/**
 * Card sharing & connection routes.
 *
 * Public:
 *   GET  /api/card/:slug           → view a public card profile
 *
 * Authenticated:
 *   POST   /api/card/:slug/connect → send a connection request
 *   GET    /api/connections         → list my connections (sent + received)
 *   PATCH  /api/connections/:id     → approve or decline a connection
 *   DELETE /api/connections/:id     → remove a connection
 */

import { Router } from "express";
import { serviceDb } from "../db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { sendEmail, connectionRequestEmail, connectionApprovedEmail } from "../lib/email.js";
import { logAudit } from "../lib/audit.js";
import { sanitiseInput, filterOutput } from "../lib/sanitise.js";
import { logger } from "../logger.js";

export const router = Router();

// ── Public: view card by slug ────────────────────────────────────────────────

router.get("/:slug", async (req, res) => {
    const { slug } = req.params;
    if (!slug || slug.length > 100 || !/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/i.test(slug)) {
        res.status(400).json({ error: "Invalid slug" });
        return;
    }

    try {
        const { rows } = await serviceDb.query(
            `SELECT p.user_id, p.display_name, p.tagline, p.bio, p.avatar_url,
                    p.cta_url, p.cta_label, p.cta_embed, p.social_links, p.services, p.card_layout, p.font_family,
                    p.theme, p.accent_color, p.slug, p.ai_query_enabled,
                    p.show_qr_scan_link,
                    (SELECT s.id FROM sites s
                       WHERE s.user_id = p.user_id AND s.verified = TRUE
                       ORDER BY s.created_at ASC
                       LIMIT 1) AS site_id
             FROM profiles p
             WHERE LOWER(p.slug) = LOWER($1)`,
            [slug],
        );

        if (rows.length === 0) {
            res.status(404).json({ error: "Card not found" });
            return;
        }

        res.json(rows[0]);
    } catch (err) {
        logger.error({ err }, "card view error");
        res.status(500).json({ error: "Failed to load card" });
    }
});

// ── Authenticated: request connection ────────────────────────────────────────

router.post("/:slug/connect", requireAuth, async (req: AuthRequest, res) => {
    const { slug } = req.params;
    const { message } = req.body as { message?: string };
    const requesterId = req.user!.id;

    if (!slug || !/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/i.test(slug)) {
        res.status(400).json({ error: "Invalid slug" });
        return;
    }

    // Sanitize message — limit to 500 chars, strip control chars
    const safeMessage = (message || "").replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim().slice(0, 500);

    try {
        // Find the card owner by slug
        const { rows: profiles } = await serviceDb.query(
            `SELECT p.user_id FROM profiles p WHERE LOWER(p.slug) = LOWER($1)`,
            [slug],
        );
        if (profiles.length === 0) {
            res.status(404).json({ error: "Card not found" });
            return;
        }

        const ownerId = profiles[0].user_id;

        if (ownerId === requesterId) {
            res.status(400).json({ error: "Cannot connect with yourself" });
            return;
        }

        // Check for existing connection (either direction)
        const { rows: existing } = await serviceDb.query(
            `SELECT id, status FROM connections
             WHERE (requester_id = $1 AND owner_id = $2)
                OR (requester_id = $2 AND owner_id = $1)`,
            [requesterId, ownerId],
        );

        if (existing.length > 0) {
            const conn = existing[0];
            if (conn.status === "approved") {
                res.status(409).json({ error: "Already connected" });
            } else if (conn.status === "pending") {
                res.status(409).json({ error: "Connection request already pending" });
            } else {
                // Declined — allow re-request by updating existing row
                await serviceDb.query(
                    `UPDATE connections SET status = 'pending', message = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [safeMessage, conn.id],
                );
                res.json({ id: conn.id, status: "pending" });
            }
            return;
        }

        // Create new connection request
        const { rows: newConn } = await serviceDb.query(
            `INSERT INTO connections (requester_id, owner_id, message)
             VALUES ($1, $2, $3) RETURNING id, status`,
            [requesterId, ownerId, safeMessage],
        );

        // Send email notification (non-blocking)
        const { rows: ownerUser } = await serviceDb.query(`SELECT email FROM users WHERE id = $1`, [ownerId]);
        const { rows: requesterProfile } = await serviceDb.query(
            `SELECT display_name FROM profiles WHERE user_id = $1`,
            [requesterId],
        );
        if (ownerUser.length > 0) {
            const requesterName = requesterProfile[0]?.display_name || "Someone";
            sendEmail(connectionRequestEmail(ownerUser[0].email, requesterName, safeMessage)).catch(() => { });
        }

        await logAudit({ userId: requesterId, action: "connection_request", tableName: "connections", recordId: newConn[0].id, ip: req.ip, userAgent: req.headers["user-agent"] });

        res.status(201).json(newConn[0]);
    } catch (err) {
        logger.error({ err }, "connection request error");
        res.status(500).json({ error: "Failed to send connection request" });
    }
});

// ── Authenticated: list connections ──────────────────────────────────────────

router.get("/", requireAuth, async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    try {
        // Get connections where user is owner or requester, join with profiles
        const { rows } = await serviceDb.query(
            `SELECT c.id, c.requester_id, c.owner_id, c.status, c.message,
                    c.created_at, c.updated_at, c.approved_at,
                    p.display_name, p.avatar_url, p.tagline, p.slug,
                    p.bio, p.cta_url, p.cta_label, p.social_links,
                    p.theme, p.accent_color, p.ai_query_enabled
             FROM connections c
             JOIN profiles p ON p.user_id = CASE
                 WHEN c.owner_id = $1 THEN c.requester_id
                 ELSE c.owner_id
             END
             WHERE c.owner_id = $1 OR c.requester_id = $1
             ORDER BY c.created_at DESC`,
            [userId],
        );
        res.json(rows);
    } catch (err) {
        logger.error({ err }, "list connections error");
        res.status(500).json({ error: "Failed to list connections" });
    }
});

// ── Authenticated: approve/decline ───────────────────────────────────────────

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { status } = req.body as { status?: string };
    const userId = req.user!.id;

    if (!status || !["approved", "declined"].includes(status)) {
        res.status(400).json({ error: "Status must be 'approved' or 'declined'" });
        return;
    }

    try {
        // Only the owner (recipient) can approve/decline
        const { rows } = await serviceDb.query(
            `UPDATE connections
             SET status = $1,
                 approved_at = CASE WHEN $1 = 'approved' THEN NOW() ELSE approved_at END,
                 updated_at = NOW()
             WHERE id = $2 AND owner_id = $3 AND status = 'pending'
             RETURNING id, status, requester_id`,
            [status, id, userId],
        );

        if (rows.length === 0) {
            res.status(404).json({ error: "Connection not found or not pending" });
            return;
        }

        // Send approval email (non-blocking)
        if (status === "approved") {
            const { rows: requesterUser } = await serviceDb.query(
                `SELECT email FROM users WHERE id = $1`,
                [rows[0].requester_id],
            );
            const { rows: ownerProfile } = await serviceDb.query(
                `SELECT display_name FROM profiles WHERE user_id = $1`,
                [userId],
            );
            if (requesterUser.length > 0) {
                const ownerName = ownerProfile[0]?.display_name || "Someone";
                sendEmail(connectionApprovedEmail(requesterUser[0].email, ownerName)).catch(() => { });
            }
        }

        await logAudit({ userId, action: `connection_${status}`, tableName: "connections", recordId: rows[0].id, ip: req.ip, userAgent: req.headers["user-agent"] });

        res.json(rows[0]);
    } catch (err) {
        logger.error({ err }, "connection update error");
        res.status(500).json({ error: "Failed to update connection" });
    }
});

// ── Authenticated: remove connection ─────────────────────────────────────────

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
        // Either party can remove a connection
        const { rowCount } = await serviceDb.query(
            `DELETE FROM connections WHERE id = $1 AND (owner_id = $2 OR requester_id = $2)`,
            [id, userId],
        );

        if (rowCount === 0) {
            res.status(404).json({ error: "Connection not found" });
            return;
        }

        await logAudit({ userId, action: "connection_removed", tableName: "connections", recordId: id, ip: req.ip, userAgent: req.headers["user-agent"] });

        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "connection delete error");
        res.status(500).json({ error: "Failed to remove connection" });
    }
});

// ── Authenticated: cross-card AI query ───────────────────────────────────────
// Ask AI about a connected person's public site content.
// Requires: approved connection + target has ai_query_enabled = true

router.post("/:id/query", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const { question } = req.body as { question?: string };
    const userId = req.user!.id;

    if (!question || !question.trim()) {
        res.status(400).json({ error: "question is required" });
        return;
    }

    // Sanitize input
    const sanitised = sanitiseInput(question);
    if (sanitised.blocked) {
        res.status(400).json({ error: sanitised.reason });
        return;
    }
    const cleanQuestion = sanitised.text;

    try {
        // Verify the connection exists, is approved, and user is a party
        const { rows: connRows } = await serviceDb.query(
            `SELECT c.requester_id, c.owner_id
             FROM connections c
             WHERE c.id = $1 AND c.status = 'approved'
               AND (c.owner_id = $2 OR c.requester_id = $2)`,
            [id, userId],
        );

        if (connRows.length === 0) {
            res.status(404).json({ error: "Connection not found or not approved" });
            return;
        }

        // Determine the "other" user (the one being queried)
        const conn = connRows[0];
        const targetUserId = conn.owner_id === userId ? conn.requester_id : conn.owner_id;

        // Check that the target has ai_query_enabled
        const { rows: targetProfile } = await serviceDb.query(
            `SELECT display_name, ai_query_enabled FROM profiles WHERE user_id = $1`,
            [targetUserId],
        );
        if (!targetProfile.length || !targetProfile[0].ai_query_enabled) {
            res.status(403).json({ error: "This user has not enabled AI queries on their card" });
            return;
        }

        // Fetch the target user's public content blocks (from their verified sites)
        const { rows: blocks } = await serviceDb.query(
            `SELECT cb.heading, cb.body
             FROM content_blocks cb
             JOIN sites s ON s.id = cb.site_id
             WHERE s.user_id = $1 AND cb.visibility = 'public'
             ORDER BY cb.block_order
             LIMIT 30`,
            [targetUserId],
        );

        if (blocks.length === 0) {
            res.json({ answer: `${targetProfile[0].display_name} hasn't added any site content yet.` });
            return;
        }

        const LEMONADE_API_KEY = process.env.LEMONADE_API_KEY;
        const LEMONADE_CONTENT_ID = process.env.LEMONADE_CONTENT_ID;

        if (!LEMONADE_API_KEY || !LEMONADE_CONTENT_ID) {
            res.status(500).json({ error: "LaunchLemonade not configured" });
            return;
        }

        // Build context from content blocks
        const siteContext = blocks
            .map((b: any) => `${b.heading || ""}: ${(b.body || "").slice(0, 300)}`)
            .join("\n");

        const targetName = targetProfile[0].display_name || "this person";

        const message = `You are a helpful assistant answering questions about ${targetName}'s business and services based on their website content. Answer concisely and accurately. If the content doesn't contain enough information to answer, say so honestly. Do not make up information.\n\n[Website content for ${targetName}]\n${siteContext}\n\n[Question]\n${cleanQuestion}`;

        const aiResponse = await fetch("https://api.launchlemonade.app/v1/chat", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${LEMONADE_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                lemonade_id: LEMONADE_CONTENT_ID,
                message,
            }),
        });

        if (!aiResponse.ok) {
            logger.error({ status: aiResponse.status }, "cross-card AI query failed");
            res.status(502).json({ error: "AI service unavailable" });
            return;
        }

        const aiData = await aiResponse.json() as any;
        const answer = filterOutput(aiData.response || "No response from AI.");

        await logAudit({
            userId,
            action: "cross_card_query",
            tableName: "connections",
            recordId: id,
            ip: req.ip,
            userAgent: req.headers["user-agent"],
            meta: { target_user_id: targetUserId, tokens: aiData.usage?.total_tokens },
        });

        res.json({ answer });
    } catch (err) {
        logger.error({ err }, "cross-card query error");
        res.status(500).json({ error: "Failed to query card" });
    }
});

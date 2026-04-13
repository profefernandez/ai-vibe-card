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
import { db } from "../db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { sendEmail, connectionRequestEmail, connectionApprovedEmail } from "../lib/email.js";
import { logAudit } from "../lib/audit.js";

export const router = Router();

// ── Public: view card by slug ────────────────────────────────────────────────

router.get("/:slug", async (req, res) => {
    const { slug } = req.params;
    if (!slug || slug.length > 100 || !/^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/i.test(slug)) {
        res.status(400).json({ error: "Invalid slug" });
        return;
    }

    try {
        const { rows } = await db.query(
            `SELECT p.display_name, p.tagline, p.bio, p.avatar_url,
                    p.cta_url, p.cta_label, p.social_links, p.card_layout,
                    p.theme, p.accent_color, p.slug
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
        console.error("Card view error:", err);
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
        const { rows: profiles } = await db.query(
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
        const { rows: existing } = await db.query(
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
                await db.query(
                    `UPDATE connections SET status = 'pending', message = $1, updated_at = NOW()
                     WHERE id = $2`,
                    [safeMessage, conn.id],
                );
                res.json({ id: conn.id, status: "pending" });
            }
            return;
        }

        // Create new connection request
        const { rows: newConn } = await db.query(
            `INSERT INTO connections (requester_id, owner_id, message)
             VALUES ($1, $2, $3) RETURNING id, status`,
            [requesterId, ownerId, safeMessage],
        );

        // Send email notification (non-blocking)
        const { rows: ownerUser } = await db.query(`SELECT email FROM users WHERE id = $1`, [ownerId]);
        const { rows: requesterProfile } = await db.query(
            `SELECT display_name FROM profiles WHERE user_id = $1`,
            [requesterId],
        );
        if (ownerUser.length > 0) {
            const requesterName = requesterProfile[0]?.display_name || "Someone";
            sendEmail(connectionRequestEmail(ownerUser[0].email, requesterName, safeMessage)).catch(() => {});
        }

        await logAudit({ userId: requesterId, action: "connection_request", tableName: "connections", recordId: newConn[0].id, ip: req.ip, userAgent: req.headers["user-agent"] });

        res.status(201).json(newConn[0]);
    } catch (err) {
        console.error("Connection request error:", err);
        res.status(500).json({ error: "Failed to send connection request" });
    }
});

// ── Authenticated: list connections ──────────────────────────────────────────

router.get("/", requireAuth, async (req: AuthRequest, res) => {
    const userId = req.user!.id;
    try {
        // Get connections where user is owner or requester, join with profiles
        const { rows } = await db.query(
            `SELECT c.id, c.requester_id, c.owner_id, c.status, c.message,
                    c.created_at, c.updated_at, c.approved_at,
                    p.display_name, p.avatar_url, p.tagline, p.slug
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
        console.error("List connections error:", err);
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
        const { rows } = await db.query(
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
            const { rows: requesterUser } = await db.query(
                `SELECT email FROM users WHERE id = $1`,
                [rows[0].requester_id],
            );
            const { rows: ownerProfile } = await db.query(
                `SELECT display_name FROM profiles WHERE user_id = $1`,
                [userId],
            );
            if (requesterUser.length > 0) {
                const ownerName = ownerProfile[0]?.display_name || "Someone";
                sendEmail(connectionApprovedEmail(requesterUser[0].email, ownerName)).catch(() => {});
            }
        }

        await logAudit({ userId, action: `connection_${status}`, tableName: "connections", recordId: rows[0].id, ip: req.ip, userAgent: req.headers["user-agent"] });

        res.json(rows[0]);
    } catch (err) {
        console.error("Connection update error:", err);
        res.status(500).json({ error: "Failed to update connection" });
    }
});

// ── Authenticated: remove connection ─────────────────────────────────────────

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const userId = req.user!.id;

    try {
        // Either party can remove a connection
        const { rowCount } = await db.query(
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
        console.error("Connection delete error:", err);
        res.status(500).json({ error: "Failed to remove connection" });
    }
});

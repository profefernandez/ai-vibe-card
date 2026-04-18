/**
 * Auth routes: register, login, logout, revoke sessions.
 * POST   /api/auth/register      — create new user account
 * POST   /api/auth/login         — return JWT on valid credentials
 * POST   /api/auth/logout        — revoke current session
 * DELETE /api/auth/sessions      — revoke all sessions for user
 */

import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../db.js";
import { requireAuth, hashToken, type AuthRequest } from "../middleware/auth.js";
import { logAudit } from "../lib/audit.js";
import { logger } from "../logger.js";

export const router = Router();

const SALT_ROUNDS = 12;
const TOKEN_TTL = "7d";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// Pre-hashed dummy for constant-time comparison on non-existent users
const DUMMY_HASH = "$2b$12$LJ3m4ys3Lg7P4ofMrYBZqe1a4oXMKm0JZnSIpOOmQbOeYXXxHBqS6";

router.post("/register", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password || password.length < 8) {
        res.status(400).json({ error: "Email and password (min 8 chars) are required" });
        return;
    }
    if (!EMAIL_RE.test(email)) {
        res.status(400).json({ error: "Invalid email format" });
        return;
    }

    const client = await db.connect();
    try {
        const existing = await client.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.rows.length > 0) {
            // Return same generic response as success to prevent user enumeration.
            // Note: no token issued — existing user still needs to sign in explicitly.
            client.release();
            res.status(200).json({ message: "Registration processed. Please sign in." });
            return;
        }

        const hash = await bcrypt.hash(password, SALT_ROUNDS);

        await client.query("BEGIN");

        const userRes = await client.query(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
            [email, hash],
        );
        const user = userRes.rows[0] as { id: string; email: string };

        // Create personal organization. Slug = sanitized email local-part + random suffix
        // so concurrent signups with similar emails don't collide.
        const localPart = email.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-") || "user";
        const slug = `${localPart}-${Math.random().toString(36).slice(2, 8)}`;

        const orgRes = await client.query(
            "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
            ["Personal", slug],
        );
        const org = orgRes.rows[0] as { id: string };

        await client.query(
            "INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')",
            [user.id, org.id],
        );

        await client.query(
            "INSERT INTO profiles (user_id, organization_id) VALUES ($1, $2)",
            [user.id, org.id],
        );

        await client.query("COMMIT");

        // Auto-login: issue a JWT + session so the user lands in /admin without a second round-trip.
        const token = jwt.sign(
            { sub: user.id, email: user.email, org: org.id },
            process.env.JWT_SECRET as string,
            { expiresIn: TOKEN_TTL },
        );
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        await db.query(
            `INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at)
             VALUES ($1, $2, $3, $4::inet, $5)`,
            [user.id, tokenHash, req.get("user-agent") || null, req.ip || null, expiresAt.toISOString()],
        );

        logAudit({ userId: user.id, action: "register", ip: req.ip, userAgent: req.get("user-agent") });

        res.status(200).json({ user: { id: user.id, email: user.email }, token });
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { /* nothing */ });
        logger.error({ err }, "register error");
        res.status(500).json({ error: "Registration failed" });
    } finally {
        client.release();
    }
});

router.post("/login", async (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };

    if (!email || !password) {
        res.status(400).json({ error: "Email and password are required" });
        return;
    }

    try {
        const result = await db.query(
            `SELECT u.id, u.email, u.password_hash, m.organization_id
             FROM users u
             LEFT JOIN memberships m ON m.user_id = u.id
             WHERE u.email = $1
             ORDER BY m.created_at ASC
             LIMIT 1`,
            [email],
        );
        const user = result.rows[0] as
            | { id: string; email: string; password_hash: string; organization_id: string | null }
            | undefined;

        // Always run bcrypt.compare to prevent timing-based user enumeration
        const hashToCheck = user?.password_hash ?? DUMMY_HASH;
        const valid = await bcrypt.compare(password, hashToCheck);

        if (!user || !valid) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        if (!user.organization_id) {
            // Shouldn't happen — every user gets an org at signup. Guard anyway.
            logger.error({ userId: user.id }, "user has no organization membership");
            res.status(500).json({ error: "Account is not fully set up. Contact support." });
            return;
        }

        const token = jwt.sign(
            { sub: user.id, email: user.email, org: user.organization_id },
            process.env.JWT_SECRET as string,
            { expiresIn: TOKEN_TTL },
        );

        // Store session for revocation support
        const tokenHash = hashToken(token);
        const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
        await db.query(
            `INSERT INTO sessions (user_id, token_hash, user_agent, ip_address, expires_at)
             VALUES ($1, $2, $3, $4::inet, $5)`,
            [user.id, tokenHash, req.get("user-agent") || null, req.ip || null, expiresAt.toISOString()],
        );

        // Audit login
        logAudit({ userId: user.id, action: "login", ip: req.ip, userAgent: req.get("user-agent") });

        res.json({ user: { id: user.id, email: user.email }, token });
    } catch (err) {
        logger.error({ err }, "login error");
        res.status(500).json({ error: "Login failed" });
    }
});

// ── Logout (revoke current session) ──────────────────────────────────────────
router.post("/logout", requireAuth, async (req: AuthRequest, res) => {
    try {
        const token = req.headers.authorization!.slice(7);
        const tokenHash = hashToken(token);
        await db.query("DELETE FROM sessions WHERE token_hash = $1", [tokenHash]);
        logAudit({ userId: req.user!.id, action: "logout", ip: req.ip, userAgent: req.get("user-agent") });
        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "logout error");
        res.status(500).json({ error: "Logout failed" });
    }
});

// ── Revoke all sessions ──────────────────────────────────────────────────────
router.delete("/sessions", requireAuth, async (req: AuthRequest, res) => {
    try {
        await db.query("DELETE FROM sessions WHERE user_id = $1", [req.user!.id]);
        logAudit({ userId: req.user!.id, action: "revoke_all_sessions", ip: req.ip, userAgent: req.get("user-agent") });
        res.json({ ok: true, message: "All sessions revoked" });
    } catch (err) {
        logger.error({ err }, "revoke sessions error");
        res.status(500).json({ error: "Failed to revoke sessions" });
    }
});

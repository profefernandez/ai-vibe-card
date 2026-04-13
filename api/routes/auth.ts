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

    try {
        const existing = await db.query("SELECT id FROM users WHERE email = $1", [email]);
        if (existing.rows.length > 0) {
            res.status(409).json({ error: "An account with that email already exists" });
            return;
        }

        const hash = await bcrypt.hash(password, SALT_ROUNDS);
        const result = await db.query(
            "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
            [email, hash],
        );
        const user = result.rows[0] as { id: string; email: string };

        // Auto-create empty profile for new user
        await db.query(
            "INSERT INTO profiles (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING",
            [user.id],
        );

        res.status(201).json({ message: "Account created. Please sign in." });
    } catch (err) {
        console.error("register error:", err);
        res.status(500).json({ error: "Registration failed" });
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
            "SELECT id, email, password_hash FROM users WHERE email = $1",
            [email],
        );
        const user = result.rows[0] as
            | { id: string; email: string; password_hash: string }
            | undefined;

        // Always run bcrypt.compare to prevent timing-based user enumeration
        const hashToCheck = user?.password_hash ?? DUMMY_HASH;
        const valid = await bcrypt.compare(password, hashToCheck);

        if (!user || !valid) {
            res.status(401).json({ error: "Invalid email or password" });
            return;
        }

        const token = jwt.sign(
            { sub: user.id, email: user.email },
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
        console.error("login error:", err);
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
        console.error("logout error:", err);
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
        console.error("revoke sessions error:", err);
        res.status(500).json({ error: "Failed to revoke sessions" });
    }
});

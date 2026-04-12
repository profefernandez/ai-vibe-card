/**
 * Auth routes: register + login.
 * POST /api/auth/register  — create new user account
 * POST /api/auth/login     — return JWT on valid credentials
 */

import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { db } from "../db.js";

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

        res.json({ user: { id: user.id, email: user.email }, token });
    } catch (err) {
        console.error("login error:", err);
        res.status(500).json({ error: "Login failed" });
    }
});

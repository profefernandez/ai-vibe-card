/**
 * JWT authentication middleware.
 * Verifies the Bearer token from the Authorization header.
 * Validates the token hash exists in the sessions table (enables revocation).
 * Attaches the decoded user payload (incl. organizationId) to req.user.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import { db } from "../db.js";

export interface AuthRequest extends Request {
    user?: {
        id: string;
        email: string;
        organizationId: string;
        /**
         * Caller's role in the organization. Populated from the JWT's `role`
         * claim when present; left undefined for legacy tokens minted before
         * the claim existed (Phase 4). `requireRole` lazily fills it via a
         * memberships lookup in that case.
         */
        role?: "owner" | "admin" | "member";
    };
}

interface JwtPayload {
    sub: string;
    email: string;
    org: string;
    /** Optional — added in Phase 4. Old tokens lack this. */
    role?: "owner" | "admin" | "member";
}

/** SHA-256 hash a token for safe storage / lookup. */
export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

/**
 * Verify a JWT against the current `JWT_SECRET`, falling back to
 * `JWT_SECRET_PREVIOUS` if set. Lets us rotate the signing secret without
 * invalidating every active session: deploy with both set, wait the max
 * session TTL (currently 7d), then unset the previous one. Sign paths
 * (auth.ts) always use the current secret.
 *
 * Returns `null` rather than throwing — keeps the call site shape simple.
 */
export function verifyJwtWithRotation<T = unknown>(token: string): T | null {
    const current = process.env.JWT_SECRET;
    if (!current) return null;
    try {
        return jwt.verify(token, current) as T;
    } catch {
        const previous = process.env.JWT_SECRET_PREVIOUS;
        if (!previous) return null;
        try {
            return jwt.verify(token, previous) as T;
        } catch {
            return null;
        }
    }
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const token = header.slice(7);
    const payload = verifyJwtWithRotation<JwtPayload>(token);
    if (!payload) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
    }

    if (!payload.org) {
        // Token minted before org scoping — force re-login
        res.status(401).json({ error: "Session outdated, please sign in again" });
        return;
    }

    const tokenHash = hashToken(token);
    db.query(
        "SELECT id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()",
        [tokenHash],
    ).then(({ rows }) => {
        if (rows.length === 0) {
            res.status(401).json({ error: "Session revoked or expired" });
            return;
        }
        req.user = {
            id: payload.sub,
            email: payload.email,
            organizationId: payload.org,
            role: payload.role,
        };
        next();
    }).catch(() => {
        res.status(401).json({ error: "Invalid or expired token" });
    });
}

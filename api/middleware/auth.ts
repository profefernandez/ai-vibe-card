/**
 * JWT authentication middleware.
 * Verifies the Bearer token from the Authorization header.
 * Validates the token hash exists in the sessions table (enables revocation).
 * Attaches the decoded user payload to req.user.
 */

import type { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { createHash } from "node:crypto";
import { db } from "../db.js";

export interface AuthRequest extends Request {
    user?: { id: string; email: string };
}

/** SHA-256 hash a token for safe storage / lookup. */
export function hashToken(token: string): string {
    return createHash("sha256").update(token).digest("hex");
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) {
        res.status(401).json({ error: "Unauthorized" });
        return;
    }
    const token = header.slice(7);
    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET as string) as {
            sub: string;
            email: string;
        };

        // Verify session exists and is not expired / revoked
        const tokenHash = hashToken(token);
        db.query(
            "SELECT id FROM sessions WHERE token_hash = $1 AND expires_at > NOW()",
            [tokenHash],
        ).then(({ rows }) => {
            if (rows.length === 0) {
                res.status(401).json({ error: "Session revoked or expired" });
                return;
            }
            req.user = { id: payload.sub, email: payload.email };
            next();
        }).catch(() => {
            res.status(401).json({ error: "Invalid or expired token" });
        });
    } catch {
        res.status(401).json({ error: "Invalid or expired token" });
    }
}

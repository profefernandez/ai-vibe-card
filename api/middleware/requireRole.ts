/**
 * Role-gating middleware.
 *
 * `requireAuth` only verifies the JWT and the session — it does not check
 * the caller's role within their organization. `requireRole(...allowed)`
 * adds that check on top.
 *
 * Role source (in priority order):
 *   1. `req.user.role` — set by `requireAuth` from the JWT `role` claim.
 *      New tokens (post-Phase-4 deploy) include this; one round-trip avoided.
 *   2. DB lookup against `memberships` for `(user_id, organization_id)`.
 *      Fallback for old JWTs that pre-date the `role` claim. Refreshes
 *      `req.user.role` so subsequent middleware in the same request can use
 *      the cached value.
 *
 * Mount AFTER `requireAuth`. A request without `req.user` set is treated as
 * unauthenticated and rejected — never trust the body / query for the role.
 */

import type { Response, NextFunction } from "express";
import { db } from "../db.js";
import { logger } from "../logger.js";
import type { AuthRequest } from "./auth.js";

export type Role = "owner" | "admin" | "member";

export function requireRole(...allowed: Role[]) {
    if (allowed.length === 0) {
        // Programmer error — fail closed by always denying.
        return (_req: AuthRequest, res: Response) => {
            res.status(500).json({ error: "Misconfigured role guard" });
        };
    }

    const allowSet = new Set<Role>(allowed);

    return async function (req: AuthRequest, res: Response, next: NextFunction): Promise<void> {
        if (!req.user) {
            res.status(401).json({ error: "Unauthorized" });
            return;
        }

        let role = req.user.role;

        // Fallback for legacy JWTs minted before the `role` claim was added.
        if (!role) {
            try {
                const { rows } = await db.query(
                    `SELECT role FROM memberships
                     WHERE user_id = $1 AND organization_id = $2
                     LIMIT 1`,
                    [req.user.id, req.user.organizationId],
                );
                role = (rows[0]?.role as Role | undefined) ?? undefined;
                if (role) req.user.role = role;
            } catch (err) {
                logger.error({ err, userId: req.user.id }, "requireRole: membership lookup failed");
                res.status(500).json({ error: "Authorization check failed" });
                return;
            }
        }

        if (!role) {
            // User has a valid session but no membership in the org claimed
            // by the JWT. Either the membership was revoked or the token is
            // stale.
            res.status(403).json({ error: "No active membership for this organization" });
            return;
        }

        if (!allowSet.has(role)) {
            res.status(403).json({ error: "Insufficient permissions" });
            return;
        }

        next();
    };
}

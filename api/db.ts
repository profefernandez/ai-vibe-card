/**
 * PostgreSQL connection pools.
 *
 * Two pools exist:
 *
 *   db          — application connections. Will run as the regular
 *                 `aivibe_user` role. Once RLS is enabled (Phase 6c+),
 *                 every query through this pool MUST happen inside a
 *                 transaction that has called set_config('app.user_id', ...)
 *                 and set_config('app.org_id', ...) — otherwise RLS
 *                 policies that filter on those settings return zero rows.
 *
 *                 Use the `withRequestClient(req, fn)` helper for any code
 *                 path that has an authenticated `req.user`.
 *
 *   serviceDb   — privileged connections that bypass RLS. Connects as the
 *                 `aivibe_service` role (created in migration 1700000006000)
 *                 which has `BYPASSRLS`. Reserved for code paths that
 *                 legitimately need to read or write across organizations
 *                 without an authenticated user:
 *                   - GET  /robots.txt
 *                   - POST /api/feedback        (anonymous visitors)
 *                   - POST /api/functions/lemonade-chat (visitor chat)
 *                   - POST /api/functions/refresh-sites (cron)
 *                   - POST /api/functions/prune-logs    (cron)
 *
 *                 If `DATABASE_URL_SERVICE` is unset, `serviceDb` falls
 *                 back to the same connection string as `db`. Pre-RLS this
 *                 is a no-op; after RLS is enabled in production, the
 *                 ops team must split the credentials so this fallback
 *                 stops working — `aivibe_user` cannot bypass RLS.
 *
 * Set `DB_SSL=true` to enable TLS (needed when DB is off-host).
 */

import dotenv from "dotenv";
dotenv.config();

import { Pool, type PoolClient } from "pg";
import type { Request } from "express";
import { logger } from "./logger.js";

const useSSL = process.env.DB_SSL === "true";
const rejectUnauthorized = process.env.DB_SSL_REJECT_UNAUTHORIZED !== "false";

const ssl = useSSL ? { rejectUnauthorized } : false;

export const db = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl,
    max: 10,
});

/**
 * Privileged pool for unauthenticated code paths. Falls back to the
 * application user pre-RLS — see module doc above for the migration plan.
 */
export const serviceDb = new Pool({
    connectionString: process.env.DATABASE_URL_SERVICE ?? process.env.DATABASE_URL,
    ssl,
    max: 5,
});

// ── RLS-aware request client ────────────────────────────────────────────────

interface AuthLike {
    user?: { id?: string; organizationId?: string };
}

/**
 * Run a sequence of queries inside a single transaction, with RLS context
 * pinned via SET LOCAL. The callback receives a checked-out PoolClient that
 * is automatically rolled back on throw and committed on resolve.
 *
 * Usage:
 *   await withRequestClient(req, async (c) => {
 *       const { rows } = await c.query("SELECT ... WHERE id = $1", [id]);
 *       await c.query("UPDATE ... WHERE id = $1", [id]);
 *       return rows[0];
 *   });
 *
 * Throws if `req.user` is missing — the helper is intended for code paths
 * already gated by `requireAuth`. Unauthenticated callers should use
 * `serviceDb` directly instead (see module doc for the list).
 *
 * Why SET LOCAL inside a transaction: GUCs set with `SET LOCAL` are scoped
 * to the current transaction and roll off automatically on COMMIT/ROLLBACK.
 * Using plain `SET` on a pooled connection would leak the value to the
 * next request that checks out the same client — unacceptable for a
 * security-critical setting.
 */
export async function withRequestClient<T>(
    req: AuthLike,
    fn: (client: PoolClient) => Promise<T>,
): Promise<T> {
    const userId = req.user?.id;
    const orgId = req.user?.organizationId;
    if (!userId || !orgId) {
        throw new Error(
            "withRequestClient called without an authenticated request. " +
            "Use serviceDb for unauthenticated paths.",
        );
    }

    const client = await db.connect();
    try {
        await client.query("BEGIN");
        // Two settings in one round-trip. The third arg `true` makes both
        // local to the transaction; they vanish on COMMIT or ROLLBACK.
        // Casting through ::uuid here would fail if either id were not a
        // UUID — we leave them as text on purpose; policies cast on read.
        await client.query(
            "SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)",
            [userId, orgId],
        );
        const result = await fn(client);
        await client.query("COMMIT");
        return result;
    } catch (err) {
        try {
            await client.query("ROLLBACK");
        } catch (rollbackErr) {
            logger.error({ err: rollbackErr }, "withRequestClient: rollback failed");
        }
        throw err;
    } finally {
        client.release();
    }
}

// Express request augmentation — attaches `req.withClient(fn)` shorthand
// equivalent to `withRequestClient(req, fn)`. Set by the attachDbHelper
// middleware in api/index.ts; safe to call from any route mounted after it.
declare module "express-serve-static-core" {
    interface Request {
        withClient?<T>(fn: (client: PoolClient) => Promise<T>): Promise<T>;
    }
}

/** Express middleware that binds `req.withClient` to the current request. */
export function attachDbHelper(req: Request, _res: unknown, next: () => void): void {
    req.withClient = (fn) => withRequestClient(req as unknown as AuthLike, fn);
    next();
}

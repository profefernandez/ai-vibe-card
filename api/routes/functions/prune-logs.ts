/**
 * prune-logs — retention cron handler.
 * POST /api/functions/prune-logs
 *
 * Protected by a shared secret header (not JWT) so cron jobs can call it:
 *   Authorization: Bearer <REFRESH_SECRET>
 *
 * Performs batched deletes against rows past their retention window:
 *   - audit_log         > 180 days
 *   - ai_feedback       > 365 days
 *   - sessions (expired)>   7 days past expiry
 *   - feedback_consumed >  30 days (HMAC token TTL is 24h; 30d gives slack)
 *
 * Each table's deletes run in their own transaction so a failure in one
 * doesn't block the others. Deletes are chunked at 10k rows with a 1M-row
 * cap per run to keep lock duration short on multi-million-row tables.
 *
 * Required environment variable:
 *   REFRESH_SECRET — shared secret for cron authentication (reused from refresh-sites)
 */

import type { Request, Response } from "express";
import { timingSafeEqual } from "node:crypto";
import { serviceDb } from "../../db.js";
import { logger } from "../../logger.js";
import { logAudit } from "../../lib/audit.js";

const CHUNK = 10_000;
const MAX_ITERATIONS = 100; // 100 * 10_000 = 1M rows / table / run

interface PruneTarget {
    table: string;
    /**
     * SELECT-id subquery body (without the outer DELETE wrapping).
     * We compose the DELETE here so every target uses the same chunked
     * pattern and nothing leaks user input — these strings are all static.
     */
    whereSql: string;
}

const TARGETS: PruneTarget[] = [
    {
        table: "audit_log",
        whereSql: "created_at < NOW() - INTERVAL '180 days'",
    },
    {
        table: "ai_feedback",
        whereSql: "created_at < NOW() - INTERVAL '365 days'",
    },
    {
        table: "sessions",
        whereSql: "expires_at < NOW() - INTERVAL '7 days'",
    },
    {
        table: "feedback_consumed",
        // feedback_consumed uses used_at (no created_at column); see migration
        // 1700000004000_auth_lockout_and_feedback_consumed.
        whereSql: "used_at < NOW() - INTERVAL '30 days'",
    },
];

async function pruneTable(target: PruneTarget): Promise<number> {
    const client = await serviceDb.connect();
    let total = 0;
    try {
        await client.query("BEGIN");
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
            // Subselect-then-delete avoids holding row locks across the
            // whole table — Postgres can't otherwise express "delete N
            // matching rows" in one statement.
            const sql =
                `DELETE FROM ${target.table} ` +
                `WHERE ctid IN ( ` +
                `    SELECT ctid FROM ${target.table} ` +
                `    WHERE ${target.whereSql} ` +
                `    LIMIT ${CHUNK} ` +
                `)`;
            const result = await client.query(sql);
            const n = result.rowCount ?? 0;
            if (n === 0) break;
            total += n;
            logger.info(
                { table: target.table, iter, deleted: n, total },
                "prune-logs: chunk deleted",
            );
        }
        await client.query("COMMIT");
        return total;
    } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        logger.error({ err, table: target.table }, "prune-logs: table failed");
        throw err;
    } finally {
        client.release();
    }
}

export async function handler(req: Request, res: Response): Promise<void> {
    try {
        const secret = process.env.REFRESH_SECRET;
        if (!secret) {
            res.status(500).json({ error: "REFRESH_SECRET not configured" });
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            res.status(401).json({ error: "Invalid refresh secret" });
            return;
        }
        const provided = Buffer.from(authHeader.slice(7));
        const expected = Buffer.from(secret);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
            res.status(401).json({ error: "Invalid refresh secret" });
            return;
        }

        logger.info("prune-logs: starting retention sweep");

        const deleted: Record<string, number> = {
            audit_log: 0,
            ai_feedback: 0,
            sessions: 0,
            feedback_consumed: 0,
        };
        const errors: Record<string, string> = {};

        // Each target gets its own try/catch so one table failing doesn't
        // abort the others — rotation should make as much progress as it can.
        for (const target of TARGETS) {
            try {
                deleted[target.table] = await pruneTable(target);
            } catch (err) {
                errors[target.table] = err instanceof Error ? err.message : "unknown";
            }
        }

        logger.info({ deleted, errors }, "prune-logs: complete");

        // Fire-and-forget audit entry so the operator can see when the cron last ran.
        logAudit({
            action: "prune_logs",
            tableName: "audit_log",
            meta: { deleted, errors },
        });

        const status = Object.keys(errors).length === 0 ? 200 : 207;
        res.status(status).json({ deleted, ...(Object.keys(errors).length ? { errors } : {}) });
    } catch (err) {
        logger.error({ err }, "prune-logs error");
        res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
}

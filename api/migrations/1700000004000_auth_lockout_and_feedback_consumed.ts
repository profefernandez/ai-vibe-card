import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Adds two security primitives:
 *
 * 1. Per-account login lockout — `users.failed_login_count` and
 *    `users.locked_until`. After N consecutive failed logins from any IP, the
 *    account is locked for a fixed window. Pure IP-based rate limiting was
 *    insufficient against distributed brute-force / credential stuffing once
 *    we fixed `trust proxy` (an attacker rotating IPs would still get 20
 *    attempts each).
 *
 * 2. Anti-poisoning replay protection for the public feedback endpoint —
 *    `feedback_consumed` records the signature hash of every accepted
 *    feedback submission. The HMAC-signed token issued alongside an AI chat
 *    response is single-use; replays are rejected at the DB level by the
 *    primary key constraint on `signature_hash`.
 *
 * The new columns/table are nullable / non-fatal — missing values mean
 * "never failed / never used", so existing rows behave correctly without
 * a backfill.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        -- ─── Per-account auth lockout ───────────────────────────────────────
        ALTER TABLE users
            ADD COLUMN IF NOT EXISTS failed_login_count INTEGER NOT NULL DEFAULT 0,
            ADD COLUMN IF NOT EXISTS locked_until       TIMESTAMPTZ DEFAULT NULL;

        -- Targeted index: the auth path filters live locks by NOW(); a partial
        -- index keeps the table scan small while accounts are mostly unlocked.
        CREATE INDEX IF NOT EXISTS idx_users_locked
            ON users (locked_until)
            WHERE locked_until IS NOT NULL;

        -- ─── feedback_consumed (HMAC nonce store) ───────────────────────────
        -- One row per accepted feedback signature. The PK provides O(1) replay
        -- detection — INSERT fails with a unique-violation if the signature
        -- has already been used. Pruned by the retention cron once entries are
        -- past their HMAC expiry window.
        CREATE TABLE IF NOT EXISTS feedback_consumed (
            signature_hash  TEXT        NOT NULL PRIMARY KEY,
            used_at         TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_feedback_consumed_used_at
            ON feedback_consumed (used_at);
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        DROP INDEX IF EXISTS idx_feedback_consumed_used_at;
        DROP TABLE IF EXISTS feedback_consumed;
        DROP INDEX IF EXISTS idx_users_locked;
        ALTER TABLE users
            DROP COLUMN IF EXISTS locked_until,
            DROP COLUMN IF EXISTS failed_login_count;
    `);
};

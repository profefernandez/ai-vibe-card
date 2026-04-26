import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Phase 6a — service role groundwork.
 *
 * Creates the `aivibe_service` PostgreSQL role with `BYPASSRLS`. Once RLS is
 * enabled (Phase 6c+), the application has two distinct database identities:
 *
 *   aivibe_user     — connection string in DATABASE_URL. Subject to RLS.
 *                     Every query must run inside a transaction that has
 *                     SET LOCAL app.user_id / app.org_id, otherwise policy
 *                     filters return zero rows.
 *
 *   aivibe_service  — connection string in DATABASE_URL_SERVICE. Bypasses
 *                     RLS. Used only by code paths that legitimately serve
 *                     unauthenticated traffic or run as cron:
 *                       - GET  /api/card/:slug
 *                       - GET  /robots.txt
 *                       - POST /api/feedback
 *                       - POST /api/functions/lemonade-chat (visitor)
 *                       - POST /api/functions/refresh-sites (cron)
 *                       - POST /api/functions/prune-logs (cron)
 *
 * The role is created NOLOGIN here — the operator sets a password and
 * ALTER ROLE … LOGIN out-of-band, then puts the credentials in
 * DATABASE_URL_SERVICE. Doing it in-migration would either bake the
 * password into the migration history or leave a usable role open with
 * no password set.
 *
 * This migration is INERT pre-Phase-6c: until policies are created and
 * RLS is ALTER TABLE … ENABLE ROW LEVEL SECURITY'd, BYPASSRLS has nothing
 * to bypass. Safe to apply now.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        DO $$
        BEGIN
            IF NOT EXISTS (
                SELECT 1 FROM pg_roles WHERE rolname = 'aivibe_service'
            ) THEN
                -- NOLOGIN: operator must ALTER ROLE … WITH LOGIN PASSWORD '...'
                -- before this role can be used. NOINHERIT keeps role
                -- privilege chains explicit.
                CREATE ROLE aivibe_service NOLOGIN NOINHERIT BYPASSRLS;
            ELSE
                -- Role pre-exists (e.g. created manually). Make sure it has
                -- the BYPASSRLS attribute we expect.
                ALTER ROLE aivibe_service BYPASSRLS;
            END IF;
        END
        $$;

        -- Grants: full DML on the schema, the same access aivibe_user has.
        -- The privilege difference between the two roles is exactly
        -- BYPASSRLS, nothing else.
        GRANT USAGE ON SCHEMA public TO aivibe_service;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO aivibe_service;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO aivibe_service;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aivibe_service;
        ALTER DEFAULT PRIVILEGES IN SCHEMA public
            GRANT USAGE, SELECT ON SEQUENCES TO aivibe_service;
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        REVOKE ALL ON ALL TABLES IN SCHEMA public FROM aivibe_service;
        REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM aivibe_service;
        REVOKE ALL ON SCHEMA public FROM aivibe_service;
        DROP ROLE IF EXISTS aivibe_service;
    `);
};

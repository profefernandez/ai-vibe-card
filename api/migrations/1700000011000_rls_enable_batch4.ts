import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Phase 6f — Stage D: enable RLS on identity + audit tables.
 *
 * Last batch. These tables are accessed almost exclusively via serviceDb
 * (the auth path, audit log writes, the requireAuth session lookup),
 * so enabling RLS here is mostly defence-in-depth. Any leftover code
 * path that uses the `db` (aivibe_user) pool to read from these tables
 * will return the user's own rows only.
 *
 * Once this batch soaks clean, run Stage E (1700000012000) to FORCE
 * row-level security so even the table owner is subject to policies.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE users             ENABLE ROW LEVEL SECURITY;
        ALTER TABLE memberships       ENABLE ROW LEVEL SECURITY;
        ALTER TABLE organizations     ENABLE ROW LEVEL SECURITY;
        ALTER TABLE sessions          ENABLE ROW LEVEL SECURITY;
        ALTER TABLE audit_log         ENABLE ROW LEVEL SECURITY;
        ALTER TABLE ai_feedback       ENABLE ROW LEVEL SECURITY;
        ALTER TABLE feedback_consumed ENABLE ROW LEVEL SECURITY;
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE feedback_consumed DISABLE ROW LEVEL SECURITY;
        ALTER TABLE ai_feedback       DISABLE ROW LEVEL SECURITY;
        ALTER TABLE audit_log         DISABLE ROW LEVEL SECURITY;
        ALTER TABLE sessions          DISABLE ROW LEVEL SECURITY;
        ALTER TABLE organizations     DISABLE ROW LEVEL SECURITY;
        ALTER TABLE memberships       DISABLE ROW LEVEL SECURITY;
        ALTER TABLE users             DISABLE ROW LEVEL SECURITY;
    `);
};

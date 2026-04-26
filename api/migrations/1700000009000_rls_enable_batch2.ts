import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Phase 6e — Stage B: enable RLS on api_connections after Stage A soaks.
 *
 * Slightly higher blast radius — admin route surface (POST /api/tables/
 * api_connections) is RLS-bound, but BYOK chat (lemonade-chat.ts) reads
 * via serviceDb so visitor traffic is unaffected. If the admin tab shows
 * empty connections after this lands, that's the signal to investigate
 * the SET LOCAL plumbing in tables.ts before going further.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE api_connections ENABLE ROW LEVEL SECURITY;
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE api_connections DISABLE ROW LEVEL SECURITY;
    `);
};

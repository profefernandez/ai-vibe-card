import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Phase 6f — Stage C: enable RLS on the bulk of tenant data.
 *
 * Profiles, sites, site_pages, content_blocks, connections. This is the
 * largest blast radius — most user-facing routes hit at least one of
 * these. Only deploy after Stages A and B have soaked clean.
 *
 * site_pages and content_blocks inherit visibility through `sites` via
 * the policies created in 1700000007000 (`site_id IN (SELECT id FROM
 * sites)`). `connections` is gated on the cross-org party rule.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
        ALTER TABLE sites           ENABLE ROW LEVEL SECURITY;
        ALTER TABLE site_pages      ENABLE ROW LEVEL SECURITY;
        ALTER TABLE content_blocks  ENABLE ROW LEVEL SECURITY;
        ALTER TABLE connections     ENABLE ROW LEVEL SECURITY;
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE connections     DISABLE ROW LEVEL SECURITY;
        ALTER TABLE content_blocks  DISABLE ROW LEVEL SECURITY;
        ALTER TABLE site_pages      DISABLE ROW LEVEL SECURITY;
        ALTER TABLE sites           DISABLE ROW LEVEL SECURITY;
        ALTER TABLE profiles        DISABLE ROW LEVEL SECURITY;
    `);
};

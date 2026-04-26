import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Phase 6d — Stage A: enable RLS on the lowest-blast-radius table first.
 *
 * `ai_preferences` is one row per organization. If our SET LOCAL plumbing
 * has a bug we missed, the symptom is "AI training tab shows empty" —
 * obvious, contained, easy to roll back. Letting it soak in staging /
 * canary for 24h before enabling more tables catches mistakes cheap.
 *
 * Roll forward to subsequent batches only after this one has been live
 * with real traffic without empty-result complaints.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE ai_preferences ENABLE ROW LEVEL SECURITY;
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE ai_preferences DISABLE ROW LEVEL SECURITY;
    `);
};

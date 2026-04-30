/**
 * Per-test DB cleanup helpers.
 *
 * `truncateAll` wipes every domain table so each test starts from an empty
 * state. We TRUNCATE rather than DROP/recreate to avoid paying the migration
 * cost on every test; CASCADE handles FK ordering and RESTART IDENTITY
 * keeps autoincrement IDs predictable.
 *
 * The list is enumerated from api/migrations/. If a future migration adds a
 * new table, append it here. Tables wrapped in try/catch tolerate the
 * "doesn't exist" case so this helper survives a partial migration history
 * (e.g. someone testing a single early migration).
 */

import type { PoolClient } from "pg";

// Order matters less with CASCADE, but listing children-before-parents is
// still good practice for readability.
const TABLES_TO_TRUNCATE = [
    "ai_feedback",
    "audit_log",
    "sessions",
    "feedback_consumed",
    "kb_images",
    "kb_items",
    "kb_folders",
    "content_blocks",
    "site_pages",
    "sites",
    "api_connections",
    "ai_preferences",
    "connections",
    "profiles",
    "memberships",
    "organizations",
    "users",
] as const;

export async function truncateAll(client: PoolClient): Promise<void> {
    // Single TRUNCATE call so CASCADE resolves FKs across the whole set in
    // one shot. If any table is missing (unlikely once migrations are up),
    // the whole call would fail — fall back to per-table best-effort.
    try {
        await client.query(
            `TRUNCATE ${TABLES_TO_TRUNCATE.join(", ")} RESTART IDENTITY CASCADE`,
        );
        return;
    } catch {
        // best-effort fallback
    }
    for (const t of TABLES_TO_TRUNCATE) {
        try {
            await client.query(`TRUNCATE ${t} RESTART IDENTITY CASCADE`);
        } catch {
            // table doesn't exist in this migration set — skip
        }
    }
}

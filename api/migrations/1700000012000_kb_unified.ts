import type { MigrationBuilder, ColumnDefinitions } from "node-pg-migrate";

export const shorthands: ColumnDefinitions | undefined = undefined;

/**
 * Phase 1 — unified Knowledge Base schema.
 *
 * Two new org-scoped tables (`kb_folders`, `kb_items`) plus their RLS
 * policies. Nothing reads from these tables yet — `kb_images`,
 * `content_blocks`, and `site_pages` remain authoritative until Phases
 * 2-4 backfill, swap reads, and drop legacy.
 *
 * RLS posture (matches kb_images / Phase 6c):
 *   - Policies are CREATE'd here so they exist as dormant DDL.
 *   - ALTER TABLE … ENABLE ROW LEVEL SECURITY is intentionally NOT run.
 *     Production doesn't yet have DATABASE_URL_SERVICE wired to a real
 *     aivibe_service credential (see commit 8e22dfb). Enabling RLS now
 *     would break any future public-read path through serviceDb the
 *     instant it falls back to aivibe_user. Enablement happens in a
 *     future staged-enable batch alongside the rest of the org-scoped
 *     tables, after the operator sets DATABASE_URL_SERVICE.
 *
 * Grants: aivibe_service picks up SELECT/INSERT/UPDATE/DELETE on these
 * tables automatically via the ALTER DEFAULT PRIVILEGES set up in
 * 1700000006000_service_role.ts. No explicit grant needed here.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
    // ─── kb_folders ───────────────────────────────────────────────────
    pgm.createTable("kb_folders", {
        id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
        user_id: { type: "uuid", notNull: true, references: '"users"', onDelete: "CASCADE" },
        organization_id: { type: "uuid", notNull: true, references: '"organizations"', onDelete: "CASCADE" },
        parent_id: { type: "uuid", references: '"kb_folders"', onDelete: "CASCADE" },
        name: { type: "text", notNull: true },
        kind: { type: "text", notNull: true },
        source: { type: "text" },
        use_for_ai: { type: "boolean", notNull: true, default: true },
        decorative: { type: "boolean", notNull: true, default: false },
        display_order: { type: "integer", notNull: true, default: 0 },
        created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
        updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    });

    pgm.addConstraint("kb_folders", "chk_kb_folders_kind", {
        check: "kind IN ('manual', 'scrape', 'system')",
    });
    pgm.addConstraint("kb_folders", "chk_kb_folders_parent", {
        check: "parent_id <> id",
    });

    pgm.createIndex("kb_folders", ["user_id", "parent_id"]);
    pgm.createIndex("kb_folders", ["source"]);
    pgm.createIndex("kb_folders", ["organization_id"]);

    pgm.sql(`
        CREATE TRIGGER trg_kb_folders_updated_at
        BEFORE UPDATE ON kb_folders
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    `);

    // ─── kb_items ─────────────────────────────────────────────────────
    pgm.createTable("kb_items", {
        id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
        user_id: { type: "uuid", notNull: true, references: '"users"', onDelete: "CASCADE" },
        organization_id: { type: "uuid", notNull: true, references: '"organizations"', onDelete: "CASCADE" },
        folder_id: { type: "uuid", notNull: true, references: '"kb_folders"', onDelete: "CASCADE" },
        type: { type: "text", notNull: true },
        title: { type: "text" },
        content: { type: "text" },
        url: { type: "text" },
        mime_type: { type: "text" },
        file_size: { type: "integer" },
        caption: { type: "text", notNull: true, default: "" },
        source: { type: "text", notNull: true },
        source_url: { type: "text" },
        status: { type: "text", notNull: true, default: "ready" },
        metadata: { type: "jsonb", notNull: true, default: "{}" },
        display_order: { type: "integer", notNull: true, default: 0 },
        created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
        updated_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
    });

    pgm.addConstraint("kb_items", "chk_kb_items_type", {
        check: "type IN ('text', 'image', 'file')",
    });
    pgm.addConstraint("kb_items", "chk_kb_items_status", {
        check: "status IN ('ready', 'processing', 'error')",
    });
    pgm.addConstraint("kb_items", "chk_kb_items_payload", {
        check: "(type = 'text' AND content IS NOT NULL) OR (type IN ('image', 'file') AND url IS NOT NULL)",
    });

    pgm.createIndex("kb_items", ["folder_id", "display_order"]);
    pgm.createIndex("kb_items", ["user_id", "type"]);
    pgm.createIndex("kb_items", ["source"]);
    pgm.createIndex("kb_items", ["organization_id"]);

    pgm.sql(`
        CREATE TRIGGER trg_kb_items_updated_at
        BEFORE UPDATE ON kb_items
        FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
    `);

    // ─── RLS policies (dormant until staged enable) ───────────────────
    pgm.sql(`
        DROP POLICY IF EXISTS p_kb_folders_org ON kb_folders;
        CREATE POLICY p_kb_folders_org ON kb_folders
            FOR ALL
            USING (organization_id = app_current_org_id())
            WITH CHECK (organization_id = app_current_org_id());

        DROP POLICY IF EXISTS p_kb_items_org ON kb_items;
        CREATE POLICY p_kb_items_org ON kb_items
            FOR ALL
            USING (organization_id = app_current_org_id())
            WITH CHECK (organization_id = app_current_org_id());
    `);
}

export async function down(pgm: MigrationBuilder): Promise<void> {
    pgm.sql(`
        DROP POLICY IF EXISTS p_kb_items_org ON kb_items;
        DROP POLICY IF EXISTS p_kb_folders_org ON kb_folders;
    `);
    pgm.dropTable("kb_items");
    pgm.dropTable("kb_folders");
}

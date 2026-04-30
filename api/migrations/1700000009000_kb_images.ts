import type { MigrationBuilder } from "node-pg-migrate";

export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS kb_images (
            id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
            user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
            url             TEXT        NOT NULL,
            caption         TEXT        NOT NULL DEFAULT '',
            display_order   INTEGER     NOT NULL DEFAULT 0,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_kb_images_user  ON kb_images (user_id, display_order);
        CREATE INDEX IF NOT EXISTS idx_kb_images_org   ON kb_images (organization_id);

        DROP POLICY IF EXISTS p_kb_images_org ON kb_images;
        CREATE POLICY p_kb_images_org ON kb_images
            FOR ALL
            USING (organization_id = app_current_org_id())
            WITH CHECK (organization_id = app_current_org_id());
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        DROP POLICY IF EXISTS p_kb_images_org ON kb_images;
        DROP TABLE IF EXISTS kb_images;
    `);
};

import type { MigrationBuilder } from "node-pg-migrate";

export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        -- ─── organizations ──────────────────────────────────────────────────
        CREATE TABLE organizations (
            id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            name        TEXT        NOT NULL,
            slug        TEXT        NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_organizations_slug UNIQUE (slug),
            CONSTRAINT ck_organizations_slug_format CHECK (slug ~ '^[a-z0-9][a-z0-9-]*$')
        );
        CREATE TRIGGER trg_organizations_updated_at
            BEFORE UPDATE ON organizations
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

        -- ─── memberships ────────────────────────────────────────────────────
        CREATE TABLE memberships (
            id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            organization_id UUID        NOT NULL REFERENCES organizations (id) ON DELETE CASCADE,
            role            TEXT        NOT NULL DEFAULT 'member'
                                CHECK (role IN ('owner', 'admin', 'member')),
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_memberships_user_org UNIQUE (user_id, organization_id)
        );
        CREATE INDEX idx_memberships_user ON memberships (user_id);
        CREATE INDEX idx_memberships_org  ON memberships (organization_id);
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        DROP TABLE IF EXISTS memberships;
        DROP TABLE IF EXISTS organizations;
    `);
};

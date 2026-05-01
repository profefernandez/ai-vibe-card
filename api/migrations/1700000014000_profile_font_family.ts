import type { MigrationBuilder } from "node-pg-migrate";

export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE profiles
            ADD COLUMN IF NOT EXISTS font_family TEXT NOT NULL DEFAULT 'hybrid';

        ALTER TABLE profiles
            DROP CONSTRAINT IF EXISTS ck_profiles_font_family;

        ALTER TABLE profiles
            ADD CONSTRAINT ck_profiles_font_family
            CHECK (font_family IN ('inter', 'hybrid', 'playfair'));
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE profiles
            DROP CONSTRAINT IF EXISTS ck_profiles_font_family;

        ALTER TABLE profiles
            DROP COLUMN IF EXISTS font_family;
    `);
};

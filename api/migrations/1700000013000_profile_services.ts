import type { MigrationBuilder } from "node-pg-migrate";

export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE profiles
            ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]';
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE profiles
            DROP COLUMN IF EXISTS services;
    `);
};

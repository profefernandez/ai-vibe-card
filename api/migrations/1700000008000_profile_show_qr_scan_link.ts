import type { MigrationBuilder } from "node-pg-migrate";

export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE profiles
            ADD COLUMN IF NOT EXISTS show_qr_scan_link BOOLEAN NOT NULL DEFAULT FALSE;
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        ALTER TABLE profiles
            DROP COLUMN IF EXISTS show_qr_scan_link;
    `);
};

import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Replaces the ordered unique constraint on `connections (requester_id, owner_id)`
 * with an unordered functional unique index on
 * `(LEAST(requester_id, owner_id), GREATEST(requester_id, owner_id))`.
 *
 * The original constraint allows BOTH `(A→B)` and `(B→A)` rows to coexist —
 * so two users could each open a "pending" request to the other and the DB
 * had no opinion. The route handler in `routes/card.ts` (search for
 * "either direction") checks for the reciprocal pair in code, but enforcement
 * belonged in the database.
 *
 * Refusal-to-apply policy: this migration does NOT auto-delete reciprocal
 * duplicates. If any exist, the up() raises and the operator must reconcile
 * manually (typically: keep the earliest, drop the later — but there's no
 * universally correct merge, so we don't make the choice here).
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        -- Refuse to apply if reciprocal duplicates exist. The functional
        -- unique index would fail with a less-helpful "could not create
        -- unique index" otherwise.
        DO $$
        DECLARE
            dup_count INTEGER;
        BEGIN
            SELECT COUNT(*) INTO dup_count FROM (
                SELECT LEAST(requester_id, owner_id) AS a,
                       GREATEST(requester_id, owner_id) AS b,
                       COUNT(*)
                FROM connections
                GROUP BY 1, 2
                HAVING COUNT(*) > 1
            ) AS dups;
            IF dup_count > 0 THEN
                RAISE EXCEPTION 'Cannot apply unordered unique index: % reciprocal pairs exist. Manually remove duplicates first.', dup_count;
            END IF;
        END $$;

        -- Drop the ordered constraint and replace with an unordered functional
        -- unique index. LEAST/GREATEST canonicalise the pair regardless of who
        -- requested whom.
        ALTER TABLE connections DROP CONSTRAINT IF EXISTS uq_connections_pair;
        CREATE UNIQUE INDEX IF NOT EXISTS uq_connections_unordered
            ON connections (LEAST(requester_id, owner_id), GREATEST(requester_id, owner_id));
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        DROP INDEX IF EXISTS uq_connections_unordered;
        ALTER TABLE connections
            ADD CONSTRAINT uq_connections_pair UNIQUE (requester_id, owner_id);
    `);
};

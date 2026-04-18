import type { MigrationBuilder } from "node-pg-migrate";

/**
 * AI feedback table — anonymous thumbs-up / thumbs-down ratings on assistant
 * responses from the ExplorePanel chat surface.
 *
 * Privacy-first: we store snapshots of question and answer text so that
 * card owners and the platform operator can later review aggregate signals
 * (e.g. `% thumbs-down by card`, `topics with high complaint rates`) without
 * ever needing to peek at live conversations. All columns except `rating`
 * and `created_at` are optional.
 *
 * profile_id references profiles(user_id). That column has a UNIQUE
 * constraint (uq_profiles_user), so a foreign key against it is valid.
 * Using user_id (rather than profiles.id) lets us outlive profile-row churn
 * and keeps joins with users/memberships straightforward.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        CREATE TABLE IF NOT EXISTS ai_feedback (
            id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            profile_id      UUID        NULL REFERENCES profiles (user_id) ON DELETE SET NULL,
            rating          TEXT        NOT NULL CHECK (rating IN ('up', 'down')),
            comment         TEXT        NULL,
            question_text   TEXT        NULL,
            answer_text     TEXT        NULL,
            conversation_id UUID        NULL,
            ip_address      INET        NULL,
            user_agent      TEXT        NULL,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_ai_feedback_profile_id ON ai_feedback (profile_id);
        CREATE INDEX IF NOT EXISTS idx_ai_feedback_created_at ON ai_feedback (created_at);
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        DROP INDEX IF EXISTS idx_ai_feedback_created_at;
        DROP INDEX IF EXISTS idx_ai_feedback_profile_id;
        DROP TABLE IF EXISTS ai_feedback;
    `);
};

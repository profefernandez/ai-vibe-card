-- =============================================================================
-- 0005_ai_feedback.sql
-- Anonymous thumbs-up / thumbs-down on visitor chat replies, plus the
-- replay-protection nonce store that backs HMAC feedback tokens.
--
-- Replaces the legacy Express endpoint POST /api/feedback and migrations
--   api/migrations/1700000003000_ai_feedback.ts        (ai_feedback table)
--   api/migrations/1700000004000_..._feedback_consumed (replay store)
--
-- Differences from the legacy schema:
--   * Single-tenant: `ai_feedback.profile_id` references `auth.users(id)`
--     directly (no `profiles(user_id)` indirection).
--   * No `failed_login_count` / `locked_until` here — Supabase Auth handles
--     login lockout natively, so only the feedback halves of the legacy
--     migration carry over.
--
-- Privacy note: the table snapshots question + answer text so platform
-- operators can later review aggregate signals (`% thumbs-down by card`,
-- topics with high complaint rates) without ever needing to read live
-- conversations. RLS makes sure card owners can only see feedback bound
-- to their own profile_id.
-- =============================================================================

-- ── ai_feedback ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_feedback (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id      UUID        DEFAULT NULL REFERENCES auth.users (id) ON DELETE SET NULL,
    rating          TEXT        NOT NULL CHECK (rating IN ('up', 'down')),
    comment         TEXT        DEFAULT NULL,
    question_text   TEXT        DEFAULT NULL,
    answer_text     TEXT        DEFAULT NULL,
    conversation_id UUID        DEFAULT NULL,
    ip_address      INET        DEFAULT NULL,
    user_agent      TEXT        DEFAULT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_feedback_profile    ON public.ai_feedback (profile_id);
CREATE INDEX IF NOT EXISTS idx_ai_feedback_created_at ON public.ai_feedback (created_at DESC);


-- ── feedback_consumed (HMAC replay-protection nonce store) ────────────────
-- One row per accepted feedback signature. The PK provides O(1) replay
-- detection — INSERT fails with 23505 (unique_violation) if a token is
-- replayed. Pruned by a future retention job once entries are past the
-- HMAC token expiry window (24h).
CREATE TABLE IF NOT EXISTS public.feedback_consumed (
    signature_hash  TEXT        PRIMARY KEY,
    used_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feedback_consumed_used_at
    ON public.feedback_consumed (used_at);


-- ── RLS ───────────────────────────────────────────────────────────────────
-- Both tables are written exclusively by the `feedback` Edge Function via
-- the service-role client (which bypasses RLS). Clients hold no INSERT /
-- UPDATE / DELETE policies, and only `ai_feedback` exposes a SELECT for
-- card owners against their own profile_id.

ALTER TABLE public.ai_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_feedback FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_feedback_owner_select ON public.ai_feedback;
CREATE POLICY ai_feedback_owner_select ON public.ai_feedback
    FOR SELECT TO authenticated
    USING (auth.uid() = profile_id);
-- No INSERT / UPDATE / DELETE policies → blocked for anon + authenticated.


ALTER TABLE public.feedback_consumed ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feedback_consumed FORCE  ROW LEVEL SECURITY;
-- No policies at all → blocked for anon + authenticated. Only the
-- service-role client (used by the Edge Function) can read/write.

-- =============================================================================
-- 0001_init_schema.sql
-- ai-vibe-card initial Supabase schema.
--
-- Differences from the legacy database/setup.sql:
--   * No `users` / `sessions` tables — Supabase Auth (auth.users + refresh
--     tokens managed by GoTrue) replaces them.
--   * Every `user_id` column references `auth.users(id)` so RLS policies can
--     use `auth.uid()` directly.
--   * Adds `profiles.is_published` so public card reads can be gated by RLS
--     instead of by the API layer.
--
-- Run with the Supabase CLI (`supabase db push`) or paste into the SQL editor.
-- RLS policies live in 0002_rls_policies.sql; this file only defines schema.
-- =============================================================================

-- ── Required extensions ─────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;    -- trigram fuzzy search

-- ── Shared updated_at trigger ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;


-- ── PROFILES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
    id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    display_name    TEXT        NOT NULL DEFAULT '',
    tagline         TEXT        NOT NULL DEFAULT '',
    bio             TEXT        NOT NULL DEFAULT '',
    avatar_url      TEXT        NOT NULL DEFAULT '',
    cta_url         TEXT        NOT NULL DEFAULT '',
    cta_label       TEXT        NOT NULL DEFAULT 'Get in Touch',
    cta_embed       TEXT        NOT NULL DEFAULT '',
    social_links    JSONB       NOT NULL DEFAULT '[]',
    card_layout     TEXT        NOT NULL DEFAULT 'classic'
                          CHECK (card_layout IN ('classic', 'bold')),
    theme           TEXT        NOT NULL DEFAULT 'dark'
                          CHECK (theme IN ('dark', 'light', 'system')),
    accent_color    TEXT        NOT NULL DEFAULT 'amber',
    seo_title       TEXT        NOT NULL DEFAULT '',
    seo_description TEXT        NOT NULL DEFAULT '',
    og_image_url    TEXT        NOT NULL DEFAULT '',
    twitter_handle  TEXT        NOT NULL DEFAULT '',
    robots_txt      JSONB       NOT NULL DEFAULT
        '[{"userAgent":"*","rules":[{"action":"allow","path":"/"}]}]',
    slug            TEXT        NOT NULL DEFAULT '',
    ai_query_enabled BOOLEAN    NOT NULL DEFAULT false,
    -- New: explicit publish flag drives the public read RLS policy.
    is_published    BOOLEAN     NOT NULL DEFAULT false,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_profiles_user UNIQUE (user_id),
    CONSTRAINT uq_profiles_slug UNIQUE (slug)
);

CREATE INDEX IF NOT EXISTS idx_profiles_slug
    ON public.profiles (slug) WHERE slug <> '';

DROP TRIGGER IF EXISTS trg_profiles_updated_at ON public.profiles;
CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


-- ── SITES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sites (
    id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                 UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    domain                  TEXT        NOT NULL,
    name                    TEXT        DEFAULT NULL,
    verified                BOOLEAN     NOT NULL DEFAULT FALSE,
    verification_token      TEXT        DEFAULT NULL,
    verification_method     TEXT        DEFAULT NULL
                                CHECK (verification_method IN ('dns_txt', 'meta_tag')),
    verified_at             TIMESTAMPTZ DEFAULT NULL,
    verification_expires_at TIMESTAMPTZ DEFAULT NULL,
    scrape_status           TEXT        NOT NULL DEFAULT 'pending'
                                CHECK (scrape_status IN ('pending', 'scraping', 'completed', 'error')),
    page_count              INTEGER     NOT NULL DEFAULT 0  CHECK (page_count >= 0),
    share_usage_limit       INTEGER     NOT NULL DEFAULT 10 CHECK (share_usage_limit >= 0),
    last_scraped_at         TIMESTAMPTZ DEFAULT NULL,
    refresh_interval_hours  INTEGER     NOT NULL DEFAULT 24 CHECK (refresh_interval_hours >= 1),
    created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sites_user_domain UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_sites_user   ON public.sites (user_id);
CREATE INDEX IF NOT EXISTS idx_sites_domain ON public.sites (domain);

DROP TRIGGER IF EXISTS trg_sites_updated_at ON public.sites;
CREATE TRIGGER trg_sites_updated_at
    BEFORE UPDATE ON public.sites
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


-- ── SITE_PAGES ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.site_pages (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id     UUID        NOT NULL REFERENCES public.sites (id) ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    title       TEXT        DEFAULT NULL,
    markdown    TEXT        DEFAULT NULL,
    html        TEXT        DEFAULT NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pages_site     ON public.site_pages (site_id);
CREATE INDEX IF NOT EXISTS idx_pages_metadata ON public.site_pages USING GIN (metadata);


-- ── CONTENT_BLOCKS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.content_blocks (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    site_id     UUID        NOT NULL REFERENCES public.sites (id) ON DELETE CASCADE,
    page_id     UUID        NOT NULL REFERENCES public.site_pages (id) ON DELETE CASCADE,
    heading     TEXT        DEFAULT NULL,
    body        TEXT        DEFAULT NULL,
    images      TEXT[]      NOT NULL DEFAULT '{}',
    tags        TEXT[]      NOT NULL DEFAULT '{}',
    category    TEXT        DEFAULT NULL,
    visibility  TEXT        NOT NULL DEFAULT 'public'
                            CHECK (visibility IN ('public', 'internal', 'draft')),
    block_order INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocks_site     ON public.content_blocks (site_id);
CREATE INDEX IF NOT EXISTS idx_blocks_page     ON public.content_blocks (page_id);
CREATE INDEX IF NOT EXISTS idx_blocks_category ON public.content_blocks (category);
CREATE INDEX IF NOT EXISTS idx_blocks_order    ON public.content_blocks (site_id, block_order);

CREATE INDEX IF NOT EXISTS idx_blocks_fts ON public.content_blocks
    USING GIN (to_tsvector('english',
        coalesce(heading, '') || ' ' || coalesce(body, '')
    ));

CREATE INDEX IF NOT EXISTS idx_blocks_trgm_body ON public.content_blocks
    USING GIN (body gin_trgm_ops);


-- ── AI_PREFERENCES ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ai_preferences (
    id                     UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id                UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    system_prompt          TEXT        NOT NULL DEFAULT '',
    rules                  JSONB       NOT NULL DEFAULT '[]',
    personality            TEXT        NOT NULL DEFAULT 'professional',
    response_style         TEXT        NOT NULL DEFAULT 'friendly',
    prompt_injection_rules JSONB       NOT NULL DEFAULT '[]',
    safety_protocol        TEXT        NOT NULL DEFAULT '',
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ai_prefs_user UNIQUE (user_id)
);

DROP TRIGGER IF EXISTS trg_ai_prefs_updated_at ON public.ai_preferences;
CREATE TRIGGER trg_ai_prefs_updated_at
    BEFORE UPDATE ON public.ai_preferences
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


-- ── API_CONNECTIONS (encrypted at app layer; never store plaintext) ─────────
CREATE TABLE IF NOT EXISTS public.api_connections (
    id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id           UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    provider          TEXT        NOT NULL,
    api_key_encrypted TEXT        NOT NULL DEFAULT '',
    model_name        TEXT        DEFAULT '',
    is_active         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_api_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_api_user ON public.api_connections (user_id);


-- ── CONNECTIONS (card-to-card networking) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS public.connections (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    requester_id  UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    owner_id      UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    status        TEXT        NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending', 'approved', 'declined')),
    message       TEXT        NOT NULL DEFAULT '',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    approved_at   TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT uq_connections_pair UNIQUE (requester_id, owner_id),
    CONSTRAINT ck_connections_no_self CHECK (requester_id <> owner_id)
);

CREATE INDEX IF NOT EXISTS idx_connections_owner     ON public.connections (owner_id);
CREATE INDEX IF NOT EXISTS idx_connections_requester ON public.connections (requester_id);
CREATE INDEX IF NOT EXISTS idx_connections_status    ON public.connections (owner_id, status);

DROP TRIGGER IF EXISTS trg_connections_updated_at ON public.connections;
CREATE TRIGGER trg_connections_updated_at
    BEFORE UPDATE ON public.connections
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


-- ── AUDIT_LOG ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        DEFAULT NULL,
    action      TEXT        NOT NULL,
    table_name  TEXT        NOT NULL DEFAULT '',
    record_id   UUID        DEFAULT NULL,
    old_values  JSONB       DEFAULT NULL,
    new_values  JSONB       DEFAULT NULL,
    ip_address  INET        DEFAULT NULL,
    user_agent  TEXT        DEFAULT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user    ON public.audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON public.audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON public.audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_auth    ON public.audit_log (action, created_at DESC)
    WHERE action IN ('login', 'signup', 'logout', 'failed_login', 'password_reset');

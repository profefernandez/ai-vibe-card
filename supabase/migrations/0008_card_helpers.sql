-- 0008_card_helpers.sql
--
-- Public-card RPC used by `src/pages/CardShare.tsx`.
--
-- Why an RPC instead of a plain `from('profiles').select(...)`:
--   * Anon callers need the profile *and* a single `site_id` (the
--     oldest-created verified site, mirroring `api/routes/card.ts:42`)
--     so the public-card AI search panel can call `lemonade-chat`.
--   * The `sites` table currently has owner-only RLS — broadening it to
--     anon would expose `verification_token`, `last_error`, etc. which we
--     don't want to publish.
--   * SECURITY DEFINER lets us return only the columns we *want* to
--     publish, with the same `is_published = TRUE` gate the existing
--     `profiles_public_select` policy enforces.
--
-- Mirrors `api/routes/card.ts:35-47` exactly. Added columns
-- (`services`, `font_family`, `show_qr_scan_link`) are defaults the legacy
-- DB has had since `api/migrations/170000000{8,14}*` — the equivalent
-- Supabase migration was never written, so we add them here too as
-- idempotent `ADD COLUMN IF NOT EXISTS` so projects on either schema apply
-- this file without error.

-- Backfill columns the Supabase init schema didn't include but the front
-- end now relies on. Defaults match the legacy Express migrations.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS services JSONB NOT NULL DEFAULT '[]';

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS font_family TEXT NOT NULL DEFAULT 'hybrid';

ALTER TABLE public.profiles
    DROP CONSTRAINT IF EXISTS ck_profiles_font_family;
ALTER TABLE public.profiles
    ADD CONSTRAINT ck_profiles_font_family
        CHECK (font_family IN ('inter', 'hybrid', 'playfair'));

ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS show_qr_scan_link BOOLEAN NOT NULL DEFAULT FALSE;


CREATE OR REPLACE FUNCTION public.get_card_by_slug(p_slug TEXT)
RETURNS TABLE (
    user_id           UUID,
    display_name      TEXT,
    tagline           TEXT,
    bio               TEXT,
    avatar_url        TEXT,
    cta_url           TEXT,
    cta_label         TEXT,
    cta_embed         TEXT,
    social_links      JSONB,
    services          JSONB,
    card_layout       TEXT,
    font_family       TEXT,
    theme             TEXT,
    accent_color      TEXT,
    seo_title         TEXT,
    seo_description   TEXT,
    og_image_url      TEXT,
    twitter_handle    TEXT,
    robots_txt        JSONB,
    slug              TEXT,
    ai_query_enabled  BOOLEAN,
    show_qr_scan_link BOOLEAN,
    site_id           UUID
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, pg_temp
STABLE
AS $$
    SELECT p.user_id,
           p.display_name,
           p.tagline,
           p.bio,
           p.avatar_url,
           p.cta_url,
           p.cta_label,
           p.cta_embed,
           p.social_links,
           p.services,
           p.card_layout,
           p.font_family,
           p.theme,
           p.accent_color,
           p.seo_title,
           p.seo_description,
           p.og_image_url,
           p.twitter_handle,
           p.robots_txt,
           p.slug,
           p.ai_query_enabled,
           p.show_qr_scan_link,
           (SELECT s.id
              FROM public.sites s
              WHERE s.user_id = p.user_id
                AND s.verified = TRUE
              ORDER BY s.created_at ASC
              LIMIT 1) AS site_id
      FROM public.profiles p
     WHERE LOWER(p.slug) = LOWER(p_slug)
       AND p.is_published = TRUE;
$$;

REVOKE ALL ON FUNCTION public.get_card_by_slug(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_card_by_slug(TEXT) TO anon, authenticated;

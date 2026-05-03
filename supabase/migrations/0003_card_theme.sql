-- =============================================================================
-- 0003_card_theme.sql
-- Design-tokens table that drives the redesigned, admin-controlled front end.
--
-- The public card is a skeleton. Every visual decision (color, typography,
-- shape, layout, motion, imagery) lives here as JSONB and is applied at
-- render time via CSS custom properties. The admin's "Design" section is
-- the only writer; the public card is a read-only consumer.
--
-- We intentionally use a single JSONB `tokens` column instead of dozens of
-- typed columns: tokens evolve frequently during the redesign, and the
-- shape is enforced in the application layer with a zod schema
-- (`cardThemeSchema`). Migrations to add validated columns can be added
-- later if a token graduates to a stable, queryable field.
-- =============================================================================

-- ── CARD_THEME ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.card_theme (
    id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    -- Full token document. Validated against `cardThemeSchema` (zod) before
    -- write. See src/lib/validations.ts.
    tokens       JSONB       NOT NULL DEFAULT '{}',
    -- Optional named preset the user started from (Editorial, Neon, etc.).
    preset       TEXT        NOT NULL DEFAULT '',
    -- Mirrors profiles.is_published so anon visitors of a published card
    -- can read the theme via RLS without joining through profiles.
    is_published BOOLEAN     NOT NULL DEFAULT false,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_card_theme_user UNIQUE (user_id)
);

CREATE INDEX IF NOT EXISTS idx_card_theme_user ON public.card_theme (user_id);

DROP TRIGGER IF EXISTS trg_card_theme_updated_at ON public.card_theme;
CREATE TRIGGER trg_card_theme_updated_at
    BEFORE UPDATE ON public.card_theme
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


-- ── CARD_THEME_VERSIONS (revert history) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS public.card_theme_versions (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    tokens      JSONB       NOT NULL,
    preset      TEXT        NOT NULL DEFAULT '',
    note        TEXT        NOT NULL DEFAULT '',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_card_theme_versions_user
    ON public.card_theme_versions (user_id, created_at DESC);


-- ── RLS ────────────────────────────────────────────────────────────────────
ALTER TABLE public.card_theme          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_theme          FORCE  ROW LEVEL SECURITY;
ALTER TABLE public.card_theme_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_theme_versions FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS card_theme_owner_all     ON public.card_theme;
DROP POLICY IF EXISTS card_theme_public_select ON public.card_theme;

CREATE POLICY card_theme_owner_all ON public.card_theme
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Public read of a published theme so anon visitors of /c/:slug can render.
CREATE POLICY card_theme_public_select ON public.card_theme
    FOR SELECT TO anon, authenticated
    USING (is_published = true);

DROP POLICY IF EXISTS card_theme_versions_owner_all ON public.card_theme_versions;
CREATE POLICY card_theme_versions_owner_all ON public.card_theme_versions
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

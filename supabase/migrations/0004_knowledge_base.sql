-- =============================================================================
-- 0004_knowledge_base.sql
-- Knowledge Base schema for ai-vibe-card.
--
-- Three new owner-scoped tables (`kb_folders`, `kb_items`, `kb_images`) and
-- their RLS policies. They replace the legacy Express endpoints
--   GET/POST/PATCH/DELETE /api/kb/folders[/:id]
--   GET/POST/PATCH/DELETE /api/kb/items[/:id]
--   POST                  /api/kb/upload
--   GET/PATCH/DELETE      /api/kb-images[/:id]
--   GET                   /api/kb-images/public/:user_id
-- which have been talking to a self-hosted PostgreSQL on the VPS.
--
-- Differences from the legacy schema (api/migrations/170000001*_kb_*.ts):
--   * No `organization_id` column. The Supabase build is single-tenant per
--     user; rows are owned by `user_id` and RLS uses `auth.uid()` directly.
--   * `kb_images` adds a public-read policy gated by `profiles.is_published`,
--     matching the public card's `kbImages.listPublic(profileId)` call so
--     anon visitors of `/c/:slug` can render hero/explore images.
--   * Storage paths follow the same `{auth.uid()}/...` convention introduced
--     for `avatars` in 0002_rls_policies.sql.
--
-- Storage buckets used by the application code:
--   * `kb-images` — public-read; per-user write; holds image files referenced
--                   by `kb_images.url` and `kb_items.url` (for type='image').
--   * `kb-files`  — private; per-user read+write; holds PDFs and other
--                   non-image attachments referenced by `kb_items.url`
--                   (for type='file'). Served via signed URLs.
--
-- Buckets must be created once in the Supabase dashboard (or via the
-- management API) before this migration's storage policies can take effect.
-- =============================================================================


-- ── KB_FOLDERS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kb_folders (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    parent_id     UUID                 REFERENCES public.kb_folders (id) ON DELETE CASCADE,
    name          TEXT        NOT NULL,
    -- 'manual' = user-created; 'scrape' = produced by a scrape job;
    -- 'system' = built-in (e.g. inbox). Mirrors the legacy schema so the
    -- shim's TypeScript union ("manual" | "scrape" | "system") still matches.
    kind          TEXT        NOT NULL DEFAULT 'manual'
                        CHECK (kind IN ('manual', 'scrape', 'system')),
    source        TEXT,
    use_for_ai    BOOLEAN     NOT NULL DEFAULT true,
    decorative    BOOLEAN     NOT NULL DEFAULT false,
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- A folder can't be its own parent. (Deeper cycles are still possible
    -- via SQL but blocked at the application layer in `kbFolders.update`.)
    CONSTRAINT chk_kb_folders_parent CHECK (parent_id IS DISTINCT FROM id)
);

CREATE INDEX IF NOT EXISTS idx_kb_folders_user_parent
    ON public.kb_folders (user_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_kb_folders_source
    ON public.kb_folders (source);

DROP TRIGGER IF EXISTS trg_kb_folders_updated_at ON public.kb_folders;
CREATE TRIGGER trg_kb_folders_updated_at
    BEFORE UPDATE ON public.kb_folders
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


-- ── KB_ITEMS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.kb_items (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    folder_id     UUID        NOT NULL REFERENCES public.kb_folders (id) ON DELETE CASCADE,
    -- 'text'  → use `content`
    -- 'image' → use `url` (lives in storage bucket `kb-images`)
    -- 'file'  → use `url` (lives in storage bucket `kb-files`)
    type          TEXT        NOT NULL
                        CHECK (type IN ('text', 'image', 'file')),
    title         TEXT,
    content       TEXT,
    url           TEXT,
    mime_type     TEXT,
    file_size     INTEGER,
    caption       TEXT        NOT NULL DEFAULT '',
    source        TEXT        NOT NULL DEFAULT 'manual',
    source_url    TEXT,
    status        TEXT        NOT NULL DEFAULT 'ready'
                        CHECK (status IN ('ready', 'processing', 'error')),
    metadata      JSONB       NOT NULL DEFAULT '{}',
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Per type, exactly one payload field is required.
    CONSTRAINT chk_kb_items_payload CHECK (
        (type = 'text'  AND content IS NOT NULL) OR
        (type IN ('image', 'file') AND url IS NOT NULL)
    )
);

CREATE INDEX IF NOT EXISTS idx_kb_items_folder
    ON public.kb_items (folder_id, display_order);
CREATE INDEX IF NOT EXISTS idx_kb_items_user_type
    ON public.kb_items (user_id, type);

DROP TRIGGER IF EXISTS trg_kb_items_updated_at ON public.kb_items;
CREATE TRIGGER trg_kb_items_updated_at
    BEFORE UPDATE ON public.kb_items
    FOR EACH ROW EXECUTE FUNCTION public.fn_set_updated_at();


-- ── KB_IMAGES ──────────────────────────────────────────────────────────────
-- Lightweight image library used by the hero slider / explore panel on the
-- public card. Distinct from `kb_items` (which is the AI knowledge corpus)
-- because it has no folder/use_for_ai concept and is read by anon visitors.
CREATE TABLE IF NOT EXISTS public.kb_images (
    id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id       UUID        NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
    url           TEXT        NOT NULL,
    caption       TEXT        NOT NULL DEFAULT '',
    display_order INTEGER     NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kb_images_user
    ON public.kb_images (user_id, display_order);


-- =============================================================================
-- ROW-LEVEL SECURITY
-- =============================================================================

-- ── kb_folders ─────────────────────────────────────────────────────────────
ALTER TABLE public.kb_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_folders FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_folders_owner_all ON public.kb_folders;
CREATE POLICY kb_folders_owner_all ON public.kb_folders
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ── kb_items ───────────────────────────────────────────────────────────────
ALTER TABLE public.kb_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_items FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_items_owner_all ON public.kb_items;
CREATE POLICY kb_items_owner_all ON public.kb_items
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ── kb_images ──────────────────────────────────────────────────────────────
ALTER TABLE public.kb_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kb_images FORCE  ROW LEVEL SECURITY;

DROP POLICY IF EXISTS kb_images_owner_all     ON public.kb_images;
DROP POLICY IF EXISTS kb_images_public_select ON public.kb_images;

-- Owners always have full access to their own rows.
CREATE POLICY kb_images_owner_all ON public.kb_images
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Anon visitors of /c/:slug can read images that belong to a published
-- profile. Matches `kbImages.listPublic(profileId)` on the front end.
CREATE POLICY kb_images_public_select ON public.kb_images
    FOR SELECT TO anon, authenticated
    USING (
        EXISTS (
            SELECT 1 FROM public.profiles p
            WHERE p.user_id = kb_images.user_id
              AND p.is_published = true
        )
    );


-- =============================================================================
-- STORAGE BUCKET POLICIES
--
-- The buckets themselves are created in the Supabase dashboard (or via the
-- management API) — `INSERT INTO storage.buckets` requires elevated
-- permissions and is intentionally not part of this migration. Once the
-- buckets exist with the names below, these policies grant per-user access.
--
-- Path convention (matches `avatars`): `{auth.uid()}/<filename>`.
-- =============================================================================

-- ── kb-images bucket ──────────────────────────────────────────────────────
-- Public-read so anon visitors can render hero/explore images straight from
-- the bucket via the public URL stored in `kb_images.url`.
--
-- Migration 0002 created a single FOR ALL policy `storage_kb_images_owner_rw`
-- on this bucket as a placeholder. We drop it here and replace with the
-- finer-grained INSERT/UPDATE/DELETE + public SELECT policies below so the
-- two policies don't coexist with overlapping intent.
DROP POLICY IF EXISTS storage_kb_images_owner_rw     ON storage.objects;
DROP POLICY IF EXISTS storage_kb_images_owner_write  ON storage.objects;
DROP POLICY IF EXISTS storage_kb_images_owner_update ON storage.objects;
DROP POLICY IF EXISTS storage_kb_images_owner_delete ON storage.objects;
DROP POLICY IF EXISTS storage_kb_images_public_read  ON storage.objects;

CREATE POLICY storage_kb_images_owner_write ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (
        bucket_id = 'kb-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY storage_kb_images_owner_update ON storage.objects
    FOR UPDATE TO authenticated
    USING (
        bucket_id = 'kb-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'kb-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY storage_kb_images_owner_delete ON storage.objects
    FOR DELETE TO authenticated
    USING (
        bucket_id = 'kb-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

CREATE POLICY storage_kb_images_public_read ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'kb-images');


-- ── kb-files bucket ───────────────────────────────────────────────────────
-- Private. PDFs/etc. are served to the owner via signed URLs and never read
-- by anon visitors directly.
DROP POLICY IF EXISTS storage_kb_files_owner_all ON storage.objects;

CREATE POLICY storage_kb_files_owner_all ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'kb-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'kb-files'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

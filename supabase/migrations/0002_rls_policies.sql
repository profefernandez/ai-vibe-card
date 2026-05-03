-- =============================================================================
-- 0002_rls_policies.sql
-- Row-Level Security for ai-vibe-card.
--
-- Once the Express API is retired, RLS is the ONLY authorization fence — the
-- browser holds the user's JWT and queries Supabase directly. Every public
-- table has RLS enabled and explicit policies for SELECT / INSERT / UPDATE /
-- DELETE.
--
-- Conventions:
--   * "owner-only" tables: rows have a `user_id` column; only `auth.uid() =
--     user_id` can read/write.
--   * `profiles` additionally allows public anonymous SELECT when
--     `is_published = true` so /c/:slug renders for logged-out visitors.
--   * `audit_log`: clients can never INSERT or DELETE; writes go through
--     Edge Functions running with the service role.
-- =============================================================================

-- ── Helper: child rows of a user-owned site ────────────────────────────────
-- site_pages and content_blocks don't carry user_id directly; they inherit
-- from sites. This SQL function keeps policies readable.
CREATE OR REPLACE FUNCTION public.fn_owns_site(target_site UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY INVOKER AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.sites s
        WHERE s.id = target_site AND s.user_id = auth.uid()
    );
$$;


-- ── PROFILES ───────────────────────────────────────────────────────────────
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS profiles_owner_select  ON public.profiles;
DROP POLICY IF EXISTS profiles_public_select ON public.profiles;
DROP POLICY IF EXISTS profiles_owner_insert  ON public.profiles;
DROP POLICY IF EXISTS profiles_owner_update  ON public.profiles;
DROP POLICY IF EXISTS profiles_owner_delete  ON public.profiles;

-- Owners always see their own row.
CREATE POLICY profiles_owner_select ON public.profiles
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);

-- Anyone (including anon) can read a published profile. This is the public
-- card read path. Unpublished rows are NOT visible.
CREATE POLICY profiles_public_select ON public.profiles
    FOR SELECT TO anon, authenticated
    USING (is_published = true);

CREATE POLICY profiles_owner_insert ON public.profiles
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY profiles_owner_update ON public.profiles
    FOR UPDATE TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY profiles_owner_delete ON public.profiles
    FOR DELETE TO authenticated
    USING (auth.uid() = user_id);


-- ── SITES ──────────────────────────────────────────────────────────────────
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sites_owner_all ON public.sites;
CREATE POLICY sites_owner_all ON public.sites
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ── SITE_PAGES (inherit ownership from sites) ──────────────────────────────
ALTER TABLE public.site_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_pages FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS site_pages_owner_all ON public.site_pages;
CREATE POLICY site_pages_owner_all ON public.site_pages
    FOR ALL TO authenticated
    USING (public.fn_owns_site(site_id))
    WITH CHECK (public.fn_owns_site(site_id));


-- ── CONTENT_BLOCKS (inherit ownership from sites) ──────────────────────────
ALTER TABLE public.content_blocks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_blocks FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS content_blocks_owner_all   ON public.content_blocks;
DROP POLICY IF EXISTS content_blocks_public_read ON public.content_blocks;

CREATE POLICY content_blocks_owner_all ON public.content_blocks
    FOR ALL TO authenticated
    USING (public.fn_owns_site(site_id))
    WITH CHECK (public.fn_owns_site(site_id));

-- Public visitors of a published card can read public/non-draft content
-- blocks belonging to that card's owner's verified sites.
CREATE POLICY content_blocks_public_read ON public.content_blocks
    FOR SELECT TO anon, authenticated
    USING (
        visibility = 'public' AND EXISTS (
            SELECT 1
            FROM public.sites s
            JOIN public.profiles p ON p.user_id = s.user_id
            WHERE s.id = content_blocks.site_id
              AND s.verified = true
              AND p.is_published = true
        )
    );


-- ── AI_PREFERENCES ─────────────────────────────────────────────────────────
ALTER TABLE public.ai_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_preferences FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ai_prefs_owner_all ON public.ai_preferences;
CREATE POLICY ai_prefs_owner_all ON public.ai_preferences
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ── API_CONNECTIONS ────────────────────────────────────────────────────────
-- Note: api_key_encrypted is encrypted at the application layer (AES-256-GCM)
-- before insert. RLS prevents cross-user reads even if encryption were
-- somehow bypassed.
ALTER TABLE public.api_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.api_connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS api_connections_owner_all ON public.api_connections;
CREATE POLICY api_connections_owner_all ON public.api_connections
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);


-- ── CONNECTIONS (card-to-card requests) ────────────────────────────────────
ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connections FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS connections_party_select   ON public.connections;
DROP POLICY IF EXISTS connections_requester_ins  ON public.connections;
DROP POLICY IF EXISTS connections_owner_update   ON public.connections;
DROP POLICY IF EXISTS connections_party_delete   ON public.connections;

-- Both parties (requester and owner) can read the row.
CREATE POLICY connections_party_select ON public.connections
    FOR SELECT TO authenticated
    USING (auth.uid() = requester_id OR auth.uid() = owner_id);

-- Only the requester may create the request, and only as themselves.
CREATE POLICY connections_requester_ins ON public.connections
    FOR INSERT TO authenticated
    WITH CHECK (auth.uid() = requester_id AND auth.uid() <> owner_id);

-- Only the card owner may approve/decline.
CREATE POLICY connections_owner_update ON public.connections
    FOR UPDATE TO authenticated
    USING (auth.uid() = owner_id)
    WITH CHECK (auth.uid() = owner_id);

-- Either party may delete (e.g., requester withdraws or owner removes).
CREATE POLICY connections_party_delete ON public.connections
    FOR DELETE TO authenticated
    USING (auth.uid() = requester_id OR auth.uid() = owner_id);


-- ── AUDIT_LOG ──────────────────────────────────────────────────────────────
-- Append-only from the user's perspective: clients can SELECT their own
-- entries but cannot INSERT, UPDATE, or DELETE. Edge Functions running with
-- the service role bypass RLS to write rows.
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_owner_select ON public.audit_log;
CREATE POLICY audit_log_owner_select ON public.audit_log
    FOR SELECT TO authenticated
    USING (auth.uid() = user_id);
-- No INSERT / UPDATE / DELETE policies → blocked for anon and authenticated.


-- =============================================================================
-- Storage bucket policies — apply once after creating the buckets.
-- (These reference storage.objects; included here so the policy is versioned
-- alongside the schema. Safe to re-run.)
-- =============================================================================

-- Per-user folder convention: object name MUST start with `{auth.uid()}/`.
-- Replace `avatars` with each bucket name when creating policies in the
-- Supabase dashboard. The same shape applies to `kb-images` and `uploads`.

DROP POLICY IF EXISTS storage_avatars_owner_rw ON storage.objects;
CREATE POLICY storage_avatars_owner_rw ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'avatars'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS storage_avatars_public_read ON storage.objects;
CREATE POLICY storage_avatars_public_read ON storage.objects
    FOR SELECT TO anon, authenticated
    USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS storage_kb_images_owner_rw ON storage.objects;
CREATE POLICY storage_kb_images_owner_rw ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'kb-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'kb-images'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

DROP POLICY IF EXISTS storage_uploads_owner_rw ON storage.objects;
CREATE POLICY storage_uploads_owner_rw ON storage.objects
    FOR ALL TO authenticated
    USING (
        bucket_id = 'uploads'
        AND (storage.foldername(name))[1] = auth.uid()::text
    )
    WITH CHECK (
        bucket_id = 'uploads'
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

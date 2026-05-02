# Supabase

This directory contains Supabase migrations (and, in a later phase, Edge
Functions) for ai-vibe-card. Supabase is the data, auth, and storage backend;
the SPA itself is still a static build uploaded to the Scala VPS.

## High-level deploy flow

1. `npm run build` locally (Vite produces `dist/`).
2. Upload `dist/*` to the Scala VPS document root (`public_html/`) — same
   workflow the project already uses via `deploy.sh`.
3. The browser bundle calls Supabase directly using `@supabase/supabase-js`.
   Auth, RLS-protected reads/writes, and Storage uploads all happen
   browser → Supabase. No Node process is required on the VPS for those
   features.

The Apache `.htaccess` only needs the SPA fallback (rewrite everything to
`index.html`). The legacy `/api/*` and `/uploads/*` proxies stay while the
Express API is being ported and are removed in a later phase.

## One-time Supabase project setup

1. Create a project at https://supabase.com.
2. In **Project Settings → API** copy:
   - `Project URL` → `VITE_SUPABASE_URL`
   - `anon public` key → `VITE_SUPABASE_ANON_KEY`
3. Add both to `.env.local` (dev) and to the build environment used by
   `deploy.sh` (CI / your local shell). Vite inlines them at build time.
4. Apply migrations in `supabase/migrations/` in numeric order. Either:
   - Use the Supabase CLI: `supabase db push`, **or**
   - Paste each file into the SQL editor in the Supabase dashboard.
5. Create three Storage buckets: `avatars`, `kb-images`, `uploads`.
   - `avatars` may be public-read (for fast OG/social previews).
   - The other two should be private; the app uses signed URLs.
   - All three buckets follow the per-user folder convention
     `{auth.uid()}/...` enforced by Storage policies in
     `0002_rls_policies.sql`.

## Migrations

- `0001_init_schema.sql` — tables: `profiles`, `sites`, `site_pages`,
  `content_blocks`, `ai_preferences`, `api_connections`, `connections`,
  `audit_log`. The legacy custom `users` and `sessions` tables are NOT
  recreated — those responsibilities move to Supabase Auth (`auth.users` +
  Supabase-managed refresh tokens).
- `0002_rls_policies.sql` — enables RLS on every table and defines per-row
  owner-only policies. Public card reads (`/c/:slug`) are gated by an
  explicit `is_published` flag on `profiles`.
- `0003_card_theme.sql` — design-tokens table that drives the redesign.
  Stores color, typography, shape, layout, and motion as JSONB. Versioned
  via `card_theme_versions` so admin can revert.

## RLS testing

A Vitest suite (added in a later phase) creates two synthetic Supabase users
and asserts that user A cannot read or modify user B's rows. This is the
only authorization fence once the Express API is gone, so the test is
non-negotiable.

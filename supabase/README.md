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

## Edge Functions

Server-side logic that needs secrets (Firecrawl, Lemonade, AI gateway, the
AES-256-GCM `ENCRYPTION_KEY`) lives in `supabase/functions/<name>/index.ts`.
The functions run on Deno; shared helpers live in
`supabase/functions/_shared/` (`cors.ts`, `auth.ts`, `crypto.ts`,
`audit.ts`).

The front-end shim `src/lib/api/functions.ts` carries an allowlist
(`SUPABASE_EDGE_FUNCTIONS`) of the names that have been ported. Anything in
the allowlist goes through `supabase.functions.invoke()`; everything else
still hits the legacy `/api/functions/<name>` endpoint until ported. This
lets us migrate one function at a time.

### Deploy
```bash
# One-time: link the local checkout to the Supabase project
supabase link --project-ref <ref>

# Set the secrets the function needs
supabase secrets set ENCRYPTION_KEY=<64-hex>          # AES-256-GCM key
# (later phases will add: LEMONADE_API_KEY, LEMONADE_AGENT_ID,
#                        LEMONADE_SECURITY_ID, FIRECRAWL_API_KEY, ...)

# Deploy a single function
supabase functions deploy test-api-connection

# Or all functions
supabase functions deploy
```

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` are
auto-populated by the Edge runtime — don't set them manually.

### Ported so far
- `test-api-connection` — validates a stored AI provider key. Replaces
  `api/routes/test-api-connection.ts`.

### Still on the legacy server
- `lemonade-chat`, `scrape-site`, `verify-domain`, `query-content`,
  `refresh-sites`, `prune-logs`, `card`, `feedback`. These will be ported
  in subsequent phases; the front-end shim continues to route them to the
  Express server in the meantime.

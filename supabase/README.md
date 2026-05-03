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
- `lemonade-chat` — visitor chat for a public card. Replaces
  `api/routes/lemonade-chat.ts`. **Public endpoint — must be deployed
  with `--no-verify-jwt`** so anonymous visitors can reach it. Required
  secrets: `LEMONADE_API_KEY`, `LEMONADE_CHAT_ID`,
  `LEMONADE_SECURITY_ID` (optional, enables the security pre-screen),
  `FEEDBACK_HMAC_SECRET` (must match the legacy `/api/feedback` server
  while feedback verification still lives there), `ENCRYPTION_KEY`.

  ```bash
  supabase functions deploy lemonade-chat --no-verify-jwt
  ```

  Schema note: the Supabase BYOK lookup joins `api_connections` to
  `sites` on `user_id` (single-tenant — no `organization_id` column),
  unlike the legacy Express handler.

- `feedback` — anonymous thumbs-up / thumbs-down on a chat reply.
  Replaces `api/routes/feedback.ts`. **Public endpoint — deploy with
  `--no-verify-jwt`.** Requires migration `0005_ai_feedback.sql`
  (creates `ai_feedback` and `feedback_consumed`). Required secret:
  `FEEDBACK_HMAC_SECRET` (or its `JWT_SECRET` fallback) — must be the
  same value used by `lemonade-chat` so tokens minted there verify
  here. While the legacy `/api/feedback` Express endpoint is still
  deployed, it must share the same secret too; once both `lemonade-chat`
  and `feedback` run on Supabase you can rotate the secret freely.

  ```bash
  supabase db push                 # applies 0005_ai_feedback.sql
  supabase functions deploy feedback --no-verify-jwt
  ```

- `verify-domain` — confirms site ownership via DNS TXT or HTML meta tag
  before we'll scrape it. Replaces `api/routes/verify-domain.ts`.
  Authenticated endpoint (deploy with default JWT verification).

  ```bash
  supabase functions deploy verify-domain
  ```

  Implementation note: Deno's built-in `fetch` does not expose a TCP
  `lookup` hook, so the SSRF defence is the trio (a) the Deno-Deploy
  network sandbox (no host-internal access), (b) per-hostname DoH
  resolution against Cloudflare `1.1.1.1` with **all** A + AAAA records
  validated against the same forbidden-range set as the legacy
  `api/lib/safe-fetch.ts`, and (c) `redirect: "manual"` with per-hop
  re-validation. DNS TXT lookups go through the same DoH endpoint
  (`dnsTxt()` in `_shared/safe-fetch.ts`).

- `scrape-site` — crawls a verified domain through Firecrawl and replaces
  the site's `site_pages` + `content_blocks` rows. Replaces
  `api/routes/scrape-site.ts`. Authenticated endpoint.

  ```bash
  supabase secrets set FIRECRAWL_API_KEY=<key>
  supabase functions deploy scrape-site
  ```

  Notes:
  - Refuses unverified sites (same `Domain must be verified before
    scraping` response as the legacy handler) and runs every read/write
    through the user-bound RLS client (owner has `FOR ALL` policies on
    `sites` / `site_pages` / `content_blocks`).
  - Calls `assertPublicHost()` on the URL before handing it to Firecrawl
    so the verification flow can't be weaponised for internal recon —
    Firecrawl crawls from their own infra but rejecting an obviously
    private hostname here is still defence in depth.
  - Crawl budget: 30 polls × 2 s = 60 s; sits inside the 150 s Edge
    Function wall clock. If you raise `CRAWL_LIMIT` above 20 pages,
    raise the budget too (or move the function to background-task
    mode).
  - HTML/markdown is run through the shared `sanitizeContent()` helper
    before insertion; the regex set is byte-identical to
    `api/lib/sanitize-content.ts` so re-scraping a row that the legacy
    server already cleaned is idempotent.

### Still on the legacy server
- `query-content`, `refresh-sites`, `prune-logs`, `card`. These will be
  ported in subsequent phases; the front-end shim continues to route
  them to the Express server in the meantime.

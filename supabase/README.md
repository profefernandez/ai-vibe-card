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

- `query-content` — AI-routed semantic search over a site's
  `content_blocks`. Replaces `api/routes/query-content.ts`. Authenticated
  endpoint.

  ```bash
  supabase secrets set LEMONADE_API_KEY=<key>
  supabase secrets set LEMONADE_CONTENT_ID=<agent-id>
  supabase functions deploy query-content
  ```

  Notes:
  - Runs the user query through the same `sanitiseInput()` block-list as
    the Node handler (`_shared/sanitise.ts`) before it ever reaches the
    model.
  - Ownership + content reads use the user-bound RLS client. Missing /
    foreign sites surface as the same uniform `Site not found or access
    denied` 403 the legacy handler returned.
  - LaunchLemonade is asked for a JSON array of block indices; we extract
    the first `[…]` substring and parse defensively, so a malformed model
    response degrades to "no matches" rather than a 500.

- `refresh-sites` — cron-triggered re-scrape of stale verified sites.
  Auth is a shared bearer secret (`REFRESH_SECRET`), **not** a JWT, so
  the function must be deployed with `--no-verify-jwt`.

  ```bash
  supabase secrets set REFRESH_SECRET=<long-random>
  supabase secrets set FIRECRAWL_API_KEY=<key>
  supabase functions deploy refresh-sites --no-verify-jwt
  ```

  Notes:
  - Re-uses the `verify-domain` re-verification logic (DNS TXT or
    `<meta name="60watt-verify">`) via `_shared/safe-fetch.ts`. A site
    that no longer proves ownership has `verified` flipped to false and
    is skipped — same behaviour as the Node handler.
  - Stale-site selection runs through a `SECURITY DEFINER` RPC,
    `public.find_stale_sites(batch_size)`, granted only to the
    `service_role` (migration `0006_refresh_sites_helpers.sql`). This is
    the single place that uses the `interval` cast against
    `refresh_interval_hours`, which PostgREST can't express directly.
  - All DB writes use the service-role client (cron has no JWT). RLS
    doesn't apply to that role.
  - Bearer-secret comparison is constant-time (XOR fold over the byte
    arrays) so the endpoint isn't a timing oracle.
  - Update `cron/refresh-sites.sh` on the host: it now reads
    `SUPABASE_URL` from `api/.env` and posts to
    `${SUPABASE_URL}/functions/v1/refresh-sites`. If `SUPABASE_URL` is
    unset it falls back to the legacy Express endpoint.

- `prune-logs` — cron-triggered retention sweep. Same shared bearer
  secret (`REFRESH_SECRET`) and `--no-verify-jwt` deploy as
  `refresh-sites`.

  ```bash
  # REFRESH_SECRET is already set if refresh-sites is deployed.
  supabase functions deploy prune-logs --no-verify-jwt
  ```

  Notes:
  - Drops rows past their retention window:
    `audit_log` > 180 d, `ai_feedback` > 365 d, `feedback_consumed` > 30 d.
  - The legacy handler also pruned a `sessions` table; that is an
    Express-managed table that does not exist in Supabase (Supabase auth
    owns `auth.sessions`, which the service role isn't allowed to
    delete from). The Edge Function intentionally skips it.
  - The chunked delete loop lives in a SECURITY DEFINER RPC,
    `public.prune_old_rows(target, chunk_size, max_iterations)`
    (migration `0007_prune_logs_helpers.sql`). Targets are whitelisted
    inside the function — `format(%I)` interpolation is safe because
    the table name comes from the whitelist, never from the caller's
    string. EXECUTE granted only to `service_role`.
  - Per-target try/catch in the Edge Function: one failing table never
    blocks the others; partial failures return HTTP 207 with an
    `errors` map, matching the legacy handler.
  - Sibling host script: `cron/prune-logs.sh`. Same `SUPABASE_URL`
    fallback pattern as `cron/refresh-sites.sh`.

- `card-vcard` — public vCard (.vcf) download. Replaces
  `GET /api/card/:slug/vcard`. **Public endpoint — deploy with
  `--no-verify-jwt`** so an anchor-tag download works for anonymous
  visitors. Reads the profile via the `get_card_by_slug` RPC
  (migration `0008_card_helpers.sql`) which gates on
  `is_published = true`. Optional secret: `FRONTEND_URL` (defaults to
  `https://ai.60wattsofclarity.com`).

  ```bash
  supabase db push                            # applies 0008_card_helpers.sql
  supabase secrets set FRONTEND_URL=https://your-domain
  supabase functions deploy card-vcard --no-verify-jwt
  ```

- `connection-request` — authenticated card-to-card connection request.
  Replaces `POST /api/card/:slug/connect`. Body `{ slug, message? }`.
  Same status codes as the Node handler (400 invalid / 404 missing /
  400 self-connect / 409 already-pending|approved). Sends a best-effort
  notification email via `_shared/email.ts` using the same SMTP creds
  as the legacy server. Audits `connection_request`.

  ```bash
  supabase secrets set SMTP_HOST=<host> SMTP_PORT=587 \
      SMTP_USER=<user> SMTP_PASS=<pass> SMTP_FROM=<from-address>
  supabase functions deploy connection-request
  ```

- `connection-respond` — owner approves / declines a pending request.
  Replaces `PATCH /api/connections/:id`. Body `{ id, status }` with
  `status ∈ {"approved","declined"}`. UPDATE only fires when
  `owner_id = auth.uid() AND status = 'pending'` (matches the legacy
  WHERE clause + `connections_owner_update` RLS). On approval, sends
  the `connectionApprovedEmail`. Audits `connection_${status}`.

  ```bash
  supabase functions deploy connection-respond
  ```

- `connection-query` — cross-card AI question.
  Replaces `POST /api/connections/:id/query`. Body `{ id, question }`.
  Reuses `_shared/sanitise.ts` (block-list pre-check + output filter).
  Verifies an `approved` connection where the caller is a party
  (RLS-bound), checks `target.ai_query_enabled`, fetches the target's
  public `content_blocks` and asks LaunchLemonade. Required secrets:
  `LEMONADE_API_KEY`, `LEMONADE_CONTENT_ID` (already set if
  `query-content` is deployed). Audits `cross_card_query` with
  `target_user_id` + token usage.

  ```bash
  supabase functions deploy connection-query
  ```

### Still on the legacy server
- (none — the `card` and `connections` surfaces moved to Edge Functions
  in `card-vcard`, `connection-request`, `connection-respond`,
  `connection-query`. The legacy `api/routes/card.ts` is kept for one
  release as a fallback; remove once Edge Function traffic is verified.)

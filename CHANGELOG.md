# Changelog

All notable changes to **AI Vibe Card** will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/) and this project adheres to [Semantic Versioning](https://semver.org/).

## [Unreleased]

<!-- Phase 6a additions -->
### Added
- **Phase 6a — RLS plumbing.** Foundation for Postgres row-level security; no policies enabled yet, no behavior change for any caller. New helper `withRequestClient(req, fn)` in `api/db.ts` runs a callback inside a single transaction with `SET LOCAL app.user_id` and `SET LOCAL app.org_id` populated from `req.user`. Express middleware `attachDbHelper` binds `req.withClient(fn)` so any authed handler can run an RLS-aware transaction in one line. New `serviceDb` pool reads from `DATABASE_URL_SERVICE` (falls back to `DATABASE_URL`) and is reserved for unauthenticated / cron paths that need to bypass RLS once policies turn on. Migration `1700000006000_service_role` creates the `aivibe_service` Postgres role with `BYPASSRLS NOLOGIN`; the operator sets a password and `ALTER ROLE … LOGIN` out of band before pointing `DATABASE_URL_SERVICE` at it. New 6-case smoke test under `api/scripts/test-with-request-client.ts` (verified end-to-end against a real Postgres: rejects unauthenticated calls, `SET LOCAL` visible inside the callback, doesn't leak past `COMMIT`, rolls back on throw). Subsequent sub-phases (Phase 6b call-site refactor, 6c policy creation, 6d–f staged enable) build on this.

### Security
- `app.set('trust proxy', 1)` so the API uses the visitor's real IP (forwarded by the `web` nginx container) instead of the docker bridge address. Restores per-IP rate-limiter accuracy and fixes audit/session IP fields. Trust set to a single hop — narrower than `'uniquelocal'` so nothing else on the bridge can spoof `X-Forwarded-For`.
- Removed `connections` from the generic `/api/tables` allowlist. The router treated `owner_id` as the sole ownership column, which left requesters unable to act on their own outgoing requests via this surface and created an asymmetric IDOR window. All connection ops continue to flow through `/api/connections` (`routes/card.ts`), which handles the requester/owner symmetry correctly.
- Added a dedicated 5/min rate limiter on `/api/functions/refresh-sites`, keyed on the SHA-256 of the bearer token, so a leaked `REFRESH_SECRET` cannot be used to hammer Firecrawl.
- Switched the org slug suffix in `auth.ts` from `Math.random()` to `crypto.randomBytes(3).toString('hex')`. Removes predictability from a value used as a unique identifier.
- Added `*.api_key_encrypted` and `*.password_hash` to the pino redact list so encrypted-key columns and bcrypt hashes are never serialized in error logs.

### Changed
- `query-content` route handler is now typed as `AuthRequest` (was `Request` with `(req as any).user` casts) — `requireAuth` is already mounted on the route, so the looser typing was misleading.
- Added `api/lib/safe-fetch.ts` — SSRF-safe outbound HTTP for fetches whose target URL came from user input. Resolves all A/AAAA records, rejects any private/loopback/link-local/CGNAT/cloud-metadata range, then pins the connection to a pre-validated IP via an undici Agent so the resolve→connect TOCTOU window (DNS rebinding) is closed. Redirects are followed manually, validated per hop, capped at 5. 10 s timeout. New `undici` dependency in `api/`.
- `routes/functions/verify-domain.ts` and `routes/functions/refresh-sites.ts` now use `safeFetch` instead of raw `fetch()` for the meta-tag homepage check. Previously these followed redirects with no IP guard and could be steered to cloud-metadata or private addresses by a hostile owner.
- `routes/functions/scrape-site.ts` replaces the regex-only "private IP" check (which tested only literal IP prefixes in the hostname *string* — `attacker.com` resolving to 127.0.0.1 silently passed) with `assertPublicHost`, which actually resolves the hostname and rejects any forbidden address.
- `verify-domain` response `detail` field is now an enum (`verified | dns_record_missing | meta_tag_missing | token_mismatch | unreachable`) instead of free-form text. Removes the upstream-HTTP-status oracle and the implementation-detail leak.
- Added `api/scripts/test-safe-fetch.ts` smoke test (manual, network-dependent). 17 cases covering the IP-range rules, IPv6 bracket parsing, disallowed protocols, and a real public-hostname accept path.
- `api/package-lock.json` regenerated as a side effect of `npm install undici`. The lockfile had drifted from `package.json` (was pinning bcrypt 5.x and node-pg-migrate 7.x while `package.json` requested 6.x and 8.x); `npm install` reconciled both. Resulting tree is consistent with the manifest.
- Replaced the hand-rolled security-header middleware with `helmet`. CSP directives are now built from observed usage (grep of `src/` and `api/`), not memory: `script-src 'self'` (Vite emits no inline scripts); `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`; `font-src 'self' https://fonts.gstatic.com data:`; `img-src 'self' data: https: blob:`; `connect-src 'self'` (browser only talks to same-origin `/api` — every cross-origin call is server-side); `frame-src 'self' https:` (owner-supplied `cta_embed` iframes); `frame-ancestors 'none'` (replaces `X-Frame-Options: DENY` semantically); `object-src 'none'`; `base-uri 'self'`; `form-action 'self'`. Helmet additionally adds `Cross-Origin-Opener-Policy`, `Cross-Origin-Resource-Policy`, `Origin-Agent-Cluster`, and disables the deprecated `X-XSS-Protection`. `Referrer-Policy` pinned to `strict-origin-when-cross-origin` (matches prior config; helmet default is the stricter `no-referrer`).
- Removed the partial Origin-header CSRF check at the top of `api/index.ts`. Auth is Bearer-only — verified by grep that no route ever calls `res.cookie` or sets a `Set-Cookie` header. The previous check let through any request that omitted the `Origin` header (most non-browser clients do), which was misleading rather than protective. CORS continues to restrict cross-origin browsers via the `cors` middleware (H3).
- New `helmet ^8.1.0` dependency in `api/`.
- Added per-account login lockout. `users.failed_login_count` increments on every failed sign-in; at the 10th consecutive failure the account is locked for 15 minutes via `users.locked_until`. The IP-keyed `authLimiter` (20 / 15 min) was insufficient against distributed credential-stuffing once `trust proxy` was fixed in Phase 1 — an attacker rotating IPs got 20 attempts each. The per-account counter caps total work against any one account regardless of source IP. Counter and lock both clear on a successful login. Locked responses return HTTP 423 with a generic message; we don't leak which account is locked. Migration `1700000004000` adds the columns.
- `memberships.role` (`owner` | `admin` | `member`) is now enforced server-side. New `api/middleware/requireRole.ts` joins memberships on the authenticated `(user_id, organization_id)` and rejects requests whose role isn't in the allowed set. Applied to all mutating routes:
  - `POST /api/tables/:table`, `PATCH /api/tables/:table`, `DELETE /api/tables/:table`, `POST /api/tables/:table/upsert` → `owner` or `admin`
  - `POST /api/functions/scrape-site`, `POST /api/functions/verify-domain`, `POST /api/functions/test-api-connection` → `owner` or `admin`
  Reads remain at `requireAuth` (members can view org data). The `role` claim is now baked into freshly-issued JWTs so the middleware doesn't need a DB hit per request; legacy tokens (no `role` claim) fall back to a single membership lookup. Today every signup creates an `owner`, so this is a no-op for production users — it's groundwork for inviting members. (C3)
- Feedback poisoning + replay protection (M7). The chat handler now mints a single-use HMAC token bound to `(profile_id, conversation_id, sha256(answer_text), nonce, expires_at)` and returns it alongside the AI response. `POST /api/feedback` requires the token, verifies the HMAC + binding, and inserts the signature hash into a new `feedback_consumed` table whose primary key enforces single-use semantics — replays fail at INSERT with a unique-violation that we collapse to a generic 400. Token TTL is 24 h; expired entries are cleaned up by the Phase-7 retention cron. New `api/lib/feedback-token.ts` (with 9-case manual smoke test under `api/scripts/test-feedback-token.ts`, all passing). Migration `1700000004000` creates `feedback_consumed`. The HMAC key is derived from `FEEDBACK_HMAC_SECRET` if set, otherwise from `JWT_SECRET` with a domain separator — production should set the explicit secret so rotation of one doesn't invalidate the other; `.env.example` and `docker-compose.yml` document it.
- Frontend `ExplorePanel` flow updated for single-use tokens. Captures `feedback_token` and `profile_id` from the chat response, echoes them on `/api/feedback`. Thumbs-down used to fire two POSTs (rating-only, then comment) — that no longer fits the single-use model, so we collect the optional comment first and submit once on Send. The cost: if the visitor closes the panel mid-comment the rating is dropped. The win: no anonymous visitor can poison `% thumbs-down by card` for a profile they never chatted with, and no rating can be amplified by replay.
- `AuthRequest.user.role` field added (optional). Populated by `requireAuth` from the JWT `role` claim when present.

<!-- Phase 7 additions -->
- Retention cron handler `POST /api/functions/prune-logs`. Authenticated by the same `REFRESH_SECRET` bearer pattern as `refresh-sites` (constant-time compare). Deletes in 10k-row chunks (1M-row cap per run) so locks stay short on multi-million-row tables: `audit_log` > 180 days, `ai_feedback` > 365 days, expired `sessions` > 7 days past expiry, `feedback_consumed` > 30 days (HMAC token TTL is 24h; 30d is slack). Each table runs in its own transaction so a failure in one doesn't abort the others. Reuses the existing `refreshLimiter` (5/min, keyed on the SHA-256 of the bearer). Writes a `prune_logs` audit entry with per-table counts on completion.
- Migration `1700000005000_connections_unordered_unique` replaces the ordered `uq_connections_pair UNIQUE (requester_id, owner_id)` constraint with a functional unique index on `(LEAST(requester_id, owner_id), GREATEST(requester_id, owner_id))`. Without this, both `(A→B)` and `(B→A)` rows could coexist — `routes/card.ts` checked for the reciprocal pair in code but the DB had no opinion. The migration refuses to apply if any reciprocal duplicates exist (raises with the count) rather than auto-resolving — there's no universally correct merge.

<!-- Phase 5 additions -->
- Encryption format is now versioned (`v1:<iv>:<authTag>:<ciphertext>` in `api/lib/crypto.ts`). `decrypt()` accepts both the new prefixed shape and the prior unprefixed legacy shape, so existing rows keep working; new writes always emit `v1:`. Sets up future `ENCRYPTION_KEY` rotation that doesn't require re-encrypting every row in one transaction (M2). Renamed `isEncrypted` → `looksEncrypted` to be honest about what the regex check actually proves (shape, not decryptability); the old name remains as a deprecated alias.
- JWT signing-key rotation. New `verifyJwtWithRotation()` helper in `middleware/auth.ts` verifies tokens against `JWT_SECRET` first and falls back to `JWT_SECRET_PREVIOUS` when set. `requireAuth` and the `userOrIpKey` rate-limit keyer both use it; sign paths in `auth.ts` always use the current secret. Rotation procedure: deploy with PREVIOUS=old, current=new; wait the max session TTL (7d); unset PREVIOUS in a follow-up deploy. `.env.example` and `docker-compose.yml` document the variable.
- New `api/scripts/audit-api-keys.ts`. Reads every `api_connections.api_key_encrypted` and *attempts* `decrypt()` (rather than just regex-matching shape — the original Phase-5 plan called this the original shortcut). Buckets each row as `ok | plaintext | wrong_key | malformed` and prints the row IDs of any non-`ok` rows. Exits non-zero if anything is non-`ok` so the script can be wired into deploy verification once cleanup is complete (M3).
- `lemonade-chat.ts` and `test-api-connection.ts` now `logger.warn` when they encounter an `api_connections` row that isn't in encrypted form — gives ops a signal without breaking back-compat. The throw-on-plaintext step is deferred until the audit script confirms zero plaintext rows in production.
- New `api/scripts/test-crypto-rotation.ts` smoke test (15 cases, all passing) covering v1 round-trip, legacy back-compat, wrong-key rejection, malformed input, and the JWT rotation paths.

<!-- Phase 8 additions -->
- BYOK provider pick in `lemonade-chat.ts` is now deterministic. The SELECT joins `sites` to `api_connections` on `organization_id` (was `user_id` — a pre-org-scoping artifact that breaks for any future shared-org membership) and adds `ORDER BY ac.created_at ASC` so a user with multiple active providers always gets the same one rather than whichever the planner returned that release (H5).

<!-- Phase 9 additions -->
- `npm audit` results documented in new `SECURITY-AUDIT.md`. API workspace is clean (0 of every severity); root has 3 low + 4 moderate dev-tooling-only findings (vite/esbuild dev-server, jsdom transitive chain) — all `fixAvailable` paths require SemVer-major upgrades and are deferred per policy. No high/critical.
- Pre-commit secret scanning configured via gitleaks in `.pre-commit-config.yaml` at repo root. README has install instructions. The `rev` is a placeholder tag with a TODO pointing at the gitleaks repo because the agent's environment couldn't reach the network to look up a stable commit SHA — pin it before merging.
- `.github/workflows/deploy.yml` carries a TODO comment above `actions/checkout@v4` to pin the action to a SHA. Same reason as above. Secret-handling otherwise reviewed and clean.
- `.env.example` synced against actual `process.env.*` reads in `api/`. Added `DB_SSL_REJECT_UNAUTHORIZED`, the `SMTP_*` block, and `SEED_EMAIL` / `SEED_PASSWORD` (the seed script's defaults — flagged that the password should not stay as `VibeCard2026!` past first deploy). Existing entries left intact.
- Note added to CODEBASE.md: `express-rate-limit` uses an in-memory store, so scaling to N replicas multiplies all per-IP / per-user limits by N until a Redis-backed store is introduced.

### Changed
- Public-facing digital business card with animated hero section
- Admin dashboard with sidebar navigation
- Site import & scraping via Firecrawl integration
- Content manager for scraped pages
- AI training tab for persona configuration
- API connector tab for managing external API keys
- Profile editor with social links, CTA, and card layout options
- SEO & social preview settings
- Received cards / visitor leads tab
- AI chat agent (Explore panel) with OpenAI-compatible backend
- Lemonade chat provider support
- Express API with JWT authentication and rate limiting
- PostgreSQL database with setup script
- Zod validation schemas for forms and API payloads
- Centralized types, constants, and formatting utilities
- React Error Boundary
- Reusable `useAsyncData` hook for data fetching
- AuthContext with `useAuth` hook
- Vitest test infrastructure

# OWASP Top 10 — Mapped to This Codebase

Quick-reference for each OWASP Top 10 (2021) category and where it applies in this project.

## A01:2021 — Broken Access Control

**Where it applies:**
- `api/routes/tables.ts` — All CRUD must enforce `user_id` from JWT
- `api/routes/functions/query-content.ts` — Must verify site ownership (GAP)
- `api/routes/upload.ts` — Avatar ownership tied to userId
- `api/routes/functions/scrape-site.ts` — Site must belong to authenticated user
- `api/routes/functions/verify-domain.ts` — Site ownership checked before verification

**Pattern:** Every database write injects `user_id = req.user.sub`. Every read filters by it.

**Red flags:**
- Route handler that accepts `user_id` from request body
- SELECT without WHERE user_id clause
- Missing `requireAuth` on data-access endpoint

## A02:2021 — Cryptographic Failures

**Where it applies:**
- `api/lib/crypto.ts` — AES-256-GCM for API keys at rest
- `api/routes/auth.ts` — bcrypt with 12 salt rounds
- JWT signed with `JWT_SECRET` env var

**Pattern:** API keys → `encrypt()` before INSERT, `decrypt()` on retrieval. Passwords → `bcrypt.hash()`.

**Red flags:**
- Storing API keys in plaintext
- Using MD5/SHA1 for passwords
- Hardcoded secrets in source
- ENCRYPTION_KEY shorter than 64 hex chars

## A03:2021 — Injection

**Where it applies:**
- `api/routes/tables.ts` — Parameterized queries + column allowlisting
- `api/lib/sanitise.ts` — Prompt injection detection (11 patterns)
- `api/lib/sanitize-content.ts` — HTML/script stripping

**Pattern:** Always use `$1, $2` parameterized queries via `pg`. Never concatenate user input into SQL.

**Red flags:**
- Template literals in SQL: `` `WHERE id = '${id}'` ``
- User input in ORDER BY without allowlist check
- Unvalidated column names in SELECT

## A04:2021 — Insecure Design

**Where it applies:**
- Session management — JWT issued but not stored in sessions table (GAP)
- Password reset — Schema exists but no endpoint (GAP)
- Email verification — Not implemented (GAP)

**Red flags:**
- No way to revoke a compromised token
- No multi-factor authentication
- No account lockout after failed attempts

## A05:2021 — Security Misconfiguration

**Where it applies:**
- `api/index.ts` — CORS, HSTS, rate limiting
- `vite.config.ts` — Dev proxy configuration
- Missing: CSP headers, HSTS preload (GAP)

**Pattern:** CORS uses env-based allowlist. HSTS set with 2-year max-age.

**Red flags:**
- `CORS_ORIGINS=*` (wildcard)
- Missing security headers
- Debug/verbose error messages in production
- Stack traces returned to client

## A06:2021 — Vulnerable and Outdated Components

**Where it applies:**
- `package.json` / `api/package.json` — Dependencies

**Action:** Run `npm audit` periodically. Check for known CVEs in `express`, `pg`, `bcrypt`, `multer`, `dompurify`.

## A07:2021 — Identification and Authentication Failures

**Where it applies:**
- `api/routes/auth.ts` — Login/register with email + password
- `api/middleware/auth.ts` — JWT validation
- Timing attack defense with DUMMY_HASH

**Red flags:**
- Different response times for valid vs invalid emails
- JWT without expiration
- No minimum password complexity
- Password in URL parameters

## A08:2021 — Software and Data Integrity Failures

**Where it applies:**
- `api/routes/functions/refresh-sites.ts` — Cron-triggered with REFRESH_SECRET
- `api/lib/crypto.ts` — GCM auth tag prevents tampering

**Red flags:**
- Plain string comparison for secrets (use `crypto.timingSafeEqual`)
- No integrity check on uploaded files
- Unsigned JWT tokens

## A09:2021 — Security Logging and Monitoring Failures

**Where it applies:**
- `api/lib/audit.ts` — Audit log table with action, userId, IP, user-agent
- Fire-and-forget pattern (errors don't block requests)

**Gaps:**
- Login failures not logged
- Auth token creation not logged
- Rate limit hits not logged
- No alerting on suspicious patterns

## A10:2021 — Server-Side Request Forgery (SSRF)

**Where it applies:**
- `api/routes/functions/scrape-site.ts` — URL validation + private IP blocking
- `api/routes/functions/refresh-sites.ts` — Same SSRF checks
- `api/routes/functions/verify-domain.ts` — HTTP fetch for meta tag verification

**Pattern:** Parse URL → check protocol (http/https only) → check hostname against private IP regex → proceed.

**Red flags:**
- Fetching user-supplied URL without validation
- Missing private IP check
- DNS rebinding not addressed (advanced)
- Redirect following without re-checking destination

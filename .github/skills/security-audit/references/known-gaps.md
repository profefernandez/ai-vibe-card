# Known Security Gaps — Backlog

Pre-existing vulnerabilities tracked for future remediation.
Items marked ✅ FIXED have been resolved and should be verified in code.

## FIXED (Implemented)

### ~~1. JWT Not Stored in Sessions Table — No Revocation~~ ✅ FIXED
- **Fix applied:** Login stores SHA-256 token hash in `sessions` table. `requireAuth` validates session exists. Added `POST /api/auth/logout` and `DELETE /api/auth/sessions`. Audit logging for login/logout.

### ~~2. ENCRYPTION_KEY Management Undefined~~ ✅ FIXED
- **Fix applied:** Startup validation in `api/index.ts` checks `ENCRYPTION_KEY` is 64 hex chars. Exits with generation command if missing.

### ~~3. No CSRF Tokens on State-Changing Endpoints~~ ✅ FIXED
- **Fix applied:** Origin validation middleware rejects mutations from unlisted origins.

### ~~4. query-content Doesn't Verify Site Ownership~~ ✅ FIXED
- **Fix applied:** Ownership check verifies `sites.user_id` matches `req.user.id`.

### ~~5. API Key Test Endpoint May Leak Information~~ ✅ FIXED
- **Fix applied:** Generic error messages only.

### ~~6. refresh-sites Cron Secret Uses Plain String Comparison~~ ✅ FIXED
- **Fix applied:** Uses `crypto.timingSafeEqual()`.

### ~~7. No Content-Security-Policy Header~~ ✅ FIXED
- **Fix applied:** CSP + X-Content-Type-Options + X-Frame-Options + X-XSS-Protection + Referrer-Policy + Permissions-Policy.

### ~~8. No Rate Limiting on query-content~~ ✅ FIXED
- **Fix applied:** Per-user rate limiter (20 req/min).

### ~~9. No HSTS Preload Directive~~ ✅ FIXED
- **Fix applied:** Added `; preload` to HSTS.

## REMAINING BACKLOG

### 10. No Email Verification on Registration — MEDIUM

- **Issue:** Accounts created without email verification. Schema has `email_verified` + `verification_token` but unused.
- **Fix:** Send verification email on signup; block login until verified.

### 11. No Password Reset Endpoint — MEDIUM

- **Issue:** Schema has `reset_token` columns but no endpoint.
- **Fix:** Implement forgot-password and reset-password endpoints.

### 12. DOMPurify Allows Arbitrary Iframes — MEDIUM

- **Issue:** Any iframe allowed via `ADD_ATTR`. Restrict to known providers or CSP `frame-src`.

### 13. Raw HTML in site_pages — MEDIUM

- **Issue:** `site_pages.html` stores unsanitized HTML. XSS risk if rendered.
- **Fix:** Sanitize before storage or ensure never rendered raw.

### 14. Avatar Files Served Without Auth — LOW

- **Issue:** `/uploads/*` public. Accept or gate behind auth.

### 15. sanitise vs sanitize Spelling — LOW

- **Issue:** British vs American spelling inconsistency in filenames.

---
name: security-audit
description: "**WORKFLOW SKILL** — Audit, fix, and harden security across the ai-vibe-card stack. USE FOR: finding vulnerabilities in new/changed code; fixing OWASP Top 10 issues; reviewing auth, CORS, rate limiting, SQL injection, SSRF, XSS, CSRF; hardening API routes, sanitization, encryption; validating ownership enforcement; checking for secrets leakage. Use when: security review, fix vulnerability, harden endpoint, audit auth, check injection, review upload, SSRF check, rate limit, CSP headers."
argument-hint: "Describe what to audit: a file, route, feature, or 'full' for complete scan"
---

# Security Audit & Fix Skill

Audit, identify, and fix security vulnerabilities in this Express + React + PostgreSQL codebase.

## When to Use

- New API route or endpoint added
- New form, upload, or user input introduced
- Auth or session logic changed
- Database query or schema modified
- Third-party integration added
- Pre-deploy security review
- Investigating a reported vulnerability
- Periodic full-stack security audit

## Tech Stack Context

| Layer | Stack | Key Security Files |
|-------|-------|--------------------|
| API Server | Express.js + TypeScript | `api/index.ts`, `api/middleware/auth.ts` |
| Database | PostgreSQL (parameterized via `pg`) | `database/setup.sql`, `api/db.ts` |
| Auth | JWT (7-day) + bcrypt (12 rounds) | `api/routes/auth.ts` |
| Encryption | AES-256-GCM for API keys at rest | `api/lib/crypto.ts` |
| Input Sanitization | Regex patterns + character stripping | `api/lib/sanitise.ts` |
| Content Sanitization | HTML/script tag stripping | `api/lib/sanitize-content.ts` |
| Frontend Sanitization | DOMPurify | `src/components/HeroSection.tsx` |
| Validation | Zod schemas | `src/lib/validations.ts` |
| Rate Limiting | express-rate-limit (in-memory) | `api/index.ts` |
| File Upload | multer (MIME whitelist, 5MB) | `api/routes/upload.ts` |
| SSRF Protection | URL parse + private IP block | `api/routes/functions/scrape-site.ts` |
| Audit Logging | Fire-and-forget to `audit_log` table | `api/lib/audit.ts` |

## Procedure

### Step 1 — Scope the Audit

Determine what to audit based on the user's request:

| Scope | What to Check |
|-------|--------------|
| **Single file** | Run the checklist (Step 2) against that file |
| **New route** | Auth, validation, SQL, rate limiting, audit logging |
| **New feature** | All files touched + integration points |
| **Full audit** | All files in [./references/file-inventory.md](./references/file-inventory.md) |

### Step 2 — Run the Security Checklist

For each file in scope, check against the [OWASP checklist](./references/owasp-checklist.md):

#### A. Authentication & Authorization
- [ ] Route protected by `requireAuth` middleware (from `api/middleware/auth.ts`)
- [ ] JWT `sub` (user ID) used for ownership — never trust client-supplied user_id
- [ ] Write operations (INSERT/UPDATE/DELETE) inject `user_id` from `req.user.sub`
- [ ] Read operations filter by ownership (`WHERE user_id = $1`)
- [ ] No elevation-of-privilege paths (user A accessing user B's data)

#### B. SQL Injection
- [ ] All queries use parameterized placeholders (`$1`, `$2`, ...)
- [ ] Column names validated against `TABLE_COLUMNS` allowlist (see `api/routes/tables.ts`)
- [ ] Table names validated against `ALLOWED_TABLES` Set
- [ ] No string concatenation of user input into SQL
- [ ] ORDER BY / SELECT columns checked against allowlist before interpolation

#### C. Input Validation
- [ ] Request body validated (type, length, format) before processing
- [ ] Zod schema used for structured input (prefer `src/lib/validations.ts`)
- [ ] String inputs length-capped (MAX_MESSAGE_LENGTH = 2000 for chat)
- [ ] Control characters stripped (use `sanitiseUserMessage` from `api/lib/sanitise.ts`)
- [ ] HTML content stripped of scripts/handlers (use `sanitizeHtmlContent` from `api/lib/sanitize-content.ts`)

#### D. XSS Prevention
- [ ] User-generated HTML sanitized before storage AND display
- [ ] React components use `{}` binding (auto-escaped), NOT `dangerouslySetInnerHTML`
- [ ] If `dangerouslySetInnerHTML` is required → DOMPurify with restrictive config
- [ ] No inline event handlers from user data
- [ ] AI/LLM responses rendered via `react-markdown` (safe) or sanitized

#### E. SSRF Prevention
- [ ] External URLs parsed with `new URL()`
- [ ] Protocol restricted to `http:` / `https:` only
- [ ] Hostname checked against private IP patterns:
  ```
  /^(127\.|10\.|172\.(1[6-9]|2\d|3[01])\.|192\.168\.|localhost|0\.0\.0\.0|\[::1\]|\[fd|fe80:)/i
  ```
- [ ] Applied consistently in: `scrape-site.ts`, `refresh-sites.ts`, `verify-domain.ts`

#### F. Rate Limiting
- [ ] Public endpoints have rate limiter applied
- [ ] Auth endpoints: 20 req / 15 min (existing `authLimiter`)
- [ ] Chat endpoints: 30 req / min (existing `chatLimiter`)
- [ ] New endpoints: determine appropriate limit and apply
- [ ] Rate limiter key uses `req.user?.sub || req.ip` for authenticated routes

#### G. Secrets & Encryption
- [ ] No hardcoded secrets, API keys, or tokens in source code
- [ ] Third-party API keys encrypted at rest via `encrypt()` from `api/lib/crypto.ts`
- [ ] `ENCRYPTION_KEY` env var required (64 hex chars for AES-256)
- [ ] Decrypted secrets never logged or returned in API responses
- [ ] Error messages don't leak secret values or internal structure

#### H. File Upload
- [ ] MIME type validated against whitelist (`image/jpeg`, `image/png`, `image/webp`, `image/gif`)
- [ ] File size capped (5MB via multer)
- [ ] Filename deterministic / sanitized (no user-controlled path components)
- [ ] Old files cleaned up on re-upload
- [ ] Upload directory not browsable (no directory listing)

#### I. CORS & Headers
- [ ] CORS origin validated against `CORS_ORIGINS` env var allowlist (no wildcards)
- [ ] HSTS header set (`Strict-Transport-Security: max-age=63072000; includeSubDomains`)
- [ ] Consider CSP headers (currently missing — see Known Gaps)

#### J. Audit Logging
- [ ] Sensitive operations logged via `logAudit()` from `api/lib/audit.ts`
- [ ] Log includes: `action`, `userId`, `tableName`, `recordId`, `ip`, `userAgent`, `metadata`
- [ ] Logging is fire-and-forget (errors don't block request)
- [ ] No PII or secrets in audit metadata

### Step 3 — Classify Findings

Rate each finding using this severity scale:

| Severity | Criteria | Example |
|----------|----------|---------|
| **CRITICAL** | Exploitable remotely, data breach risk | SQL injection, auth bypass, secrets in code |
| **HIGH** | Requires some access, significant impact | Missing ownership check, CSRF, session hijack |
| **MEDIUM** | Limited exploit, moderate impact | Missing rate limit, info disclosure, weak validation |
| **LOW** | Minimal risk, best-practice gap | Spelling inconsistency, missing headers, verbose errors |

### Step 4 — Fix

For each finding:

1. **Read** the affected file(s) to understand current implementation
2. **Apply** the fix following existing patterns in the codebase:
   - Auth → follow pattern in `api/middleware/auth.ts`
   - SQL → follow parameterized query pattern in `api/routes/tables.ts`
   - Sanitization → use existing functions from `api/lib/sanitise.ts` or `api/lib/sanitize-content.ts`
   - Rate limiting → follow `authLimiter`/`chatLimiter` pattern in `api/index.ts`
   - Encryption → use `encrypt()`/`decrypt()` from `api/lib/crypto.ts`
   - Audit logging → use `logAudit()` from `api/lib/audit.ts`
3. **Verify** no regressions (run `npm test` if tests exist for affected area)

### Step 5 — Report

Summarize findings in a table:

```markdown
| # | Severity | File | Issue | Status |
|---|----------|------|-------|--------|
| 1 | CRITICAL | api/routes/new-route.ts | No auth middleware | FIXED |
| 2 | HIGH | api/routes/new-route.ts | Missing ownership check | FIXED |
| 3 | MEDIUM | api/routes/new-route.ts | No rate limiting | FIXED |
```

## Known Gaps (Backlog)

These are pre-existing issues tracked for future work. Reference [./references/known-gaps.md](./references/known-gaps.md) for full details.

| Gap | Severity | Status |
|-----|----------|--------|
| JWT not stored in sessions table — no revocation | CRITICAL | Backlog |
| No CSRF tokens on state-changing endpoints | HIGH | Backlog |
| query-content doesn't verify site ownership | HIGH | Backlog |
| No email verification on registration | MEDIUM | Backlog |
| No password reset endpoint | MEDIUM | Backlog |
| No Content-Security-Policy header | MEDIUM | Backlog |
| No rate limiting on query-content | MEDIUM | Backlog |
| DOMPurify allows arbitrary iframes | MEDIUM | Backlog |
| Raw HTML stored in site_pages without sanitization | MEDIUM | Backlog |
| Avatar files served without auth | LOW | Backlog |
| sanitise vs sanitize spelling inconsistency | LOW | Backlog |

## Codebase Patterns to Follow

When fixing or adding security code, follow these established patterns:

```typescript
// Auth middleware — api/middleware/auth.ts
import { requireAuth } from "../middleware/auth";
router.post("/endpoint", requireAuth, handler);

// Ownership enforcement — always use JWT sub
const userId = req.user!.sub;
await db.query("UPDATE t SET col=$1 WHERE id=$2 AND user_id=$3", [val, id, userId]);

// Parameterized queries — never concatenate
await db.query("SELECT * FROM t WHERE id = $1", [id]); // ✅
await db.query(`SELECT * FROM t WHERE id = '${id}'`);   // ❌ NEVER

// Rate limiting — api/index.ts pattern
import rateLimit from "express-rate-limit";
const myLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20 });
app.use("/api/my-route", myLimiter);

// Audit logging — api/lib/audit.ts
import { logAudit } from "../lib/audit";
logAudit({ action: "my_action", userId, ip: req.ip, userAgent: req.get("user-agent"), metadata: {} });

// Encryption at rest — api/lib/crypto.ts
import { encrypt, decrypt } from "../lib/crypto";
const encrypted = encrypt(apiKey);
```

# Security-Relevant File Inventory

All files that should be included in a full security audit.

## API Layer (Priority: HIGH)

| File                          | Security Relevance                                                      |
| ----------------------------- | ----------------------------------------------------------------------- |
| `api/index.ts`                | CORS, HSTS, rate limiters, static file serving, route mounting          |
| `api/db.ts`                   | Database connection pool, SSL config                                    |
| `api/middleware/auth.ts`      | JWT verification, `requireAuth` middleware                              |
| `api/routes/auth.ts`          | Login, register, password hashing, timing attack defense                |
| `api/routes/tables.ts`        | Generic CRUD — column allowlisting, ownership enforcement, SQL building |
| `api/routes/upload.ts`        | File upload — MIME validation, size limit, path construction            |
| `api/lib/audit.ts`            | Audit logging helper                                                    |
| `api/lib/crypto.ts`           | AES-256-GCM encryption/decryption for API keys                          |
| `api/lib/sanitise.ts`         | Prompt injection detection, message sanitization                        |
| `api/lib/sanitize-content.ts` | HTML/script stripping for scraped content                               |

## API Functions (Priority: HIGH)

| File                                          | Security Relevance                                        |
| --------------------------------------------- | --------------------------------------------------------- |
| `api/routes/functions/index.ts`               | Route mounting, auth middleware application               |
| `api/routes/functions/lemonade-chat.ts`       | LLM integration, prompt injection rules, output filtering |
| `api/routes/functions/query-content.ts`       | Content retrieval — site_id required, ownership gap       |
| `api/routes/functions/scrape-site.ts`         | SSRF protection, URL validation, content storage          |
| `api/routes/functions/refresh-sites.ts`       | Cron auth, SSRF protection, bulk re-scraping              |
| `api/routes/functions/test-api-connection.ts` | API key decryption, external API call                     |
| `api/routes/functions/verify-domain.ts`       | DNS/HTTP verification, domain ownership                   |

## Frontend (Priority: MEDIUM)

| File                             | Security Relevance                                |
| -------------------------------- | ------------------------------------------------- |
| `src/lib/apiClient.ts`           | HTTP client, token storage, auth header injection |
| `src/lib/validations.ts`         | Zod schemas for client-side validation            |
| `src/contexts/AuthContext.tsx`   | Auth state management, token lifecycle            |
| `src/components/HeroSection.tsx` | DOMPurify usage for CTA embeds                    |
| `src/components/AiChatAgent.tsx` | Chat interface, message rendering                 |

## Configuration (Priority: MEDIUM)

| File                 | Security Relevance                              |
| -------------------- | ----------------------------------------------- |
| `vite.config.ts`     | Dev proxy config, build settings                |
| `database/setup.sql` | Schema, constraints, RLS-like patterns, indexes |
| `api/package.json`   | Backend dependencies (check for CVEs)           |
| `package.json`       | Frontend dependencies (check for CVEs)          |

## Audit Checklist Order

For a full audit, review in this order:
1. `api/middleware/auth.ts` — Auth foundation
2. `api/routes/auth.ts` — Auth endpoints
3. `api/routes/tables.ts` — Generic CRUD (highest attack surface)
4. `api/routes/upload.ts` — File uploads
5. `api/routes/functions/*.ts` — Business logic endpoints
6. `api/lib/*.ts` — Security utilities
7. `api/index.ts` — Server config
8. `database/setup.sql` — Schema constraints
9. `src/lib/apiClient.ts` — Frontend auth handling
10. `src/components/HeroSection.tsx` — Frontend sanitization

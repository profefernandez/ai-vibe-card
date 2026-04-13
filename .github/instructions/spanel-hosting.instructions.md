---
applyTo: "**"
---

# SPanel Hosting — Agent Reference

This project is hosted on a **Scala Hosting Managed VPS** using **SPanel** (not cPanel, not Plesk).
All agents working on this codebase should understand the deployment architecture below.

## Hosting Stack

| Layer            | Technology                                      |
|------------------|-------------------------------------------------|
| VPS Provider     | Scala Hosting (Managed Cloud VPS)               |
| Control Panel    | SPanel (proprietary — not cPanel)               |
| Web Server       | Apache (with mod_rewrite + mod_proxy)           |
| Node.js Manager  | SPanel NodeJS Manager (uses PM2 internally)     |
| Database         | PostgreSQL 14+ (self-hosted on same VPS)        |
| OS               | Rocky Linux (RHEL-based)                        |
| SSL              | Free Let's Encrypt via SPanel                   |

## Directory Layout on the VPS

```
/home/<username>/
├── aivibe/
│   ├── api/
│   │   ├── dist/           ← Compiled Express API (TypeScript → JS)
│   │   ├── node_modules/   ← Production dependencies only
│   │   ├── package.json
│   │   ├── uploads/        ← User-uploaded files (avatars, etc.)
│   │   └── .env            ← Server secrets (NEVER in git)
│   └── public_html/        ← Domain document root (Vite build output)
│       ├── index.html
│       ├── assets/         ← Hashed JS/CSS bundles
│       ├── .htaccess       ← Apache rewrite rules (API proxy + SPA fallback)
│       └── robots.txt
```

## How Requests Flow

```
Browser → Apache (:443 SSL)
  ├── /api/*       → mod_proxy → Express on 127.0.0.1:3001
  ├── /uploads/*   → mod_proxy → Express on 127.0.0.1:3001
  ├── /assets/*    → Serve static file from public_html/assets/
  └── /*           → Serve index.html (React SPA fallback)
```

## SPanel NodeJS Manager

- **Accessible from**: SPanel User Interface → NodeJS Manager
- **Allowed ports**: 3000–3500 only
- **Process manager**: PM2 (auto-restart on crash, auto-start on reboot)
- **Actions available**: Deploy, Stop, Restart, Undeploy, npm install
- **Startup file**: `dist/index.js` (compiled from TypeScript)
- **npm install**: Click the Actions dropdown → "npm install" after uploading new code

## .htaccess Configuration

The `.htaccess` file in `public_html/` does three things:
1. **Proxies** `/api/*` and `/uploads/*` to Express on port 3001
2. **Serves** static files (JS, CSS, images) directly via Apache
3. **Falls back** to `index.html` for all other routes (React Router SPA)

The file is at [public/.htaccess](../../public/.htaccess) and gets copied into the build during deploy.

## Deploy Process

Use the deploy script: [deploy.sh](../../deploy.sh)

```bash
./deploy.sh              # Build + package into tarball
./deploy.sh --upload     # Build + package + rsync to VPS
```

### Manual deploy steps:
1. `npm run build` (root) → produces `dist/` (React frontend)
2. `cd api && npm run build` → produces `api/dist/` (Express API)
3. Upload `dist/*` contents to `public_html/`
4. Upload `api/dist/`, `api/package.json`, `api/node_modules/` to `aivibe/api/`
5. In SPanel → NodeJS Manager → Restart the app (or Deploy if first time)

## Environment Variables

The API server requires these env vars in `api/.env`:

| Variable          | Required | Description                                       |
|-------------------|----------|---------------------------------------------------|
| `DATABASE_URL`    | Yes      | PostgreSQL connection string                       |
| `JWT_SECRET`      | Yes      | 32+ char random string for JWT signing             |
| `ENCRYPTION_KEY`  | Yes      | 64-char hex string (AES-256-GCM for API keys)     |
| `PORT`            | No       | API port (default: 3001, must be 3000–3500)        |
| `CORS_ORIGINS`    | Yes*     | Comma-separated allowed origins for production     |
| `FIRECRAWL_API_KEY`| No      | Firecrawl API key for site scraping               |
| `AI_API_KEY`      | No       | OpenAI-compatible API key                          |
| `AI_API_URL`      | No       | AI gateway base URL                                |
| `AI_MODEL`        | No       | Model name for AI features                         |
| `REFRESH_SECRET`  | No       | Shared secret for cron-triggered site refresh      |
| `SMTP_HOST`       | No       | SMTP server hostname for email notifications       |
| `SMTP_PORT`       | No       | SMTP port (default: 587)                           |
| `SMTP_USER`       | No       | SMTP username / email                              |
| `SMTP_PASS`       | No       | SMTP password                                      |
| `SMTP_FROM`       | No       | Sender address (defaults to SMTP_USER)             |

*Defaults to localhost origins if unset — must be set in production.

## Important Rules for Agents

1. **Port range**: Node.js apps MUST use ports 3000–3500 on SPanel
2. **No systemd**: Don't create systemd services — SPanel uses PM2 via NodeJS Manager
3. **Apache in front**: Express never faces the internet directly; Apache proxies to it
4. **`.htaccess` is critical**: Without it, SPA routing and API proxying break
5. **PostgreSQL, not MySQL**: This project uses `pg` driver, not mysql/mysql2
6. **ESM modules**: Both frontend and API use `"type": "module"` — use `.js` extensions in imports
7. **Build before deploy**: TypeScript API must be compiled (`npm run build` in `api/`)
8. **Secrets stay on server**: `.env` is gitignored; secrets are only in the VPS `api/.env`
9. **CORS_ORIGINS must match domain**: Set to your production domain or API calls will be blocked
10. **mod_proxy required**: The `.htaccess` RewriteRules use `[P]` (proxy) flag — needs `mod_proxy` enabled (default on SPanel)

## Database Access

- PostgreSQL runs locally on the VPS (`127.0.0.1:5432`)
- Managed via SPanel's database tools or SSH (`psql`)
- Schema setup: [database/setup.sql](../../database/setup.sql)
- The app user (`aivibe_user`) has SELECT/INSERT/UPDATE/DELETE only — no DDL
- All queries use parameterized statements (no string concatenation)

## SSH Access

```bash
ssh -p 22 <username>@<vps-ip>
# Node.js app logs:
pm2 logs aivibe-api
# Restart app:
pm2 restart aivibe-api
# Check status:
pm2 status
```

## Cron Jobs

The `refresh-sites` endpoint re-scrapes stale verified sites. Set up a cron job via SPanel:

```bash
# Every 6 hours — refresh stale sites
0 */6 * * * /home/<username>/aivibe/cron/refresh-sites.sh >> /home/<username>/aivibe/cron/refresh.log 2>&1
```

The script reads `REFRESH_SECRET` from `api/.env` automatically. See [cron/refresh-sites.sh](../../cron/refresh-sites.sh).

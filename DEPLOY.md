# Deployment runbook — ai.60wattsofclarity.com

Self-hosted on a Scala Hosting VPS with SPanel + Docker.

## Architecture

```
Internet ──► SPanel nginx (TLS) ──► 127.0.0.1:8080 ──► [web (nginx) + api (Node) + postgres]
```

The Docker stack only exposes one port (`127.0.0.1:8080`); SPanel's nginx
terminates TLS and reverse-proxies to it. Postgres and the API are unreachable
from outside the host.

## Files in play

| File | Role |
|---|---|
| `docker-compose.yml` | Production stack (web + api + postgres + migrate) |
| `Dockerfile.api` | Multi-stage Node image (build → deps → runtime, non-root) |
| `Dockerfile.web` | nginx image with built static frontend baked in |
| `deploy/nginx.conf` | nginx config for the web container |
| `.env` | Secrets — **never** commit. `chmod 600`. |
| `.env.example` | Template — copy to `.env`, fill in |
| `database/setup.sql` | One-time bootstrap (DB user + extensions). Schema is in migrations. |
| `api/migrations/*.ts` | Schema migrations, applied via `docker compose run --rm migrate` |

## First-time deploy

### 1. On your laptop (or codespace)
```bash
git push                  # push latest code to your repo
```

### 2. SSH to the server
```bash
ssh root@your-server
cd /srv && git clone https://github.com/<you>/ai-vibe-card.git aivibe
cd aivibe
```

### 3. Create the production .env
```bash
cp .env.example .env
nano .env                                          # fill in all values
chmod 600 .env

# Generate the cryptographic secrets:
openssl rand -hex 32                               # → JWT_SECRET
openssl rand -hex 32                               # → ENCRYPTION_KEY
openssl rand -base64 24                            # → POSTGRES_PASSWORD
```

`CORS_ORIGINS` should be `https://ai.60wattsofclarity.com` (the public URL — no trailing slash).

### 4. Build images and start the stack
```bash
docker compose build                               # builds api + web images
docker compose up -d postgres                      # bring DB up first
docker compose --profile tools run --rm migrate    # apply schema migrations
docker compose up -d                               # start api + web
docker compose ps                                  # confirm all healthy
```

### 5. Configure SPanel reverse proxy
In SPanel: pick the domain `ai.60wattsofclarity.com`, add a reverse proxy entry
that targets `http://127.0.0.1:8080`. Enable Let's Encrypt SSL on the domain.
SPanel handles TLS, HTTP→HTTPS redirect, and certificate renewal.

### 6. Smoke test
```bash
curl -fsS https://ai.60wattsofclarity.com/healthz
curl -fsS https://ai.60wattsofclarity.com/api/health
curl -fsS https://ai.60wattsofclarity.com/api/ready
```
All three should return 200. Then open the site in a browser, register your
account — that creates your user + your "Personal" organization + your card
profile in a single transaction.

## Routine operations

| Task | Command |
|---|---|
| View live logs | `docker compose logs -f api` |
| View web logs | `docker compose logs -f web` |
| Restart api only | `docker compose restart api` |
| Restart everything | `docker compose restart` |
| Pull latest code & redeploy | `git pull && docker compose build && docker compose --profile tools run --rm migrate && docker compose up -d` |
| Apply pending migrations | `docker compose --profile tools run --rm migrate` |
| Check migration status | `docker compose run --rm -e DATABASE_URL --entrypoint npx api node-pg-migrate -m dist/migrations -j js status` |
| Roll back last migration | `docker compose run --rm --entrypoint npx api node-pg-migrate -m dist/migrations -j js down` |
| Open a psql shell | `docker compose exec postgres psql -U aivibe_user -d aivibe_db` |
| Stop the stack (data preserved) | `docker compose down` |
| **Wipe everything (destroys data)** | `docker compose down -v` ⚠️ |

## Backups

Set this up before you have anything you'd cry about losing.

### Daily DB dump (cron on the host)
```bash
# /etc/cron.daily/aivibe-backup
#!/bin/sh
set -eu
TS=$(date +%Y%m%d-%H%M%S)
DEST=/srv/backups/aivibe
mkdir -p "$DEST"
docker compose -f /srv/aivibe/docker-compose.yml exec -T postgres \
    pg_dump -U aivibe_user -d aivibe_db --format=custom \
    > "$DEST/db-$TS.dump"
docker run --rm -v aivibe_uploads:/data -v "$DEST":/backup \
    alpine tar -czf "/backup/uploads-$TS.tar.gz" -C /data .
# Retain 14 daily snapshots
find "$DEST" -name 'db-*.dump'    -mtime +14 -delete
find "$DEST" -name 'uploads-*.tar.gz' -mtime +14 -delete
```
`chmod +x /etc/cron.daily/aivibe-backup`.

### Restore from a dump
```bash
# Restore DB
docker compose exec -T postgres pg_restore -U aivibe_user -d aivibe_db \
    --clean --if-exists < /srv/backups/aivibe/db-YYYYMMDD-HHMMSS.dump

# Restore uploads
docker run --rm -v aivibe_uploads:/data -v /srv/backups/aivibe:/backup \
    alpine sh -c "rm -rf /data/* && tar -xzf /backup/uploads-YYYYMMDD-HHMMSS.tar.gz -C /data"
```

**Off-site copy:** scp/rsync `/srv/backups/aivibe/` to a different machine
(another VPS, a NAS, a B2/R2 bucket). Backups on the same server they back up
are not backups.

### Quarterly restore drill
Once a quarter, restore the latest dump to a throwaway Postgres container and
verify the data is intact. If you haven't tested a restore, you don't have one.

## Where data lives

| What | Where (on the host) |
|---|---|
| Database | Docker volume `aivibe_postgres_data` (`/var/lib/docker/volumes/aivibe_postgres_data/_data`) |
| User uploads | Docker volume `aivibe_uploads` |
| Secrets | `/srv/aivibe/.env` (chmod 600) |
| App code | `/srv/aivibe/` (cloned from git) |
| Logs | Docker captures stdout — `docker compose logs <service>`. Rotated to 5 × 10 MB per service. |

## Troubleshooting

**`/api/ready` returns 503**
The API can't reach the DB. Check `docker compose ps` — postgres should be `healthy`.
If it isn't: `docker compose logs postgres`.

**Frontend loads but API calls fail with CORS errors**
`CORS_ORIGINS` in `.env` is wrong. Must exactly match the public URL,
no trailing slash. Edit `.env`, then `docker compose up -d` to apply.

**Login returns "Session outdated, please sign in again" after deploy**
Expected. Old JWTs (issued before the org-scoping migration) don't carry
the `org` claim and are rejected. Users log in once and they're fine.

**`docker compose --profile tools run --rm migrate` fails halfway**
Migrations run in a transaction — a failed migration rolls itself back.
Read the error, fix the migration, re-run. The API is unaffected during
migration runs.

**SPanel's nginx returns 502**
The web container isn't responding. Check `docker compose ps` and
`docker compose logs web`. If healthy, SPanel's proxy target may be wrong —
must be `http://127.0.0.1:8080`.

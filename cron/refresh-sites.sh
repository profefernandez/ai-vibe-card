#!/usr/bin/env bash
# =============================================================================
# Refresh stale sites — cron job script for SPanel
#
# Calls the refresh-sites API endpoint to re-scrape verified sites that
# haven't been updated within their configured refresh interval.
#
# Setup on SPanel (via SSH or SPanel Cron Jobs UI):
#   crontab -e
#   0 */6 * * * /home/<username>/aivibe/cron/refresh-sites.sh >> /home/<username>/aivibe/cron/refresh.log 2>&1
#
# Required: REFRESH_SECRET must match the value in api/.env
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
# Load secret from the API .env file
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../api/.env"

if [[ -f "$ENV_FILE" ]]; then
    REFRESH_SECRET=$(grep '^REFRESH_SECRET=' "$ENV_FILE" | cut -d= -f2-)
fi

if [[ -z "${REFRESH_SECRET:-}" ]]; then
    echo "[$(date -Iseconds)] ERROR: REFRESH_SECRET not set. Add it to api/.env"
    exit 1
fi

API_URL="${API_URL:-http://127.0.0.1:3001}"

# ── Call the endpoint ─────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Starting site refresh..."

HTTP_CODE=$(curl -s -o /tmp/refresh-response.json -w "%{http_code}" \
    -X POST "${API_URL}/api/functions/refresh-sites" \
    -H "Authorization: Bearer ${REFRESH_SECRET}" \
    -H "Content-Type: application/json")

if [[ "$HTTP_CODE" == "200" ]]; then
    echo "[$(date -Iseconds)] OK — $(cat /tmp/refresh-response.json)"
else
    echo "[$(date -Iseconds)] FAILED (HTTP ${HTTP_CODE}) — $(cat /tmp/refresh-response.json)"
    exit 1
fi

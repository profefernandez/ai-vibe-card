#!/usr/bin/env bash
# =============================================================================
# Prune retention tables — cron job script for SPanel.
#
# Calls the prune-logs Edge Function (or legacy /api/functions/prune-logs)
# to drop rows past their retention window in audit_log / ai_feedback /
# feedback_consumed.
#
# Setup on SPanel (via SSH or SPanel Cron Jobs UI):
#   crontab -e
#   17 3 * * * /home/<username>/aivibe/cron/prune-logs.sh >> /home/<username>/aivibe/cron/prune.log 2>&1
#
# Required: REFRESH_SECRET must match the value in api/.env (and Supabase
# secrets — same secret as refresh-sites).
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ENV_FILE="${SCRIPT_DIR}/../api/.env"

if [[ -f "$ENV_FILE" ]]; then
    REFRESH_SECRET=$(grep '^REFRESH_SECRET=' "$ENV_FILE" | cut -d= -f2-)
    SUPABASE_URL=$(grep '^SUPABASE_URL=' "$ENV_FILE" | cut -d= -f2-)
fi

if [[ -z "${REFRESH_SECRET:-}" ]]; then
    echo "[$(date -Iseconds)] ERROR: REFRESH_SECRET not set. Add it to api/.env"
    exit 1
fi

# Prefer the Supabase Edge Function (Phase D-8). Falls back to the legacy
# Express endpoint if SUPABASE_URL is unset, so an in-flight migration
# keeps working.
if [[ -n "${SUPABASE_URL:-}" ]]; then
    PRUNE_URL="${SUPABASE_URL%/}/functions/v1/prune-logs"
else
    API_URL="${API_URL:-http://127.0.0.1:3001}"
    PRUNE_URL="${API_URL}/api/functions/prune-logs"
fi

# ── Call the endpoint ─────────────────────────────────────────────────────────
echo "[$(date -Iseconds)] Starting retention sweep against ${PRUNE_URL}..."

HTTP_CODE=$(curl -s -o /tmp/prune-response.json -w "%{http_code}" \
    -X POST "${PRUNE_URL}" \
    -H "Authorization: Bearer ${REFRESH_SECRET}" \
    -H "Content-Type: application/json")

# 207 = partial success (one or more tables errored but others succeeded)
if [[ "$HTTP_CODE" == "200" || "$HTTP_CODE" == "207" ]]; then
    echo "[$(date -Iseconds)] OK (${HTTP_CODE}) — $(cat /tmp/prune-response.json)"
else
    echo "[$(date -Iseconds)] FAILED (HTTP ${HTTP_CODE}) — $(cat /tmp/prune-response.json)"
    exit 1
fi

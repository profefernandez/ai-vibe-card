#!/usr/bin/env bash
# =============================================================================
# AI Vibe Card — SPanel Deploy Script
#
# Builds the React frontend and Express API, then packages everything into
# a deploy-ready tarball you can upload to your Scala Hosting VPS.
#
# Usage:
#   chmod +x deploy.sh
#   ./deploy.sh                  # builds + packages
#   ./deploy.sh --upload         # builds, packages, and rsyncs to server
#
# Prerequisites:
#   - Node.js 18+ and npm installed locally
#   - For --upload: SSH access to your VPS (set DEPLOY_HOST below)
#
# =============================================================================
set -euo pipefail

# ── Configuration ─────────────────────────────────────────────────────────────
# Edit these to match your SPanel setup
DEPLOY_HOST="${DEPLOY_HOST:-}"                        # e.g. user@123.45.67.89
DEPLOY_PATH="${DEPLOY_PATH:-/home/\$USER/aivibe}"    # path on the VPS
DEPLOY_PORT="${DEPLOY_PORT:-22}"                      # SSH port
NODE_PORT="${NODE_PORT:-3001}"                        # Express API port (3000-3500)

# ── Derived paths ─────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BUILD_DIR="$SCRIPT_DIR/.deploy"
TARBALL="$SCRIPT_DIR/ai-vibe-card-deploy.tar.gz"

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'
info()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn()  { echo -e "${YELLOW}[deploy]${NC} $*"; }
error() { echo -e "${RED}[deploy]${NC} $*" >&2; }

# ── Clean previous build ─────────────────────────────────────────────────────
info "Cleaning previous build artifacts..."
rm -rf "$BUILD_DIR" "$TARBALL"
mkdir -p "$BUILD_DIR/public_html" "$BUILD_DIR/api"

# ── Step 1: Build React frontend ─────────────────────────────────────────────
info "Installing frontend dependencies..."
cd "$SCRIPT_DIR"
npm ci --ignore-scripts

info "Building React frontend (vite)..."
npm run build

info "Copying frontend build to deploy package..."
cp -r "$SCRIPT_DIR/dist/"* "$BUILD_DIR/public_html/"

# ── Step 2: Build Express API ─────────────────────────────────────────────────
info "Installing API dependencies..."
cd "$SCRIPT_DIR/api"
npm ci

info "Compiling TypeScript API..."
npm run build

info "Copying API build to deploy package..."
cp -r "$SCRIPT_DIR/api/dist"      "$BUILD_DIR/api/dist"
cp    "$SCRIPT_DIR/api/package.json"     "$BUILD_DIR/api/package.json"
cp    "$SCRIPT_DIR/api/package-lock.json" "$BUILD_DIR/api/package-lock.json" 2>/dev/null || true

# Copy production dependencies only (no devDependencies)
info "Installing production-only API dependencies..."
cd "$BUILD_DIR/api"
npm ci --omit=dev

# ── Step 3: Copy .htaccess ────────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/public/.htaccess" ]]; then
    cp "$SCRIPT_DIR/public/.htaccess" "$BUILD_DIR/public_html/.htaccess"
    info "Copied .htaccess to public_html/"
else
    warn ".htaccess not found in public/ — skipping"
fi

# ── Step 4: Copy robots.txt ──────────────────────────────────────────────────
if [[ -f "$SCRIPT_DIR/public/robots.txt" ]]; then
    cp "$SCRIPT_DIR/public/robots.txt" "$BUILD_DIR/public_html/robots.txt"
fi

# ── Step 5: Create .env template if API .env doesn't exist ────────────────────
if [[ ! -f "$BUILD_DIR/api/.env" ]]; then
    cat > "$BUILD_DIR/api/.env.example" <<'ENVTEMPLATE'
# AI Vibe Card — API Environment Variables
# Copy this to .env and fill in your values. NEVER commit .env to git.

DATABASE_URL=postgresql://aivibe_user:CHANGE_ME@127.0.0.1:5432/aivibe_db
JWT_SECRET=CHANGE_ME_32_CHARS_MINIMUM
ENCRYPTION_KEY=CHANGE_ME_64_HEX_CHARS
PORT=3001
CORS_ORIGINS=https://yourdomain.com

# Optional — external services
FIRECRAWL_API_KEY=
AI_API_KEY=
AI_API_URL=
AI_MODEL=
ENVTEMPLATE
    info "Created .env.example (fill in values on the server)"
fi

# ── Step 6: Package into tarball ──────────────────────────────────────────────
info "Creating deploy tarball..."
cd "$BUILD_DIR"
tar -czf "$TARBALL" .
info "Package ready: $TARBALL ($(du -h "$TARBALL" | cut -f1))"

# ── Step 7: Upload (optional) ────────────────────────────────────────────────
if [[ "${1:-}" == "--upload" ]]; then
    if [[ -z "$DEPLOY_HOST" ]]; then
        error "Set DEPLOY_HOST (e.g. export DEPLOY_HOST=user@1.2.3.4) before using --upload"
        exit 1
    fi

    info "Uploading to $DEPLOY_HOST:$DEPLOY_PATH ..."

    # Create remote dir structure
    ssh -p "$DEPLOY_PORT" "$DEPLOY_HOST" "mkdir -p $DEPLOY_PATH"

    # Rsync the build (preserves .env if it already exists on server)
    rsync -avz --progress \
        -e "ssh -p $DEPLOY_PORT" \
        --exclude='.env' \
        "$BUILD_DIR/" "$DEPLOY_HOST:$DEPLOY_PATH/"

    info "Restarting Node.js app via PM2..."
    ssh -p "$DEPLOY_PORT" "$DEPLOY_HOST" \
        "cd $DEPLOY_PATH/api && pm2 restart dist/index.js --name aivibe-api 2>/dev/null || pm2 start dist/index.js --name aivibe-api"

    info "Deploy complete! Site: https://$(echo "$DEPLOY_HOST" | cut -d@ -f2)"
else
    echo ""
    info "To upload to your VPS:"
    echo "  export DEPLOY_HOST=user@your-vps-ip"
    echo "  ./deploy.sh --upload"
    echo ""
    info "Or manually:"
    echo "  1. Upload $TARBALL to your VPS"
    echo "  2. Extract: cd /home/<user>/aivibe && tar -xzf ai-vibe-card-deploy.tar.gz"
    echo "  3. Copy .env.example to api/.env and fill in secrets"
    echo "  4. In SPanel NodeJS Manager → Deploy app at port $NODE_PORT"
fi

# ── Cleanup ───────────────────────────────────────────────────────────────────
rm -rf "$BUILD_DIR"
info "Done."

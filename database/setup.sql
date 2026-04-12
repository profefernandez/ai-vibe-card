-- =============================================================================
-- AI VIBE CARD — Self-Hosted PostgreSQL Database Setup
-- Target: Scala Hosting VPS  |  SPanel  |  Rocky Linux
-- Requires: PostgreSQL 14+
--
-- Run as the "postgres" superuser via SSH:
--   psql -U postgres -f database/setup.sql
--
-- After running this script, configure the API server (.env):
--   DATABASE_URL=postgresql://aivibe_user:<password>@127.0.0.1:5432/aivibe_db
--   JWT_SECRET=<32+ char secret>
--
-- SECURITY PARAMETERS APPLIED (OWASP Top 10):
--   A01 Broken Access Control   → Least-privilege DB user; no DDL grants
--   A02 Cryptographic Failures  → Passwords via bcrypt; API keys encrypted at app layer
--   A03 Injection               → Use parameterized queries in ALL app code
--   A04 Insecure Design         → Audit log + rate_limits tables included
--   A05 Security Misconfiguration → App user has SELECT/INSERT/UPDATE/DELETE only
--   A07 Auth Failures           → sessions table with expiry; rate limiting
--   A09 Logging                 → audit_log captures sensitive actions
--
-- ============================================================================= 


-- =============================================================================
-- STEP 1 — Run as the "postgres" superuser (in SPanel > MySQL/PostgreSQL Manager
--           or via SSH: psql -U postgres)
-- =============================================================================

-- Create the database
CREATE DATABASE aivibe_db
    ENCODING 'UTF8'
    LC_COLLATE 'en_US.utf8'
    LC_CTYPE   'en_US.utf8'
    TEMPLATE   template0;

-- Create the application user
-- !! REPLACE 'CHANGE_ME_STRONG_PASSWORD' with a real password !!
-- (min 20 chars, mixed case, numbers, symbols — store it in SPanel secrets)
CREATE USER aivibe_user WITH
    ENCRYPTED PASSWORD 'CHANGE_ME_STRONG_PASSWORD'
    CONNECTION LIMIT 25       -- prevent connection exhaustion
    LOGIN
    NOSUPERUSER
    NOCREATEDB
    NOCREATEROLE;

-- Connect to the new database before continuing
\connect aivibe_db


-- =============================================================================
-- STEP 2 — Run inside aivibe_db (still as postgres superuser)
-- =============================================================================

-- Enable the pgcrypto extension (provides gen_random_uuid, pgp_sym_encrypt)
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Enable pg_trgm for fuzzy / full-text search on content
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Revoke default public schema create from all roles (hardens defaults)
REVOKE CREATE ON SCHEMA public FROM PUBLIC;

-- Grant only usage (not create) to app user
GRANT USAGE  ON SCHEMA public TO aivibe_user;

-- Pre-authorize future tables & sequences that this script will create
ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO aivibe_user;

ALTER DEFAULT PRIVILEGES IN SCHEMA public
    GRANT USAGE, SELECT ON SEQUENCES TO aivibe_user;


-- =============================================================================
-- STEP 3 — Schema (run as postgres superuser, connected to aivibe_db)
-- =============================================================================

-- -------------------------------------------------------
-- Shared trigger: auto-update "updated_at" on any table
-- -------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;


-- -------------------------------------------------------
-- USERS  (local auth — bcrypt password hash)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
    id                   UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    email                TEXT        NOT NULL,
    password_hash        TEXT        NOT NULL,   -- bcrypt hash; NEVER store plaintext
    email_verified       BOOLEAN     NOT NULL DEFAULT FALSE,
    verification_token   TEXT        DEFAULT NULL,
    reset_token          TEXT        DEFAULT NULL,
    reset_token_expires_at TIMESTAMPTZ DEFAULT NULL,
    last_sign_in_at      TIMESTAMPTZ DEFAULT NULL,
    created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_users_email UNIQUE (email)
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- -------------------------------------------------------
-- SESSIONS  (JWT / API token registry)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sessions (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    token_hash  TEXT        NOT NULL,   -- SHA-256(token); never store raw token
    user_agent  TEXT        DEFAULT NULL,
    ip_address  INET        DEFAULT NULL,
    expires_at  TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_sessions_token UNIQUE (token_hash)
);

CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions (user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);
-- Partial index: only active (non-expired) sessions need fast lookup
CREATE INDEX IF NOT EXISTS idx_sessions_active ON sessions (token_hash)
    WHERE expires_at > now();


-- -------------------------------------------------------
-- PROFILES  (public card info)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS profiles (
    id            UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id       UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    display_name  TEXT        NOT NULL DEFAULT '',
    tagline       TEXT        NOT NULL DEFAULT '',
    bio           TEXT        NOT NULL DEFAULT '',
    avatar_url    TEXT        NOT NULL DEFAULT '',
    cta_url       TEXT        NOT NULL DEFAULT '',
    cta_label     TEXT        NOT NULL DEFAULT 'Get in Touch',
    cta_embed     TEXT        NOT NULL DEFAULT '',
    social_links  JSONB       NOT NULL DEFAULT '[]',
    card_layout   TEXT        NOT NULL DEFAULT 'classic'
                      CHECK (card_layout IN ('classic', 'bold')),
    theme         TEXT        NOT NULL DEFAULT 'dark'
                      CHECK (theme IN ('dark', 'light', 'system')),
    accent_color  TEXT        NOT NULL DEFAULT 'amber',
    seo_title     TEXT        NOT NULL DEFAULT '',
    seo_description TEXT      NOT NULL DEFAULT '',
    og_image_url  TEXT        NOT NULL DEFAULT '',
    robots_txt    JSONB       NOT NULL DEFAULT '[{"userAgent":"*","rules":[{"action":"allow","path":"/"}]}]',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_profiles_user UNIQUE (user_id)
);

CREATE TRIGGER trg_profiles_updated_at
    BEFORE UPDATE ON profiles
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- -------------------------------------------------------
-- SITES  (imported websites)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS sites (
    id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    domain            TEXT        NOT NULL,
    name              TEXT        DEFAULT NULL,
    scrape_status     TEXT        NOT NULL DEFAULT 'pending'
                          CHECK (scrape_status IN ('pending', 'scraping', 'completed', 'error')),
    page_count        INTEGER     NOT NULL DEFAULT 0  CHECK (page_count >= 0),
    share_usage_limit INTEGER     NOT NULL DEFAULT 10 CHECK (share_usage_limit >= 0),
    last_scraped_at        TIMESTAMPTZ DEFAULT NULL,
    refresh_interval_hours INTEGER     NOT NULL DEFAULT 24 CHECK (refresh_interval_hours >= 1),
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sites_user   ON sites (user_id);
CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites (domain);

CREATE TRIGGER trg_sites_updated_at
    BEFORE UPDATE ON sites
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- -------------------------------------------------------
-- SITE_PAGES  (scraped pages per site)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS site_pages (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id     UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    url         TEXT        NOT NULL,
    title       TEXT        DEFAULT NULL,
    markdown    TEXT        DEFAULT NULL,
    html        TEXT        DEFAULT NULL,
    metadata    JSONB       NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pages_site ON site_pages (site_id);
-- GIN index on metadata for fast JSONB key queries
CREATE INDEX IF NOT EXISTS idx_pages_metadata ON site_pages USING GIN (metadata);


-- -------------------------------------------------------
-- CONTENT_BLOCKS  (parsed content from pages)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS content_blocks (
    id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    site_id     UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
    page_id     UUID        NOT NULL REFERENCES site_pages (id) ON DELETE CASCADE,
    heading     TEXT        DEFAULT NULL,
    body        TEXT        DEFAULT NULL,
    images      TEXT[]      NOT NULL DEFAULT '{}',
    tags        TEXT[]      NOT NULL DEFAULT '{}',
    category    TEXT        DEFAULT NULL,
    block_order INTEGER     NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_blocks_site     ON content_blocks (site_id);
CREATE INDEX IF NOT EXISTS idx_blocks_page     ON content_blocks (page_id);
CREATE INDEX IF NOT EXISTS idx_blocks_category ON content_blocks (category);
CREATE INDEX IF NOT EXISTS idx_blocks_order    ON content_blocks (site_id, block_order);

-- Full-text search index (used by query-content edge function)
CREATE INDEX IF NOT EXISTS idx_blocks_fts ON content_blocks
    USING GIN (to_tsvector('english',
        coalesce(heading, '') || ' ' || coalesce(body, '')
    ));

-- Trigram index for partial / fuzzy string matching
CREATE INDEX IF NOT EXISTS idx_blocks_trgm_body ON content_blocks
    USING GIN (body gin_trgm_ops);


-- -------------------------------------------------------
-- AI_PREFERENCES  (per-user AI persona settings)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS ai_preferences (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    system_prompt   TEXT        NOT NULL DEFAULT '',
    rules           JSONB       NOT NULL DEFAULT '[]',
    personality     TEXT        NOT NULL DEFAULT 'professional',
    response_style  TEXT        NOT NULL DEFAULT 'friendly',
    prompt_injection_rules JSONB NOT NULL DEFAULT '[]',
    safety_protocol TEXT        NOT NULL DEFAULT '',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ai_prefs_user UNIQUE (user_id)
);

CREATE TRIGGER trg_ai_prefs_updated_at
    BEFORE UPDATE ON ai_preferences
    FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();


-- -------------------------------------------------------
-- API_CONNECTIONS  (external API keys, encrypted at app layer)
-- Encryption responsibility: the app must AES-256 encrypt the raw key
-- BEFORE writing to api_key_encrypted.  Never store plaintext keys.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS api_connections (
    id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id           UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    provider          TEXT        NOT NULL,   -- 'openai', 'anthropic', etc.
    api_key_encrypted TEXT        NOT NULL DEFAULT '',
    model_name        TEXT        DEFAULT '',
    is_active         BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_api_user_provider UNIQUE (user_id, provider)
);

CREATE INDEX IF NOT EXISTS idx_api_user ON api_connections (user_id);


-- -------------------------------------------------------
-- RECEIVED_CARDS  (visitor card exchanges / leads)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS received_cards (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    owner_id        UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
    sender_name     TEXT        NOT NULL DEFAULT '',
    sender_domain   TEXT        DEFAULT '',
    sender_avatar   TEXT        DEFAULT '',
    sender_tagline  TEXT        DEFAULT '',
    sender_site_id  UUID        DEFAULT NULL REFERENCES sites (id) ON DELETE SET NULL,
    notes           TEXT        DEFAULT '',
    usage_count     INTEGER     NOT NULL DEFAULT 0 CHECK (usage_count >= 0),
    usage_limit     INTEGER     NOT NULL DEFAULT 10 CHECK (usage_limit >= 0),
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cards_owner ON received_cards (owner_id);


-- =============================================================================
-- SECURITY / OBSERVABILITY TABLES
-- =============================================================================

-- -------------------------------------------------------
-- AUDIT_LOG  (OWASP A09 — Logging & Monitoring)
-- Append-only; the app user cannot DELETE from this table.
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL   PRIMARY KEY,
    user_id     UUID        DEFAULT NULL,   -- NULL = unauthenticated action
    action      TEXT        NOT NULL,       -- 'login', 'signup', 'update_profile', etc.
    table_name  TEXT        NOT NULL DEFAULT '',
    record_id   UUID        DEFAULT NULL,
    old_values  JSONB       DEFAULT NULL,
    new_values  JSONB       DEFAULT NULL,
    ip_address  INET        DEFAULT NULL,
    user_agent  TEXT        DEFAULT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audit_user    ON audit_log (user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action  ON audit_log (action);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log (created_at DESC);

-- Partial index: quickly find auth events
CREATE INDEX IF NOT EXISTS idx_audit_auth ON audit_log (action, created_at DESC)
    WHERE action IN ('login', 'signup', 'logout', 'failed_login', 'password_reset');


-- -------------------------------------------------------
-- RATE_LIMITS  (OWASP A07 — Brute-force & DDoS protection)
-- -------------------------------------------------------
CREATE TABLE IF NOT EXISTS rate_limits (
    id            BIGSERIAL   PRIMARY KEY,
    identifier    TEXT        NOT NULL,   -- IP address or user_id
    action        TEXT        NOT NULL,   -- 'login', 'signup', 'api_call', etc.
    attempts      INTEGER     NOT NULL DEFAULT 1,
    window_start  TIMESTAMPTZ NOT NULL DEFAULT now(),
    blocked_until TIMESTAMPTZ DEFAULT NULL,
    CONSTRAINT uq_rate UNIQUE (identifier, action)
);

CREATE INDEX IF NOT EXISTS idx_rate_ident ON rate_limits (identifier, action);


-- =============================================================================
-- STEP 4 — Explicit grants after table creation
-- (covers anything not caught by ALTER DEFAULT PRIVILEGES above)
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES    IN SCHEMA public TO aivibe_user;
GRANT USAGE, SELECT                  ON ALL SEQUENCES IN SCHEMA public TO aivibe_user;

-- Audit log: app user can INSERT but NOT DELETE (preserve integrity)
REVOKE DELETE ON audit_log FROM aivibe_user;


-- =============================================================================
-- STEP 5 — PostgreSQL server-level security settings
-- Add these to /etc/postgresql/14/main/postgresql.conf (or via SPanel)
-- =============================================================================
--
-- # Bind only to localhost (app and DB on same server)
-- listen_addresses = 'localhost'
--
-- # Limit max connections (tune to VPS RAM: ~5 MB per connection)
-- max_connections = 50
--
-- # Log failed logins and slow queries
-- log_connections         = on
-- log_disconnections      = on
-- log_failed_connections  = on
-- log_min_duration_statement = 1000   -- log queries taking > 1 second
-- log_line_prefix         = '%t [%p]: [%l-1] user=%u,db=%d,app=%a,client=%h '
--
-- # SSL (enable if accepting remote connections)
-- ssl = on
--
-- /etc/postgresql/14/main/pg_hba.conf — allow only local connections:
-- local   aivibe_db   aivibe_user                     scram-sha-256
-- host    aivibe_db   aivibe_user   127.0.0.1/32      scram-sha-256


-- =============================================================================
-- STEP 6 — Rocky Linux installation commands (run via SSH on the VPS)
-- SSH into server:  ssh -p 6543 root@165.140.156.47
-- =============================================================================
--
-- # Install PostgreSQL 16 (PGDG repo)
-- dnf install -y https://download.postgresql.org/pub/repos/yum/reporpms/EL-9-x86_64/pgdg-redhat-repo-latest.noarch.rpm
-- dnf -qy module disable postgresql
-- dnf install -y postgresql16-server postgresql16-contrib
-- /usr/pgsql-16/bin/postgresql-16-setup initdb
-- systemctl enable --now postgresql-16
--
-- # Open firewall only for localhost (NOT public internet)
-- firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="127.0.0.1" port port="5432" protocol="tcp" accept'
-- firewall-cmd --reload
--
-- # Run this SQL file
-- sudo -u postgres psql -f /path/to/setup.sql
--
-- # Verify
-- sudo -u postgres psql -d aivibe_db -c "\dt"


-- =============================================================================
-- STEP 7 — Connecting the React app
-- Set these environment variables in your GitHub Actions secrets and .env:
--
-- DATABASE_URL=postgresql://aivibe_user:CHANGE_ME_STRONG_PASSWORD@127.0.0.1:5432/aivibe_db
--
-- The Express API server (api/) reads DATABASE_URL and exposes REST endpoints
-- consumed by the React frontend. Start it with: node api/dist/index.js
-- =============================================================================


-- =============================================================================
-- MAINTENANCE — run periodically (or set up via pg_cron)
-- =============================================================================

-- Clean up expired sessions (run daily via cron or pg_cron)
-- DELETE FROM sessions WHERE expires_at < now();

-- Clean up stale rate-limit windows older than 24 hours
-- DELETE FROM rate_limits WHERE window_start < now() - INTERVAL '24 hours' AND blocked_until IS NULL;

-- Rotate old audit logs after 90 days (keep data, but archive if needed)
-- INSERT INTO audit_log_archive SELECT * FROM audit_log WHERE created_at < now() - INTERVAL '90 days';
-- DELETE FROM audit_log WHERE created_at < now() - INTERVAL '90 days';

-- Analyze tables after bulk imports
-- ANALYZE content_blocks;
-- ANALYZE site_pages;

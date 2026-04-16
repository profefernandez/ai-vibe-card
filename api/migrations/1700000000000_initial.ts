import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Baseline migration — captures the schema that existed before migrations
 * were introduced. Uses IF NOT EXISTS throughout, so running this against
 * a database that already has the schema (from the original database/setup.sql)
 * is a safe no-op.
 *
 * Fresh databases: run `npm run migrate:up` — this applies.
 * Pre-existing databases (from setup.sql): first run
 *   node -e "require('pg').Pool && ..." — or: apply with node-pg-migrate
 *   after which it will simply no-op.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        -- Extensions
        CREATE EXTENSION IF NOT EXISTS pgcrypto;
        CREATE EXTENSION IF NOT EXISTS pg_trgm;

        -- Shared trigger function
        CREATE OR REPLACE FUNCTION fn_set_updated_at()
        RETURNS TRIGGER LANGUAGE plpgsql AS $$
        BEGIN
            NEW.updated_at = now();
            RETURN NEW;
        END;
        $$;

        -- ─── users ──────────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS users (
            id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            email                   TEXT        NOT NULL,
            password_hash           TEXT        NOT NULL,
            email_verified          BOOLEAN     NOT NULL DEFAULT FALSE,
            verification_token      TEXT        DEFAULT NULL,
            reset_token             TEXT        DEFAULT NULL,
            reset_token_expires_at  TIMESTAMPTZ DEFAULT NULL,
            last_sign_in_at         TIMESTAMPTZ DEFAULT NULL,
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_users_email UNIQUE (email)
        );
        CREATE INDEX IF NOT EXISTS idx_users_email ON users (email);
        DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
        CREATE TRIGGER trg_users_updated_at
            BEFORE UPDATE ON users
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

        -- ─── sessions ───────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS sessions (
            id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            token_hash  TEXT        NOT NULL,
            user_agent  TEXT        DEFAULT NULL,
            ip_address  INET        DEFAULT NULL,
            expires_at  TIMESTAMPTZ NOT NULL,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_sessions_token UNIQUE (token_hash)
        );
        CREATE INDEX IF NOT EXISTS idx_sessions_user   ON sessions (user_id);
        CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions (expires_at);
        -- token_hash already has a unique index from uq_sessions_token; no separate "active"
        -- partial index (Postgres rejects now() in index predicates as non-IMMUTABLE).

        -- ─── profiles ───────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS profiles (
            id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id         UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            display_name    TEXT        NOT NULL DEFAULT '',
            tagline         TEXT        NOT NULL DEFAULT '',
            bio             TEXT        NOT NULL DEFAULT '',
            avatar_url      TEXT        NOT NULL DEFAULT '',
            cta_url         TEXT        NOT NULL DEFAULT '',
            cta_label       TEXT        NOT NULL DEFAULT 'Get in Touch',
            cta_embed       TEXT        NOT NULL DEFAULT '',
            social_links    JSONB       NOT NULL DEFAULT '[]',
            card_layout     TEXT        NOT NULL DEFAULT 'classic'
                                CHECK (card_layout IN ('classic', 'bold')),
            theme           TEXT        NOT NULL DEFAULT 'dark'
                                CHECK (theme IN ('dark', 'light', 'system')),
            accent_color    TEXT        NOT NULL DEFAULT 'amber',
            seo_title       TEXT        NOT NULL DEFAULT '',
            seo_description TEXT        NOT NULL DEFAULT '',
            og_image_url    TEXT        NOT NULL DEFAULT '',
            twitter_handle  TEXT        NOT NULL DEFAULT '',
            robots_txt      JSONB       NOT NULL DEFAULT '[{"userAgent":"*","rules":[{"action":"allow","path":"/"}]}]',
            slug            TEXT        NOT NULL DEFAULT '',
            ai_query_enabled BOOLEAN    NOT NULL DEFAULT false,
            created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_profiles_user UNIQUE (user_id),
            CONSTRAINT uq_profiles_slug UNIQUE (slug)
        );
        CREATE INDEX IF NOT EXISTS idx_profiles_slug ON profiles (slug) WHERE slug <> '';
        DROP TRIGGER IF EXISTS trg_profiles_updated_at ON profiles;
        CREATE TRIGGER trg_profiles_updated_at
            BEFORE UPDATE ON profiles
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

        -- ─── sites ──────────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS sites (
            id                      UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id                 UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            domain                  TEXT        NOT NULL,
            name                    TEXT        DEFAULT NULL,
            verified                BOOLEAN     NOT NULL DEFAULT FALSE,
            verification_token      TEXT        DEFAULT NULL,
            verification_method     TEXT        DEFAULT NULL
                                        CHECK (verification_method IN ('dns_txt', 'meta_tag')),
            verified_at             TIMESTAMPTZ DEFAULT NULL,
            verification_expires_at TIMESTAMPTZ DEFAULT NULL,
            scrape_status           TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (scrape_status IN ('pending', 'scraping', 'completed', 'error')),
            page_count              INTEGER     NOT NULL DEFAULT 0  CHECK (page_count >= 0),
            share_usage_limit       INTEGER     NOT NULL DEFAULT 10 CHECK (share_usage_limit >= 0),
            last_scraped_at         TIMESTAMPTZ DEFAULT NULL,
            refresh_interval_hours  INTEGER     NOT NULL DEFAULT 24 CHECK (refresh_interval_hours >= 1),
            created_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at              TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_sites_user_domain UNIQUE (user_id, domain)
        );
        CREATE INDEX IF NOT EXISTS idx_sites_user   ON sites (user_id);
        CREATE INDEX IF NOT EXISTS idx_sites_domain ON sites (domain);
        DROP TRIGGER IF EXISTS trg_sites_updated_at ON sites;
        CREATE TRIGGER trg_sites_updated_at
            BEFORE UPDATE ON sites
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

        -- ─── site_pages ─────────────────────────────────────────────────────
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
        CREATE INDEX IF NOT EXISTS idx_pages_site     ON site_pages (site_id);
        CREATE INDEX IF NOT EXISTS idx_pages_metadata ON site_pages USING GIN (metadata);

        -- ─── content_blocks ─────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS content_blocks (
            id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            site_id     UUID        NOT NULL REFERENCES sites (id) ON DELETE CASCADE,
            page_id     UUID        NOT NULL REFERENCES site_pages (id) ON DELETE CASCADE,
            heading     TEXT        DEFAULT NULL,
            body        TEXT        DEFAULT NULL,
            images      TEXT[]      NOT NULL DEFAULT '{}',
            tags        TEXT[]      NOT NULL DEFAULT '{}',
            category    TEXT        DEFAULT NULL,
            visibility  TEXT        NOT NULL DEFAULT 'public'
                            CHECK (visibility IN ('public', 'internal', 'draft')),
            block_order INTEGER     NOT NULL DEFAULT 0,
            created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_blocks_site     ON content_blocks (site_id);
        CREATE INDEX IF NOT EXISTS idx_blocks_page     ON content_blocks (page_id);
        CREATE INDEX IF NOT EXISTS idx_blocks_category ON content_blocks (category);
        CREATE INDEX IF NOT EXISTS idx_blocks_order    ON content_blocks (site_id, block_order);
        CREATE INDEX IF NOT EXISTS idx_blocks_fts ON content_blocks
            USING GIN (to_tsvector('english',
                coalesce(heading, '') || ' ' || coalesce(body, '')
            ));
        CREATE INDEX IF NOT EXISTS idx_blocks_trgm_body ON content_blocks
            USING GIN (body gin_trgm_ops);

        -- ─── ai_preferences ─────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS ai_preferences (
            id                     UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id                UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            system_prompt          TEXT        NOT NULL DEFAULT '',
            rules                  JSONB       NOT NULL DEFAULT '[]',
            personality            TEXT        NOT NULL DEFAULT 'professional',
            response_style         TEXT        NOT NULL DEFAULT 'friendly',
            prompt_injection_rules JSONB       NOT NULL DEFAULT '[]',
            safety_protocol        TEXT        NOT NULL DEFAULT '',
            created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_ai_prefs_user UNIQUE (user_id)
        );
        DROP TRIGGER IF EXISTS trg_ai_prefs_updated_at ON ai_preferences;
        CREATE TRIGGER trg_ai_prefs_updated_at
            BEFORE UPDATE ON ai_preferences
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

        -- ─── api_connections ────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS api_connections (
            id                UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            user_id           UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            provider          TEXT        NOT NULL,
            api_key_encrypted TEXT        NOT NULL DEFAULT '',
            model_name        TEXT        DEFAULT '',
            is_active         BOOLEAN     NOT NULL DEFAULT FALSE,
            created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_api_user_provider UNIQUE (user_id, provider)
        );
        CREATE INDEX IF NOT EXISTS idx_api_user ON api_connections (user_id);

        -- ─── connections (card-to-card) ─────────────────────────────────────
        CREATE TABLE IF NOT EXISTS connections (
            id           UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
            requester_id UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            owner_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
            status       TEXT        NOT NULL DEFAULT 'pending'
                            CHECK (status IN ('pending', 'approved', 'declined')),
            message      TEXT        NOT NULL DEFAULT '',
            created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
            approved_at  TIMESTAMPTZ DEFAULT NULL,
            CONSTRAINT uq_connections_pair  UNIQUE (requester_id, owner_id),
            CONSTRAINT ck_connections_no_self CHECK (requester_id <> owner_id)
        );
        CREATE INDEX IF NOT EXISTS idx_connections_owner     ON connections (owner_id);
        CREATE INDEX IF NOT EXISTS idx_connections_requester ON connections (requester_id);
        CREATE INDEX IF NOT EXISTS idx_connections_status    ON connections (owner_id, status);
        DROP TRIGGER IF EXISTS trg_connections_updated_at ON connections;
        CREATE TRIGGER trg_connections_updated_at
            BEFORE UPDATE ON connections
            FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

        -- ─── audit_log ──────────────────────────────────────────────────────
        CREATE TABLE IF NOT EXISTS audit_log (
            id          BIGSERIAL   PRIMARY KEY,
            user_id     UUID        DEFAULT NULL,
            action      TEXT        NOT NULL,
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
        CREATE INDEX IF NOT EXISTS idx_audit_auth ON audit_log (action, created_at DESC)
            WHERE action IN ('login', 'signup', 'logout', 'failed_login', 'password_reset');
    `);
};

// Baseline migration is non-destructive by design — no down migration.
// To reset, drop and recreate the database.
export const down = (): false => false;

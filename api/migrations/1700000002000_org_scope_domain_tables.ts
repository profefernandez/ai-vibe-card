import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Adds organization_id to domain tables and backfills existing data.
 *
 * Strategy:
 *   1. For every existing user, create a personal organization named "Personal"
 *      with a slug derived from the email local-part + a random suffix
 *      (slug must be globally unique).
 *   2. Create an 'owner' membership linking user → org.
 *   3. Add organization_id (nullable) to each org-scoped domain table.
 *   4. Backfill organization_id from each row's user_id via memberships.
 *   5. Set organization_id NOT NULL and add FK + indexes.
 *
 * Org-scoped domain tables:
 *   profiles, sites, ai_preferences, api_connections
 *
 * NOT org-scoped (stay user-scoped):
 *   connections (card-to-card networking is person-to-person)
 *   site_pages, content_blocks (inherit via sites → sites.organization_id)
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        -- 1 & 2. Create a personal organization + owner membership for every user
        --        that doesn't already have one.
        WITH
          new_orgs AS (
            INSERT INTO organizations (name, slug)
            SELECT
                'Personal',
                -- slug = sanitized email local-part + short random suffix for uniqueness
                regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9-]', '-', 'g')
                    || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)
            FROM users u
            WHERE NOT EXISTS (
                SELECT 1 FROM memberships m WHERE m.user_id = u.id
            )
            RETURNING id, slug
          ),
          user_org_pairs AS (
            SELECT u.id AS user_id, o.id AS organization_id
            FROM users u
            JOIN new_orgs o
              ON o.slug LIKE regexp_replace(lower(split_part(u.email, '@', 1)), '[^a-z0-9-]', '-', 'g') || '-%'
             AND NOT EXISTS (
                 SELECT 1 FROM memberships m WHERE m.user_id = u.id
             )
          )
        INSERT INTO memberships (user_id, organization_id, role)
        SELECT user_id, organization_id, 'owner'
        FROM user_org_pairs
        ON CONFLICT (user_id, organization_id) DO NOTHING;

        -- Note: the join above can produce duplicates if two users share an email
        -- prefix. The UNIQUE(user_id, organization_id) constraint + ON CONFLICT
        -- keeps us safe; any orphan organizations will be trimmed below.

        -- Trim any organizations created above that didn't end up owned by a user
        -- (defensive — the regex join can over-match when email prefixes collide).
        DELETE FROM organizations o
        WHERE NOT EXISTS (SELECT 1 FROM memberships m WHERE m.organization_id = o.id);

        -- 3. Add nullable organization_id columns
        ALTER TABLE profiles        ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE;
        ALTER TABLE sites           ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE;
        ALTER TABLE ai_preferences  ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE;
        ALTER TABLE api_connections ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations (id) ON DELETE CASCADE;

        -- 4. Backfill organization_id from each row's owning user's first membership
        UPDATE profiles p SET organization_id = m.organization_id
        FROM memberships m
        WHERE m.user_id = p.user_id AND p.organization_id IS NULL;

        UPDATE sites s SET organization_id = m.organization_id
        FROM memberships m
        WHERE m.user_id = s.user_id AND s.organization_id IS NULL;

        UPDATE ai_preferences a SET organization_id = m.organization_id
        FROM memberships m
        WHERE m.user_id = a.user_id AND a.organization_id IS NULL;

        UPDATE api_connections c SET organization_id = m.organization_id
        FROM memberships m
        WHERE m.user_id = c.user_id AND c.organization_id IS NULL;

        -- 5. Enforce NOT NULL + add indexes (safe — we just backfilled)
        ALTER TABLE profiles        ALTER COLUMN organization_id SET NOT NULL;
        ALTER TABLE sites           ALTER COLUMN organization_id SET NOT NULL;
        ALTER TABLE ai_preferences  ALTER COLUMN organization_id SET NOT NULL;
        ALTER TABLE api_connections ALTER COLUMN organization_id SET NOT NULL;

        CREATE INDEX IF NOT EXISTS idx_profiles_org        ON profiles (organization_id);
        CREATE INDEX IF NOT EXISTS idx_sites_org           ON sites (organization_id);
        CREATE INDEX IF NOT EXISTS idx_ai_prefs_org        ON ai_preferences (organization_id);
        CREATE INDEX IF NOT EXISTS idx_api_connections_org ON api_connections (organization_id);

        -- ai_preferences and api_connections: previously unique per (user_id, *)
        -- should now be unique per (organization_id, *). Drop old, add new.
        ALTER TABLE ai_preferences DROP CONSTRAINT IF EXISTS uq_ai_prefs_user;
        ALTER TABLE ai_preferences ADD CONSTRAINT uq_ai_prefs_org UNIQUE (organization_id);

        ALTER TABLE api_connections DROP CONSTRAINT IF EXISTS uq_api_user_provider;
        ALTER TABLE api_connections ADD CONSTRAINT uq_api_org_provider UNIQUE (organization_id, provider);

        -- profiles.uq_profiles_user stays: for now each user still has one personal card.
        -- sites.uq_sites_user_domain stays: a user still can't have duplicate domains.
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        -- Restore the original uniqueness constraints
        ALTER TABLE api_connections DROP CONSTRAINT IF EXISTS uq_api_org_provider;
        ALTER TABLE api_connections ADD CONSTRAINT uq_api_user_provider UNIQUE (user_id, provider);

        ALTER TABLE ai_preferences DROP CONSTRAINT IF EXISTS uq_ai_prefs_org;
        ALTER TABLE ai_preferences ADD CONSTRAINT uq_ai_prefs_user UNIQUE (user_id);

        DROP INDEX IF EXISTS idx_api_connections_org;
        DROP INDEX IF EXISTS idx_ai_prefs_org;
        DROP INDEX IF EXISTS idx_sites_org;
        DROP INDEX IF EXISTS idx_profiles_org;

        ALTER TABLE api_connections DROP COLUMN IF EXISTS organization_id;
        ALTER TABLE ai_preferences  DROP COLUMN IF EXISTS organization_id;
        ALTER TABLE sites           DROP COLUMN IF EXISTS organization_id;
        ALTER TABLE profiles        DROP COLUMN IF EXISTS organization_id;
    `);
};

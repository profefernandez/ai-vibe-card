import type { MigrationBuilder } from "node-pg-migrate";

/**
 * Phase 6c — create RLS policies but leave RLS DISABLED on every table.
 *
 * This migration is intentionally a no-op at runtime: policies exist, no
 * table has `ENABLE ROW LEVEL SECURITY`, so queries return rows the same
 * way they always have. Phase 6d-f will flip the switch per-table on a
 * staging soak schedule.
 *
 * Why split now: creating policies in their own migration lets us review
 * the policy definitions without the pressure of "and now production
 * users hit them in 5 seconds". A subsequent ALTER TABLE … ENABLE migration
 * is a one-line change at that point.
 *
 * Policy model:
 *   - Org-scoped tables (profiles, sites, ai_preferences, api_connections,
 *     site_pages via site, content_blocks via site):
 *     visibility = `organization_id = current_setting('app.org_id')::uuid`.
 *   - User-scoped tables (sessions, audit_log read):
 *     visibility = `user_id = current_setting('app.user_id')::uuid`.
 *   - Cross-org by design (connections):
 *     visibility = caller is requester OR owner.
 *   - Identity tables (users, memberships, organizations):
 *     visibility = caller belongs to the org / IS the user.
 *   - Anonymous-insert tables (audit_log, ai_feedback, sessions):
 *     INSERT WITH CHECK true so the application can write regardless.
 *
 * `aivibe_service` (the BYPASSRLS role created in 1700000006000) sees
 * every row regardless. Routes that need cross-org reads (visitor chat,
 * public card lookup, cron) connect via DATABASE_URL_SERVICE.
 *
 * The policies are written as `current_setting('...', true)::uuid`. The
 * `true` second argument tells Postgres to return NULL when the GUC is
 * unset rather than raising — which means a query made WITHOUT the
 * SET LOCAL plumbing returns 0 rows (a safe failure) instead of 500ing.
 */
export const up = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        -- ─── Helper: org membership lookup ─────────────────────────────────
        -- Used by policies that need to know "is the caller a member of the
        -- org that owns this row?". STABLE so the planner can cache it
        -- per-statement.
        CREATE OR REPLACE FUNCTION app_current_user_id() RETURNS UUID
            LANGUAGE SQL STABLE AS
        $$ SELECT NULLIF(current_setting('app.user_id', true), '')::UUID $$;

        CREATE OR REPLACE FUNCTION app_current_org_id() RETURNS UUID
            LANGUAGE SQL STABLE AS
        $$ SELECT NULLIF(current_setting('app.org_id', true), '')::UUID $$;

        -- ─── profiles ─────────────────────────────────────────────────────
        DROP POLICY IF EXISTS p_profiles_org ON profiles;
        CREATE POLICY p_profiles_org ON profiles
            FOR ALL
            USING (organization_id = app_current_org_id())
            WITH CHECK (organization_id = app_current_org_id());

        -- ─── sites ────────────────────────────────────────────────────────
        DROP POLICY IF EXISTS p_sites_org ON sites;
        CREATE POLICY p_sites_org ON sites
            FOR ALL
            USING (organization_id = app_current_org_id())
            WITH CHECK (organization_id = app_current_org_id());

        -- ─── ai_preferences ───────────────────────────────────────────────
        DROP POLICY IF EXISTS p_ai_preferences_org ON ai_preferences;
        CREATE POLICY p_ai_preferences_org ON ai_preferences
            FOR ALL
            USING (organization_id = app_current_org_id())
            WITH CHECK (organization_id = app_current_org_id());

        -- ─── api_connections ──────────────────────────────────────────────
        DROP POLICY IF EXISTS p_api_connections_org ON api_connections;
        CREATE POLICY p_api_connections_org ON api_connections
            FOR ALL
            USING (organization_id = app_current_org_id())
            WITH CHECK (organization_id = app_current_org_id());

        -- ─── site_pages (inherits via site) ────────────────────────────────
        DROP POLICY IF EXISTS p_site_pages_via_site ON site_pages;
        CREATE POLICY p_site_pages_via_site ON site_pages
            FOR ALL
            USING (site_id IN (SELECT id FROM sites))
            WITH CHECK (site_id IN (SELECT id FROM sites));

        -- ─── content_blocks (inherits via site) ───────────────────────────
        DROP POLICY IF EXISTS p_content_blocks_via_site ON content_blocks;
        CREATE POLICY p_content_blocks_via_site ON content_blocks
            FOR ALL
            USING (site_id IN (SELECT id FROM sites))
            WITH CHECK (site_id IN (SELECT id FROM sites));

        -- ─── connections (cross-org by design) ────────────────────────────
        -- The connections feature is person-to-person across org boundaries.
        -- Visibility rule: caller is one of the two parties.
        DROP POLICY IF EXISTS p_connections_party ON connections;
        CREATE POLICY p_connections_party ON connections
            FOR ALL
            USING (
                requester_id = app_current_user_id()
                OR owner_id = app_current_user_id()
            )
            WITH CHECK (
                requester_id = app_current_user_id()
                OR owner_id = app_current_user_id()
            );

        -- ─── sessions ─────────────────────────────────────────────────────
        -- READ: only the owning user. INSERT: allowed (login path needs to
        -- write a session before app.user_id is set; serviceDb handles this
        -- in practice but the policy permits it as defence-in-depth).
        DROP POLICY IF EXISTS p_sessions_self ON sessions;
        CREATE POLICY p_sessions_self ON sessions
            FOR ALL
            USING (user_id = app_current_user_id())
            WITH CHECK (TRUE);

        -- ─── users ────────────────────────────────────────────────────────
        -- A user can read their own row. Writes flow through the auth path
        -- (serviceDb) so WITH CHECK is permissive.
        DROP POLICY IF EXISTS p_users_self ON users;
        CREATE POLICY p_users_self ON users
            FOR ALL
            USING (id = app_current_user_id())
            WITH CHECK (TRUE);

        -- ─── memberships ──────────────────────────────────────────────────
        -- A user can see their own membership rows. Admin-side org member
        -- listing flows through serviceDb when needed.
        DROP POLICY IF EXISTS p_memberships_self ON memberships;
        CREATE POLICY p_memberships_self ON memberships
            FOR ALL
            USING (user_id = app_current_user_id())
            WITH CHECK (TRUE);

        -- ─── organizations ────────────────────────────────────────────────
        -- A user can see orgs they belong to.
        DROP POLICY IF EXISTS p_organizations_member ON organizations;
        CREATE POLICY p_organizations_member ON organizations
            FOR ALL
            USING (
                id IN (
                    SELECT organization_id FROM memberships
                    WHERE user_id = app_current_user_id()
                )
            )
            WITH CHECK (TRUE);

        -- ─── audit_log ────────────────────────────────────────────────────
        -- Append-only from any code path; readable by the user whose action
        -- it records. NULL user_id (system actions) are not visible to
        -- aivibe_user — only via serviceDb.
        DROP POLICY IF EXISTS p_audit_log_self ON audit_log;
        CREATE POLICY p_audit_log_self ON audit_log
            FOR ALL
            USING (user_id = app_current_user_id())
            WITH CHECK (TRUE);

        -- ─── ai_feedback ──────────────────────────────────────────────────
        -- Anonymous inserts allowed. Reads scoped to the org owning the
        -- profile that received the feedback.
        DROP POLICY IF EXISTS p_ai_feedback_read ON ai_feedback;
        CREATE POLICY p_ai_feedback_read ON ai_feedback
            FOR ALL
            USING (
                profile_id IN (
                    SELECT user_id FROM profiles
                    WHERE organization_id = app_current_org_id()
                )
            )
            WITH CHECK (TRUE);

        -- ─── feedback_consumed ────────────────────────────────────────────
        -- Service-only table — the unique-key replay guard. No user-facing
        -- access; aivibe_user gets nothing.
        DROP POLICY IF EXISTS p_feedback_consumed_none ON feedback_consumed;
        CREATE POLICY p_feedback_consumed_none ON feedback_consumed
            FOR ALL
            USING (FALSE)
            WITH CHECK (FALSE);

        -- ─── DELIBERATELY DO NOT ENABLE RLS HERE ──────────────────────────
        -- Phase 6d-f will run ALTER TABLE … ENABLE ROW LEVEL SECURITY per
        -- table batch with staging soak between batches. Until then, these
        -- policies sit dormant.
    `);
};

export const down = (pgm: MigrationBuilder): void => {
    pgm.sql(`
        DROP POLICY IF EXISTS p_feedback_consumed_none ON feedback_consumed;
        DROP POLICY IF EXISTS p_ai_feedback_read ON ai_feedback;
        DROP POLICY IF EXISTS p_audit_log_self ON audit_log;
        DROP POLICY IF EXISTS p_organizations_member ON organizations;
        DROP POLICY IF EXISTS p_memberships_self ON memberships;
        DROP POLICY IF EXISTS p_users_self ON users;
        DROP POLICY IF EXISTS p_sessions_self ON sessions;
        DROP POLICY IF EXISTS p_connections_party ON connections;
        DROP POLICY IF EXISTS p_content_blocks_via_site ON content_blocks;
        DROP POLICY IF EXISTS p_site_pages_via_site ON site_pages;
        DROP POLICY IF EXISTS p_api_connections_org ON api_connections;
        DROP POLICY IF EXISTS p_ai_preferences_org ON ai_preferences;
        DROP POLICY IF EXISTS p_sites_org ON sites;
        DROP POLICY IF EXISTS p_profiles_org ON profiles;

        DROP FUNCTION IF EXISTS app_current_org_id();
        DROP FUNCTION IF EXISTS app_current_user_id();
    `);
};

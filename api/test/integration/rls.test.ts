/**
 * RLS isolation integration test — load-bearing security test.
 *
 * Ports the proof-of-concept from `scripts/test-rls-isolation.ts` into Vitest
 * against `aivibe_test_db`. Validates that, with policies from migration
 * 1700000007000_rls_policies.ts in place AND RLS force-enabled per table:
 *
 *   1. A query under user A's `app.user_id` / `app.org_id` GUCs sees ONLY
 *      org A's rows (and the symmetric statement holds for B).
 *   2. A query with NO `SET LOCAL` returns 0 rows (safe failure — the
 *      policies use `current_setting('...', true)::uuid`, which yields NULL
 *      when unset, which never matches `organization_id`).
 *   3. A profile owned by org A is invisible to org B's session context.
 *
 * Critical: `aivibe_user` is a superuser+BYPASSRLS role on the test cluster,
 * so connecting through `db` (which uses DATABASE_URL) would silently bypass
 * every policy — the test would pass for the wrong reason. We create a
 * dedicated `rls_test_user` role (NOSUPERUSER NOBYPASSRLS NOINHERIT) and run
 * all assertion queries against a Pool that connects as that role. Setup
 * (CREATE ROLE, INSERTs, ALTER TABLE … FORCE) is done as the admin
 * connection because it requires DDL.
 */

import { afterAll, beforeAll, describe, expect, test } from "vitest";
import { Pool, type PoolClient } from "pg";
import { truncateAll } from "../helpers/db-fixtures.js";

const ADMIN_URL =
    process.env.DATABASE_URL ??
    "postgresql://aivibe_user:password@127.0.0.1:5432/aivibe_test_db";

const RLS_TEST_PASSWORD = "rls_test_pw";

// Tables that have RLS policies in migration 1700000007000. We force RLS on
// each so policies apply even to the table owner. The test pool connects as
// rls_test_user (NOBYPASSRLS), so it would obey policies anyway — FORCE is
// belt-and-braces.
const RLS_TABLES = [
    "ai_preferences",
    "api_connections",
    "profiles",
    "sites",
    "site_pages",
    "content_blocks",
    "connections",
    "users",
    "memberships",
    "organizations",
    "sessions",
    "audit_log",
    "ai_feedback",
    "feedback_consumed",
] as const;

let adminPool: Pool;
let testPool: Pool;
let orgA: string;
let orgB: string;
let userA: string;
let userB: string;

async function withCtx<T>(
    userId: string,
    orgId: string,
    fn: (c: PoolClient) => Promise<T>,
): Promise<T> {
    const c = await testPool.connect();
    try {
        await c.query("BEGIN");
        await c.query(
            "SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)",
            [userId, orgId],
        );
        const r = await fn(c);
        await c.query("COMMIT");
        return r;
    } catch (e) {
        await c.query("ROLLBACK").catch(() => undefined);
        throw e;
    } finally {
        c.release();
    }
}

beforeAll(async () => {
    adminPool = new Pool({ connectionString: ADMIN_URL, max: 2 });

    // Verify the migrations created aivibe_service (it's cluster-wide, so it
    // should already exist from a prior run on this Postgres instance).
    const svcCheck = await adminPool.query(
        "SELECT 1 FROM pg_roles WHERE rolname = 'aivibe_service'",
    );
    if (svcCheck.rowCount === 0) {
        throw new Error(
            "aivibe_service role is missing — migration 1700000006000 should have created it",
        );
    }

    // Create rls_test_user as a non-privileged role. Cluster-wide DDL —
    // we tolerate "already exists" because Postgres roles are not per-DB.
    await adminPool.query(`
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_user') THEN
                CREATE ROLE rls_test_user LOGIN PASSWORD '${RLS_TEST_PASSWORD}'
                    NOSUPERUSER NOBYPASSRLS NOINHERIT;
            ELSE
                ALTER ROLE rls_test_user WITH LOGIN PASSWORD '${RLS_TEST_PASSWORD}'
                    NOSUPERUSER NOBYPASSRLS NOINHERIT;
            END IF;
        END
        $$;
    `);

    // Grant DML on all tables in the test DB so policy checks (not privilege
    // checks) are what gate the queries.
    await adminPool.query(`
        GRANT USAGE ON SCHEMA public TO rls_test_user;
        GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test_user;
        GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rls_test_user;
    `);

    // Wipe + seed two orgs.
    const c = await adminPool.connect();
    try {
        await truncateAll(c);

        orgA = (
            await c.query(
                `INSERT INTO organizations (name, slug) VALUES ('Org A', 'org-a-${Date.now()}') RETURNING id`,
            )
        ).rows[0].id;
        orgB = (
            await c.query(
                `INSERT INTO organizations (name, slug) VALUES ('Org B', 'org-b-${Date.now()}') RETURNING id`,
            )
        ).rows[0].id;

        userA = (
            await c.query(
                `INSERT INTO users (email, password_hash) VALUES ('a@rls.test', 'x') RETURNING id`,
            )
        ).rows[0].id;
        userB = (
            await c.query(
                `INSERT INTO users (email, password_hash) VALUES ('b@rls.test', 'x') RETURNING id`,
            )
        ).rows[0].id;

        await c.query(
            `INSERT INTO memberships (user_id, organization_id, role)
             VALUES ($1, $2, 'owner'), ($3, $4, 'owner')`,
            [userA, orgA, userB, orgB],
        );
        await c.query(
            `INSERT INTO profiles (user_id, organization_id, slug)
             VALUES ($1, $2, 'a-card'), ($3, $4, 'b-card')`,
            [userA, orgA, userB, orgB],
        );
        await c.query(
            `INSERT INTO ai_preferences (user_id, organization_id, system_prompt)
             VALUES ($1, $2, 'A prompt'), ($3, $4, 'B prompt')`,
            [userA, orgA, userB, orgB],
        );

        // Enable + FORCE RLS on every policied table. The migration leaves
        // RLS disabled (Phase 6c-f staged enable). For a security test, we
        // explicitly turn it on so the policies actually filter.
        for (const t of RLS_TABLES) {
            await c.query(`ALTER TABLE ${t} ENABLE ROW LEVEL SECURITY`);
            await c.query(`ALTER TABLE ${t} FORCE ROW LEVEL SECURITY`);
        }
    } finally {
        c.release();
    }

    // Build the test pool now that the role exists and grants are in place.
    const url = new URL(ADMIN_URL);
    url.username = "rls_test_user";
    url.password = RLS_TEST_PASSWORD;
    testPool = new Pool({ connectionString: url.toString(), max: 4 });
}, 30_000);

afterAll(async () => {
    // Disable + un-force RLS so the next test file (or a re-run) starts from
    // the migration's "policies dormant" baseline. The DB itself is dropped
    // by global-setup teardown.
    if (adminPool) {
        const c = await adminPool.connect();
        try {
            for (const t of RLS_TABLES) {
                await c.query(`ALTER TABLE ${t} NO FORCE ROW LEVEL SECURITY`).catch(() => undefined);
                await c.query(`ALTER TABLE ${t} DISABLE ROW LEVEL SECURITY`).catch(() => undefined);
            }
            await truncateAll(c);
        } finally {
            c.release();
        }
    }
    await Promise.all([
        testPool?.end().catch(() => undefined),
        adminPool?.end().catch(() => undefined),
    ]);
});

describe("RLS: ai_preferences cross-org isolation", () => {
    test("user A context sees exactly 1 row, belonging to org A", async () => {
        const rows = await withCtx(userA, orgA, async (c) => {
            const r = await c.query<{ id: string; organization_id: string }>(
                "SELECT id, organization_id FROM ai_preferences",
            );
            return r.rows;
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].organization_id).toBe(orgA);
    });

    test("user B context sees exactly 1 row, belonging to org B", async () => {
        const rows = await withCtx(userB, orgB, async (c) => {
            const r = await c.query<{ id: string; organization_id: string }>(
                "SELECT id, organization_id FROM ai_preferences",
            );
            return r.rows;
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].organization_id).toBe(orgB);
    });
});

describe("RLS: no-context query returns 0 rows", () => {
    test("ai_preferences: query with no SET LOCAL is filtered to empty", async () => {
        const c = await testPool.connect();
        try {
            const r = await c.query("SELECT id FROM ai_preferences");
            expect(r.rows).toHaveLength(0);
        } finally {
            c.release();
        }
    });

    test("profiles: query with no SET LOCAL is filtered to empty", async () => {
        const c = await testPool.connect();
        try {
            const r = await c.query("SELECT id FROM profiles");
            expect(r.rows).toHaveLength(0);
        } finally {
            c.release();
        }
    });
});

describe("RLS: profile slug isolation", () => {
    test("user A context sees only their own profile (slug=a-card)", async () => {
        const slugs = await withCtx(userA, orgA, async (c) => {
            const r = await c.query<{ slug: string }>("SELECT slug FROM profiles");
            return r.rows.map((x) => x.slug);
        });
        expect(slugs).toEqual(["a-card"]);
    });

    test("user B context cannot read user A's profile by slug", async () => {
        const rows = await withCtx(userB, orgB, async (c) => {
            const r = await c.query("SELECT id FROM profiles WHERE slug = 'a-card'");
            return r.rows;
        });
        expect(rows).toHaveLength(0);
    });
});

describe("RLS: memberships self-only", () => {
    test("user A sees only their own membership row", async () => {
        const rows = await withCtx(userA, orgA, async (c) => {
            const r = await c.query<{ user_id: string }>(
                "SELECT user_id FROM memberships",
            );
            return r.rows;
        });
        expect(rows).toHaveLength(1);
        expect(rows[0].user_id).toBe(userA);
    });
});

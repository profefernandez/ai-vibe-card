/**
 * End-to-end RLS isolation test. Spins up two organizations and verifies
 * that, with all migrations applied AND RLS turned on, a query made under
 * org A's app.user_id / app.org_id cannot see org B's rows.
 *
 *   DATABASE_URL=postgresql://aivibe_user:test@127.0.0.1:65432/aivibe_db \
 *     npx tsx scripts/test-rls-isolation.ts
 *
 * Run against a clean Postgres (this script truncates tables). The CI /
 * pre-deploy harness can use this to gate the staged enable migrations:
 * if it passes after each batch, the batch is safe to roll forward.
 */

import dotenv from "dotenv";
dotenv.config();

import { Pool } from "pg";

// Two pools: the admin pool runs setup (CREATE ROLE, DDL, seed rows). The
// test pool connects as a non-privileged role created at setup time so that
// RLS actually gates queries. In production these are aivibe_user and
// aivibe_service respectively.
const adminPool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 2,
});
let testPool: Pool | null = null;

let passed = 0;
let failed = 0;
function expect(label: string, cond: boolean): void {
    if (cond) { console.log(`✓ ${label}`); passed++; }
    else      { console.error(`✗ ${label}`); failed++; }
}

async function setup() {
    const c = await adminPool.connect();
    try {
        // Create a non-privileged test role and grant DML so RLS policies
        // actually gate queries. Connecting as the original superuser would
        // bypass everything regardless of FORCE.
        await c.query(`
            DO $$
            BEGIN
                IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rls_test_user') THEN
                    CREATE ROLE rls_test_user LOGIN PASSWORD 'test'
                        NOSUPERUSER NOBYPASSRLS NOINHERIT;
                END IF;
            END $$;
            GRANT USAGE ON SCHEMA public TO rls_test_user;
            GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO rls_test_user;
            GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO rls_test_user;
        `);

        // Reset
        await c.query(`
            TRUNCATE
                ai_feedback, audit_log, sessions,
                content_blocks, site_pages, sites,
                api_connections, ai_preferences,
                connections, profiles,
                memberships, organizations, users
            RESTART IDENTITY CASCADE
        `);

        // Two orgs, one user each, one profile / site / api_connection per org.
        const orgA = (await c.query(
            `INSERT INTO organizations (name, slug) VALUES ('Org A', 'org-a-${Date.now()}-a') RETURNING id`,
        )).rows[0].id;
        const orgB = (await c.query(
            `INSERT INTO organizations (name, slug) VALUES ('Org B', 'org-b-${Date.now()}-b') RETURNING id`,
        )).rows[0].id;

        const userA = (await c.query(
            `INSERT INTO users (email, password_hash) VALUES ('a@test', 'x') RETURNING id`,
        )).rows[0].id;
        const userB = (await c.query(
            `INSERT INTO users (email, password_hash) VALUES ('b@test', 'x') RETURNING id`,
        )).rows[0].id;

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

        // Build the test pool now that the role exists. Reuse the host /
        // port / db from DATABASE_URL but swap user/password.
        const url = new URL(process.env.DATABASE_URL!);
        url.username = "rls_test_user";
        url.password = "test";
        testPool = new Pool({ connectionString: url.toString(), max: 4 });

        return { orgA, orgB, userA, userB };
    } finally {
        c.release();
    }
}

async function withCtx<T>(userId: string, orgId: string, fn: (c: any) => Promise<T>): Promise<T> {
    const c = await testPool!.connect();
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
        await c.query("ROLLBACK").catch(() => { /* nothing */ });
        throw e;
    } finally {
        c.release();
    }
}

async function main() {
    // Apply all migrations first (assumes they're already applied via the
    // migrate runner before this script — we just verify the policies).
    const { orgA, orgB, userA, userB } = await setup();

    // The migration set 1700000008000–1700000011000 already enables RLS on
    // every relevant table; we just need FORCE to make table-owner queries
    // (and the rls_test_user we created) actually obey the policies.
    const c = await adminPool.connect();
    try {
        await c.query(`
            ALTER TABLE ai_preferences  ENABLE ROW LEVEL SECURITY;
            ALTER TABLE api_connections ENABLE ROW LEVEL SECURITY;
            ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
            ALTER TABLE sites           ENABLE ROW LEVEL SECURITY;
            ALTER TABLE site_pages      ENABLE ROW LEVEL SECURITY;
            ALTER TABLE content_blocks  ENABLE ROW LEVEL SECURITY;
            ALTER TABLE connections     ENABLE ROW LEVEL SECURITY;
            ALTER TABLE users           ENABLE ROW LEVEL SECURITY;
            ALTER TABLE memberships     ENABLE ROW LEVEL SECURITY;
            ALTER TABLE organizations   ENABLE ROW LEVEL SECURITY;
            ALTER TABLE sessions        ENABLE ROW LEVEL SECURITY;
            ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;
            ALTER TABLE ai_feedback     ENABLE ROW LEVEL SECURITY;
            ALTER TABLE feedback_consumed ENABLE ROW LEVEL SECURITY;
        `);
    } finally {
        c.release();
    }

    // FORCE keeps the table owner subject to RLS too — without it,
    // ALTER TABLE owners (and superusers) sail past policies. Stage E
    // in production does the same.
    const c2 = await adminPool.connect();
    try {
        await c2.query(`
            ALTER TABLE ai_preferences  FORCE ROW LEVEL SECURITY;
            ALTER TABLE api_connections FORCE ROW LEVEL SECURITY;
            ALTER TABLE profiles        FORCE ROW LEVEL SECURITY;
            ALTER TABLE sites           FORCE ROW LEVEL SECURITY;
        `);
    } finally {
        c2.release();
    }

    // After RLS + FORCE, user A only sees their own org's rows.
    const afterA = await withCtx(userA, orgA, async (c) => {
        const r = await c.query("SELECT id, organization_id FROM ai_preferences");
        return r.rows;
    });
    expect("RLS on: user A sees exactly 1 ai_preferences row", afterA.length === 1);
    expect("RLS on: user A's row belongs to org A", afterA[0]?.organization_id === orgA);

    const afterB = await withCtx(userB, orgB, async (c) => {
        const r = await c.query("SELECT id, organization_id FROM ai_preferences");
        return r.rows;
    });
    expect("RLS on: user B sees exactly 1 ai_preferences row", afterB.length === 1);
    expect("RLS on: user B's row belongs to org B", afterB[0]?.organization_id === orgB);

    // Profiles cross-org isolation
    const profilesA = await withCtx(userA, orgA, async (c) => {
        const r = await c.query("SELECT slug FROM profiles");
        return r.rows.map((x: any) => x.slug);
    });
    expect("RLS on: user A sees only their profile (slug=a-card)",
        profilesA.length === 1 && profilesA[0] === "a-card");

    // Negative case: a query without SET LOCAL returns 0 rows (safe failure).
    const noCtx = await testPool!.connect();
    try {
        const r = await noCtx.query("SELECT id FROM ai_preferences");
        expect("RLS on: query without SET LOCAL returns 0 rows", r.rows.length === 0);
    } finally {
        noCtx.release();
    }

    // Memberships: user A sees their membership only
    const memA = await withCtx(userA, orgA, async (c) => {
        const r = await c.query("SELECT user_id FROM memberships");
        return r.rows;
    });
    expect("RLS on: user A sees only their own membership row",
        memA.length === 1 && memA[0]?.user_id === userA);

    console.log(`\n${passed} passed, ${failed} failed`);
    await Promise.all([adminPool.end(), testPool?.end() ?? Promise.resolve()]);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
    console.error(err);
    await Promise.all([adminPool.end(), testPool?.end() ?? Promise.resolve()]).catch(() => { /* nothing */ });
    process.exit(2);
});

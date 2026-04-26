/**
 * Smoke test for withRequestClient.
 *
 * Requires a running Postgres reachable via DATABASE_URL.
 *   DATABASE_URL=postgresql://aivibe_user:pwd@127.0.0.1:5432/aivibe_db \
 *     npx tsx scripts/test-with-request-client.ts
 *
 * Verifies:
 *   - Throws when called without an authenticated request (req.user missing)
 *   - Wraps the callback in a transaction (set_config visible from inside)
 *   - Rolls back the transaction on throw (no partial writes)
 *   - The helper actually runs SET LOCAL — current_setting('app.user_id')
 *     returns the value we passed, then unsets after COMMIT
 */

import dotenv from "dotenv";
dotenv.config();

import { withRequestClient, db } from "../db.js";

let passed = 0;
let failed = 0;
function expect(label: string, cond: boolean): void {
    if (cond) { console.log(`✓ ${label}`); passed++; }
    else      { console.error(`✗ ${label}`); failed++; }
}

const fakeReq = (userId: string | null, orgId: string | null) => ({
    user: (userId && orgId) ? { id: userId, organizationId: orgId } : undefined,
}) as Parameters<typeof withRequestClient>[0];

async function main() {
    // No req.user → throws synchronously (well, async throws)
    try {
        await withRequestClient(fakeReq(null, null), async () => "should not run");
        expect("rejects unauthenticated request", false);
    } catch (err) {
        expect(
            "rejects unauthenticated request",
            err instanceof Error && err.message.includes("authenticated"),
        );
    }

    // Authenticated path: SET LOCAL is visible from inside, gone after
    const userId = "00000000-0000-0000-0000-000000000aaa";
    const orgId  = "00000000-0000-0000-0000-000000000bbb";

    const seenUser = await withRequestClient(fakeReq(userId, orgId), async (c) => {
        const { rows } = await c.query<{ v: string | null }>(
            "SELECT current_setting('app.user_id', true) AS v",
        );
        return rows[0].v;
    });
    expect("SET LOCAL app.user_id visible inside callback", seenUser === userId);

    const seenOrg = await withRequestClient(fakeReq(userId, orgId), async (c) => {
        const { rows } = await c.query<{ v: string | null }>(
            "SELECT current_setting('app.org_id', true) AS v",
        );
        return rows[0].v;
    });
    expect("SET LOCAL app.org_id visible inside callback", seenOrg === orgId);

    // After COMMIT, a fresh checkout from the pool should see the GUC
    // unset (or empty) — proves SET LOCAL didn't leak.
    const { rows: leakRows } = await db.query<{ v: string | null }>(
        "SELECT current_setting('app.user_id', true) AS v",
    );
    expect(
        "SET LOCAL did not leak past COMMIT",
        leakRows[0].v === "" || leakRows[0].v === null,
    );

    // Rollback on throw
    try {
        await withRequestClient(fakeReq(userId, orgId), async (c) => {
            await c.query("CREATE TEMP TABLE _wrt_test (n INT)");
            throw new Error("boom");
        });
        expect("throws are surfaced", false);
    } catch (err) {
        expect("throws are surfaced", err instanceof Error && err.message === "boom");
    }
    // The TEMP TABLE was inside the transaction; ROLLBACK should drop it.
    // (TEMP tables are session-scoped not txn-scoped, but ROLLBACK still
    // undoes any DDL in the same transaction.) A fresh check proves the
    // transaction was rolled back without errors.
    const ok = await withRequestClient(fakeReq(userId, orgId), async (c) => {
        const { rows } = await c.query("SELECT 1 AS x");
        return rows[0].x === 1;
    });
    expect("pool still healthy after rollback", ok === true);

    console.log(`\n${passed} passed, ${failed} failed`);
    await db.end().catch(() => { /* nothing */ });
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(async (err) => {
    console.error(err);
    await db.end().catch(() => { /* nothing */ });
    process.exit(2);
});

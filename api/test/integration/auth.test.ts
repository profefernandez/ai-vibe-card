/**
 * Auth integration test — proves the test plumbing works end-to-end.
 *
 * Exercises the real Express app (built via `buildApp()`) against the real
 * `aivibe_test_db` Postgres database that globalSetup provisioned. No
 * mocks: register goes through bcrypt + organization+membership inserts,
 * login signs a real JWT, and the protected endpoint runs through
 * `requireAuth` → session-table lookup → `withRequestClient` transaction.
 */

import { afterAll, beforeAll, beforeEach, describe, expect, test } from "vitest";
import request from "supertest";
import type { Express } from "express";
import { buildApp } from "../helpers/build-app.js";
import { truncateAll } from "../helpers/db-fixtures.js";
import { db, serviceDb } from "../../db.js";

const TEST_EMAIL = "alice@example.test";
const TEST_PASSWORD = "correct horse battery staple";

let app: Express;

beforeAll(() => {
    app = buildApp();
});

afterAll(async () => {
    // Close the pools so the worker process exits cleanly. globalSetup's
    // teardown runs after this and reconnects via a fresh admin client to
    // drop the database, so closing pools here doesn't break anything.
    await Promise.all([db.end(), serviceDb.end()]);
});

beforeEach(async () => {
    const client = await serviceDb.connect();
    try {
        await truncateAll(client);
    } finally {
        client.release();
    }
});

describe("POST /api/auth/register", () => {
    test("creates a user and returns a token", async () => {
        const res = await request(app)
            .post("/api/auth/register")
            .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            user: { email: TEST_EMAIL },
            token: expect.any(String),
        });
        expect(res.body.user.id).toEqual(expect.any(String));
    });
});

describe("POST /api/auth/login", () => {
    test("returns a token for valid credentials", async () => {
        await request(app)
            .post("/api/auth/register")
            .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
            .expect(200);

        // Wait >1s so the login JWT's `iat` claim differs from register's,
        // producing a distinct token_hash. Without this the sessions
        // unique-constraint trips when the two requests fall in the same
        // wall-clock second. Real bug worth fixing later (e.g. add a jti
        // claim) — out of scope for PR-E1's plumbing test.
        await new Promise((r) => setTimeout(r, 1100));

        const res = await request(app)
            .post("/api/auth/login")
            .send({ email: TEST_EMAIL, password: TEST_PASSWORD });

        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({
            user: { email: TEST_EMAIL },
            token: expect.any(String),
        });
    });
});

describe("protected endpoint /api/kb/folders", () => {
    test("rejects unauthenticated requests with 401", async () => {
        const res = await request(app).get("/api/kb/folders");
        expect(res.status).toBe(401);
    });

    test("accepts a valid Bearer token", async () => {
        const reg = await request(app)
            .post("/api/auth/register")
            .send({ email: TEST_EMAIL, password: TEST_PASSWORD })
            .expect(200);
        const token = reg.body.token as string;

        const res = await request(app)
            .get("/api/kb/folders")
            .set("Authorization", `Bearer ${token}`);

        expect(res.status).toBe(200);
        expect(Array.isArray(res.body)).toBe(true);
    });

    test("rejects a garbage Bearer token with 401", async () => {
        const res = await request(app)
            .get("/api/kb/folders")
            .set("Authorization", "Bearer garbage");
        expect(res.status).toBe(401);
    });
});

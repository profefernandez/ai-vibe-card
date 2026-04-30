/**
 * Vitest globalSetup — runs ONCE before any test file in the run, in a
 * separate process from the test workers. Returns a teardown closure that
 * Vitest invokes after the run finishes.
 *
 * Responsibilities:
 *   1. Drop + create `aivibe_test_db` (owned by aivibe_user) on the local
 *      Postgres so tests start from an empty schema.
 *   2. Run `npx node-pg-migrate ... up` against that fresh DB.
 *   3. On teardown, drop the DB unless KEEP_TEST_DB=1 (handy when an
 *      integration failure needs post-mortem inspection).
 *
 * Connection details mirror docker-compose: aivibe_user/password on
 * 127.0.0.1:5432. Override TEST_ADMIN_DATABASE_URL if running against a
 * different cluster.
 */

import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "pg";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// helpers → test → api
const API_DIR = path.resolve(__dirname, "../..");

const TEST_DB_NAME = "aivibe_test_db";
const ADMIN_URL =
    process.env.TEST_ADMIN_DATABASE_URL ??
    "postgresql://aivibe_user:password@127.0.0.1:5432/postgres";
const TEST_DB_URL =
    process.env.TEST_DATABASE_URL ??
    `postgresql://aivibe_user:password@127.0.0.1:5432/${TEST_DB_NAME}`;

async function withAdmin<T>(fn: (c: Client) => Promise<T>): Promise<T> {
    const client = new Client({ connectionString: ADMIN_URL });
    await client.connect();
    try {
        return await fn(client);
    } finally {
        await client.end().catch(() => undefined);
    }
}

async function dropDb(): Promise<void> {
    await withAdmin(async (c) => {
        // Force-disconnect any stragglers before DROP — otherwise a leaked
        // pool from a previous run would block the drop.
        await c.query(
            `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
              WHERE datname = $1 AND pid <> pg_backend_pid()`,
            [TEST_DB_NAME],
        );
        await c.query(`DROP DATABASE IF EXISTS ${TEST_DB_NAME}`);
    });
}

async function createDb(): Promise<void> {
    await withAdmin(async (c) => {
        await c.query(`CREATE DATABASE ${TEST_DB_NAME} OWNER aivibe_user`);
    });
}

function runMigrations(): Promise<void> {
    return new Promise((resolve, reject) => {
        const child = spawn(
            "npx",
            ["--no-install", "node-pg-migrate", "-m", "migrations", "-j", "ts", "up"],
            {
                cwd: API_DIR,
                env: {
                    ...process.env,
                    DATABASE_URL: TEST_DB_URL,
                    // node-pg-migrate's ts loader expects this when running
                    // outside a build step.
                    NODE_ENV: "test",
                },
                stdio: "inherit",
            },
        );
        child.on("error", reject);
        child.on("exit", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`node-pg-migrate exited with code ${code}`));
        });
    });
}

export default async function setup(): Promise<() => Promise<void>> {
    await dropDb();
    await createDb();
    await runMigrations();

    return async () => {
        if (process.env.KEEP_TEST_DB === "1") {
            // eslint-disable-next-line no-console
            console.log(`[global-setup] KEEP_TEST_DB=1, leaving ${TEST_DB_NAME} in place`);
            return;
        }
        await dropDb().catch((err) => {
            // eslint-disable-next-line no-console
            console.warn(`[global-setup] teardown drop failed: ${(err as Error).message}`);
        });
    };
}

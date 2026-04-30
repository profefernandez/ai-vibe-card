/**
 * Seed (or reset password for) a known admin user.
 *
 * Run from the api/ directory:
 *   npx tsx scripts/seed-user.ts
 *
 * Idempotent: if the user already exists, the password is updated and the
 * existing organization/membership/profile rows are reused.
 */

import dotenv from "dotenv";
dotenv.config();

import bcrypt from "bcrypt";
import { db } from "../db.js";

const EMAIL = process.env.SEED_EMAIL ?? "jason@60wattsofclarity.com";
const PASSWORD = process.env.SEED_PASSWORD ?? "VibeCard2026!";
const SALT_ROUNDS = 12;

async function main() {
    if (PASSWORD.length < 8) {
        throw new Error("SEED_PASSWORD must be at least 8 characters");
    }

    const client = await db.connect();
    try {
        await client.query("BEGIN");

        const hash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

        const existing = await client.query(
            "SELECT id FROM users WHERE email = $1",
            [EMAIL],
        );

        let userId: string;

        if (existing.rows.length > 0) {
            userId = (existing.rows[0] as { id: string }).id;
            await client.query(
                "UPDATE users SET password_hash = $1 WHERE id = $2",
                [hash, userId],
            );
            console.log(`User exists — password reset for ${EMAIL}`);
        } else {
            const userRes = await client.query(
                "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id",
                [EMAIL, hash],
            );
            userId = (userRes.rows[0] as { id: string }).id;
            console.log(`Created user ${EMAIL}`);
        }

        const membership = await client.query(
            "SELECT organization_id FROM memberships WHERE user_id = $1 LIMIT 1",
            [userId],
        );

        let orgId: string;
        if (membership.rows.length > 0) {
            orgId = (membership.rows[0] as { organization_id: string }).organization_id;
        } else {
            const localPart =
                EMAIL.split("@")[0].toLowerCase().replace(/[^a-z0-9-]/g, "-") || "user";
            const slug = `${localPart}-${Math.random().toString(36).slice(2, 8)}`;
            const orgRes = await client.query(
                "INSERT INTO organizations (name, slug) VALUES ($1, $2) RETURNING id",
                ["Personal", slug],
            );
            orgId = (orgRes.rows[0] as { id: string }).id;
            await client.query(
                "INSERT INTO memberships (user_id, organization_id, role) VALUES ($1, $2, 'owner')",
                [userId, orgId],
            );
        }

        const profile = await client.query(
            "SELECT user_id FROM profiles WHERE user_id = $1 LIMIT 1",
            [userId],
        );
        if (profile.rows.length === 0) {
            await client.query(
                "INSERT INTO profiles (user_id, organization_id) VALUES ($1, $2)",
                [userId, orgId],
            );
        }

        await client.query("COMMIT");

        console.log("");
        console.log("──────────────────────────────────────────");
        console.log(" Login credentials");
        console.log("──────────────────────────────────────────");
        console.log(`  Email:    ${EMAIL}`);
        console.log(`  Password: ${PASSWORD}`);
        console.log("──────────────────────────────────────────");
    } catch (err) {
        await client.query("ROLLBACK").catch(() => { /* nothing */ });
        throw err;
    } finally {
        client.release();
    }
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error("Seed failed:", err);
        process.exit(1);
    });

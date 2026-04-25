/**
 * Audit `api_connections.api_key_encrypted` rows.
 *
 *   cd api && npx tsx scripts/audit-api-keys.ts
 *
 * Why this exists: `looksEncrypted()` is a SHAPE check — a value with the
 * right `iv:tag:ciphertext` regex shape but encrypted under a different key
 * passes the regex and fails decrypt. The original Phase-5 plan called for
 * attempting decryption, not just regex-matching, and that's what this
 * script does.
 *
 * Output buckets:
 *   ok          — decrypts cleanly with the current ENCRYPTION_KEY
 *   plaintext   — doesn't look encrypted at all (likely legacy / never run
 *                 through encrypt())
 *   wrong_key   — has encrypted shape but decrypt throws (possibly encrypted
 *                 under an old key — investigate manually)
 *   malformed   — has encrypted shape but parts are wrong / corrupt
 *
 * Read-only: never modifies the DB. Run before tightening lemonade-chat.ts /
 * test-api-connection.ts to throw on plaintext rather than passing values
 * through to upstream providers.
 */

import dotenv from "dotenv";
dotenv.config();

import { db } from "../db.js";
import { decrypt, looksEncrypted } from "../lib/crypto.js";

interface Bucket {
    label: "ok" | "plaintext" | "wrong_key" | "malformed";
    rowIds: string[];
}

async function main(): Promise<void> {
    const buckets: Record<Bucket["label"], string[]> = {
        ok: [],
        plaintext: [],
        wrong_key: [],
        malformed: [],
    };

    const { rows } = await db.query<{ id: string; api_key_encrypted: string | null }>(
        `SELECT id, api_key_encrypted FROM api_connections ORDER BY created_at`,
    );

    for (const row of rows) {
        const value = row.api_key_encrypted ?? "";
        if (!value) {
            // Empty string — treat as plaintext (effectively no key).
            buckets.plaintext.push(row.id);
            continue;
        }
        if (!looksEncrypted(value)) {
            buckets.plaintext.push(row.id);
            continue;
        }
        try {
            decrypt(value);
            buckets.ok.push(row.id);
        } catch (err) {
            const msg = err instanceof Error ? err.message : String(err);
            // Distinguish "wrong key" (auth tag mismatch) from "malformed"
            // (parsing error). Node's crypto module throws different
            // messages for each.
            if (msg.includes("Unsupported state") || msg.includes("auth") || msg.includes("decrypt")) {
                buckets.wrong_key.push(row.id);
            } else {
                buckets.malformed.push(row.id);
            }
        }
    }

    const total = rows.length;
    console.log("api_connections audit");
    console.log("─────────────────────");
    console.log(`Total rows:     ${total}`);
    console.log(`  ok:           ${buckets.ok.length}`);
    console.log(`  plaintext:    ${buckets.plaintext.length}`);
    console.log(`  wrong_key:    ${buckets.wrong_key.length}`);
    console.log(`  malformed:    ${buckets.malformed.length}`);

    for (const label of ["plaintext", "wrong_key", "malformed"] as const) {
        if (buckets[label].length > 0) {
            console.log(`\n${label} row IDs:`);
            for (const id of buckets[label]) {
                console.log(`  ${id}`);
            }
        }
    }

    // Exit non-zero if anything is unexpected, so this script can be wired
    // into deployment / CI checks once the cleanup is complete.
    const concerning = buckets.plaintext.length + buckets.wrong_key.length + buckets.malformed.length;
    process.exit(concerning === 0 ? 0 : 1);
}

main()
    .catch((err) => {
        console.error("audit failed:", err);
        process.exit(2);
    })
    .finally(async () => {
        await db.end().catch(() => { /* nothing */ });
    });

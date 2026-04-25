/**
 * Smoke tests for api/lib/crypto.ts and middleware/auth.ts JWT rotation.
 *   cd api && npx tsx scripts/test-crypto-rotation.ts
 */

import jwt from "jsonwebtoken";
import { encrypt, decrypt, looksEncrypted, isEncrypted } from "../lib/crypto.js";
import { verifyJwtWithRotation } from "../middleware/auth.js";

let passed = 0;
let failed = 0;
function expect(label: string, cond: boolean): void {
    if (cond) { console.log(`✓ ${label}`); passed++; }
    else      { console.error(`✗ ${label}`); failed++; }
}

// ── Crypto: v1 round-trip ──────────────────────────────────────────────────
process.env.ENCRYPTION_KEY = "a".repeat(64);
const plaintext = "sk-secret-key-1234567890";
const v1 = encrypt(plaintext);
expect("encrypt() emits v1 prefix", v1.startsWith("v1:"));
expect("v1 decrypts back to plaintext", decrypt(v1) === plaintext);
expect("looksEncrypted matches v1 form", looksEncrypted(v1));
expect("isEncrypted alias works", isEncrypted(v1));

// ── Crypto: legacy unprefixed back-compat ──────────────────────────────────
// Hand-craft a legacy-shaped value by encrypting and stripping the prefix.
const legacy = v1.slice("v1:".length);
expect("legacy decrypts (back-compat)", decrypt(legacy) === plaintext);
expect("looksEncrypted matches legacy form", looksEncrypted(legacy));

// ── Crypto: wrong key fails ────────────────────────────────────────────────
process.env.ENCRYPTION_KEY = "b".repeat(64);
let threw = false;
try { decrypt(v1); } catch { threw = true; }
expect("decrypt under wrong key throws", threw);
process.env.ENCRYPTION_KEY = "a".repeat(64);

// ── Crypto: malformed input ────────────────────────────────────────────────
let threw2 = false;
try { decrypt("not:enough"); } catch { threw2 = true; }
expect("decrypt rejects 2-part input", threw2);

let threw3 = false;
try { decrypt("v9:aa:bb:cc"); } catch { threw3 = true; }
expect("decrypt rejects unknown version", threw3);

expect("looksEncrypted rejects plaintext", !looksEncrypted("hello world"));

// ── JWT rotation ───────────────────────────────────────────────────────────
const oldSecret = "old".padEnd(40, "x");
const newSecret = "new".padEnd(40, "y");

process.env.JWT_SECRET = oldSecret;
const oldToken = jwt.sign({ sub: "u-1" }, oldSecret, { expiresIn: "1h" });

// Verify under old secret (no rotation)
const v1Result = verifyJwtWithRotation<{ sub: string }>(oldToken);
expect("verifies token under current secret", v1Result?.sub === "u-1");

// Now flip: new is current, old is previous
process.env.JWT_SECRET = newSecret;
process.env.JWT_SECRET_PREVIOUS = oldSecret;

const v2Result = verifyJwtWithRotation<{ sub: string }>(oldToken);
expect("verifies legacy-secret token via JWT_SECRET_PREVIOUS", v2Result?.sub === "u-1");

const newToken = jwt.sign({ sub: "u-2" }, newSecret, { expiresIn: "1h" });
const v3Result = verifyJwtWithRotation<{ sub: string }>(newToken);
expect("verifies new-secret token", v3Result?.sub === "u-2");

// Drop previous: old token should now be rejected
delete process.env.JWT_SECRET_PREVIOUS;
const v4Result = verifyJwtWithRotation<{ sub: string }>(oldToken);
expect("rejects old token after JWT_SECRET_PREVIOUS unset", v4Result === null);

// Garbage token
expect("rejects garbage", verifyJwtWithRotation("not.a.jwt") === null);

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

/**
 * AES-256-GCM encryption helpers for storing secrets at rest.
 *
 * Format (v1):  v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
 * Format (legacy, pre-Phase-5):  <iv_hex>:<authTag_hex>:<ciphertext_hex>
 *
 * Why versioned: rotating ENCRYPTION_KEY without a version byte is all-or-
 * nothing — every row has to be re-encrypted in one transaction or the app
 * breaks. Prefixing with `v1:` lets a future `v2:` key coexist with `v1:`
 * rows during a gradual migration. `decrypt()` accepts both shapes; new
 * writes always emit the prefixed form.
 *
 * `ENCRYPTION_KEY` is read from env at call time (not at module load) so
 * callers can vary it in tests / scripts.
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits — the standard for GCM
const VERSION = "v1";

function getKey(): Buffer {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
    }
    return Buffer.from(hex, "hex");
}

/**
 * Encrypt plaintext. Always emits the versioned form so audit/rotation tooling
 * can identify which key version produced a row.
 */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${VERSION}:${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/**
 * Decrypt either v1-prefixed or legacy unprefixed values. Throws on:
 *   - malformed shape
 *   - unknown version prefix
 *   - bad authentication tag (wrong key, tampered ciphertext)
 *
 * The audit script in scripts/audit-api-keys.ts uses this to detect rows
 * that were encrypted under a different key — a regex shape match alone is
 * insufficient because a value can have the right shape but fail decrypt.
 */
export function decrypt(encoded: string): string {
    const parts = encoded.split(":");

    let ivHex: string;
    let authTagHex: string;
    let ciphertextHex: string;

    if (parts.length === 4) {
        const [version, iv, tag, ct] = parts;
        if (version !== VERSION) {
            throw new Error(`Unknown crypto version: ${version}`);
        }
        ivHex = iv;
        authTagHex = tag;
        ciphertextHex = ct;
    } else if (parts.length === 3) {
        // Legacy unprefixed format (pre-Phase-5 rows). Accept and re-emit
        // as v1 the next time the row is written.
        [ivHex, authTagHex, ciphertextHex] = parts;
    } else {
        throw new Error("Invalid encrypted value format");
    }

    const key = getKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
}

/**
 * Shape-check only: returns true if the value MATCHES the encrypted format.
 * Does NOT prove the value will actually decrypt under the current key — a
 * row encrypted with a different key passes this check and fails decrypt.
 * Renamed from `isEncrypted` to make the limitation honest. The old name
 * is kept as a deprecated alias so unmodified callers don't break.
 */
export function looksEncrypted(value: string): boolean {
    // v1:<24 hex>:<32 hex>:<>= 0 hex>  OR  legacy <24 hex>:<32 hex>:<>= 0 hex>
    return (
        /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i.test(value) ||
        /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i.test(value)
    );
}

/**
 * @deprecated Use `looksEncrypted` — the original name implied a stronger
 * guarantee than the regex actually provides.
 */
export const isEncrypted = looksEncrypted;

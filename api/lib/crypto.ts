/**
 * AES-256-GCM encryption helpers for storing secrets at rest.
 * Uses ENCRYPTION_KEY from environment (must be 64 hex chars = 32 bytes).
 *
 * Format: <iv_hex>:<authTag_hex>:<ciphertext_hex>
 */

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12; // 96 bits recommended for GCM

function getKey(): Buffer {
    const hex = process.env.ENCRYPTION_KEY;
    if (!hex || hex.length !== 64) {
        throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
    }
    return Buffer.from(hex, "hex");
}

/** Encrypt plaintext → "iv:authTag:ciphertext" (all hex-encoded). */
export function encrypt(plaintext: string): string {
    const key = getKey();
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;
}

/** Decrypt "iv:authTag:ciphertext" → plaintext. */
export function decrypt(encoded: string): string {
    const parts = encoded.split(":");
    if (parts.length !== 3) {
        throw new Error("Invalid encrypted value format");
    }
    const [ivHex, authTagHex, ciphertextHex] = parts;
    const key = getKey();
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, "hex"));
    decipher.setAuthTag(Buffer.from(authTagHex, "hex"));
    const decrypted = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, "hex")), decipher.final()]);
    return decrypted.toString("utf8");
}

/** Check if a value looks like it's already encrypted (hex:hex:hex). */
export function isEncrypted(value: string): boolean {
    return /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]+$/i.test(value);
}

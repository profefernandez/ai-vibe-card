// Deno port of `api/lib/crypto.ts`'s decrypt() — AES-256-GCM via Web Crypto.
//
// Format (v1):     v1:<iv_hex>:<authTag_hex>:<ciphertext_hex>
// Format (legacy): <iv_hex>:<authTag_hex>:<ciphertext_hex>
//
// Web Crypto's AES-GCM expects the auth tag appended to the ciphertext, so we
// concatenate them before calling `crypto.subtle.decrypt`. Node's
// `createDecipheriv` separates them via `setAuthTag` — both paths produce the
// same plaintext.
//
// `ENCRYPTION_KEY` is read from env at call time so the function can be
// rotated by `supabase secrets set` without a redeploy.
//
// The `looksEncrypted` shape check matches the regex used by the Node
// helper exactly so the audit/migration tooling stays in lockstep.

const VERSION = "v1";

function hexToBytes(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) {
        throw new Error("Invalid hex string: odd length");
    }
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
        bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return bytes;
}

async function getKey(): Promise<CryptoKey> {
    const hex = Deno.env.get("ENCRYPTION_KEY");
    if (!hex || hex.length !== 64) {
        throw new Error("ENCRYPTION_KEY must be a 64-character hex string (32 bytes)");
    }
    return await crypto.subtle.importKey(
        "raw",
        hexToBytes(hex),
        { name: "AES-GCM" },
        false,
        ["decrypt"],
    );
}

export async function decrypt(encoded: string): Promise<string> {
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
        // Legacy unprefixed format. Same as the Node helper — accept on read.
        [ivHex, authTagHex, ciphertextHex] = parts;
    } else {
        throw new Error("Invalid encrypted value format");
    }

    const key = await getKey();
    const iv = hexToBytes(ivHex);
    const ct = hexToBytes(ciphertextHex);
    const tag = hexToBytes(authTagHex);

    // Web Crypto wants ciphertext || tag.
    const ctWithTag = new Uint8Array(ct.length + tag.length);
    ctWithTag.set(ct, 0);
    ctWithTag.set(tag, ct.length);

    const plaintext = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv },
        key,
        ctWithTag,
    );
    return new TextDecoder().decode(plaintext);
}

/** Same regex as the Node helper. Shape-only — passing this does not prove
 * the value will decrypt under the current key. */
export function looksEncrypted(value: string): boolean {
    return (
        /^v1:[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i.test(value) ||
        /^[0-9a-f]{24}:[0-9a-f]{32}:[0-9a-f]*$/i.test(value)
    );
}

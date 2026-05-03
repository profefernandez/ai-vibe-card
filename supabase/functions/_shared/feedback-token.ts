// Single-use HMAC token that lets an anonymous visitor submit feedback on
// exactly the AI response they received, and only that response.
//
// Deno/Web-Crypto port of `api/lib/feedback-token.ts`. The legacy
// `/api/feedback` endpoint must continue to verify these tokens, so the
// wire format (base64url-encoded JSON `{ p, c, h, n, e, s }`) and the key
// derivation (`sha256("feedback-token:v1\0" || secret)`) match the Node
// helper byte-for-byte. As long as `FEEDBACK_HMAC_SECRET` (or its
// `JWT_SECRET` fallback) carries the same value in both runtimes, tokens
// minted in this Edge Function are accepted by the legacy verifier and
// vice-versa.
//
// We only implement `issue` here — verification stays on the legacy server
// until that endpoint is also ported.

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

interface FeedbackTokenPayload {
    p: string | null; // profile_id
    c: string | null; // conversation_id
    h: string;        // sha256(answer_text), hex
    n: string;        // 16-byte nonce, hex
    e: number;        // expires_at, unix seconds
}

interface SignedToken extends FeedbackTokenPayload {
    s: string; // HMAC-SHA256, hex
}

function utf8(s: string): Uint8Array {
    return new TextEncoder().encode(s);
}

function bytesToHex(bytes: Uint8Array): string {
    let out = "";
    for (let i = 0; i < bytes.length; i++) {
        out += bytes[i].toString(16).padStart(2, "0");
    }
    return out;
}

async function sha256Hex(data: string): Promise<string> {
    const buf = await crypto.subtle.digest("SHA-256", utf8(data));
    return bytesToHex(new Uint8Array(buf));
}

async function getKey(): Promise<CryptoKey> {
    const explicit = Deno.env.get("FEEDBACK_HMAC_SECRET");
    const fallback = Deno.env.get("JWT_SECRET");
    const raw = explicit || fallback;
    if (!raw) {
        throw new Error("FEEDBACK_HMAC_SECRET (or JWT_SECRET fallback) is required");
    }
    // Domain-separate from JWT signing so a leaked JWT_SECRET can't be used
    // to forge feedback tokens unless the explicit secret is also missing.
    // The literal "feedback-token:v1\0" must match the Node helper exactly.
    const seed = new Uint8Array(
        utf8("feedback-token:v1").length + 1 + utf8(raw).length,
    );
    const prefix = utf8("feedback-token:v1");
    seed.set(prefix, 0);
    seed[prefix.length] = 0; // \0
    seed.set(utf8(raw), prefix.length + 1);
    const keyBytes = await crypto.subtle.digest("SHA-256", seed);
    return await crypto.subtle.importKey(
        "raw",
        keyBytes,
        { name: "HMAC", hash: "SHA-256" },
        false,
        ["sign"],
    );
}

async function hmac(payload: FeedbackTokenPayload): Promise<string> {
    const key = await getKey();
    // Canonical JSON: keys are emitted in insertion order, which we control.
    const json = JSON.stringify({
        p: payload.p,
        c: payload.c,
        h: payload.h,
        n: payload.n,
        e: payload.e,
    });
    const sig = await crypto.subtle.sign("HMAC", key, utf8(json));
    return bytesToHex(new Uint8Array(sig));
}

function b64urlEncode(s: string): string {
    // btoa accepts only Latin-1; convert via Uint8Array to handle UTF-8.
    const bytes = utf8(s);
    // Build the binary string in one pass via String.fromCharCode(...spread)
    // — chunked to avoid the argument-count limit on very large inputs.
    const CHUNK = 0x8000;
    let bin = "";
    for (let i = 0; i < bytes.length; i += CHUNK) {
        bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
    }
    return btoa(bin)
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=+$/, "");
}

export interface IssueArgs {
    profileId: string | null;
    conversationId: string | null;
    answerText: string;
}

/** Mint a token for a fresh AI response. */
export async function issueFeedbackToken(args: IssueArgs): Promise<string> {
    const nonceBytes = new Uint8Array(16);
    crypto.getRandomValues(nonceBytes);

    const payload: FeedbackTokenPayload = {
        p: args.profileId,
        c: args.conversationId,
        h: await sha256Hex(args.answerText),
        n: bytesToHex(nonceBytes),
        e: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    };
    const signed: SignedToken = { ...payload, s: await hmac(payload) };
    return b64urlEncode(JSON.stringify(signed));
}

export const FEEDBACK_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;

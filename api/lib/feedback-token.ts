/**
 * Single-use HMAC token that lets an anonymous visitor submit feedback on
 * exactly the AI response they received, and only that response.
 *
 * Threat model:
 *
 *   1. Cross-card poisoning — without binding, anyone can POST `profile_id =
 *      victim_card`, `rating = 'down'` and skew the victim's analytics.
 *   2. Replay — even with binding, the same valid token could be POSTed N
 *      times to amplify a downvote / upvote.
 *
 * The token covers (1) by signing `(profile_id, conversation_id, hash(answer))`
 * — feedback against a card the visitor never chatted with won't have a
 * matching signature. It covers (2) via a `feedback_consumed (signature_hash)`
 * unique-key table populated on accept. Replays fail at INSERT time.
 *
 * Tokens are short-lived (24 h). Expired tokens are rejected; the consumed
 * table is pruned by the retention cron once entries are older than the
 * lifetime, so it can't grow unbounded.
 *
 * Wire format: base64url-encoded JSON `{ p, c, h, n, e, s }` where:
 *   p — profile_id   (UUID or null)
 *   c — conversation_id (UUID or null)
 *   h — sha256(answer_text), hex
 *   n — random 16-byte nonce, hex (uniqueness per token)
 *   e — expires_at, unix seconds
 *   s — HMAC-SHA256 over JSON.stringify({p,c,h,n,e}) using FEEDBACK_HMAC_SECRET
 *
 * The secret key lives in env (`FEEDBACK_HMAC_SECRET`). It's derived from
 * JWT_SECRET if not explicitly set so the app can boot in dev without an
 * extra knob — but production should set it explicitly so rotating one
 * doesn't invalidate the other.
 */

import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

const TOKEN_TTL_SECONDS = 24 * 60 * 60;

interface FeedbackTokenPayload {
    p: string | null; // profile_id
    c: string | null; // conversation_id
    h: string; // sha256(answer_text)
    n: string; // nonce
    e: number; // expires_at (unix seconds)
}

interface SignedToken extends FeedbackTokenPayload {
    s: string; // HMAC signature
}

function getKey(): Buffer {
    const explicit = process.env.FEEDBACK_HMAC_SECRET;
    const fallback = process.env.JWT_SECRET;
    const raw = explicit || fallback;
    if (!raw) {
        throw new Error("FEEDBACK_HMAC_SECRET (or JWT_SECRET fallback) is required");
    }
    // Domain-separate from JWT signing so a leaked JWT_SECRET can't be used
    // to forge feedback tokens unless the explicit secret is also missing.
    return createHash("sha256").update("feedback-token:v1\0").update(raw).digest();
}

function hmac(payload: FeedbackTokenPayload): string {
    const key = getKey();
    // Canonical JSON: keys are emitted in insertion order, which we control.
    const json = JSON.stringify({ p: payload.p, c: payload.c, h: payload.h, n: payload.n, e: payload.e });
    return createHmac("sha256", key).update(json).digest("hex");
}

function b64urlEncode(s: string): string {
    return Buffer.from(s, "utf8").toString("base64url");
}

function b64urlDecode(s: string): string {
    return Buffer.from(s, "base64url").toString("utf8");
}

export interface IssueArgs {
    profileId: string | null;
    conversationId: string | null;
    answerText: string;
}

/** Mint a token for a fresh AI response. Called from chat handlers. */
export function issueFeedbackToken(args: IssueArgs): string {
    const payload: FeedbackTokenPayload = {
        p: args.profileId,
        c: args.conversationId,
        h: createHash("sha256").update(args.answerText).digest("hex"),
        n: randomBytes(16).toString("hex"),
        e: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
    };
    const signed: SignedToken = { ...payload, s: hmac(payload) };
    return b64urlEncode(JSON.stringify(signed));
}

export interface VerifyArgs {
    token: string;
    profileId: string | null;
    conversationId: string | null;
    answerText: string;
}

export type VerifyOk = { ok: true; signatureHash: string };
export type VerifyErr = { ok: false; reason: "malformed" | "expired" | "signature_mismatch" | "binding_mismatch" };
export type VerifyResult = VerifyOk | VerifyErr;

/**
 * Verify a token presented at feedback time. Does NOT mark the token as
 * consumed — that responsibility belongs to the caller (an INSERT into
 * `feedback_consumed` keyed on the returned `signatureHash` provides the
 * unique-key replay guard).
 */
export function verifyFeedbackToken(args: VerifyArgs): VerifyResult {
    let parsed: SignedToken;
    try {
        parsed = JSON.parse(b64urlDecode(args.token)) as SignedToken;
    } catch {
        return { ok: false, reason: "malformed" };
    }

    // Shape check before doing crypto.
    if (
        typeof parsed.p !== "string" && parsed.p !== null ||
        typeof parsed.c !== "string" && parsed.c !== null ||
        typeof parsed.h !== "string" ||
        typeof parsed.n !== "string" ||
        typeof parsed.e !== "number" ||
        typeof parsed.s !== "string"
    ) {
        return { ok: false, reason: "malformed" };
    }

    if (parsed.e < Math.floor(Date.now() / 1000)) {
        return { ok: false, reason: "expired" };
    }

    // Recompute HMAC and compare in constant time.
    const expected = hmac({ p: parsed.p, c: parsed.c, h: parsed.h, n: parsed.n, e: parsed.e });
    const expectedBuf = Buffer.from(expected, "hex");
    const providedBuf = Buffer.from(parsed.s, "hex");
    if (expectedBuf.length !== providedBuf.length) {
        return { ok: false, reason: "signature_mismatch" };
    }
    if (!timingSafeEqual(expectedBuf, providedBuf)) {
        return { ok: false, reason: "signature_mismatch" };
    }

    // Binding check: feedback claims must match what was signed.
    const argHash = createHash("sha256").update(args.answerText).digest("hex");
    if (
        parsed.p !== args.profileId ||
        parsed.c !== args.conversationId ||
        parsed.h !== argHash
    ) {
        return { ok: false, reason: "binding_mismatch" };
    }

    // signatureHash uniquely identifies this token for the feedback_consumed
    // PK. Keyed on the signature itself (which embeds the nonce), so
    // distinct tokens against the same response collide only by chance over
    // a 256-bit space.
    const signatureHash = createHash("sha256").update(parsed.s).digest("hex");
    return { ok: true, signatureHash };
}

export const FEEDBACK_TOKEN_TTL_SECONDS = TOKEN_TTL_SECONDS;

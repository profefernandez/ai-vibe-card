/**
 * Smoke test for api/lib/feedback-token.ts.
 *   FEEDBACK_HMAC_SECRET=$(openssl rand -hex 32) npx tsx scripts/test-feedback-token.ts
 *
 * Manual run only — exercises the issue/verify path end-to-end including
 * binding mismatch and signature tampering.
 */

import { issueFeedbackToken, verifyFeedbackToken } from "../lib/feedback-token.js";

process.env.FEEDBACK_HMAC_SECRET ??= "x".repeat(64);

let passed = 0;
let failed = 0;

function expect(label: string, cond: boolean) {
    if (cond) { console.log(`✓ ${label}`); passed++; }
    else      { console.error(`✗ ${label}`); failed++; }
}

const profileId = "11111111-1111-1111-1111-111111111111";
const conversationId = "22222222-2222-2222-2222-222222222222";
const answer = "Hello, here is the answer to your question.";

const token = issueFeedbackToken({
    profileId,
    conversationId,
    answerText: answer,
});

// Happy path
const r1 = verifyFeedbackToken({ token, profileId, conversationId, answerText: answer });
expect("verifies a fresh token", r1.ok === true);

// Different signature hash means we'll reject replays at INSERT time, but we
// can't test the DB layer here — at least confirm two tokens for the same
// triple produce different signatures (different nonces).
const token2 = issueFeedbackToken({ profileId, conversationId, answerText: answer });
expect("two tokens for the same triple have different signatures", token !== token2);

// Profile binding mismatch
const r2 = verifyFeedbackToken({
    token, profileId: "33333333-3333-3333-3333-333333333333",
    conversationId, answerText: answer,
});
expect("rejects profile_id mismatch", !r2.ok && r2.reason === "binding_mismatch");

// Conversation binding mismatch
const r3 = verifyFeedbackToken({
    token, profileId,
    conversationId: "44444444-4444-4444-4444-444444444444",
    answerText: answer,
});
expect("rejects conversation_id mismatch", !r3.ok && r3.reason === "binding_mismatch");

// Answer text mismatch
const r4 = verifyFeedbackToken({ token, profileId, conversationId, answerText: "different answer" });
expect("rejects answer_text mismatch", !r4.ok && r4.reason === "binding_mismatch");

// Tampered signature: flip last hex char
const decoded = Buffer.from(token, "base64url").toString("utf8");
const obj = JSON.parse(decoded) as { s: string };
obj.s = obj.s.slice(0, -1) + (obj.s.slice(-1) === "0" ? "1" : "0");
const tamperedToken = Buffer.from(JSON.stringify(obj), "utf8").toString("base64url");
const r5 = verifyFeedbackToken({ token: tamperedToken, profileId, conversationId, answerText: answer });
expect("rejects tampered signature", !r5.ok && r5.reason === "signature_mismatch");

// Garbage token
const r6 = verifyFeedbackToken({ token: "not-a-valid-token!!!", profileId, conversationId, answerText: answer });
expect("rejects malformed token", !r6.ok && r6.reason === "malformed");

// Empty answer
const tokenEmpty = issueFeedbackToken({ profileId: null, conversationId: null, answerText: "" });
const r7 = verifyFeedbackToken({ token: tokenEmpty, profileId: null, conversationId: null, answerText: "" });
expect("verifies a token with null bindings + empty answer", r7.ok === true);

// Cross-secret: another secret won't verify
process.env.FEEDBACK_HMAC_SECRET = "y".repeat(64);
const r8 = verifyFeedbackToken({ token, profileId, conversationId, answerText: answer });
expect("rejects token under a different HMAC key", !r8.ok && r8.reason === "signature_mismatch");

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed === 0 ? 0 : 1);

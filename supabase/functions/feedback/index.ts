// feedback — anonymous thumbs-up / thumbs-down on a chat reply.
// POST {
//   profile_id?: UUID, conversation_id?: UUID,
//   rating: "up" | "down",
//   comment?: string, question_text?: string, answer_text?: string,
//   feedback_token: string
// }
//
// PUBLIC endpoint. Deploy with `--no-verify-jwt` — card visitors are
// anonymous. The HMAC `feedback_token` minted by `lemonade-chat` (and the
// legacy Express server while it still exists) carries the integrity:
//
//   1. Cross-card poisoning blocked by the binding check
//      (profile_id, conversation_id, sha256(answer_text)).
//   2. Replay blocked by the unique-key INSERT into feedback_consumed.
//
// Both Node-issued and Edge-issued tokens are accepted: the wire format
// and HMAC key derivation are byte-identical between
// `api/lib/feedback-token.ts` and `supabase/functions/_shared/feedback-token.ts`,
// as long as `FEEDBACK_HMAC_SECRET` (or the `JWT_SECRET` fallback) carries
// the same value in both runtimes.

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/auth.ts";
import { verifyFeedbackToken } from "../_shared/feedback-token.ts";

// ── Validation helpers ─────────────────────────────────────────────────────
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isUuid(value: unknown): value is string {
    return typeof value === "string" && UUID_RE.test(value);
}

function stripControlChars(s: string): string {
    // Keep newlines/tabs; strip other control chars that could break INET/TEXT.
    return s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function normaliseOptionalText(value: unknown, maxLen: number): string | null {
    if (value === undefined || value === null) return null;
    if (typeof value !== "string") return null;
    const cleaned = stripControlChars(value).trim();
    if (!cleaned) return null;
    return cleaned.slice(0, maxLen);
}

function clientIp(req: Request): string | null {
    // Supabase Edge Functions sit behind a load balancer; x-forwarded-for is
    // the canonical client-IP source. Take the leftmost entry.
    const xff = req.headers.get("x-forwarded-for");
    if (xff) {
        const first = xff.split(",")[0]?.trim();
        if (first) return first;
    }
    return req.headers.get("x-real-ip");
}

interface RequestBody {
    profile_id?: unknown;
    rating?: unknown;
    comment?: unknown;
    question_text?: unknown;
    answer_text?: unknown;
    conversation_id?: unknown;
    feedback_token?: unknown;
}

const GENERIC_TOKEN_ERROR = "Invalid or expired feedback token";

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    let body: RequestBody;
    try {
        body = (await req.json()) as RequestBody;
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    // ── rating ────────────────────────────────────────────────────────────
    if (body.rating !== "up" && body.rating !== "down") {
        return jsonResponse({ error: "rating must be 'up' or 'down'" }, 400);
    }
    const rating: "up" | "down" = body.rating;

    // ── profile_id (optional UUID) ───────────────────────────────────────
    let profileId: string | null = null;
    if (body.profile_id !== undefined && body.profile_id !== null && body.profile_id !== "") {
        if (!isUuid(body.profile_id)) {
            return jsonResponse({ error: "profile_id must be a UUID" }, 400);
        }
        profileId = body.profile_id;
    }

    // ── conversation_id (optional UUID) ──────────────────────────────────
    let conversationId: string | null = null;
    if (body.conversation_id !== undefined && body.conversation_id !== null && body.conversation_id !== "") {
        if (!isUuid(body.conversation_id)) {
            return jsonResponse({ error: "conversation_id must be a UUID" }, 400);
        }
        conversationId = body.conversation_id;
    }

    // ── Length caps validated BEFORE normalising so oversize payloads
    //    are rejected rather than silently truncated.
    if (typeof body.comment === "string" && body.comment.length > 2000) {
        return jsonResponse({ error: "comment must be 2000 chars or less" }, 400);
    }
    if (typeof body.question_text === "string" && body.question_text.length > 8000) {
        return jsonResponse({ error: "question_text must be 8000 chars or less" }, 400);
    }
    if (typeof body.answer_text === "string" && body.answer_text.length > 8000) {
        return jsonResponse({ error: "answer_text must be 8000 chars or less" }, 400);
    }

    const comment = normaliseOptionalText(body.comment, 2000);
    const questionText = normaliseOptionalText(body.question_text, 8000);
    const answerText = normaliseOptionalText(body.answer_text, 8000);

    // ── feedback_token (required) ────────────────────────────────────────
    if (typeof body.feedback_token !== "string" || body.feedback_token.length === 0) {
        return jsonResponse({ error: "feedback_token is required" }, 400);
    }
    const verified = await verifyFeedbackToken({
        token: body.feedback_token,
        profileId,
        conversationId,
        answerText: answerText ?? "",
    });
    if (!verified.ok) {
        // Log the reason for ops without disclosing it to a potential attacker.
        console.info("feedback token rejected:", verified.reason);
        return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
    }

    const serviceOrError = getServiceClient();
    if (serviceOrError instanceof Response) return serviceOrError;
    const service = serviceOrError;

    const userAgentRaw = req.headers.get("user-agent");
    const userAgent = userAgentRaw ? userAgentRaw.slice(0, 500) : null;
    const ipAddress = clientIp(req);

    // ── Replay guard: insert the signature first ─────────────────────────
    // PostgreSQL raises 23505 on a duplicate PK. We surface the same
    // generic error as a bad signature so an attacker can't tell whether
    // their token was ever valid (only whether they've already used it).
    {
        const { error } = await service
            .from("feedback_consumed")
            .insert({ signature_hash: verified.signatureHash });
        if (error) {
            const code = (error as { code?: string }).code;
            if (code === "23505") {
                console.info("feedback token replay rejected:", verified.signatureHash);
                return jsonResponse({ error: GENERIC_TOKEN_ERROR }, 400);
            }
            console.error("feedback_consumed insert failed:", error);
            return jsonResponse({ error: "Failed to record feedback" }, 500);
        }
    }

    // ── Insert the feedback row ──────────────────────────────────────────
    // If this fails, we leave the consumed row in place — it costs us a
    // single nonce slot but the visitor can't replay this exact token, so
    // partial-success (consumed but no row) is the safer failure mode than
    // partial-success (row but token re-usable).
    {
        const { error } = await service.from("ai_feedback").insert({
            profile_id: profileId,
            rating,
            comment,
            question_text: questionText,
            answer_text: answerText,
            conversation_id: conversationId,
            ip_address: ipAddress,
            user_agent: userAgent,
        });
        if (error) {
            console.error("ai_feedback insert failed:", error);
            return jsonResponse({ error: "Failed to record feedback" }, 500);
        }
    }

    return jsonResponse({ ok: true });
});

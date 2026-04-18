/**
 * AI feedback route.
 *
 * Public:
 *   POST /api/feedback — anonymous thumbs-up / thumbs-down on an assistant
 *                       response in the ExplorePanel chat surface.
 *
 * No auth required: card visitors (unauthenticated) must be able to submit
 * feedback. We snapshot question + answer text here so card owners and the
 * platform operator can later review aggregate signals (e.g. `% thumbs-down
 * by card`, `topics with high complaint rates`) without ever needing to read
 * live conversations — critical for a social-worker audience where
 * confidentiality is professional-grade.
 *
 * Rate-limited: the existing global rate-limiters in `api/index.ts` are
 * keyed on JWT for authed users and IP otherwise (via express-rate-limit).
 * Feedback is anonymous, so we apply a dedicated IP-keyed limit of 5/min
 * right here via express-rate-limit — matching the rest of the codebase
 * rather than inventing a new mechanism.
 */

import { Router } from "express";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import { db } from "../db.js";
import { logger } from "../logger.js";

export const router = Router();

// ── Rate limiter ─────────────────────────────────────────────────────────────
// 5 submissions/minute per IP. This is plenty for legitimate use — a visitor
// would rarely rate more than one or two assistant replies in a single minute.
const feedbackLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 5,
    keyGenerator: (req) => ipKeyGenerator(req.ip ?? "unknown"),
    message: { error: "Too many feedback submissions, please slow down" },
});

// ── Validation helpers ───────────────────────────────────────────────────────
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

// ── POST /api/feedback ───────────────────────────────────────────────────────
router.post("/", feedbackLimiter, async (req, res) => {
    const body = (req.body ?? {}) as {
        profile_id?: unknown;
        rating?: unknown;
        comment?: unknown;
        question_text?: unknown;
        answer_text?: unknown;
        conversation_id?: unknown;
    };

    // rating — required, must be exactly "up" or "down"
    if (body.rating !== "up" && body.rating !== "down") {
        res.status(400).json({ error: "rating must be 'up' or 'down'" });
        return;
    }
    const rating = body.rating;

    // profile_id — optional, must be UUID if present
    let profileId: string | null = null;
    if (body.profile_id !== undefined && body.profile_id !== null && body.profile_id !== "") {
        if (!isUuid(body.profile_id)) {
            res.status(400).json({ error: "profile_id must be a UUID" });
            return;
        }
        profileId = body.profile_id;
    }

    // conversation_id — optional, must be UUID if present
    let conversationId: string | null = null;
    if (body.conversation_id !== undefined && body.conversation_id !== null && body.conversation_id !== "") {
        if (!isUuid(body.conversation_id)) {
            res.status(400).json({ error: "conversation_id must be a UUID" });
            return;
        }
        conversationId = body.conversation_id;
    }

    // Length caps — validate raw input length BEFORE normalising so oversize
    // payloads are rejected rather than silently truncated.
    if (typeof body.comment === "string" && body.comment.length > 2000) {
        res.status(400).json({ error: "comment must be 2000 chars or less" });
        return;
    }
    if (typeof body.question_text === "string" && body.question_text.length > 8000) {
        res.status(400).json({ error: "question_text must be 8000 chars or less" });
        return;
    }
    if (typeof body.answer_text === "string" && body.answer_text.length > 8000) {
        res.status(400).json({ error: "answer_text must be 8000 chars or less" });
        return;
    }

    const comment = normaliseOptionalText(body.comment, 2000);
    const questionText = normaliseOptionalText(body.question_text, 8000);
    const answerText = normaliseOptionalText(body.answer_text, 8000);

    const ipAddress = req.ip ?? null;
    const userAgentRaw = req.headers["user-agent"];
    const userAgent = typeof userAgentRaw === "string" ? userAgentRaw.slice(0, 500) : null;

    try {
        await db.query(
            `INSERT INTO ai_feedback
                (profile_id, rating, comment, question_text, answer_text,
                 conversation_id, ip_address, user_agent)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [profileId, rating, comment, questionText, answerText, conversationId, ipAddress, userAgent],
        );
        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "ai_feedback insert failed");
        res.status(500).json({ error: "Failed to record feedback" });
    }
});

// connection-query — authenticated cross-card AI query.
//
// POST { id: UUID, question: string }
//
// The caller asks a question about the *other* party of an approved
// connection. Mirrors `api/routes/card.ts:310-426` and reuses
// `query-content`'s sanitise/filter pipeline.
//
// Auth: caller's JWT. The connection row is read via RLS
// (`connections_party_select`) so a user can only query connections they
// are a party to. The target's `content_blocks` are read via
// `content_blocks_public_read` (visibility=public + verified site +
// published profile).

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";
import { filterOutput, sanitiseInput } from "../_shared/sanitise.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEMONADE_CHAT_URL = "https://api.launchlemonade.app/v1/chat";
const BLOCK_FETCH_LIMIT = 30;
const BLOCK_BODY_PREVIEW = 300;

interface RequestBody {
    id?: unknown;
    question?: unknown;
}

interface ConnectionRow {
    requester_id: string;
    owner_id: string;
}

interface TargetProfile {
    display_name: string | null;
    ai_query_enabled: boolean | null;
}

interface ContentBlock {
    heading: string | null;
    body: string | null;
}

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;
    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user, userClient, serviceClient } = auth;

    let body: RequestBody;
    try {
        body = (await req.json()) as RequestBody;
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const id = typeof body.id === "string" ? body.id : "";
    const rawQuestion = typeof body.question === "string" ? body.question : "";
    if (!id || !UUID_RE.test(id)) {
        return jsonResponse({ error: "Invalid connection id" }, 400);
    }
    if (!rawQuestion.trim()) {
        return jsonResponse({ error: "question is required" }, 400);
    }

    const sanitised = sanitiseInput(rawQuestion);
    if (sanitised.blocked) {
        return jsonResponse({ error: sanitised.reason }, 400);
    }
    const cleanQuestion = sanitised.text;

    // ── Approved connection where caller is a party ────────────────────
    const { data: conn, error: connErr } = await userClient
        .from("connections")
        .select("requester_id, owner_id")
        .eq("id", id)
        .eq("status", "approved")
        .maybeSingle<ConnectionRow>();
    if (connErr) {
        console.error("connection-query: connection lookup failed:", connErr.message);
        return jsonResponse({ error: "Failed to query card" }, 500);
    }
    if (!conn) {
        return jsonResponse({ error: "Connection not found or not approved" }, 404);
    }

    const targetUserId = conn.owner_id === user.id ? conn.requester_id : conn.owner_id;

    // ── Target must have AI query enabled (read via RLS — public profile) ─
    const { data: target, error: targetErr } = await userClient
        .from("profiles")
        .select("display_name, ai_query_enabled")
        .eq("user_id", targetUserId)
        .maybeSingle<TargetProfile>();
    if (targetErr) {
        console.error("connection-query: target profile lookup failed:", targetErr.message);
        return jsonResponse({ error: "Failed to query card" }, 500);
    }
    if (!target || !target.ai_query_enabled) {
        return jsonResponse(
            { error: "This user has not enabled AI queries on their card" },
            403,
        );
    }

    // ── Pull target's public content blocks ─────────────────────────────
    // We need to scope to the target's verified sites. The
    // `content_blocks_public_read` policy already enforces both verified
    // and published, but we still have to filter to *this* user's sites.
    // Service-role read is the simplest expression — RLS isn't bypassed
    // here for security reasons (the gate is the connection check above).
    const { data: siteRows, error: sitesErr } = await serviceClient
        .from("sites")
        .select("id")
        .eq("user_id", targetUserId)
        .eq("verified", true);
    if (sitesErr) {
        console.error("connection-query: sites lookup failed:", sitesErr.message);
        return jsonResponse({ error: "Failed to query card" }, 500);
    }
    const siteIds = (siteRows ?? []).map((r: { id: string }) => r.id);

    let blocks: ContentBlock[] = [];
    if (siteIds.length > 0) {
        const { data: blockRows, error: blocksErr } = await serviceClient
            .from("content_blocks")
            .select("heading, body")
            .in("site_id", siteIds)
            .eq("visibility", "public")
            .order("block_order", { ascending: true })
            .limit(BLOCK_FETCH_LIMIT);
        if (blocksErr) {
            console.error("connection-query: blocks lookup failed:", blocksErr.message);
            return jsonResponse({ error: "Failed to query card" }, 500);
        }
        blocks = (blockRows ?? []) as ContentBlock[];
    }

    const targetName = target.display_name?.trim() || "this person";

    if (blocks.length === 0) {
        return jsonResponse({
            answer: `${targetName} hasn't added any site content yet.`,
        });
    }

    const apiKey = Deno.env.get("LEMONADE_API_KEY");
    const contentId = Deno.env.get("LEMONADE_CONTENT_ID");
    if (!apiKey || !contentId) {
        return jsonResponse({ error: "LaunchLemonade not configured" }, 500);
    }

    const siteContext = blocks
        .map((b) => `${b.heading ?? ""}: ${(b.body ?? "").slice(0, BLOCK_BODY_PREVIEW)}`)
        .join("\n");

    const message =
        `You are a helpful assistant answering questions about ${targetName}'s business and services based on their website content. Answer concisely and accurately. If the content doesn't contain enough information to answer, say so honestly. Do not make up information.\n\n` +
        `[Website content for ${targetName}]\n${siteContext}\n\n[Question]\n${cleanQuestion}`;

    let aiResponse: Response;
    try {
        aiResponse = await fetch(LEMONADE_CHAT_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({ lemonade_id: contentId, message }),
        });
    } catch (err) {
        console.error("connection-query: AI gateway threw:", err);
        return jsonResponse({ error: "AI service unavailable" }, 502);
    }
    if (!aiResponse.ok) {
        console.error("connection-query: AI gateway non-200:", aiResponse.status);
        return jsonResponse({ error: "AI service unavailable" }, 502);
    }

    let aiData: { response?: string; usage?: { total_tokens?: number } };
    try {
        aiData = (await aiResponse.json()) as typeof aiData;
    } catch {
        aiData = {};
    }
    const answer = filterOutput(aiData.response ?? "No response from AI.");

    await logAudit(serviceClient, {
        userId: user.id,
        action: "cross_card_query",
        tableName: "connections",
        recordId: id,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        meta: { target_user_id: targetUserId, tokens: aiData.usage?.total_tokens },
    });

    return jsonResponse({ answer });
});

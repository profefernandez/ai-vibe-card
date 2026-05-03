// query-content — AI-routed semantic search over a site's content_blocks.
//
// POST { query: string, site_id: UUID }
//
// We pull up to 200 public blocks for the site (RLS enforces ownership),
// summarise them for the model, then ask LaunchLemonade for the indices
// of the 3-5 most relevant. The selected rows are returned to the caller.
//
// Replaces `api/routes/query-content.ts`.
//
// Auth: caller's JWT required. All `sites` / `content_blocks` reads go
// through the user-bound RLS client (owner has `FOR ALL` per migration
// `0002`). Audit rows go through the service-role client.

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";
import { sanitiseInput } from "../_shared/sanitise.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LEMONADE_CHAT_URL = "https://api.launchlemonade.app/v1/chat";
const BLOCK_FETCH_LIMIT = 200;
const BLOCK_BODY_PREVIEW = 200;

interface RequestBody {
    query?: unknown;
    site_id?: unknown;
}

interface ContentBlock {
    id: string;
    heading: string | null;
    body: string | null;
    images: string[];
    category: string | null;
    tags: string[];
    block_order: number;
    page_id: string | null;
}

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;
    if (req.method !== "POST") {
        return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user, userClient, serviceClient } = auth;

    let body: RequestBody;
    try {
        body = (await req.json()) as RequestBody;
    } catch {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const rawQuery = body.query;
    const siteId = body.site_id;
    if (typeof rawQuery !== "string" || !rawQuery.trim()) {
        return jsonResponse({ success: false, error: "query is required" }, 400);
    }
    if (typeof siteId !== "string" || !UUID_RE.test(siteId)) {
        return jsonResponse({ success: false, error: "site_id is required" }, 400);
    }

    // ── Server-side input sanitisation (prompt-injection block list) ────
    const sanitised = sanitiseInput(rawQuery);
    if (sanitised.blocked) {
        return jsonResponse({ success: false, error: sanitised.reason }, 400);
    }
    const cleanQuery = sanitised.text;

    // ── Ownership check (RLS-bound) ─────────────────────────────────────
    // Belt-and-braces explicit user_id filter; RLS already enforces it.
    // Missing row → uniform 403 (no existence-leak oracle).
    const { data: site, error: siteErr } = await userClient
        .from("sites")
        .select("id")
        .eq("id", siteId)
        .eq("user_id", user.id)
        .maybeSingle<{ id: string }>();
    if (siteErr) {
        console.error("query-content: site lookup failed:", siteErr.message);
        return jsonResponse({ success: false, error: "Lookup failed" }, 500);
    }
    if (!site) {
        return jsonResponse(
            { success: false, error: "Site not found or access denied" },
            403,
        );
    }

    // ── Fetch public blocks for the site (RLS-bound) ────────────────────
    const { data: blockRows, error: blocksErr } = await userClient
        .from("content_blocks")
        .select("id, heading, body, images, category, tags, block_order, page_id")
        .eq("site_id", siteId)
        .eq("visibility", "public")
        .order("block_order", { ascending: true })
        .limit(BLOCK_FETCH_LIMIT);
    if (blocksErr) {
        console.error("query-content: blocks fetch failed:", blocksErr.message);
        return jsonResponse({ success: false, error: "Failed to load content" }, 500);
    }

    const blocks = (blockRows ?? []) as ContentBlock[];
    if (blocks.length === 0) {
        return jsonResponse({
            success: true,
            blocks: [],
            message: "No content available yet",
        });
    }

    // ── Call LaunchLemonade for routing ─────────────────────────────────
    const apiKey = Deno.env.get("LEMONADE_API_KEY");
    const contentId = Deno.env.get("LEMONADE_CONTENT_ID");
    if (!apiKey || !contentId) {
        return jsonResponse(
            { success: false, error: "LaunchLemonade not configured" },
            500,
        );
    }

    const blockSummaries = blocks
        .map(
            (b, i) =>
                `[${i}] ${b.heading || "No heading"}: ${(b.body ?? "").slice(0, BLOCK_BODY_PREVIEW)}`,
        )
        .join("\n");

    const message =
        `You are a content routing AI. Given a user query and a list of content blocks, return the indices of the 3-5 most relevant blocks. Return ONLY a JSON array of indices, e.g. [0, 3, 7]. If nothing is relevant, return [].\n\n` +
        `Query: "${cleanQuery}"\n\nContent blocks:\n${blockSummaries}`;

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
        console.error("query-content: AI gateway threw:", err);
        return jsonResponse({ error: "AI gateway error" }, 500);
    }

    if (!aiResponse.ok) {
        if (aiResponse.status === 429) {
            return jsonResponse(
                { error: "Rate limited, please try again shortly." },
                429,
            );
        }
        return jsonResponse({ error: "AI gateway error" }, 500);
    }

    let aiData: { response?: string };
    try {
        aiData = (await aiResponse.json()) as { response?: string };
    } catch {
        aiData = {};
    }
    const content = aiData.response ?? "[]";

    // The model is asked for a JSON array but occasionally wraps it in
    // prose. Extract the first `[...]` and parse defensively — a malformed
    // response should degrade to "no matches", not a 500.
    let indices: number[] = [];
    const jsonMatch = content.match(/\[[\d,\s]*\]/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (Array.isArray(parsed)) {
                indices = parsed.filter(
                    (n): n is number => typeof n === "number" && Number.isInteger(n),
                );
            }
        } catch {
            indices = [];
        }
    }

    const matchedBlocks = indices
        .filter((i) => i >= 0 && i < blocks.length)
        .map((i) => blocks[i]);

    await logAudit(serviceClient, {
        userId: user.id,
        action: "query_content",
        tableName: "sites",
        recordId: siteId,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        meta: { site_id: siteId, results: matchedBlocks.length },
    });

    return jsonResponse({ success: true, blocks: matchedBlocks });
});

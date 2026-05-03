// scrape-site — crawl a verified domain via Firecrawl and replace the
// site's `site_pages` + `content_blocks` rows.
//
// POST { domain: string, site_id: UUID }
//
// Auth: requires the caller's JWT. The user-bound client enforces RLS on
// every read and write; the user-owner has `FOR ALL` policies on
// `sites` / `site_pages` / `content_blocks` (see migration 0002).
//
// Crawl budget: 30 polls × 2 s = 60 s; the Edge Function wall-clock is
// 150 s by default so this leaves ~90 s for setup + writes. Firecrawl
// itself performs the outbound HTTP from their infrastructure, but we
// still call `assertPublicHost()` first so a user can't aim the
// verification flow at internal hostnames for recon.
//
// Replaces `api/routes/scrape-site.ts`.

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";
import { assertPublicHost, SafeFetchError } from "../_shared/safe-fetch.ts";
import { sanitizeContent } from "../_shared/sanitize-content.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";
const CRAWL_LIMIT = 20;
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ITERATIONS = 30;

interface RequestBody {
    domain?: unknown;
    site_id?: unknown;
}

interface Block {
    heading: string | null;
    body: string | null;
    images: string[];
    category: string | null;
}

interface FirecrawlPage {
    url?: string;
    markdown?: string;
    html?: string;
    metadata?: { sourceURL?: string; title?: string } & Record<string, unknown>;
}

interface FirecrawlStatus {
    status?: "scraping" | "completed" | "failed" | string;
    data?: FirecrawlPage[];
}

function parseMarkdownToBlocks(markdown: string): Block[] {
    const lines = markdown.split("\n");
    const blocks: Block[] = [];
    let current: Block | null = null;
    const bodyLines: string[] = [];

    const flush = () => {
        if (current) {
            current.body = bodyLines.join("\n").trim();
            if (current.heading || current.body) blocks.push(current);
        }
        bodyLines.length = 0;
    };

    for (const line of lines) {
        if (line.startsWith("#")) {
            flush();
            current = { heading: line.replace(/^#+\s*/, ""), body: null, images: [], category: null };
        } else {
            if (!current) current = { heading: null, body: null, images: [], category: null };
            bodyLines.push(line);
            const m = line.match(/!\[.*?\]\((.*?)\)/);
            if (m) current.images.push(m[1]);
        }
    }
    flush();
    return blocks.filter((b) => b.heading || (b.body && b.body.length > 10));
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

    const rawDomain = body.domain;
    const siteId = body.site_id;
    if (
        typeof rawDomain !== "string" ||
        !rawDomain.trim() ||
        typeof siteId !== "string" ||
        !UUID_RE.test(siteId)
    ) {
        return jsonResponse({ success: false, error: "domain and site_id are required" }, 400);
    }

    // ── Validate URL + reject private hostnames ─────────────────────────
    let formattedUrl = rawDomain.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
    }
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(formattedUrl);
    } catch {
        return jsonResponse({ success: false, error: "Invalid URL" }, 400);
    }
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
        return jsonResponse({ success: false, error: "Only http/https URLs are allowed" }, 400);
    }
    try {
        await assertPublicHost(parsedUrl.hostname);
    } catch (err) {
        const isPrivate = err instanceof SafeFetchError && err.reason === "private_address";
        return jsonResponse(
            {
                success: false,
                error: isPrivate
                    ? "Internal/private addresses are not allowed"
                    : "Could not resolve domain",
            },
            400,
        );
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
        return jsonResponse({ success: false, error: "Firecrawl connector not configured" }, 500);
    }

    // ── Ownership + verification check (RLS-bound) ──────────────────────
    // Belt-and-braces explicit user_id filter; RLS on `sites` already
    // enforces it. A missing row → forbidden (no existence-leak oracle).
    const { data: site, error: siteErr } = await userClient
        .from("sites")
        .select("id, verified")
        .eq("id", siteId)
        .eq("user_id", user.id)
        .maybeSingle<{ id: string; verified: boolean }>();
    if (siteErr) {
        console.error("scrape-site: site lookup failed:", siteErr.message);
        return jsonResponse({ success: false, error: "Lookup failed" }, 500);
    }
    if (!site) {
        return jsonResponse({ success: false, error: "Forbidden" }, 403);
    }
    if (!site.verified) {
        return jsonResponse(
            { success: false, error: "Domain must be verified before scraping" },
            403,
        );
    }

    // Mark scraping. If this fails, surface — we don't want to start a
    // Firecrawl job we can't reflect in the DB.
    const { error: markErr } = await userClient
        .from("sites")
        .update({ scrape_status: "scraping" })
        .eq("id", siteId);
    if (markErr) {
        console.error("scrape-site: status update failed:", markErr.message);
        return jsonResponse({ success: false, error: "Failed to mark site scraping" }, 500);
    }

    await logAudit(serviceClient, {
        userId: user.id,
        action: "scrape_site",
        tableName: "sites",
        recordId: siteId,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        meta: { domain: formattedUrl },
    });

    // Helper for the failure path — flip status to error and return 500.
    const fail = async (message: string, detail?: unknown): Promise<Response> => {
        await userClient
            .from("sites")
            .update({ scrape_status: "error" })
            .eq("id", siteId)
            .then(() => undefined, () => undefined);
        await logAudit(serviceClient, {
            userId: user.id,
            action: "scrape_site_failed",
            tableName: "sites",
            recordId: siteId,
            ip: clientIp(req),
            userAgent: req.headers.get("user-agent"),
            meta: { domain: formattedUrl, error: message },
        });
        if (detail !== undefined) console.error("scrape-site:", message, detail);
        return jsonResponse({ success: false, error: message }, 500);
    };

    // ── Wipe previous content (RLS-bound) ───────────────────────────────
    // Order matters: `content_blocks` carries `page_id REFERENCES site_pages
    // ON DELETE CASCADE`, so deleting site_pages alone would suffice — we
    // do both explicitly for parity with the legacy handler and so a
    // partial delete leaves nothing inconsistent.
    {
        const { error: blocksErr } = await userClient
            .from("content_blocks")
            .delete()
            .eq("site_id", siteId);
        if (blocksErr) return fail("Failed to clear previous content", blocksErr);

        const { error: pagesErr } = await userClient
            .from("site_pages")
            .delete()
            .eq("site_id", siteId);
        if (pagesErr) return fail("Failed to clear previous pages", pagesErr);
    }

    // ── Kick off Firecrawl ──────────────────────────────────────────────
    let crawlData: { id?: string; error?: string };
    let crawlResp: Response;
    try {
        crawlResp = await fetch(`${FIRECRAWL_BASE}/crawl`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                url: formattedUrl,
                limit: CRAWL_LIMIT,
                scrapeOptions: { formats: ["markdown", "html"] },
            }),
        });
        crawlData = (await crawlResp.json()) as { id?: string; error?: string };
    } catch (err) {
        return fail("Failed to reach Firecrawl", err);
    }
    if (!crawlResp.ok) {
        return fail(crawlData.error || "Crawl failed", crawlData);
    }
    const jobId = crawlData.id;
    if (!jobId) {
        return fail("No crawl job ID returned", crawlData);
    }

    // ── Poll for completion ─────────────────────────────────────────────
    let results: FirecrawlPage[] | null = null;
    for (let i = 0; i < POLL_MAX_ITERATIONS; i++) {
        await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
        let statusResp: Response;
        let statusData: FirecrawlStatus;
        try {
            statusResp = await fetch(`${FIRECRAWL_BASE}/crawl/${jobId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            statusData = (await statusResp.json()) as FirecrawlStatus;
        } catch (err) {
            return fail("Failed to poll Firecrawl", err);
        }
        if (statusData.status === "completed") {
            results = statusData.data ?? [];
            break;
        }
        if (statusData.status === "failed") {
            return fail("Crawl job failed", statusData);
        }
    }
    if (!results?.length) {
        return fail("Crawl timed out or returned no results");
    }

    // ── Persist pages + blocks ──────────────────────────────────────────
    let totalBlocks = 0;
    for (const page of results) {
        const pageUrl = page.metadata?.sourceURL ?? page.url ?? formattedUrl;
        const pageTitle = page.metadata?.title ?? "Untitled";
        const markdown = page.markdown ?? "";
        const html = page.html ?? "";
        const blocks = parseMarkdownToBlocks(markdown);

        const { data: pageRow, error: pageErr } = await userClient
            .from("site_pages")
            .insert({
                site_id: siteId,
                url: pageUrl,
                title: pageTitle,
                markdown,
                html,
                metadata: page.metadata ?? {},
            })
            .select("id")
            .single<{ id: string }>();
        if (pageErr || !pageRow) {
            return fail("Failed to insert page", pageErr);
        }

        if (blocks.length > 0) {
            const rows = blocks.map((b, idx) => ({
                site_id: siteId,
                page_id: pageRow.id,
                heading: sanitizeContent(b.heading),
                body: sanitizeContent(b.body),
                images: b.images,
                category: b.category,
                block_order: idx,
            }));
            const { error: insErr } = await userClient.from("content_blocks").insert(rows);
            if (insErr) {
                return fail("Failed to insert content blocks", insErr);
            }
            totalBlocks += blocks.length;
        }
    }

    // ── Mark complete ───────────────────────────────────────────────────
    const { error: doneErr } = await userClient
        .from("sites")
        .update({
            scrape_status: "completed",
            page_count: results.length,
            last_scraped_at: new Date().toISOString(),
        })
        .eq("id", siteId);
    if (doneErr) {
        return fail("Failed to mark site complete", doneErr);
    }

    await logAudit(serviceClient, {
        userId: user.id,
        action: "scrape_site_completed",
        tableName: "sites",
        recordId: siteId,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        meta: { domain: formattedUrl, pages: results.length, blocks: totalBlocks },
    });

    return jsonResponse({ success: true, pages: results.length, blocks: totalBlocks });
});

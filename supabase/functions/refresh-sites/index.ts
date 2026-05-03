// refresh-sites — cron-triggered re-scrape of stale verified sites.
//
// POST (no body required)
//
// Auth: shared bearer secret in `Authorization: Bearer <REFRESH_SECRET>`,
// timing-safe compared. There is no JWT — deploy with `--no-verify-jwt`
// so the SPanel cron job (or any caller that holds the secret) can hit
// it directly. The secret never reaches the database.
//
// Behaviour matches `api/routes/refresh-sites.ts`:
//   1. Pick up to 5 verified sites whose `last_scraped_at` is older than
//      `refresh_interval_hours` (or NULL), and that aren't already mid-
//      scrape, ordered oldest-first.
//   2. For each, re-verify ownership using the same DNS-TXT / meta-tag
//      flow as `verify-domain`. If the proof is gone, flip
//      `verified=false` and record `verification_lapsed`.
//   3. Otherwise validate the URL (`assertPublicHost`), mark the site
//      `scraping`, wipe its `content_blocks` + `site_pages`, run a
//      Firecrawl crawl (same 30×2s poll budget as `scrape-site`),
//      persist new pages + blocks, mark `completed`.
//   4. On any failure mid-flight, flip the site to `error` and record
//      the message in the per-site result.
//
// All DB access goes through the service-role client because there is
// no user JWT in the cron path. RLS doesn't apply to that role.

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/auth.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";
import {
    assertPublicHost,
    dnsTxt,
    safeFetch,
    SafeFetchError,
} from "../_shared/safe-fetch.ts";
import { sanitizeContent } from "../_shared/sanitize-content.ts";

const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";
const CRAWL_LIMIT = 20;
const POLL_INTERVAL_MS = 2_000;
const POLL_MAX_ITERATIONS = 30;
const STALE_BATCH_SIZE = 5;

interface StaleSite {
    id: string;
    domain: string;
    user_id: string;
    verification_token: string | null;
    verification_method: "dns_txt" | "meta_tag" | string | null;
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

interface RefreshResult {
    id: string;
    domain: string;
    status: string;
}

// ── Constant-time bearer-secret compare ─────────────────────────────────────
function timingSafeEqualStr(a: string, b: string): boolean {
    const aBuf = new TextEncoder().encode(a);
    const bBuf = new TextEncoder().encode(b);
    if (aBuf.length !== bBuf.length) return false;
    let diff = 0;
    for (let i = 0; i < aBuf.length; i++) diff |= aBuf[i] ^ bBuf[i];
    return diff === 0;
}

// ── Markdown parser (kept in lockstep with scrape-site) ─────────────────────
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

// ── Re-verification helpers ─────────────────────────────────────────────────
async function reVerifyDomain(site: StaleSite): Promise<boolean> {
    if (!site.verification_token) return false;

    let host = site.domain.trim();
    try {
        const u = new URL(host.startsWith("http") ? host : `https://${host}`);
        host = u.hostname;
    } catch {
        return false;
    }

    if (site.verification_method === "meta_tag") {
        try {
            const resp = await safeFetch(`https://${host}`, {
                userAgent: "60WattVerifyBot/1.0",
                timeoutMs: 10_000,
            });
            if (!resp.ok) return false;
            const html = await resp.text();
            const pattern = /<meta\s+[^>]*name\s*=\s*["']60watt-verify["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/i;
            const altPattern = /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']60watt-verify["'][^>]*\/?>/i;
            const match = html.match(pattern) || html.match(altPattern);
            return match?.[1] === site.verification_token;
        } catch {
            return false;
        }
    }

    // Default: DNS TXT (matches legacy fallback behaviour).
    try {
        const records = await dnsTxt(`_60watt-verify.${host}`);
        return records.some((value) => value === site.verification_token);
    } catch {
        return false;
    }
}

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;
    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // ── Bearer-secret auth ──────────────────────────────────────────────
    const expected = Deno.env.get("REFRESH_SECRET");
    if (!expected) {
        return jsonResponse({ error: "REFRESH_SECRET not configured" }, 500);
    }
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
        return jsonResponse({ error: "Invalid refresh secret" }, 401);
    }
    const provided = authHeader.slice(7);
    if (!timingSafeEqualStr(provided, expected)) {
        return jsonResponse({ error: "Invalid refresh secret" }, 401);
    }

    const serviceOrErr = getServiceClient();
    if (serviceOrErr instanceof Response) return serviceOrErr;
    const serviceClient = serviceOrErr;

    // ── Find stale sites via SQL RPC ────────────────────────────────────
    // PostgREST can't express the `(refresh_interval_hours||' hours')::interval`
    // comparison cleanly, so we reach for an RPC. The RPC is added in
    // migration `0006_refresh_sites_helpers.sql` and is `security definer`
    // bound to the service role.
    const { data: staleData, error: staleErr } = await serviceClient.rpc(
        "find_stale_sites",
        { batch_size: STALE_BATCH_SIZE },
    );
    if (staleErr) {
        console.error("refresh-sites: stale lookup failed:", staleErr.message);
        return jsonResponse({ error: "Failed to load stale sites" }, 500);
    }
    const staleSites = (staleData ?? []) as StaleSite[];
    if (staleSites.length === 0) {
        return jsonResponse({ refreshed: 0, sites: [], message: "All sites are fresh" });
    }

    const apiKey = Deno.env.get("FIRECRAWL_API_KEY");
    if (!apiKey) {
        return jsonResponse({ error: "FIRECRAWL_API_KEY not set" }, 500);
    }

    const results: RefreshResult[] = [];
    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");

    for (const site of staleSites) {
        try {
            // Re-verify ownership before touching the site.
            const stillVerified = await reVerifyDomain(site);
            if (!stillVerified) {
                await serviceClient
                    .from("sites")
                    .update({ verified: false, updated_at: new Date().toISOString() })
                    .eq("id", site.id);
                results.push({ id: site.id, domain: site.domain, status: "verification_lapsed" });
                await logAudit(serviceClient, {
                    userId: site.user_id,
                    action: "refresh_site",
                    tableName: "sites",
                    recordId: site.id,
                    ip,
                    userAgent,
                    meta: { domain: site.domain, status: "verification_lapsed" },
                });
                continue;
            }

            // Format + SSRF-validate the URL before handing it to Firecrawl.
            let formattedUrl = site.domain.trim();
            if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
                formattedUrl = `https://${formattedUrl}`;
            }
            let parsedUrl: URL;
            try {
                parsedUrl = new URL(formattedUrl);
            } catch {
                throw new Error("Invalid URL");
            }
            if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
                throw new Error("Only http/https URLs are allowed");
            }
            try {
                await assertPublicHost(parsedUrl.hostname);
            } catch (err) {
                if (err instanceof SafeFetchError && err.reason === "private_address") {
                    throw new Error("Internal/private addresses are not allowed");
                }
                throw new Error("Could not resolve domain");
            }

            // Wipe previous content. `content_blocks.page_id` cascades from
            // `site_pages`, but we delete both for parity with the legacy
            // handler so a partial delete leaves nothing inconsistent.
            const { error: blocksDelErr } = await serviceClient
                .from("content_blocks")
                .delete()
                .eq("site_id", site.id);
            if (blocksDelErr) throw new Error(`Failed to clear blocks: ${blocksDelErr.message}`);
            const { error: pagesDelErr } = await serviceClient
                .from("site_pages")
                .delete()
                .eq("site_id", site.id);
            if (pagesDelErr) throw new Error(`Failed to clear pages: ${pagesDelErr.message}`);

            const { error: markErr } = await serviceClient
                .from("sites")
                .update({ scrape_status: "scraping" })
                .eq("id", site.id);
            if (markErr) throw new Error(`Failed to mark scraping: ${markErr.message}`);

            // Kick off Firecrawl.
            const crawlResp = await fetch(`${FIRECRAWL_BASE}/crawl`, {
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
            const crawlData = (await crawlResp.json()) as { id?: string; error?: string };
            if (!crawlResp.ok) throw new Error(crawlData.error || "Crawl failed");
            const jobId = crawlData.id;
            if (!jobId) throw new Error("No crawl job ID returned");

            // Poll until completion (60 s budget).
            let crawlResults: FirecrawlPage[] | null = null;
            for (let i = 0; i < POLL_MAX_ITERATIONS; i++) {
                await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
                const statusResp = await fetch(`${FIRECRAWL_BASE}/crawl/${jobId}`, {
                    headers: { Authorization: `Bearer ${apiKey}` },
                });
                const statusData = (await statusResp.json()) as FirecrawlStatus;
                if (statusData.status === "completed") {
                    crawlResults = statusData.data ?? [];
                    break;
                }
                if (statusData.status === "failed") {
                    throw new Error("Crawl job failed");
                }
            }
            if (!crawlResults?.length) throw new Error("Crawl timed out or returned no results");

            let totalBlocks = 0;
            for (const page of crawlResults) {
                const pageUrl = page.metadata?.sourceURL ?? page.url ?? formattedUrl;
                const pageTitle = page.metadata?.title ?? "Untitled";
                const markdown = page.markdown ?? "";
                const html = page.html ?? "";

                const { data: pageRow, error: pageErr } = await serviceClient
                    .from("site_pages")
                    .insert({
                        site_id: site.id,
                        url: pageUrl,
                        title: pageTitle,
                        markdown,
                        html,
                        metadata: page.metadata ?? {},
                    })
                    .select("id")
                    .single<{ id: string }>();
                if (pageErr || !pageRow) {
                    throw new Error(`Failed to insert page: ${pageErr?.message ?? "unknown"}`);
                }

                const blocks = parseMarkdownToBlocks(markdown);
                if (blocks.length > 0) {
                    const rows = blocks.map((b, idx) => ({
                        site_id: site.id,
                        page_id: pageRow.id,
                        heading: sanitizeContent(b.heading),
                        body: sanitizeContent(b.body),
                        images: b.images,
                        category: b.category,
                        block_order: idx,
                    }));
                    const { error: insErr } = await serviceClient
                        .from("content_blocks")
                        .insert(rows);
                    if (insErr) throw new Error(`Failed to insert blocks: ${insErr.message}`);
                    totalBlocks += blocks.length;
                }
            }

            const { error: doneErr } = await serviceClient
                .from("sites")
                .update({
                    scrape_status: "completed",
                    page_count: crawlResults.length,
                    last_scraped_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                })
                .eq("id", site.id);
            if (doneErr) throw new Error(`Failed to mark complete: ${doneErr.message}`);

            results.push({ id: site.id, domain: site.domain, status: "refreshed" });
            await logAudit(serviceClient, {
                userId: site.user_id,
                action: "refresh_site",
                tableName: "sites",
                recordId: site.id,
                ip,
                userAgent,
                meta: {
                    domain: site.domain,
                    status: "refreshed",
                    pages: crawlResults.length,
                    blocks: totalBlocks,
                },
            });
        } catch (err) {
            const message = err instanceof Error ? err.message : "unknown";
            console.error("refresh-sites: scrape failed", { domain: site.domain, message });
            await serviceClient
                .from("sites")
                .update({ scrape_status: "error" })
                .eq("id", site.id)
                .then(() => undefined, () => undefined);
            results.push({ id: site.id, domain: site.domain, status: `error: ${message}` });
            await logAudit(serviceClient, {
                userId: site.user_id,
                action: "refresh_site",
                tableName: "sites",
                recordId: site.id,
                ip,
                userAgent,
                meta: { domain: site.domain, status: "error", error: message },
            });
        }
    }

    return jsonResponse({
        refreshed: results.filter((r) => r.status === "refreshed").length,
        sites: results,
    });
});

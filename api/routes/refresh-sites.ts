/**
 * refresh-sites — find stale sites and re-scrape them.
 * POST /api/functions/refresh-sites
 *
 * Protected by a shared secret header (not JWT) so cron jobs can call it:
 *   Authorization: Bearer <REFRESH_SECRET>
 *
 * Required environment variables:
 *   REFRESH_SECRET    — shared secret for cron authentication
 *   FIRECRAWL_API_KEY — passed through to scrape-site logic
 */

import type { Request, Response } from "express";
import { serviceDb } from "../db.js";
import { handler as scrapeSiteHandler } from "./scrape-site.js";
import { logger } from "../logger.js";
import { sanitizeContent } from "../lib/sanitize-content.js";
import { promises as dns } from "node:dns";
import { timingSafeEqual } from "node:crypto";
import { safeFetch } from "../lib/safe-fetch.js";

export async function handler(req: Request, res: Response): Promise<void> {
    try {
        const secret = process.env.REFRESH_SECRET;
        if (!secret) {
            res.status(500).json({ error: "REFRESH_SECRET not configured" });
            return;
        }

        const authHeader = req.headers.authorization;
        if (!authHeader?.startsWith("Bearer ")) {
            res.status(401).json({ error: "Invalid refresh secret" });
            return;
        }
        const provided = Buffer.from(authHeader.slice(7));
        const expected = Buffer.from(secret);
        if (provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
            res.status(401).json({ error: "Invalid refresh secret" });
            return;
        }

        // Find sites that are stale: never scraped or last_scraped_at older than refresh_interval_hours
        // Only refresh verified sites
        const { rows: staleSites } = await serviceDb.query(`
            SELECT id, domain, user_id, verification_token, verification_method
            FROM sites
            WHERE verified = TRUE
              AND scrape_status != 'scraping'
              AND (
                last_scraped_at IS NULL
                OR last_scraped_at < NOW() - (refresh_interval_hours || ' hours')::INTERVAL
              )
            ORDER BY last_scraped_at ASC NULLS FIRST
            LIMIT 5
        `);

        if (!staleSites.length) {
            res.json({ refreshed: 0, sites: [], message: "All sites are fresh" });
            return;
        }

        const results: { id: string; domain: string; status: string }[] = [];

        for (const site of staleSites) {
            try {
                // Re-verify domain ownership before refreshing
                const stillVerified = await reVerifyDomain(site.domain, site.verification_token, site.verification_method);
                if (!stillVerified) {
                    await serviceDb.query(
                        "UPDATE sites SET verified = FALSE, updated_at = NOW() WHERE id = $1",
                        [site.id],
                    );
                    results.push({ id: site.id, domain: site.domain, status: "verification_lapsed" });
                    continue;
                }

                // Build a fake request with the site owner's JWT-like context
                // We call the DB directly instead of going through the HTTP handler
                // to avoid needing per-user JWTs.
                await serviceDb.query("DELETE FROM content_blocks WHERE site_id = $1", [site.id]);
                await serviceDb.query("DELETE FROM site_pages WHERE site_id = $1", [site.id]);
                await serviceDb.query("UPDATE sites SET scrape_status = 'scraping' WHERE id = $1", [site.id]);

                const apiKey = process.env.FIRECRAWL_API_KEY;
                if (!apiKey) throw new Error("FIRECRAWL_API_KEY not set");

                let formattedUrl = site.domain.trim();
                if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
                    formattedUrl = `https://${formattedUrl}`;
                }

                // SSRF protection — validate URL before sending to Firecrawl
                let parsedUrl: URL;
                try {
                    parsedUrl = new URL(formattedUrl);
                } catch {
                    throw new Error("Invalid URL");
                }
                if (!["http:", "https:"].includes(parsedUrl.protocol)) {
                    throw new Error("Only http/https URLs are allowed");
                }
                const hostname = parsedUrl.hostname;
                const privatePatterns = /^(127\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|192\.168\.|0\.|169\.254\.|::1|localhost|fc00|fd00|fe80)/i;
                if (privatePatterns.test(hostname)) {
                    throw new Error("Internal/private addresses are not allowed");
                }

                const crawlResponse = await fetch("https://api.firecrawl.dev/v1/crawl", {
                    method: "POST",
                    headers: {
                        Authorization: `Bearer ${apiKey}`,
                        "Content-Type": "application/json",
                    },
                    body: JSON.stringify({
                        url: formattedUrl,
                        limit: 20,
                        scrapeOptions: { formats: ["markdown", "html"] },
                    }),
                });

                const crawlData = (await crawlResponse.json()) as any;
                if (!crawlResponse.ok) throw new Error(crawlData.error || "Crawl failed");

                const jobId: string = crawlData.id;
                if (!jobId) throw new Error("No crawl job ID returned");

                // Poll for completion (max 60 s)
                let crawlResults: any[] | null = null;
                for (let i = 0; i < 30; i++) {
                    await new Promise((r) => setTimeout(r, 2000));
                    const statusResp = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
                        headers: { Authorization: `Bearer ${apiKey}` },
                    });
                    const statusData = (await statusResp.json()) as any;
                    if (statusData.status === "completed") {
                        crawlResults = statusData.data;
                        break;
                    } else if (statusData.status === "failed") {
                        throw new Error("Crawl job failed");
                    }
                }

                if (!crawlResults?.length) throw new Error("Crawl timed out or returned no results");

                let totalBlocks = 0;
                for (const page of crawlResults) {
                    const pageUrl: string = page.metadata?.sourceURL || page.url || formattedUrl;
                    const pageTitle: string = page.metadata?.title || "Untitled";
                    const markdown: string = page.markdown || "";
                    const html: string = page.html || "";

                    const pageResult = await serviceDb.query(
                        `INSERT INTO site_pages (site_id, url, title, markdown, html, metadata)
                         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                        [site.id, pageUrl, pageTitle, markdown, html, JSON.stringify(page.metadata || {})],
                    );
                    const pageId: string = pageResult.rows[0].id;

                    const blocks = parseMarkdownToBlocks(markdown);
                    for (let j = 0; j < blocks.length; j++) {
                        const b = blocks[j];
                        await serviceDb.query(
                            `INSERT INTO content_blocks (site_id, page_id, heading, body, images, category, block_order)
                             VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                            [site.id, pageId, sanitizeContent(b.heading), sanitizeContent(b.body), b.images, b.category, j],
                        );
                        totalBlocks++;
                    }
                }

                await serviceDb.query(
                    "UPDATE sites SET scrape_status = 'completed', page_count = $1, last_scraped_at = NOW(), updated_at = NOW() WHERE id = $2",
                    [crawlResults.length, site.id],
                );

                results.push({ id: site.id, domain: site.domain, status: "refreshed" });
            } catch (err) {
                logger.error({ err, domain: site.domain }, "refresh-sites: scrape failed");
                await serviceDb
                    .query("UPDATE sites SET scrape_status = 'error' WHERE id = $1", [site.id])
                    .catch(() => { });
                results.push({
                    id: site.id,
                    domain: site.domain,
                    status: `error: ${err instanceof Error ? err.message : "unknown"}`,
                });
            }
        }

        res.json({ refreshed: results.filter((r) => r.status === "refreshed").length, sites: results });
    } catch (err) {
        logger.error({ err }, "refresh-sites error");
        res.status(500).json({ error: err instanceof Error ? err.message : "Unknown error" });
    }
}

// ── Re-verification helper ──────────────────────────────────────────────────

async function reVerifyDomain(
    rawDomain: string,
    token: string | null,
    method: string | null,
): Promise<boolean> {
    if (!token) return false;

    let domain = rawDomain.trim();
    try {
        const url = new URL(domain.startsWith("http") ? domain : `https://${domain}`);
        domain = url.hostname;
    } catch {
        return false;
    }

    // Prefer the method used for original verification; fall back to DNS TXT.
    // Uses safeFetch so DNS rebinding / cloud-metadata SSRF is blocked at the
    // resolve+pin layer — the previous fetch() with `redirect: "follow"` and
    // no IP guard could be steered to private addresses by a hostile owner.
    if (method === "meta_tag") {
        try {
            const resp = await safeFetch(`https://${domain}`, {
                userAgent: "60WattVerifyBot/1.0",
                timeoutMs: 10_000,
            });
            if (!resp.ok) return false;
            const html = await resp.text();
            const pattern = /<meta\s+[^>]*name\s*=\s*["']60watt-verify["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/i;
            const altPattern = /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']60watt-verify["'][^>]*\/?>/i;
            const match = html.match(pattern) || html.match(altPattern);
            return match?.[1] === token;
        } catch {
            return false;
        }
    }

    // Default: DNS TXT
    try {
        const records = await dns.resolveTxt(`_60watt-verify.${domain}`);
        return records.some((parts) => parts.join("") === token);
    } catch {
        return false;
    }
}

// ── Markdown parser (shared with scrape-site) ──────────────────────────────
type Block = {
    heading: string | null;
    body: string | null;
    images: string[];
    category: string | null;
};

function parseMarkdownToBlocks(markdown: string): Block[] {
    const lines = markdown.split("\n");
    const blocks: Block[] = [];
    let currentBlock: Block | null = null;
    const bodyLines: string[] = [];

    const push = () => {
        if (currentBlock) {
            currentBlock.body = bodyLines.join("\n").trim();
            if (currentBlock.heading || currentBlock.body) blocks.push(currentBlock);
        }
        bodyLines.length = 0;
    };

    for (const line of lines) {
        if (line.startsWith("#")) {
            push();
            currentBlock = { heading: line.replace(/^#+\s*/, ""), body: null, images: [], category: null };
        } else {
            if (!currentBlock) currentBlock = { heading: null, body: null, images: [], category: null };
            bodyLines.push(line);
            const imgMatch = line.match(/!\[.*?\]\((.*?)\)/);
            if (imgMatch) currentBlock.images.push(imgMatch[1]);
        }
    }
    push();
    return blocks.filter((b) => b.heading || (b.body && b.body.length > 10));
}

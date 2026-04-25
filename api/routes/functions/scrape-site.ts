/**
 * scrape-site — crawl a domain and store content blocks.
 * POST /api/functions/scrape-site
 * Body: { domain: string, site_id: string }
 *
 * Requires env:  FIRECRAWL_API_KEY
 * Requires auth: Bearer JWT (user must own the site record).
 */

import type { Response } from "express";
import { db } from "../../db.js";
import { type AuthRequest } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { sanitizeContent } from "../../lib/sanitize-content.js";
import { assertPublicHost, SafeFetchError } from "../../lib/safe-fetch.js";
import { logger } from "../../logger.js";

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

export async function handler(req: AuthRequest, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
    }

    const { domain, site_id } = req.body as { domain?: string; site_id?: string };
    if (!domain || !site_id) {
        res.status(400).json({ success: false, error: "domain and site_id are required" });
        return;
    }

    // SSRF protection — validate URL before sending to Firecrawl
    let formattedUrl = domain.trim();
    if (!formattedUrl.startsWith("http://") && !formattedUrl.startsWith("https://")) {
        formattedUrl = `https://${formattedUrl}`;
    }
    let parsedUrl: URL;
    try {
        parsedUrl = new URL(formattedUrl);
    } catch {
        res.status(400).json({ success: false, error: "Invalid URL" });
        return;
    }
    if (!["http:", "https:"].includes(parsedUrl.protocol)) {
        res.status(400).json({ success: false, error: "Only http/https URLs are allowed" });
        return;
    }
    // Defense in depth: resolve the hostname and reject if it lands on a
    // private/loopback/link-local/CGNAT/cloud-metadata range. The previous
    // regex-only check passed any hostname that didn't *literally start with*
    // a private octet — so e.g. `attacker.com` resolving to 127.0.0.1 slipped
    // through. Firecrawl actually performs the crawl from their infra, so
    // the live SSRF surface lives in their network, but accepting an obviously
    // private hostname here would still let a user weaponize the verified-
    // domain check for internal recon. (verify-domain.ts also uses safeFetch,
    // which prevents verification of a private hostname in the first place —
    // this is the second layer.)
    try {
        await assertPublicHost(parsedUrl.hostname);
    } catch (err) {
        const message = err instanceof SafeFetchError && err.reason === "private_address"
            ? "Internal/private addresses are not allowed"
            : "Could not resolve domain";
        res.status(400).json({ success: false, error: message });
        return;
    }

    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
        res.status(500).json({ success: false, error: "Firecrawl connector not configured" });
        return;
    }

    // Verify the site belongs to the requesting user
    const siteCheck = await db.query("SELECT id, verified FROM sites WHERE id = $1 AND user_id = $2", [
        site_id,
        user.id,
    ]);
    if (!siteCheck.rows.length) {
        res.status(403).json({ success: false, error: "Forbidden" });
        return;
    }
    if (!siteCheck.rows[0].verified) {
        res.status(403).json({ success: false, error: "Domain must be verified before scraping" });
        return;
    }

    await db.query("UPDATE sites SET scrape_status = 'scraping' WHERE id = $1", [site_id]);

    // Audit log — track scrape actions
    logAudit({
        userId: user.id,
        action: "scrape_site",
        tableName: "sites",
        recordId: site_id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        meta: { domain: formattedUrl },
    });

    // Clear old data so re-scrape is a clean replace
    await db.query("DELETE FROM content_blocks WHERE site_id = $1", [site_id]);
    await db.query("DELETE FROM site_pages WHERE site_id = $1", [site_id]);

    try {
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
        if (!crawlResponse.ok) {
            await db.query("UPDATE sites SET scrape_status = 'error' WHERE id = $1", [site_id]);
            throw new Error(crawlData.error || "Crawl failed");
        }

        const jobId: string = crawlData.id;
        if (!jobId) {
            await db.query("UPDATE sites SET scrape_status = 'error' WHERE id = $1", [site_id]);
            throw new Error("No crawl job ID returned");
        }

        // Poll for completion (max 60 s)
        let results: any[] | null = null;
        for (let i = 0; i < 30; i++) {
            await new Promise((r) => setTimeout(r, 2000));
            const statusResp = await fetch(`https://api.firecrawl.dev/v1/crawl/${jobId}`, {
                headers: { Authorization: `Bearer ${apiKey}` },
            });
            const statusData = (await statusResp.json()) as any;
            if (statusData.status === "completed") {
                results = statusData.data;
                break;
            } else if (statusData.status === "failed") {
                await db.query("UPDATE sites SET scrape_status = 'error' WHERE id = $1", [site_id]);
                throw new Error("Crawl job failed");
            }
        }

        if (!results?.length) {
            await db.query("UPDATE sites SET scrape_status = 'error' WHERE id = $1", [site_id]);
            throw new Error("Crawl timed out or returned no results");
        }

        let totalBlocks = 0;
        for (const page of results) {
            const pageUrl: string = page.metadata?.sourceURL || page.url || formattedUrl;
            const pageTitle: string = page.metadata?.title || "Untitled";
            const markdown: string = page.markdown || "";
            const html: string = page.html || "";

            const pageResult = await db.query(
                `INSERT INTO site_pages (site_id, url, title, markdown, html, metadata)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
                [site_id, pageUrl, pageTitle, markdown, html, JSON.stringify(page.metadata || {})],
            );
            const pageId: string = pageResult.rows[0].id;

            const blocks = parseMarkdownToBlocks(markdown);
            for (let i = 0; i < blocks.length; i++) {
                const b = blocks[i];
                await db.query(
                    `INSERT INTO content_blocks (site_id, page_id, heading, body, images, category, block_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
                    [site_id, pageId, sanitizeContent(b.heading), sanitizeContent(b.body), b.images, b.category, i],
                );
                totalBlocks++;
            }
        }

        await db.query(
            "UPDATE sites SET scrape_status = 'completed', page_count = $1, last_scraped_at = NOW(), updated_at = NOW() WHERE id = $2",
            [results.length, site_id],
        );

        res.json({ success: true, pages: results.length, blocks: totalBlocks });
    } catch (err) {
        logger.error({ err }, "scrape-site error");
        await db
            .query("UPDATE sites SET scrape_status = 'error' WHERE id = $1", [site_id])
            .catch(() => { });
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

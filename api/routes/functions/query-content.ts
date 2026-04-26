/**
 * query-content — semantic search over stored content blocks.
 * POST /api/functions/query-content
 * Body: { query: string, site_id?: string }
 *
 * Uses LaunchLemonade as the AI provider:
 *   LEMONADE_API_KEY    — your LaunchLemonade API key
 *   LEMONADE_CONTENT_ID — content agent ID
 */

import type { Response } from "express";
import type { AuthRequest } from "../../middleware/auth.js";
import { sanitiseInput } from "../../lib/sanitise.js";
import { logAudit } from "../../lib/audit.js";
import { logger } from "../../logger.js";

export async function handler(req: AuthRequest, res: Response): Promise<void> {
    try {
        const { query, site_id } = req.body as { query?: string; site_id?: string };
        if (!query) {
            res.status(400).json({ success: false, error: "query is required" });
            return;
        }
        if (!site_id) {
            res.status(400).json({ success: false, error: "site_id is required" });
            return;
        }

        // Server-side input sanitisation
        const sanitised = sanitiseInput(query);
        if (sanitised.blocked) {
            res.status(400).json({ success: false, error: sanitised.reason });
            return;
        }
        const cleanQuery = sanitised.text;

        // Verify the authenticated user owns this site, then fetch content
        // blocks — grouped in one transaction so both queries share RLS context.
        const blocks = await req.withClient!(async (c) => {
            const { rows: siteRows } = await c.query(
                "SELECT id FROM sites WHERE id = $1 AND user_id = $2",
                [site_id, req.user!.id],
            );
            if (siteRows.length === 0) {
                return null;
            }
            const { rows } = await c.query(
                `SELECT id, heading, body, images, category, tags, block_order, page_id
                 FROM content_blocks
                 WHERE site_id = $1 AND visibility = 'public'
                 ORDER BY block_order LIMIT 200`,
                [site_id],
            );
            return rows;
        });
        if (blocks === null) {
            res.status(403).json({ success: false, error: "Site not found or access denied" });
            return;
        }

        if (!blocks.length) {
            res.json({ success: true, blocks: [], message: "No content available yet" });
            return;
        }

        const LEMONADE_API_KEY = process.env.LEMONADE_API_KEY;
        const LEMONADE_CONTENT_ID = process.env.LEMONADE_CONTENT_ID;

        if (!LEMONADE_API_KEY || !LEMONADE_CONTENT_ID) {
            res.status(500).json({ success: false, error: "LaunchLemonade not configured" });
            return;
        }

        // Summarise blocks for the AI
        const blockSummaries = blocks
            .map((b: any, i: number) => `[${i}] ${b.heading || "No heading"}: ${String(b.body || "").slice(0, 200)}`)
            .join("\n");

        const message =
            `You are a content routing AI. Given a user query and a list of content blocks, return the indices of the 3-5 most relevant blocks. Return ONLY a JSON array of indices, e.g. [0, 3, 7]. If nothing is relevant, return [].\n\n` +
            `Query: "${cleanQuery}"\n\nContent blocks:\n${blockSummaries}`;

        const aiResponse = await fetch("https://api.launchlemonade.app/v1/chat", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${LEMONADE_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                lemonade_id: LEMONADE_CONTENT_ID,
                message,
            }),
        });

        if (!aiResponse.ok) {
            const status = aiResponse.status;
            if (status === 429) {
                res.status(429).json({ error: "Rate limited, please try again shortly." });
                return;
            }
            res.status(500).json({ error: "AI gateway error" });
            return;
        }

        const aiData = (await aiResponse.json()) as any;
        const content: string = aiData.response || "[]";
        const jsonMatch = content.match(/\[[\d,\s]*\]/);
        const indices: number[] = jsonMatch ? (JSON.parse(jsonMatch[0]) as number[]) : [];

        const matchedBlocks = indices
            .filter((i) => i >= 0 && i < blocks.length)
            .map((i) => blocks[i]);

        // Audit log — track content queries
        logAudit({
            userId: req.user!.id,
            action: "query_content",
            ip: req.ip,
            userAgent: req.headers["user-agent"],
            meta: { site_id, results: matchedBlocks.length },
        });

        res.json({ success: true, blocks: matchedBlocks });
    } catch (err) {
        logger.error({ err }, "query-content error");
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

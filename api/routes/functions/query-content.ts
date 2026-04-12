/**
 * query-content — semantic search over stored content blocks.
 * POST /api/functions/query-content
 * Body: { query: string, site_id?: string }
 *
 * Uses the AI gateway configured via environment variables:
 *   AI_API_URL   — base URL of the AI-compatible chat completions API
 *   AI_API_KEY   — bearer key for the AI gateway
 *   AI_MODEL     — model identifier (default: gpt-4o-mini)
 */

import type { Request, Response } from "express";
import { db } from "../../db.js";

export async function handler(req: Request, res: Response): Promise<void> {
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

        // Fetch content blocks scoped to the requested site
        const { rows: blocks } = await db.query(
            `SELECT id, heading, body, images, category, tags, block_order, page_id
             FROM content_blocks
             WHERE site_id = $1
             ORDER BY block_order LIMIT 200`,
            [site_id],
        );

        if (!blocks.length) {
            res.json({ success: true, blocks: [], message: "No content available yet" });
            return;
        }

        const AI_API_URL = process.env.AI_API_URL;
        const AI_API_KEY = process.env.AI_API_KEY;
        const AI_MODEL = process.env.AI_MODEL || "gpt-4o-mini";

        if (!AI_API_URL || !AI_API_KEY) {
            res.status(500).json({ success: false, error: "AI gateway not configured" });
            return;
        }

        // Summarise blocks for the AI
        const blockSummaries = blocks
            .map((b: any, i: number) => `[${i}] ${b.heading || "No heading"}: ${String(b.body || "").slice(0, 200)}`)
            .join("\n");

        const aiResponse = await fetch(`${AI_API_URL}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${AI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: AI_MODEL,
                messages: [
                    {
                        role: "system",
                        content:
                            "You are a content routing AI. Given a user query and a list of content blocks, return the indices of the 3-5 most relevant blocks. Return ONLY a JSON array of indices, e.g. [0, 3, 7]. If nothing is relevant, return [].",
                    },
                    {
                        role: "user",
                        content: `Query: "${query}"\n\nContent blocks:\n${blockSummaries}`,
                    },
                ],
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
        const content: string = aiData.choices?.[0]?.message?.content || "[]";
        const jsonMatch = content.match(/\[[\d,\s]*\]/);
        const indices: number[] = jsonMatch ? (JSON.parse(jsonMatch[0]) as number[]) : [];

        const matchedBlocks = indices
            .filter((i) => i >= 0 && i < blocks.length)
            .map((i) => blocks[i]);

        res.json({ success: true, blocks: matchedBlocks });
    } catch (err) {
        console.error("query-content error:", err);
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

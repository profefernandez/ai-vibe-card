/**
 * lemonade-chat — proxy to LaunchLemonade chat API.
 * POST /api/functions/lemonade-chat
 * Body: { message: string, conversation_id?: string }
 *
 * Required environment variables:
 *   LEMONADE_API_KEY  — your LaunchLemonade API key
 *   LEMONADE_ID       — your Lemonade agent ID
 */

import type { Request, Response } from "express";
import { db } from "../../db.js";

const LEMONADE_API_URL = "https://api.launchlemonade.app/v1/chat";

export async function handler(req: Request, res: Response): Promise<void> {
    try {
        const { message, conversation_id } = req.body as {
            message?: string;
            conversation_id?: string;
        };

        if (!message || !message.trim()) {
            res.status(400).json({ error: "message is required" });
            return;
        }

        const apiKey = process.env.LEMONADE_API_KEY;
        const lemonadeId = process.env.LEMONADE_ID;

        if (!apiKey || !lemonadeId) {
            res.status(500).json({ error: "Lemonade API not configured. Set LEMONADE_API_KEY and LEMONADE_ID." });
            return;
        }

        // Fetch fresh content blocks from our own scraping pipeline
        let siteContext = "";
        try {
            const { rows: blocks } = await db.query(
                `SELECT heading, body FROM content_blocks
                 ORDER BY block_order LIMIT 30`
            );
            if (blocks.length) {
                siteContext = blocks
                    .map((b: any) => `${b.heading || ""}: ${(b.body || "").slice(0, 300)}`)
                    .join("\n");
            }
        } catch (err) {
            // DB may be unavailable — continue without context
            console.warn("lemonade-chat: could not fetch content blocks:", err);
        }

        // Augment the user message with fresh website content
        const augmentedMessage = siteContext
            ? `[Latest website content]\n${siteContext}\n\n[Visitor question]\n${message.trim()}`
            : message.trim();

        const payload: Record<string, string> = {
            lemonade_id: lemonadeId,
            message: augmentedMessage,
        };
        if (conversation_id) {
            payload.conversation_id = conversation_id;
        }

        const response = await fetch(LEMONADE_API_URL, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${apiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            const errorBody = await response.text();
            let parsed: unknown;
            try {
                parsed = JSON.parse(errorBody);
            } catch {
                parsed = { message: errorBody };
            }
            res.status(response.status).json({
                error: (parsed as Record<string, unknown>)?.error ?? parsed,
            });
            return;
        }

        const data = await response.json();
        res.json({
            response: data.response,
            conversation_id: data.conversation_id,
            tokens_used: data.tokens_used,
        });
    } catch (err) {
        console.error("lemonade-chat error:", err);
        res.status(500).json({
            error: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

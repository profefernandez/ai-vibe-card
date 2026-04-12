/**
 * test-api-connection — validate an external AI provider API key.
 * POST /api/functions/test-api-connection
 * Body: { provider: "openai" | "anthropic" | "google" | "lemonade" }
 *
 * The API key is looked up server-side from api_connections for the
 * authenticated user — it is NEVER sent from the client.
 * Requires: requireAuth middleware (applied in functions/index.ts)
 */

import type { Response } from "express";
import type { AuthRequest } from "../../middleware/auth.js";
import { db } from "../../db.js";

export async function handler(req: AuthRequest, res: Response): Promise<void> {
    const { provider } = req.body as { provider?: string };

    if (!provider) {
        res.status(400).json({ success: false, error: "Missing provider" });
        return;
    }

    try {
        // Look up the stored API key for this user + provider
        const { rows } = await db.query(
            `SELECT api_key_encrypted FROM api_connections WHERE user_id = $1 AND provider = $2`,
            [req.user!.id, provider],
        );
        const api_key = rows[0]?.api_key_encrypted;
        if (!api_key) {
            res.status(404).json({ success: false, error: "No API key stored for this provider" });
            return;
        }

        let testUrl = "";
        let testHeaders: Record<string, string> = {};
        let testBody = "";

        switch (provider) {
            case "openai":
                testUrl = "https://api.openai.com/v1/models";
                testHeaders = { Authorization: `Bearer ${api_key}` };
                break;

            case "anthropic":
                testUrl = "https://api.anthropic.com/v1/messages";
                testHeaders = {
                    "x-api-key": api_key,
                    "anthropic-version": "2023-06-01",
                    "Content-Type": "application/json",
                };
                testBody = JSON.stringify({
                    model: "claude-3-haiku-20240307",
                    max_tokens: 1,
                    messages: [{ role: "user", content: "hi" }],
                });
                break;

            case "google":
                testUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(api_key)}`;
                break;

            case "lemonade":
                res.json({ success: true, message: "Key stored. Launch Lemonade integration ready." });
                return;

            default:
                res.status(400).json({ success: false, error: "Unknown provider" });
                return;
        }

        const fetchOpts: RequestInit = { method: testBody ? "POST" : "GET", headers: testHeaders };
        if (testBody) fetchOpts.body = testBody;

        const apiRes = await fetch(testUrl, fetchOpts);
        const success = apiRes.ok;

        res.json({ success, error: success ? null : `API returned ${apiRes.status}` });
    } catch (err) {
        console.error("test-api-connection error:", err);
        res.status(500).json({
            success: false,
            error: err instanceof Error ? err.message : "Unknown error",
        });
    }
}

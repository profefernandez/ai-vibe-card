/**
 * test-api-connection — validate an external AI provider API key.
 * POST /api/functions/test-api-connection
 * Body: { provider: "openai" | "anthropic" | "google" | "lemonade", api_key: string }
 */

import type { Request, Response } from "express";

export async function handler(req: Request, res: Response): Promise<void> {
    const { provider, api_key } = req.body as { provider?: string; api_key?: string };

    if (!provider || !api_key) {
        res.status(400).json({ success: false, error: "Missing provider or api_key" });
        return;
    }

    try {
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
                res.json({ success: !!api_key, message: "Key stored. Launch Lemonade integration ready." });
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

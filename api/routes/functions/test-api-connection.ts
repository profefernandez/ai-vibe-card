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
import { decrypt, isEncrypted } from "../../lib/crypto.js";
import { logAudit } from "../../lib/audit.js";
import { logger } from "../../logger.js";

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
        const raw = rows[0]?.api_key_encrypted;
        if (!raw) {
            res.status(404).json({ success: false, error: "No API key stored for this provider" });
            return;
        }
        // Decrypt if encrypted, support legacy plaintext gracefully
        const api_key = isEncrypted(raw) ? decrypt(raw) : raw;

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

            case "lemonade": {
                // Verify the Lemonade key against their health/models endpoint
                const lemonadeRes = await fetch("https://api.launchlemonade.app/v1/health", {
                    headers: { Authorization: `Bearer ${api_key}` },
                });
                if (!lemonadeRes.ok) {
                    res.json({ success: false, error: "Lemonade API connection failed" });
                } else {
                    res.json({ success: true, message: "Lemonade connection verified." });
                }
                logAudit({
                    userId: req.user!.id,
                    action: "test_api_connection",
                    meta: { provider, success: lemonadeRes.ok },
                });
                return;
            }

            default:
                res.status(400).json({ success: false, error: "Unknown provider" });
                return;
        }

        const fetchOpts: RequestInit = { method: testBody ? "POST" : "GET", headers: testHeaders };
        if (testBody) fetchOpts.body = testBody;

        const apiRes = await fetch(testUrl, fetchOpts);
        let success = apiRes.ok;
        let errorDetail: string | null = null;

        // Validate response body structure (not just HTTP status)
        if (success) {
            try {
                const body = await apiRes.json();
                if (provider === "openai" && !Array.isArray((body as any)?.data)) {
                    success = false;
                    errorDetail = "Unexpected response format from OpenAI";
                }
                if (provider === "google" && !Array.isArray((body as any)?.models)) {
                    success = false;
                    errorDetail = "Unexpected response format from Google";
                }
                // Anthropic returns a message object — if we got this far, status was ok
            } catch {
                success = false;
                errorDetail = "Could not parse API response";
            }
        } else {
            errorDetail = "API connection failed — check your key and try again";
        }

        logAudit({
            userId: req.user!.id,
            action: "test_api_connection",
            meta: { provider, success },
        });

        res.json({ success, error: errorDetail });
    } catch (err) {
        logger.error({ err }, "test-api-connection error");
        res.status(500).json({
            success: false,
            error: "Connection test failed. Please verify your API key and try again.",
        });
    }
}

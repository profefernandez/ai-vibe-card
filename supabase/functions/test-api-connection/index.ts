// test-api-connection — validate an external AI provider API key.
//
// POST { provider: "openai" | "anthropic" | "google" | "lemonade" }
//
// Behaviour parity with `api/routes/test-api-connection.ts`:
//   - Looks up the encrypted key from `api_connections` for the signed-in
//     user. The key is NEVER sent from the client.
//   - Decrypts (AES-256-GCM) using the Edge Function's ENCRYPTION_KEY secret.
//   - Probes the provider's lightest authenticated endpoint.
//   - Validates response body shape (not just HTTP status).
//   - Writes an `audit_log` row regardless of outcome.
//
// Auth: requires a valid Supabase JWT. The `api_connections` lookup runs
// through the user-scoped client so RLS enforces ownership — no chance of
// reading another user's key by guessing a provider id.
//
// Secrets required (set via `supabase secrets set`):
//   - ENCRYPTION_KEY — 64-char hex (same value as the legacy server)

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { decrypt, looksEncrypted } from "../_shared/crypto.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";

interface RequestBody {
    provider?: string;
}

const SUPPORTED = new Set(["openai", "anthropic", "google", "lemonade"]);

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    if (req.method !== "POST") {
        return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    const authed = await requireUser(req);
    if (authed instanceof Response) return authed;
    const { user, userClient, serviceClient } = authed;

    let body: RequestBody;
    try {
        body = (await req.json()) as RequestBody;
    } catch {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const provider = body.provider;
    if (!provider) {
        return jsonResponse({ success: false, error: "Missing provider" }, 400);
    }
    if (!SUPPORTED.has(provider)) {
        return jsonResponse({ success: false, error: "Unknown provider" }, 400);
    }

    // Look up the stored API key — RLS scopes this to the signed-in user.
    const { data: rows, error: lookupErr } = await userClient
        .from("api_connections")
        .select("id,api_key_encrypted")
        .eq("provider", provider)
        .limit(1);
    if (lookupErr) {
        console.error("api_connections lookup failed:", lookupErr.message);
        return jsonResponse(
            { success: false, error: "Connection test failed. Please try again." },
            500,
        );
    }
    const raw = (rows as Array<{ id: string; api_key_encrypted: string }> | null)?.[0]
        ?.api_key_encrypted;
    if (!raw) {
        return jsonResponse(
            { success: false, error: "No API key stored for this provider" },
            404,
        );
    }

    let apiKey: string;
    try {
        if (looksEncrypted(raw)) {
            apiKey = await decrypt(raw);
        } else {
            // Phase 5 transitional: accept plaintext but log a warning so
            // ops can finish the migration. Mirrors the Node handler.
            console.warn(
                `test-api-connection: api_connections row ${rows?.[0]?.id} is not encrypted — migrate via scripts/audit-api-keys.ts`,
            );
            apiKey = raw;
        }
    } catch (err) {
        console.error("Failed to decrypt api_connections row:", err);
        return jsonResponse(
            { success: false, error: "Connection test failed. Please try again." },
            500,
        );
    }

    const ip = clientIp(req);
    const userAgent = req.headers.get("user-agent");

    let probe: ProbeResult;
    try {
        probe = await probeProvider(provider, apiKey);
    } catch (err) {
        console.error("test-api-connection probe threw:", err);
        probe = {
            success: false,
            error: "Connection test failed. Please verify your API key and try again.",
        };
    }

    await logAudit(serviceClient, {
        userId: user.id,
        action: "test_api_connection",
        meta: { provider, success: probe.success },
        ip,
        userAgent,
    });

    return jsonResponse({ success: probe.success, error: probe.error ?? null });
});

interface ProbeResult {
    success: boolean;
    error?: string;
}

async function probeProvider(provider: string, apiKey: string): Promise<ProbeResult> {
    if (provider === "lemonade") {
        const res = await fetch("https://api.launchlemonade.app/v1/health", {
            headers: { Authorization: `Bearer ${apiKey}` },
        });
        return res.ok
            ? { success: true }
            : { success: false, error: "Lemonade API connection failed" };
    }

    let url = "";
    let headers: Record<string, string> = {};
    let reqBody: string | undefined;

    switch (provider) {
        case "openai":
            url = "https://api.openai.com/v1/models";
            headers = { Authorization: `Bearer ${apiKey}` };
            break;
        case "anthropic":
            url = "https://api.anthropic.com/v1/messages";
            headers = {
                "x-api-key": apiKey,
                "anthropic-version": "2023-06-01",
                "Content-Type": "application/json",
            };
            reqBody = JSON.stringify({
                model: "claude-3-haiku-20240307",
                max_tokens: 1,
                messages: [{ role: "user", content: "hi" }],
            });
            break;
        case "google":
            url = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
            break;
        default:
            return { success: false, error: "Unknown provider" };
    }

    const init: RequestInit = { method: reqBody ? "POST" : "GET", headers };
    if (reqBody) init.body = reqBody;

    const res = await fetch(url, init);
    if (!res.ok) {
        return {
            success: false,
            error: "API connection failed — check your key and try again",
        };
    }

    // Validate body shape (matches the legacy handler).
    try {
        const json = (await res.json()) as Record<string, unknown>;
        if (provider === "openai" && !Array.isArray(json?.data)) {
            return { success: false, error: "Unexpected response format from OpenAI" };
        }
        if (provider === "google" && !Array.isArray(json?.models)) {
            return { success: false, error: "Unexpected response format from Google" };
        }
        // Anthropic returns a `message` object — getting here means status was ok.
        return { success: true };
    } catch {
        return { success: false, error: "Could not parse API response" };
    }
}

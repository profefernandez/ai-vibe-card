// verify-domain — confirm site ownership via DNS TXT or HTML meta tag.
// POST { site_id: UUID, method: "dns_txt" | "meta_tag" }
//
// Auth: requires the caller's JWT. The user-bound client enforces RLS:
// `SELECT ... FROM sites WHERE id = $1` returns the row only if it belongs
// to the caller, so a missing-row response means either the site doesn't
// exist OR the caller doesn't own it — same answer either way (no
// existence-leak oracle).
//
// The successful UPDATE goes through the service-role client. Reasoning:
// the public column `verified` is a trust signal that drives downstream
// scraping + sharing; we don't want clients to flip it via direct table
// writes (RLS already blocks owner UPDATE on `verified`, but using the
// service role here documents intent and survives policy churn).
//
// Replaces `api/routes/verify-domain.ts`.

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";
import { dnsTxt, safeFetch, SafeFetchError } from "../_shared/safe-fetch.ts";

type VerifyMethod = "dns_txt" | "meta_tag";
type VerifyDetail =
    | "verified"
    | "dns_record_missing"
    | "meta_tag_missing"
    | "token_mismatch"
    | "unreachable";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestBody {
    site_id?: unknown;
    method?: unknown;
}

interface SiteRow {
    id: string;
    domain: string;
    verification_token: string | null;
    verification_expires_at: string | null;
    verified: boolean;
}

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;

    if (req.method !== "POST") {
        return jsonResponse({ success: false, error: "Method not allowed" }, 405);
    }

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user, userClient, serviceClient } = auth;

    let body: RequestBody;
    try {
        body = (await req.json()) as RequestBody;
    } catch {
        return jsonResponse({ success: false, error: "Invalid JSON body" }, 400);
    }

    const siteId = body.site_id;
    const method = body.method;
    if (
        typeof siteId !== "string" ||
        !UUID_RE.test(siteId) ||
        (method !== "dns_txt" && method !== "meta_tag")
    ) {
        return jsonResponse(
            { success: false, error: "site_id and method (dns_txt | meta_tag) are required" },
            400,
        );
    }
    const verifyMethod: VerifyMethod = method;

    // ── Load the site through the user-bound (RLS) client ───────────────
    // RLS on `sites` already enforces `auth.uid() = user_id`; the explicit
    // `eq("user_id", user.id)` is belt + braces and matches the legacy
    // handler's behaviour.
    const { data: site, error: siteErr } = await userClient
        .from("sites")
        .select("id, domain, verification_token, verification_expires_at, verified")
        .eq("id", siteId)
        .eq("user_id", user.id)
        .maybeSingle<SiteRow>();
    if (siteErr) {
        console.error("verify-domain: site lookup failed:", siteErr.message);
        return jsonResponse({ success: false, error: "Lookup failed" }, 500);
    }
    if (!site) {
        return jsonResponse({ success: false, error: "Forbidden" }, 403);
    }

    if (site.verified) {
        return jsonResponse({ success: true, already_verified: true });
    }

    const token = site.verification_token;
    if (!token) {
        return jsonResponse(
            { success: false, error: "No verification token generated for this site" },
            400,
        );
    }

    if (site.verification_expires_at && new Date(site.verification_expires_at) < new Date()) {
        return jsonResponse(
            {
                success: false,
                error: "Verification token has expired. Delete and re-add the site.",
            },
            400,
        );
    }

    // ── Normalise domain (strip protocol/path) ──────────────────────────
    let domain = site.domain.trim();
    try {
        const parsed = new URL(domain.startsWith("http") ? domain : `https://${domain}`);
        domain = parsed.hostname;
    } catch {
        return jsonResponse({ success: false, error: "Invalid domain on record" }, 400);
    }

    // ── Run the chosen check ────────────────────────────────────────────
    let detail: VerifyDetail;
    if (verifyMethod === "dns_txt") {
        detail = (await checkDnsTxt(domain, token)) ? "verified" : "dns_record_missing";
    } else {
        detail = await checkMetaTag(domain, token);
    }
    const verified = detail === "verified";

    if (verified) {
        const { error: updErr } = await serviceClient
            .from("sites")
            .update({
                verified: true,
                verification_method: verifyMethod,
                verified_at: new Date().toISOString(),
            })
            .eq("id", siteId);
        if (updErr) {
            console.error("verify-domain: update failed:", updErr.message);
            // The check passed but the write failed — surface a generic 500
            // so the client retries rather than treating the verification as
            // complete.
            return jsonResponse({ success: false, error: "Failed to record verification" }, 500);
        }
    }

    await logAudit(serviceClient, {
        userId: user.id,
        action: verified ? "domain_verified" : "domain_verification_failed",
        tableName: "sites",
        recordId: siteId,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        meta: { domain, method: verifyMethod, detail },
    });

    return jsonResponse({ success: verified, method: verifyMethod, detail });
});

// ── DNS TXT verification ───────────────────────────────────────────────────
async function checkDnsTxt(domain: string, token: string): Promise<boolean> {
    try {
        const records = await dnsTxt(`_60watt-verify.${domain}`);
        return records.some((value) => value === token);
    } catch {
        // DoH failure / NXDOMAIN — treat as missing.
        return false;
    }
}

// ── Meta tag verification ──────────────────────────────────────────────────
async function checkMetaTag(domain: string, token: string): Promise<VerifyDetail> {
    const url = `https://${domain}`;
    try {
        const resp = await safeFetch(url, {
            userAgent: "60WattVerifyBot/1.0",
            timeoutMs: 10_000,
        });
        if (!resp.ok) {
            // Any non-2xx — collapse into "unreachable" rather than leaking
            // upstream status (port-scan oracle).
            return "unreachable";
        }

        const html = await resp.text();
        const pattern = /<meta\s+[^>]*name\s*=\s*["']60watt-verify["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/i;
        const altPattern = /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']60watt-verify["'][^>]*\/?>/i;

        const match = html.match(pattern) || html.match(altPattern);
        if (!match) return "meta_tag_missing";
        if (match[1] !== token) return "token_mismatch";
        return "verified";
    } catch (err) {
        if (err instanceof SafeFetchError) return "unreachable";
        if (err instanceof Error) return "unreachable";
        return "unreachable";
    }
}

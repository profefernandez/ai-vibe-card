/**
 * verify-domain — check domain ownership via DNS TXT record or HTML meta tag.
 * POST /api/functions/verify-domain
 * Body: { site_id: string, method: 'dns_txt' | 'meta_tag' }
 *
 * Requires auth: Bearer JWT (user must own the site record).
 *
 * DNS TXT:  expects a TXT record at _60watt-verify.<domain> containing the token.
 * Meta tag: expects <meta name="60watt-verify" content="TOKEN"> on the homepage.
 */

import { promises as dns } from "node:dns";
import type { Response } from "express";
import { type AuthRequest } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";
import { safeFetch, SafeFetchError } from "../../lib/safe-fetch.js";

/**
 * Public detail enum. Replaces the previous free-form string which leaked
 * upstream HTTP statuses (a port-scan oracle) and disclosed which check
 * branch ran. Keep this list small and stable — clients render it as UI.
 */
type VerifyDetail =
    | "verified"
    | "dns_record_missing"
    | "meta_tag_missing"
    | "token_mismatch"
    | "unreachable";

export async function handler(req: AuthRequest, res: Response): Promise<void> {
    const user = req.user;
    if (!user) {
        res.status(401).json({ success: false, error: "Unauthorized" });
        return;
    }

    const { site_id, method } = req.body as { site_id?: string; method?: string };
    if (!site_id || !method || !["dns_txt", "meta_tag"].includes(method)) {
        res.status(400).json({ success: false, error: "site_id and method (dns_txt | meta_tag) are required" });
        return;
    }

    // Fetch the site — must belong to user and have a token
    const rows = await req.withClient!(async (c) => (await c.query(
        `SELECT id, domain, verification_token, verification_expires_at, verified
         FROM sites WHERE id = $1 AND user_id = $2`,
        [site_id, user.id],
    )).rows);
    if (!rows.length) {
        res.status(403).json({ success: false, error: "Forbidden" });
        return;
    }
    const site = rows[0];

    if (site.verified) {
        res.json({ success: true, already_verified: true });
        return;
    }

    const token: string | null = site.verification_token;
    if (!token) {
        res.status(400).json({ success: false, error: "No verification token generated for this site" });
        return;
    }

    // Check expiry
    if (site.verification_expires_at && new Date(site.verification_expires_at) < new Date()) {
        res.status(400).json({ success: false, error: "Verification token has expired. Delete and re-add the site." });
        return;
    }

    // Normalise domain (strip protocol/path)
    let domain = site.domain.trim();
    try {
        const url = new URL(domain.startsWith("http") ? domain : `https://${domain}`);
        domain = url.hostname;
    } catch {
        res.status(400).json({ success: false, error: "Invalid domain on record" });
        return;
    }

    let detail: VerifyDetail;

    if (method === "dns_txt") {
        detail = (await checkDnsTxt(domain, token)) ? "verified" : "dns_record_missing";
    } else {
        detail = await checkMetaTag(domain, token);
    }
    const verified = detail === "verified";

    if (verified) {
        await req.withClient!((c) => c.query(
            `UPDATE sites SET verified = TRUE, verification_method = $1, verified_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [method, site_id],
        ));
    }

    logAudit({
        userId: user.id,
        action: verified ? "domain_verified" : "domain_verification_failed",
        tableName: "sites",
        recordId: site_id,
        ip: req.ip,
        userAgent: req.headers["user-agent"],
        meta: { domain, method, detail },
    });

    res.json({ success: verified, method, detail });
}

// ── DNS TXT verification ────────────────────────────────────────────────────

async function checkDnsTxt(domain: string, token: string): Promise<boolean> {
    try {
        const records = await dns.resolveTxt(`_60watt-verify.${domain}`);
        // records is string[][] — each entry is a TXT record split into chunks
        return records.some((parts) => parts.join("") === token);
    } catch {
        return false;
    }
}

// ── Meta tag verification ───────────────────────────────────────────────────

async function checkMetaTag(domain: string, token: string): Promise<VerifyDetail> {
    const url = `https://${domain}`;
    try {
        const resp = await safeFetch(url, {
            userAgent: "60WattVerifyBot/1.0",
            timeoutMs: 10_000,
        });

        if (!resp.ok) {
            // Any non-2xx — caller cannot tell whether it was 4xx, 5xx, or
            // a redirect we refused to follow. Intentional: avoid leaking
            // upstream status as a port-scan oracle.
            return "unreachable";
        }

        const html = await resp.text();
        // Look for <meta name="60watt-verify" content="TOKEN"> in either order
        const pattern = /<meta\s+[^>]*name\s*=\s*["']60watt-verify["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/i;
        const altPattern = /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']60watt-verify["'][^>]*\/?>/i;

        const match = html.match(pattern) || html.match(altPattern);
        if (!match) return "meta_tag_missing";
        if (match[1] !== token) return "token_mismatch";
        return "verified";
    } catch (err) {
        // safeFetch throws SafeFetchError for SSRF / DNS / timeout / network.
        // All bucketed into "unreachable" for the user — investigate via logs
        // (the err object is captured by the audit log + pino).
        if (err instanceof SafeFetchError || err instanceof Error) {
            return "unreachable";
        }
        return "unreachable";
    }
}

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
import { db } from "../../db.js";
import { type AuthRequest } from "../../middleware/auth.js";
import { logAudit } from "../../lib/audit.js";

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
    const { rows } = await db.query(
        `SELECT id, domain, verification_token, verification_expires_at, verified
         FROM sites WHERE id = $1 AND user_id = $2`,
        [site_id, user.id],
    );
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

    let verified = false;
    let detail = "";

    if (method === "dns_txt") {
        verified = await checkDnsTxt(domain, token);
        detail = verified
            ? "DNS TXT record found"
            : `No matching TXT record at _60watt-verify.${domain}`;
    } else {
        const result = await checkMetaTag(domain, token);
        verified = result.ok;
        detail = result.detail;
    }

    if (verified) {
        await db.query(
            `UPDATE sites SET verified = TRUE, verification_method = $1, verified_at = NOW(), updated_at = NOW()
             WHERE id = $2`,
            [method, site_id],
        );
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

async function checkMetaTag(
    domain: string,
    token: string,
): Promise<{ ok: boolean; detail: string }> {
    const url = `https://${domain}`;
    try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10_000);

        const resp = await fetch(url, {
            headers: { "User-Agent": "60WattVerifyBot/1.0" },
            signal: controller.signal,
            redirect: "follow",
        });
        clearTimeout(timeout);

        if (!resp.ok) {
            return { ok: false, detail: `Homepage returned HTTP ${resp.status}` };
        }

        const html = await resp.text();
        // Look for <meta name="60watt-verify" content="TOKEN">
        const pattern = /<meta\s+[^>]*name\s*=\s*["']60watt-verify["'][^>]*content\s*=\s*["']([^"']+)["'][^>]*\/?>/i;
        const altPattern = /<meta\s+[^>]*content\s*=\s*["']([^"']+)["'][^>]*name\s*=\s*["']60watt-verify["'][^>]*\/?>/i;

        const match = html.match(pattern) || html.match(altPattern);
        if (!match) {
            return { ok: false, detail: "Meta tag <meta name=\"60watt-verify\" ...> not found on homepage" };
        }
        if (match[1] !== token) {
            return { ok: false, detail: "Meta tag found but token does not match" };
        }
        return { ok: true, detail: "Meta tag verified" };
    } catch (err) {
        return {
            ok: false,
            detail: `Could not fetch homepage: ${err instanceof Error ? err.message : "unknown error"}`,
        };
    }
}

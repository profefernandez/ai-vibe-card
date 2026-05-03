// card-vcard — public vCard (.vcf) download for a published card.
//
// GET /functions/v1/card-vcard?slug=<slug>
//
// Auth: none. Deploy with `--no-verify-jwt` so a plain anchor `<a href>`
// download from the public card works for anonymous visitors.
//
// Mirrors `api/routes/card.ts:62-110` exactly: same slug regex, same
// vCard 3.0 template, same escape rules. Looks up the profile via the
// `get_card_by_slug` RPC (migration `0008_card_helpers.sql`) which
// already gates on `is_published = true`.

import { corsHeaders, handlePreflight } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/auth.ts";

const SLUG_RE = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/i;

interface CardRow {
    display_name: string | null;
    tagline: string | null;
    bio: string | null;
    cta_url: string | null;
    slug: string | null;
}

function textResponse(body: string, status = 200, extra: Record<string, string> = {}): Response {
    return new Response(body, {
        status,
        headers: { ...corsHeaders, "Content-Type": "text/plain; charset=utf-8", ...extra },
    });
}

/** Escape vCard special characters (comma, semicolon, backslash, newline). */
function esc(s: string | null | undefined): string {
    return (s ?? "")
        .replace(/[,;\\]/g, (c) => `\\${c}`)
        .replace(/\n/g, "\\n");
}

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;
    if (req.method !== "GET") {
        return textResponse("Method not allowed", 405);
    }

    const url = new URL(req.url);
    const slug = url.searchParams.get("slug") ?? "";
    if (!slug || slug.length > 100 || !SLUG_RE.test(slug)) {
        return textResponse("Invalid slug", 400);
    }

    const service = getServiceClient();
    if (service instanceof Response) return service;

    const { data, error } = await service
        .rpc("get_card_by_slug", { p_slug: slug })
        .maybeSingle<CardRow>();

    if (error) {
        console.error("card-vcard: lookup failed:", error.message);
        return textResponse("Error generating contact file", 500);
    }
    if (!data) {
        return textResponse("Card not found", 404);
    }

    const frontendUrl = Deno.env.get("FRONTEND_URL") ?? "https://ai.60wattsofclarity.com";
    const cardUrl = `${frontendUrl}/card/${slug}`;

    const nameParts = (data.display_name ?? "").trim().split(/\s+/).filter(Boolean);
    const lastName = nameParts.length > 1 ? nameParts.pop() ?? "" : "";
    const firstName = nameParts.join(" ");

    const lines = [
        "BEGIN:VCARD",
        "VERSION:3.0",
        `N:${esc(lastName)};${esc(firstName)};;;`,
        `FN:${esc(data.display_name ?? "")}`,
        `TITLE:${esc(data.tagline ?? "")}`,
        `NOTE:${esc(data.bio ?? "")}`,
        `URL:${cardUrl}`,
        "END:VCARD",
    ];

    return new Response(lines.join("\r\n"), {
        status: 200,
        headers: {
            ...corsHeaders,
            "Content-Type": "text/vcard; charset=utf-8",
            "Content-Disposition": `attachment; filename="${slug}.vcf"`,
        },
    });
});

// Shared CORS handling for Supabase Edge Functions.
//
// `supabase.functions.invoke()` from the browser sends an OPTIONS preflight
// for any non-trivial request (custom headers, JSON body). We answer it with
// the headers below and let the actual request through.
//
// The allowed origin is `*` because the public card may be embedded on
// arbitrary domains; auth comes from the JWT we verify in `auth.ts`, so a
// permissive origin is safe — rows are still owner-scoped via RLS.

export const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers":
        "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
};

/** Returns a 204 preflight response when the request is OPTIONS, else null. */
export function handlePreflight(req: Request): Response | null {
    if (req.method === "OPTIONS") {
        return new Response(null, { status: 204, headers: corsHeaders });
    }
    return null;
}

/** JSON helper that always carries the CORS headers. */
export function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
}

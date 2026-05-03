// Shared auth helper for Supabase Edge Functions.
//
// Edge Functions receive the caller's JWT in the `Authorization: Bearer ...`
// header (the `supabase.functions.invoke()` client attaches it
// automatically). We:
//   1. Build a request-scoped client that forwards that header, so any
//      `userClient.from(...)` call runs as the user and respects RLS.
//   2. Resolve the user identity by hitting `auth.getUser()` against the
//      Supabase Auth server, which validates the signature and expiry.
//   3. Optionally hand back a service-role client for tables/columns the
//      function legitimately needs to bypass RLS for (e.g. writing to
//      `audit_log`).
//
// `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are
// auto-populated by the Supabase Edge runtime — no `secrets set` needed.

import {
    createClient,
    type SupabaseClient,
    type User,
} from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface AuthedRequest {
    user: User;
    /** RLS-bound client carrying the caller's JWT. */
    userClient: SupabaseClient;
    /** Service-role client for trusted writes (audit log, cross-row reads). */
    serviceClient: SupabaseClient;
}

export async function requireUser(req: Request): Promise<AuthedRequest | Response> {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
        return new Response(
            JSON.stringify({ success: false, error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
        );
    }

    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey) {
        // Misconfiguration — surface a 500 with a stable shape so the front
        // end's existing error toast keeps working.
        return new Response(
            JSON.stringify({
                success: false,
                error: "Edge function is not configured.",
            }),
            { status: 500, headers: { "Content-Type": "application/json" } },
        );
    }

    const userClient = createClient(url, anonKey, {
        global: { headers: { Authorization: authHeader } },
        auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await userClient.auth.getUser();
    if (error || !data?.user) {
        return new Response(
            JSON.stringify({ success: false, error: "Unauthorized" }),
            { status: 401, headers: { "Content-Type": "application/json" } },
        );
    }

    const serviceClient = createClient(url, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
    });

    return { user: data.user, userClient, serviceClient };
}

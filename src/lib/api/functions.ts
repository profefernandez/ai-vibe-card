/**
 * Edge-functions-style RPC: `apiClient.functions.invoke(name, { body })`.
 *
 * Routing:
 *   - Names listed in `SUPABASE_EDGE_FUNCTIONS` are dispatched to a real
 *     Supabase Edge Function via `supabase.functions.invoke()`. The Supabase
 *     JS client attaches the user's JWT and handles CORS.
 *   - Anything else continues to hit the legacy Express server at
 *     `/api/functions/<name>` via `apiFetch` until that function gets ported.
 *
 * This per-function allowlist lets us migrate functions one at a time
 * without breaking unported callers.
 */

import { apiFetch } from "./client";
import { getSupabase } from "@/lib/supabase";

/**
 * Functions that have been ported to Supabase Edge Functions. Add a name
 * here the moment its `supabase/functions/<name>/index.ts` is deployed.
 */
export const SUPABASE_EDGE_FUNCTIONS: ReadonlySet<string> = new Set([
    "test-api-connection",
    "lemonade-chat",
    "feedback",
    "verify-domain",
    "scrape-site",
    "query-content",
]);

export const functions = {
    async invoke(
        name: string,
        { body }: { body?: unknown } = {},
    ): Promise<{ data: unknown; error: Error | null }> {
        if (SUPABASE_EDGE_FUNCTIONS.has(name)) {
            try {
                const { data, error } = await getSupabase().functions.invoke(name, {
                    body: body ?? {},
                });
                if (error) {
                    // Supabase's FunctionsError already carries a message; pass
                    // through unchanged so the existing toast UX is consistent.
                    return { data: null, error: error instanceof Error ? error : new Error(String(error)) };
                }
                return { data, error: null };
            } catch (err) {
                return {
                    data: null,
                    error: err instanceof Error ? err : new Error(String(err)),
                };
            }
        }

        try {
            const data = await apiFetch(`/functions/${name}`, {
                method: "POST",
                body: body !== undefined ? JSON.stringify(body) : undefined,
            });
            return { data, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

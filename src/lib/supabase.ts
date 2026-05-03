/**
 * Supabase browser client — singleton.
 *
 * Reads credentials from Vite env at build time:
 *   VITE_SUPABASE_URL       — e.g. https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — public anon JWT (safe to ship in the SPA bundle;
 *                             RLS policies in Supabase are the actual fence).
 *
 * Hosting: the built SPA is uploaded to the Scala VPS (`public_html/`). Apache
 * serves the static files; all data/auth/storage calls go directly from the
 * browser to Supabase. No Node process is required on the VPS for these
 * features.
 *
 * Misconfiguration policy: if either env var is missing, `getSupabase()`
 * throws on first use rather than at module-load time. This keeps tests/build
 * working while still making a misconfigured *deploy* fail loudly the moment
 * any auth/db call is made.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * The client is constructed lazily on first access. This is important because:
 *
 *   1. Vitest specs import modules that transitively import this file. We
 *      don't want every test file to require live Supabase env vars; only the
 *      ones that actually exercise the network do.
 *   2. Vite dev/build still inlines `import.meta.env.*`. A misconfigured
 *      *deploy* should fail loudly the moment any auth/db call is made — that
 *      is preserved by throwing inside `getSupabase()` rather than silently
 *      returning `null`.
 */

let _client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
    if (_client) return _client;

    const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
    const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

    if (!url || !anonKey) {
        throw new Error(
            "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
                "in your build environment (see .env.example).",
        );
    }

    _client = createClient(url, anonKey, {
        auth: {
            // Persist the session in localStorage so refreshes don't log the
            // user out.
            persistSession: true,
            autoRefreshToken: true,
            // Detect access_token / refresh_token in the URL hash so password
            // recovery and magic-link callbacks land the user in a session.
            detectSessionInUrl: true,
        },
    });

    return _client;
}

/**
 * Test-only escape hatch. Inject a stub SupabaseClient (or `null` to reset
 * back to lazy-construction). Production code MUST keep calling
 * {@link getSupabase} so that the singleton path stays the source of truth.
 */
export function __setSupabaseForTests(client: SupabaseClient | null): void {
    _client = client;
}

/**
 * Back-compat default export. Existing call sites can still write
 * `supabase.auth.signInWithPassword(...)`; the proxy resolves to the lazily
 * constructed client on every property access.
 */
export const supabase: SupabaseClient = new Proxy({} as SupabaseClient, {
    get(_target, prop, receiver) {
        const client = getSupabase();
        const value = Reflect.get(client as object, prop, receiver);
        return typeof value === "function" ? value.bind(client) : value;
    },
});

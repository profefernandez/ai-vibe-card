/**
 * Supabase browser client — singleton.
 *
 * Reads credentials from Vite env at build time:
 *   VITE_SUPABASE_URL       — e.g. https://xxxx.supabase.co
 *   VITE_SUPABASE_ANON_KEY  — public anon JWT (safe to ship in the SPA bundle;
 *                             RLS policies in Supabase are the actual fence).
 *
 * Both vars must be present at build time. We intentionally throw early so a
 * misconfigured deploy fails loudly instead of silently 401'ing every query.
 *
 * Hosting: the built SPA is uploaded to the Scala VPS (`public_html/`). Apache
 * serves the static files; all data/auth/storage calls go directly from the
 * browser to Supabase. No Node process is required on the VPS for these
 * features.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
    throw new Error(
        "Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY " +
            "in your build environment (see .env.example).",
    );
}

export const supabase: SupabaseClient = createClient(url, anonKey, {
    auth: {
        // Persist the session in localStorage so refreshes don't log the user out.
        persistSession: true,
        autoRefreshToken: true,
        // We use email + magic link (and OAuth later); no need to detect the
        // session in URL fragments unless we add OAuth callbacks.
        detectSessionInUrl: true,
    },
});

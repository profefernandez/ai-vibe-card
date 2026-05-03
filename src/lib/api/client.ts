/**
 * VPS REST API client core: base URL, listener bus, fetch helper.
 *
 * Auth is now owned by Supabase (`src/lib/supabase.ts`), so this module no
 * longer persists its own session in localStorage. The `loadSession` /
 * `saveSession` helpers are retained as thin compatibility shims:
 *
 *   - `loadSession()` derives a Session from the live Supabase client
 *     (synchronously, from its in-memory cache populated by `getSession`).
 *   - `saveSession()` is a no-op except for `null`, which signs the user out
 *     of Supabase. Older call sites that did `saveSession(session)` after a
 *     manual login don't need that anymore — Supabase persists for them.
 *
 * The fetch helper (`apiFetch`) still attaches `Authorization: Bearer …` so
 * the few Express routes that haven't been ported to Supabase yet keep
 * working during the transition.
 */

export type { User, Session } from "@/types";

import type { Session } from "@/types";
import { getSupabase } from "@/lib/supabase";

export const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Session helpers ──────────────────────────────────────────────────────────

/** In-memory mirror of the Supabase session, kept in sync via the listener
 *  installed below. Used by `loadSession()` so existing synchronous callers
 *  keep returning a value without becoming async. */
let _cachedSession: Session | null = null;

function toSession(sb: import("@supabase/supabase-js").Session | null): Session | null {
    if (!sb || !sb.user || !sb.user.email) return null;
    return {
        user: { id: sb.user.id, email: sb.user.email },
        token: sb.access_token,
        refresh_token: sb.refresh_token,
        expires_at: sb.expires_at ?? undefined,
    };
}

// Install the bridge once on first import. Wrapped in try/catch so test files
// that import this module without configuring Supabase don't blow up.
let _bridgeInstalled = false;
function installSupabaseBridge(): void {
    if (_bridgeInstalled) return;
    try {
        const sb = getSupabase();
        sb.auth.getSession().then(({ data }) => {
            _cachedSession = toSession(data.session);
        }).catch(() => {
            _cachedSession = null;
        });
        sb.auth.onAuthStateChange((_event, session) => {
            _cachedSession = toSession(session);
        });
        _bridgeInstalled = true;
    } catch {
        // Supabase not configured in this environment (e.g. unit tests). Leave
        // the cache empty; callers will see `null`.
    }
}

export function loadSession(): Session | null {
    installSupabaseBridge();
    return _cachedSession;
}

/**
 * Compatibility shim. `null` signs the user out of Supabase; any other value
 * is a no-op — supabase-js owns the canonical session and our `_cachedSession`
 * mirror is kept in sync by the `onAuthStateChange` listener installed in
 * `installSupabaseBridge()`. Hand-injecting a session object would risk
 * staleness without unblocking any caller.
 */
export function saveSession(session: Session | null): void {
    if (session === null) {
        try {
            void getSupabase().auth.signOut();
        } catch {
            // ignore
        }
        _cachedSession = null;
    }
    // else: no-op — see docblock above.
}

// ─── Auth state listeners ─────────────────────────────────────────────────────

export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT";
export type AuthListener = (event: AuthEvent, session: Session | null) => void;

export const _listeners: AuthListener[] = [];

export function notifyListeners(event: AuthEvent, session: Session | null): void {
    _listeners.forEach((fn) => fn(event, session));
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

/**
 * Fetch helper for the *legacy* Express endpoints that haven't been ported to
 * Supabase yet (uploads, edge-style functions, kb folders/items, etc.).
 * Attaches the live Supabase access token as a Bearer header so the Express
 * server can validate it via supabase-js on the server side.
 */
export async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
    installSupabaseBridge();

    // Prefer asking Supabase directly so we always send the freshest token,
    // not a stale value from `_cachedSession`.
    let token: string | null = _cachedSession?.token ?? null;
    try {
        const { data } = await getSupabase().auth.getSession();
        token = data.session?.access_token ?? token;
    } catch {
        // Supabase not configured — fall back to whatever we cached (likely null).
    }

    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
    };
    if (token) {
        headers["Authorization"] = `Bearer ${token}`;
    }

    const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

    if (res.status === 401) {
        saveSession(null);
        notifyListeners("SIGNED_OUT", null);
        throw new Error("Unauthorized");
    }

    const text = await res.text();
    let json: unknown;
    try {
        json = JSON.parse(text);
    } catch {
        throw new Error(`Non-JSON response: ${text.slice(0, 200)}`);
    }

    if (!res.ok) {
        const msg =
            (json as Record<string, unknown>)?.error ||
            (json as Record<string, unknown>)?.message ||
            `HTTP ${res.status}`;
        throw new Error(String(msg));
    }

    return json;
}

/**
 * Auth module — delegates to Supabase Auth (`@supabase/supabase-js`).
 *
 * The shape (`signUp`, `signInWithPassword`, `signOut`, `getSession`,
 * `onAuthStateChange`) is intentionally identical to the previous
 * Express-backed shim so callers (`AuthContext`, `Auth.tsx`, etc.) need no
 * changes when we switch the backend.
 *
 * Notes for reviewers:
 *   - We do NOT persist a session ourselves. supabase-js handles
 *     localStorage + auto-refresh internally (see `auth.persistSession` and
 *     `auth.autoRefreshToken` in src/lib/supabase.ts).
 *   - We still call the legacy listener bus (`notifyListeners`) so existing
 *     subscribers keep working alongside the Supabase event stream during the
 *     transition. Remove once all consumers subscribe directly to Supabase.
 */

import type { AuthChangeEvent, Session as SbSession } from "@supabase/supabase-js";
import { getSupabase } from "@/lib/supabase";
import type { User, Session } from "@/types";
import {
    notifyListeners,
    _listeners,
    type AuthListener,
} from "./client";

function toSession(sb: SbSession | null): Session | null {
    if (!sb || !sb.user || !sb.user.email) return null;
    const user: User = { id: sb.user.id, email: sb.user.email };
    return {
        user,
        token: sb.access_token,
        refresh_token: sb.refresh_token,
        expires_at: sb.expires_at ?? undefined,
    };
}

export const auth = {
    async signUp({
        email,
        password,
    }: {
        email: string;
        password: string;
        options?: Record<string, unknown>;
    }): Promise<{ error: Error | null; autoLoggedIn: boolean }> {
        try {
            const { data, error } = await getSupabase().auth.signUp({ email, password });
            if (error) return { error, autoLoggedIn: false };

            // When email confirmation is disabled in the Supabase dashboard,
            // signUp returns a live session and the user is logged in.
            // When confirmation is required, `session` is null — caller is
            // expected to prompt the user to check their inbox.
            if (data.session) {
                notifyListeners("SIGNED_IN", toSession(data.session));
                return { error: null, autoLoggedIn: true };
            }
            return { error: null, autoLoggedIn: false };
        } catch (err) {
            return {
                error: err instanceof Error ? err : new Error(String(err)),
                autoLoggedIn: false,
            };
        }
    },

    async signInWithPassword({
        email,
        password,
    }: {
        email: string;
        password: string;
    }): Promise<{ error: Error | null }> {
        try {
            const { data, error } = await getSupabase().auth.signInWithPassword({
                email,
                password,
            });
            if (error) return { error };
            notifyListeners("SIGNED_IN", toSession(data.session));
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },

    async signOut(): Promise<void> {
        try {
            await getSupabase().auth.signOut();
        } catch {
            // Even if the network call fails, we want the local session
            // cleared so the UI returns to the signed-out state.
        }
        notifyListeners("SIGNED_OUT", null);
    },

    async getSession(): Promise<{ data: { session: Session | null } }> {
        try {
            const { data } = await getSupabase().auth.getSession();
            return { data: { session: toSession(data.session) } };
        } catch {
            return { data: { session: null } };
        }
    },

    onAuthStateChange(callback: AuthListener): {
        data: { subscription: { unsubscribe: () => void } };
    } {
        // Keep callbacks on the legacy listener bus so the sign-in/sign-out
        // notifications above still flow to subscribers.
        _listeners.push(callback);

        // Also subscribe to the live Supabase auth stream so token refreshes
        // and external sign-outs (e.g. another tab) are surfaced to the app.
        const { data } = getSupabase().auth.onAuthStateChange(
            (event: AuthChangeEvent, sbSession) => {
                const session = toSession(sbSession);
                if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED" || event === "USER_UPDATED") {
                    callback("SIGNED_IN", session);
                } else if (event === "SIGNED_OUT") {
                    callback("SIGNED_OUT", null);
                }
            },
        );

        return {
            data: {
                subscription: {
                    unsubscribe() {
                        const idx = _listeners.indexOf(callback);
                        if (idx !== -1) _listeners.splice(idx, 1);
                        try {
                            data.subscription.unsubscribe();
                        } catch {
                            // ignore — already torn down
                        }
                    },
                },
            },
        };
    },

    /** Send a password-reset email. Replaces POST /api/auth/forgot-password. */
    async resetPasswordForEmail(
        email: string,
        opts?: { redirectTo?: string },
    ): Promise<{ error: Error | null }> {
        try {
            const { error } = await getSupabase().auth.resetPasswordForEmail(email, {
                redirectTo: opts?.redirectTo,
            });
            return { error: error ?? null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },

    /** Update the password of the currently-signed-in user (post reset link). */
    async updatePassword(password: string): Promise<{ error: Error | null }> {
        try {
            const { error } = await getSupabase().auth.updateUser({ password });
            return { error: error ?? null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

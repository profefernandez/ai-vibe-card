/**
 * Auth module: signUp, signInWithPassword, signOut, getSession, onAuthStateChange.
 */

import type { User, Session } from "@/types";
import {
    API_BASE,
    apiFetch,
    loadSession,
    saveSession,
    notifyListeners,
    _listeners,
    type AuthListener,
} from "./client";

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
            const data = (await apiFetch("/auth/register", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            })) as { user?: User; token?: string; message?: string };

            // New-user path: backend returns { user, token } → log them in immediately.
            if (data.user && data.token) {
                const session: Session = { user: data.user, token: data.token };
                saveSession(session);
                notifyListeners("SIGNED_IN", session);
                return { error: null, autoLoggedIn: true };
            }

            // Existing-user path: backend returns a generic message without credentials
            // (to avoid user enumeration). Caller should prompt them to sign in.
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
            const data = (await apiFetch("/auth/login", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            })) as { user: User; token: string };
            const session: Session = { user: data.user, token: data.token };
            saveSession(session);
            notifyListeners("SIGNED_IN", session);
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },

    async signOut(): Promise<void> {
        const session = loadSession();
        if (session?.token) {
            fetch(`${API_BASE}/auth/logout`, {
                method: "POST",
                headers: { Authorization: `Bearer ${session.token}` },
            }).catch(() => {});
        }
        saveSession(null);
        notifyListeners("SIGNED_OUT", null);
    },

    async getSession(): Promise<{ data: { session: Session | null } }> {
        return { data: { session: loadSession() } };
    },

    onAuthStateChange(callback: AuthListener): {
        data: { subscription: { unsubscribe: () => void } };
    } {
        _listeners.push(callback);
        return {
            data: {
                subscription: {
                    unsubscribe() {
                        const idx = _listeners.indexOf(callback);
                        if (idx !== -1) _listeners.splice(idx, 1);
                    },
                },
            },
        };
    },
};

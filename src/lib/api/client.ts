/**
 * VPS REST API client core: base URL, session storage, listener bus, fetch helper.
 * Other modules in this folder import from here. Listener bus must remain a
 * singleton — define it here and ONLY here.
 */

export type { User, Session } from "@/types";

import type { Session } from "@/types";

export const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Session helpers ──────────────────────────────────────────────────────────

const SESSION_KEY = "vps_session";

export function loadSession(): Session | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
        return null;
    }
}

export function saveSession(session: Session | null): void {
    if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
        localStorage.removeItem(SESSION_KEY);
    }
}

// ─── Auth state listeners ─────────────────────────────────────────────────────

export type AuthEvent = "SIGNED_IN" | "SIGNED_OUT";
export type AuthListener = (event: AuthEvent, session: Session | null) => void;

export const _listeners: AuthListener[] = [];

export function notifyListeners(event: AuthEvent, session: Session | null): void {
    _listeners.forEach((fn) => fn(event, session));
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

export async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
    const session = loadSession();
    const headers: Record<string, string> = {
        "Content-Type": "application/json",
        ...(options.headers as Record<string, string>),
    };
    if (session?.token) {
        headers["Authorization"] = `Bearer ${session.token}`;
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

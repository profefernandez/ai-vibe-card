/**
 * VPS REST API client for ai-vibe-card.
 * All data calls go to VITE_API_URL (your Scala Hosting VPS Express API).
 *
 * Drop-in compatible: keeps the same .from().select().eq() / .auth / .functions
 * interface that the rest of the codebase already uses.
 */

const API_BASE = import.meta.env.VITE_API_URL || "/api";

// ─── Public types (re-exported from @/types for backward compatibility) ───────

export type { User, Session } from "@/types";

import type { User, Session } from "@/types";

// ─── Session helpers ──────────────────────────────────────────────────────────

const SESSION_KEY = "vps_session";

function loadSession(): Session | null {
    try {
        const raw = localStorage.getItem(SESSION_KEY);
        return raw ? (JSON.parse(raw) as Session) : null;
    } catch {
        return null;
    }
}

function saveSession(session: Session | null): void {
    if (session) {
        localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    } else {
        localStorage.removeItem(SESSION_KEY);
    }
}

// ─── Auth state listeners ─────────────────────────────────────────────────────

type AuthEvent = "SIGNED_IN" | "SIGNED_OUT";
type AuthListener = (event: AuthEvent, session: Session | null) => void;

const _listeners: AuthListener[] = [];

function notifyListeners(event: AuthEvent, session: Session | null): void {
    _listeners.forEach((fn) => fn(event, session));
}

// ─── Core fetch helper ────────────────────────────────────────────────────────

async function apiFetch(path: string, options: RequestInit = {}): Promise<unknown> {
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

// ─── Query builder ────────────────────────────────────────────────────────────

type DbResult<T> = { data: T | null; error: Error | null };

class QueryBuilder<T = unknown> implements PromiseLike<DbResult<T[] | T | null>> {
    private _table: string;
    private _select = "*";
    private _eqFilters: Array<[string, unknown]> = [];
    private _orderCol: string | null = null;
    private _orderAsc = true;
    private _limitVal: number | null = null;
    private _single = false;
    private _maybeSingle = false;
    private _insertData: unknown = null;
    private _updateData: unknown = null;
    private _deleteMode = false;
    private _upsertData: unknown = null;
    private _upsertConflict: string | null = null;

    constructor(table: string) {
        this._table = table;
    }

    select(cols = "*"): this {
        this._select = cols;
        return this;
    }

    eq(col: string, val: unknown): this {
        this._eqFilters.push([col, val]);
        return this;
    }

    order(col: string, opts?: { ascending?: boolean }): this {
        this._orderCol = col;
        this._orderAsc = opts?.ascending !== false;
        return this;
    }

    limit(n: number): this {
        this._limitVal = n;
        return this;
    }

    single(): this {
        this._single = true;
        return this;
    }

    maybeSingle(): this {
        this._maybeSingle = true;
        return this;
    }

    insert(data: unknown): this {
        this._insertData = data;
        return this;
    }

    update(data: unknown): this {
        this._updateData = data;
        return this;
    }

    delete(): this {
        this._deleteMode = true;
        return this;
    }

    upsert(data: unknown, opts?: { onConflict?: string }): this {
        this._upsertData = data;
        this._upsertConflict = opts?.onConflict ?? null;
        return this;
    }

    then<TResult1 = DbResult<T[] | T | null>, TResult2 = never>(
        onfulfilled?: ((value: DbResult<T[] | T | null>) => TResult1 | PromiseLike<TResult1>) | null,
        onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): Promise<TResult1 | TResult2> {
        return this._execute().then(onfulfilled, onrejected);
    }

    private async _execute(): Promise<DbResult<T[] | T | null>> {
        try {
            const params = new URLSearchParams();
            if (this._select !== "*") params.set("select", this._select);
            this._eqFilters.forEach(([col, val]) => params.append("filter", `${col}=eq.${val}`));
            if (this._orderCol) {
                params.set("order", `${this._orderCol}.${this._orderAsc ? "asc" : "desc"}`);
            }
            if (this._limitVal !== null) params.set("limit", String(this._limitVal));
            const qs = params.toString() ? `?${params}` : "";
            const basePath = `/tables/${this._table}`;

            if (this._deleteMode) {
                await apiFetch(`${basePath}${qs}`, { method: "DELETE" });
                return { data: null, error: null };
            }

            if (this._upsertData !== null) {
                const json = await apiFetch(`${basePath}/upsert`, {
                    method: "POST",
                    body: JSON.stringify({ data: this._upsertData, onConflict: this._upsertConflict }),
                });
                return { data: json as T, error: null };
            }

            if (this._updateData !== null) {
                await apiFetch(`${basePath}${qs}`, {
                    method: "PATCH",
                    body: JSON.stringify(this._updateData),
                });
                return { data: null, error: null };
            }

            if (this._insertData !== null) {
                const json = await apiFetch(basePath, {
                    method: "POST",
                    body: JSON.stringify(this._insertData),
                });
                if (this._single) {
                    const row = Array.isArray(json) ? json[0] : json;
                    return { data: row as T, error: null };
                }
                return { data: json as T[], error: null };
            }

            // SELECT
            const json = await apiFetch(`${basePath}${qs}`);
            if (this._single || this._maybeSingle) {
                const row = Array.isArray(json) ? (json[0] ?? null) : json;
                return { data: (row as T) ?? null, error: null };
            }
            return { data: (json as T[]) ?? [], error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    }
}

// ─── Auth module ──────────────────────────────────────────────────────────────

const auth = {
    async signUp({
        email,
        password,
    }: {
        email: string;
        password: string;
        options?: Record<string, unknown>;
    }): Promise<{ error: Error | null }> {
        try {
            await apiFetch("/auth/register", {
                method: "POST",
                body: JSON.stringify({ email, password }),
            });
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
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

// ─── Functions module ─────────────────────────────────────────────────────────

const functions = {
    async invoke(
        name: string,
        { body }: { body?: unknown } = {},
    ): Promise<{ data: unknown; error: Error | null }> {
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

// ─── Upload helpers ───────────────────────────────────────────────────────────

const upload = {
    /** Upload an avatar image file. Returns { url } on success. */
    async avatar(file: File): Promise<{ url: string | null; error: Error | null }> {
        try {
            const session = loadSession();
            const formData = new FormData();
            formData.append("avatar", file);

            const headers: Record<string, string> = {};
            if (session?.token) {
                headers["Authorization"] = `Bearer ${session.token}`;
            }

            const res = await fetch(`${API_BASE}/upload/avatar`, {
                method: "POST",
                headers,
                body: formData,
            });

            if (res.status === 401) {
                saveSession(null);
                notifyListeners("SIGNED_OUT", null);
                throw new Error("Unauthorized");
            }

            const json = await res.json();
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            return { url: json.url, error: null };
        } catch (err) {
            return { url: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },

    /** Delete the current avatar. */
    async deleteAvatar(): Promise<{ error: Error | null }> {
        try {
            await apiFetch("/upload/avatar", { method: "DELETE" });
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

// ─── Main export ──────────────────────────────────────────────────────────────

export const apiClient = {
    auth,
    functions,
    upload,
    from: <T = unknown>(table: string) => new QueryBuilder<T>(table),
};

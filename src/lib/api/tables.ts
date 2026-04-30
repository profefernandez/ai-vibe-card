/**
 * Generic table query builder. Mirrors a tiny subset of the Supabase JS client.
 */

import { apiFetch } from "./client";

export type DbResult<T> = { data: T | null; error: Error | null };

export class QueryBuilder<T = unknown> implements PromiseLike<DbResult<T[] | T | null>> {
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

export const from = <T = unknown>(table: string) => new QueryBuilder<T>(table);

/**
 * `db.from(...)` — thin re-export of Supabase's PostgREST query builder.
 *
 * Previously this file shimmed Supabase's API on top of the Express
 * `/api/tables/*` endpoints. Now that the data layer is Supabase, the shim is
 * unnecessary: every caller in the codebase already uses the
 * `from(...).select().eq().order().limit().single()/.maybeSingle()/
 * .insert()/.update()/.delete()/.upsert()` chain, which is the native API.
 *
 * RLS policies (see `supabase/migrations/0002_rls_policies.sql`) are the
 * security fence — these calls run as the signed-in browser user and the
 * server enforces row ownership.
 *
 * Result shape compatibility:
 *   - Supabase returns `{ data, error, count, status, statusText }`.
 *   - All existing call sites only destructure `{ data, error }` (and
 *     occasionally treat `error?.message` as a string), which `PostgrestError`
 *     satisfies. So the swap is a drop-in.
 */

import { getSupabase } from "@/lib/supabase";

/**
 * Generic table query result. Kept as an exported type alias for
 * backwards-compat with code that imports `DbResult` from this module.
 *
 * Note: Supabase's `error` is a `PostgrestError`, not a vanilla `Error`. Both
 * have `.message: string`, which is the only field consumers in this repo
 * touch, so we model this loosely as `{ message: string } | null` to keep the
 * type permissive without leaking the supabase-js types into every caller.
 */
export type DbResult<T> = {
    data: T | null;
    error: { message: string } | null;
};

/**
 * Back-compat alias for the previous custom QueryBuilder class. Now points at
 * Supabase's PostgREST builder. Imported as a *type* by any code that needs
 * to annotate a builder return value.
 */
export type QueryBuilder<T = unknown> = ReturnType<
    ReturnType<typeof getSupabase>["from"]
> & {
    /** Marker so callers can still parameterise on the row type. */
    __row?: T;
};

export const from = <T = unknown>(table: string): QueryBuilder<T> =>
    getSupabase().from(table) as QueryBuilder<T>;

/**
 * `db.rpc(name, args)` — thin pass-through to `supabase.rpc()`.
 *
 * Used by callers that need to invoke a Postgres function (typically a
 * `SECURITY DEFINER` helper exposed via `GRANT EXECUTE` to anon /
 * authenticated). Returns the same `{ data, error }` shape as `from()`.
 */
export const rpc = (
    name: string,
    args?: Record<string, unknown>,
): ReturnType<ReturnType<typeof getSupabase>["rpc"]> =>
    getSupabase().rpc(name, args);

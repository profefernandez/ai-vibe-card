import { describe, it, expect, vi } from "vitest";

/**
 * `from(...)` is a thin re-export of `getSupabase().from(...)`. The semantics
 * of the chain (select/eq/order/limit/single/maybeSingle/insert/update/
 * delete/upsert) are owned and tested by `@supabase/supabase-js` itself; we
 * only need to verify that our wrapper hands the call off correctly and that
 * the table name flows through unchanged. A heavier integration test would
 * need a live PostgREST server, which belongs in a separate phase.
 */

describe("db.from() → supabase.from()", () => {
    it("forwards the table name to the underlying Supabase client", async () => {
        vi.resetModules();
        const fakeBuilder = { __isFake: true };
        const fromSpy = vi.fn(() => fakeBuilder);

        const supabaseModule = await import("@/lib/supabase");
        supabaseModule.__setSupabaseForTests({
            from: fromSpy,
        } as unknown as Parameters<typeof supabaseModule.__setSupabaseForTests>[0]);

        const { from } = await import("@/lib/api/tables");
        const result = from("profiles");

        expect(fromSpy).toHaveBeenCalledWith("profiles");
        expect(result).toBe(fakeBuilder);
    });

    it("typed call signature accepts a row generic without runtime change", async () => {
        vi.resetModules();
        const fakeBuilder = { __isFake: true };
        const fromSpy = vi.fn(() => fakeBuilder);

        const supabaseModule = await import("@/lib/supabase");
        supabaseModule.__setSupabaseForTests({
            from: fromSpy,
        } as unknown as Parameters<typeof supabaseModule.__setSupabaseForTests>[0]);

        const { from } = await import("@/lib/api/tables");

        interface Site {
            id: string;
            domain: string;
        }

        // Compiles + returns the same fake builder; the `<Site>` is purely
        // informational for callers.
        const result = from<Site>("sites");
        expect(fromSpy).toHaveBeenCalledWith("sites");
        expect(result).toBe(fakeBuilder);
    });
});

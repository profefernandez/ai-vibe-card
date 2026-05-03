import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Integration-style tests against a hand-rolled Supabase mock. We exercise
 * the public-facing shape of `kbImages.{list, listPublic, update, remove}`
 * so consumers (CardView, ExplorePanel, PhotoStage) get the same `{data,
 * error}` contract they had against the legacy Express endpoints.
 *
 * The mock implements just enough of PostgREST's chain-then-await pattern
 * to satisfy the call sites used by the shim.
 */

type Row = {
    id: string;
    user_id: string;
    url: string;
    caption: string;
    display_order: number;
    created_at: string;
};

function makeMock(initialRows: Row[] = []) {
    let rows = [...initialRows];
    const session = { user: { id: "user-1" } };

    function builder(table: string) {
        const state: {
            op: "select" | "update" | "delete";
            patch?: Partial<Row>;
            filters: Array<[string, unknown]>;
            orderCol?: string;
            orderAsc?: boolean;
        } = { op: "select", filters: [] };

        const chain: Record<string, unknown> = {
            select(_cols: string) {
                state.op = "select";
                return chain;
            },
            update(patch: Partial<Row>) {
                state.op = "update";
                state.patch = patch;
                return chain;
            },
            delete() {
                state.op = "delete";
                return chain;
            },
            eq(col: string, val: unknown) {
                state.filters.push([col, val]);
                return chain;
            },
            order(col: string, opts?: { ascending?: boolean }) {
                state.orderCol = col;
                state.orderAsc = opts?.ascending !== false;
                return chain;
            },
            then(onFulfilled: (v: { data: Row[] | null; error: null }) => unknown) {
                if (table !== "kb_images") {
                    return Promise.resolve(onFulfilled({ data: [], error: null }));
                }
                if (state.op === "delete") {
                    rows = rows.filter(
                        (r) => !state.filters.every(([col, val]) => (r as Record<string, unknown>)[col] === val),
                    );
                    return Promise.resolve(onFulfilled({ data: [], error: null }));
                }
                if (state.op === "update") {
                    rows = rows.map((r) => {
                        const matches = state.filters.every(
                            ([col, val]) => (r as Record<string, unknown>)[col] === val,
                        );
                        return matches ? { ...r, ...state.patch } : r;
                    });
                    return Promise.resolve(onFulfilled({ data: [], error: null }));
                }
                let result = rows.filter((r) =>
                    state.filters.every(([col, val]) => (r as Record<string, unknown>)[col] === val),
                );
                if (state.orderCol) {
                    const k = state.orderCol;
                    result = [...result].sort((a, b) => {
                        const av = (a as Record<string, unknown>)[k] as number;
                        const bv = (b as Record<string, unknown>)[k] as number;
                        return state.orderAsc ? av - bv : bv - av;
                    });
                }
                return Promise.resolve(onFulfilled({ data: result, error: null }));
            },
        };
        return chain;
    }

    return {
        client: {
            auth: {
                async getSession() {
                    return { data: { session }, error: null };
                },
            },
            from: vi.fn(builder),
        },
        get rows() {
            return rows;
        },
    };
}

describe("kbImages shim → Supabase", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    async function load(initialRows: Row[] = []) {
        const mock = makeMock(initialRows);
        const supabaseModule = await import("@/lib/supabase");
        supabaseModule.__setSupabaseForTests(
            mock.client as unknown as Parameters<typeof supabaseModule.__setSupabaseForTests>[0],
        );
        const { kbImages } = await import("@/lib/api/kbImages");
        return { kbImages, mock };
    }

    const sample: Row[] = [
        { id: "a", user_id: "user-1", url: "https://ex/a.png", caption: "A", display_order: 1, created_at: "t1" },
        { id: "b", user_id: "user-1", url: "https://ex/b.png", caption: "B", display_order: 0, created_at: "t2" },
        { id: "c", user_id: "other", url: "https://ex/c.png", caption: "C", display_order: 0, created_at: "t3" },
    ];

    it("list() returns the signed-in user's rows ordered by display_order asc", async () => {
        const { kbImages } = await load(sample);
        const { data, error } = await kbImages.list();
        expect(error).toBeNull();
        expect(data.map((r) => r.id)).toEqual(["b", "a"]);
    });

    it("listPublic() filters by user_id (anon path — RLS gates is_published)", async () => {
        const { kbImages } = await load(sample);
        const { data, error } = await kbImages.listPublic("user-1");
        expect(error).toBeNull();
        expect(data.map((r) => r.id)).toEqual(["b", "a"]);
    });

    it("update() patches the targeted row", async () => {
        const { kbImages, mock } = await load(sample);
        const { error } = await kbImages.update("a", { caption: "A!" });
        expect(error).toBeNull();
        expect(mock.rows.find((r) => r.id === "a")?.caption).toBe("A!");
    });

    it("remove() deletes the targeted row", async () => {
        const { kbImages, mock } = await load(sample);
        const { error } = await kbImages.remove("a");
        expect(error).toBeNull();
        expect(mock.rows.find((r) => r.id === "a")).toBeUndefined();
    });

    it("list() returns an empty array (not an error) when no session is present", async () => {
        const supabaseModule = await import("@/lib/supabase");
        supabaseModule.__setSupabaseForTests({
            auth: { async getSession() { return { data: { session: null }, error: null }; } },
            from: vi.fn(),
        } as unknown as Parameters<typeof supabaseModule.__setSupabaseForTests>[0]);
        const { kbImages } = await import("@/lib/api/kbImages");
        const { data, error } = await kbImages.list();
        expect(data).toEqual([]);
        expect(error).toBeInstanceOf(Error);
    });
});

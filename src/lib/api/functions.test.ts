import { describe, it, expect, vi, beforeEach } from "vitest";

/**
 * Tests the per-function routing in `functions.invoke`:
 *   - Names in `SUPABASE_EDGE_FUNCTIONS` go through `supabase.functions.invoke`
 *   - Everything else goes through `apiFetch` (legacy Express server)
 *
 * Mocks are scoped per test via `vi.resetModules()` so the SUPABASE allowlist
 * doesn't leak between cases.
 */

const apiFetchMock = vi.fn();
vi.mock("@/lib/api/client", async () => {
    const actual = await vi.importActual<typeof import("@/lib/api/client")>(
        "@/lib/api/client",
    );
    return { ...actual, apiFetch: apiFetchMock };
});

describe("functions.invoke routing", () => {
    beforeEach(() => {
        vi.resetModules();
        apiFetchMock.mockReset();
    });

    async function load(invokeImpl: ReturnType<typeof vi.fn>) {
        const supabaseModule = await import("@/lib/supabase");
        supabaseModule.__setSupabaseForTests({
            functions: { invoke: invokeImpl },
        } as unknown as Parameters<typeof supabaseModule.__setSupabaseForTests>[0]);
        const { functions } = await import("@/lib/api/functions");
        return functions;
    }

    it("ported names go through Supabase Edge Functions", async () => {
        const invoke = vi.fn().mockResolvedValue({ data: { ok: true }, error: null });
        const functions = await load(invoke);

        const { data, error } = await functions.invoke("test-api-connection", {
            body: { provider: "openai" },
        });

        expect(error).toBeNull();
        expect(data).toEqual({ ok: true });
        expect(invoke).toHaveBeenCalledWith("test-api-connection", {
            body: { provider: "openai" },
        });
        expect(apiFetchMock).not.toHaveBeenCalled();
    });

    it("unported names fall through to apiFetch", async () => {
        const invoke = vi.fn();
        const functions = await load(invoke);
        apiFetchMock.mockResolvedValue({ ok: true });

        const { data, error } = await functions.invoke("scrape-site", {
            body: { url: "https://example.com" },
        });

        expect(error).toBeNull();
        expect(data).toEqual({ ok: true });
        expect(invoke).not.toHaveBeenCalled();
        expect(apiFetchMock).toHaveBeenCalledWith("/functions/scrape-site", {
            method: "POST",
            body: JSON.stringify({ url: "https://example.com" }),
        });
    });

    it("Supabase errors are surfaced as Error instances", async () => {
        const invoke = vi
            .fn()
            .mockResolvedValue({ data: null, error: new Error("boom") });
        const functions = await load(invoke);

        const { data, error } = await functions.invoke("test-api-connection");

        expect(data).toBeNull();
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("boom");
    });

    it("apiFetch errors are surfaced as Error instances", async () => {
        const invoke = vi.fn();
        const functions = await load(invoke);
        apiFetchMock.mockRejectedValue(new Error("network down"));

        const { error } = await functions.invoke("verify-domain", { body: {} });

        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toBe("network down");
    });
});

import { describe, it, expect, beforeEach, vi } from "vitest";

// Mock supabase client object — only the bits the auth shim touches.
type Listener = (
    event: "SIGNED_IN" | "SIGNED_OUT" | "TOKEN_REFRESHED" | "USER_UPDATED",
    session: unknown,
) => void;

function makeMockClient() {
    const listeners: Listener[] = [];
    return {
        signUp: vi.fn(async ({ email }: { email: string; password: string }) => ({
            data: {
                user: { id: "u1", email },
                session: {
                    access_token: "at-1",
                    refresh_token: "rt-1",
                    expires_at: 9999,
                    user: { id: "u1", email },
                },
            },
            error: null,
        })),
        signInWithPassword: vi.fn(async ({ email }: { email: string; password: string }) => ({
            data: {
                user: { id: "u1", email },
                session: {
                    access_token: "at-2",
                    refresh_token: "rt-2",
                    expires_at: 9999,
                    user: { id: "u1", email },
                },
            },
            error: null,
        })),
        signOut: vi.fn(async () => ({ error: null })),
        getSession: vi.fn(async () => ({ data: { session: null }, error: null })),
        onAuthStateChange: vi.fn((cb: Listener) => {
            listeners.push(cb);
            return {
                data: {
                    subscription: {
                        unsubscribe: () => {
                            const i = listeners.indexOf(cb);
                            if (i !== -1) listeners.splice(i, 1);
                        },
                    },
                },
            };
        }),
        resetPasswordForEmail: vi.fn(async () => ({ data: {}, error: null })),
        updateUser: vi.fn(async () => ({ data: { user: { id: "u1" } }, error: null })),
        _listeners: listeners,
    };
}

async function loadAuthWithMock() {
    // Reset module cache so `client.ts` re-installs its bridge against the
    // freshly installed mock — the bridge only attaches once per import.
    vi.resetModules();
    const mock = makeMockClient();
    // Re-import the supabase module from the *new* module graph and inject
    // the mock there; the previously installed singleton was on the old
    // module instance and is now unreachable.
    const supabaseModule = await import("@/lib/supabase");
    supabaseModule.__setSupabaseForTests({
        auth: mock,
    } as unknown as Parameters<typeof supabaseModule.__setSupabaseForTests>[0]);
    const authModule = await import("@/lib/api/auth");
    return { auth: authModule.auth, mock };
}

describe("auth shim → Supabase", () => {
    beforeEach(() => {
        vi.resetModules();
    });

    it("signInWithPassword returns no error and notifies listeners", async () => {
        const { auth, mock } = await loadAuthWithMock();
        const events: Array<[string, unknown]> = [];
        auth.onAuthStateChange((event, session) => events.push([event, session]));

        const { error } = await auth.signInWithPassword({
            email: "user@example.com",
            password: "supersecret",
        });

        expect(error).toBeNull();
        expect(mock.signInWithPassword).toHaveBeenCalledOnce();
        expect(events.some(([e]) => e === "SIGNED_IN")).toBe(true);
    });

    it("signUp marks autoLoggedIn=true when Supabase returns a session", async () => {
        const { auth } = await loadAuthWithMock();
        const { error, autoLoggedIn } = await auth.signUp({
            email: "new@example.com",
            password: "supersecret",
        });
        expect(error).toBeNull();
        expect(autoLoggedIn).toBe(true);
    });

    it("signUp marks autoLoggedIn=false when email confirmation is required", async () => {
        const { auth, mock } = await loadAuthWithMock();
        mock.signUp.mockResolvedValueOnce({
            data: { user: { id: "u1", email: "x@y.com" }, session: null },
            error: null,
        });
        const { error, autoLoggedIn } = await auth.signUp({
            email: "x@y.com",
            password: "supersecret",
        });
        expect(error).toBeNull();
        expect(autoLoggedIn).toBe(false);
    });

    it("signOut calls supabase.auth.signOut and notifies listeners", async () => {
        const { auth, mock } = await loadAuthWithMock();
        const events: string[] = [];
        auth.onAuthStateChange((event) => events.push(event));

        await auth.signOut();

        expect(mock.signOut).toHaveBeenCalledOnce();
        expect(events).toContain("SIGNED_OUT");
    });

    it("resetPasswordForEmail forwards to Supabase", async () => {
        const { auth, mock } = await loadAuthWithMock();
        await auth.resetPasswordForEmail("a@b.com", { redirectTo: "https://example/reset" });
        expect(mock.resetPasswordForEmail).toHaveBeenCalledWith("a@b.com", {
            redirectTo: "https://example/reset",
        });
    });

    it("updatePassword forwards to supabase.auth.updateUser", async () => {
        const { auth, mock } = await loadAuthWithMock();
        const { error } = await auth.updatePassword("brand-new-pw");
        expect(error).toBeNull();
        expect(mock.updateUser).toHaveBeenCalledWith({ password: "brand-new-pw" });
    });

    it("returns the error object as-is when Supabase rejects credentials", async () => {
        const { auth, mock } = await loadAuthWithMock();
        mock.signInWithPassword.mockResolvedValueOnce({
            data: { user: null, session: null },
            error: new Error("Invalid login credentials"),
        });
        const { error } = await auth.signInWithPassword({
            email: "wrong@example.com",
            password: "badbadbad",
        });
        expect(error).toBeInstanceOf(Error);
        expect(error?.message).toMatch(/invalid login credentials/i);
    });
});

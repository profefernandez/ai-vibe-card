import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";
import { apiClient } from "@/lib/apiClient";
import type { User, Session } from "@/types";

interface AuthContextValue {
    user: User | null;
    loading: boolean;
    signIn: (email: string, password: string) => Promise<{ error: Error | null }>;
    signUp: (email: string, password: string) => Promise<{ error: Error | null }>;
    signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const {
            data: { subscription },
        } = apiClient.auth.onAuthStateChange((_event, session) => {
            setUser(session?.user ?? null);
        });

        apiClient.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
            setLoading(false);
        }).catch(() => {
            setUser(null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const signIn = useCallback(async (email: string, password: string) => {
        const result = await apiClient.auth.signInWithPassword({ email, password });
        if (!result.error) {
            const { data: { session } } = await apiClient.auth.getSession();
            setUser(session?.user ?? null);
        }
        return result;
    }, []);

    const signUp = useCallback(async (email: string, password: string) => {
        return apiClient.auth.signUp({ email, password });
    }, []);

    const signOut = useCallback(async () => {
        await apiClient.auth.signOut();
        setUser(null);
    }, []);

    return (
        <AuthContext.Provider value={{ user, loading, signIn, signUp, signOut }}>
            {children}
        </AuthContext.Provider>
    );
}

export function useAuth(): AuthContextValue {
    const ctx = useContext(AuthContext);
    if (!ctx) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return ctx;
}

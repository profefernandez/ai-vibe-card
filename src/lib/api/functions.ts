/**
 * Edge-functions-style RPC module: apiClient.functions.invoke(name, { body }).
 */

import { apiFetch } from "./client";

export const functions = {
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

/**
 * Knowledge-base image rows: list / public list / update / remove.
 */

import { API_BASE, apiFetch } from "./client";

export interface KbImage {
    id: string;
    url: string;
    caption: string;
    display_order: number;
    created_at?: string;
}

export const kbImages = {
    async list(): Promise<{ data: KbImage[]; error: Error | null }> {
        try {
            const data = (await apiFetch("/kb-images")) as KbImage[];
            return { data, error: null };
        } catch (err) {
            return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async listPublic(userId: string): Promise<{ data: KbImage[]; error: Error | null }> {
        try {
            const res = await fetch(`${API_BASE}/kb-images/public/${userId}`);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            const data = await res.json();
            return { data, error: null };
        } catch (err) {
            return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async update(id: string, patch: Partial<Pick<KbImage, "caption" | "display_order">>): Promise<{ error: Error | null }> {
        try {
            await apiFetch(`/kb-images/${id}`, { method: "PATCH", body: JSON.stringify(patch) });
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async remove(id: string): Promise<{ error: Error | null }> {
        try {
            await apiFetch(`/kb-images/${id}`, { method: "DELETE" });
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

/**
 * Knowledge-base folders and items (text/image/file rows + folder upload).
 */

import { API_BASE, loadSession, saveSession, notifyListeners, apiFetch } from "./client";

export interface KbFolder {
    id: string;
    parent_id: string | null;
    name: string;
    kind: "manual" | "scrape" | "system";
    source: string | null;
    use_for_ai: boolean;
    decorative: boolean;
    display_order: number;
    created_at?: string;
    updated_at?: string;
}

export interface KbItem {
    id: string;
    folder_id: string;
    type: "text" | "image" | "file";
    title: string | null;
    content: string | null;
    url: string | null;
    mime_type: string | null;
    file_size: number | null;
    caption: string;
    source: string;
    source_url: string | null;
    status: "ready" | "processing" | "error";
    metadata: Record<string, unknown>;
    display_order: number;
    created_at?: string;
    updated_at?: string;
}

export const kbFolders = {
    async list(): Promise<{ data: KbFolder[]; error: Error | null }> {
        try {
            const data = (await apiFetch("/kb/folders")) as KbFolder[];
            return { data, error: null };
        } catch (err) {
            return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async create(input: { name: string; parent_id?: string | null }): Promise<{ data: KbFolder | null; error: Error | null }> {
        try {
            const data = (await apiFetch("/kb/folders", {
                method: "POST",
                body: JSON.stringify(input),
            })) as KbFolder;
            return { data, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async update(id: string, patch: Partial<Pick<KbFolder, "name" | "parent_id" | "display_order" | "use_for_ai">>): Promise<{ data: KbFolder | null; error: Error | null }> {
        try {
            const data = (await apiFetch(`/kb/folders/${id}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            })) as KbFolder;
            return { data, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async remove(id: string): Promise<{ error: Error | null }> {
        try {
            await apiFetch(`/kb/folders/${id}`, { method: "DELETE" });
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

export const kbItems = {
    async list(folderId: string): Promise<{ data: KbItem[]; error: Error | null }> {
        try {
            const data = (await apiFetch(`/kb/items?folder_id=${encodeURIComponent(folderId)}`)) as KbItem[];
            return { data, error: null };
        } catch (err) {
            return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async createText(input: { folder_id: string; title?: string | null; content: string }): Promise<{ data: KbItem | null; error: Error | null }> {
        try {
            const data = (await apiFetch("/kb/items", {
                method: "POST",
                body: JSON.stringify(input),
            })) as KbItem;
            return { data, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async update(id: string, patch: Partial<Pick<KbItem, "title" | "content" | "caption" | "folder_id" | "display_order">>): Promise<{ data: KbItem | null; error: Error | null }> {
        try {
            const data = (await apiFetch(`/kb/items/${id}`, {
                method: "PATCH",
                body: JSON.stringify(patch),
            })) as KbItem;
            return { data, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async remove(id: string): Promise<{ error: Error | null }> {
        try {
            await apiFetch(`/kb/items/${id}`, { method: "DELETE" });
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    /** Upload a file (PDF or image) into a KB folder. Server inserts a kb_items row. */
    async upload(file: File, folderId: string, opts: { title?: string; caption?: string } = {}): Promise<{ data: KbItem | null; error: Error | null }> {
        try {
            const session = loadSession();
            const formData = new FormData();
            formData.append("file", file);
            formData.append("folder_id", folderId);
            if (opts.title) formData.append("title", opts.title);
            if (opts.caption) formData.append("caption", opts.caption);

            const headers: Record<string, string> = {};
            if (session?.token) headers["Authorization"] = `Bearer ${session.token}`;

            const res = await fetch(`${API_BASE}/kb/upload`, {
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
            if (!res.ok) throw new Error((json as { error?: string }).error || `HTTP ${res.status}`);
            return { data: json as KbItem, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

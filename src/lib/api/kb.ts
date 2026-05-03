/**
 * Knowledge-base folders and items (text/image/file rows + folder upload).
 *
 * Backed by Supabase tables `kb_folders` and `kb_items` and the storage
 * buckets `kb-images` (public-read) and `kb-files` (private). Schema and RLS
 * live in `supabase/migrations/0004_knowledge_base.sql`.
 *
 * `display_order` is auto-assigned (current max + 1 within the same scope)
 * to preserve the legacy server's behaviour. Concurrent inserts can race
 * here — the front end recomputes the next slot from the in-memory list, and
 * a future migration can move this to a SQL trigger if needed.
 */

import { getSupabase } from "@/lib/supabase";

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

const KB_IMAGES_BUCKET = "kb-images";
const KB_FILES_BUCKET = "kb-files";
const FOLDER_COLS =
    "id,parent_id,name,kind,source,use_for_ai,decorative,display_order,created_at,updated_at";
const ITEM_COLS =
    "id,folder_id,type,title,content,url,mime_type,file_size,caption,source,source_url,status,metadata,display_order,created_at,updated_at";

async function getCurrentUserId(): Promise<string | null> {
    try {
        const { data } = await getSupabase().auth.getSession();
        return data.session?.user?.id ?? null;
    } catch {
        return null;
    }
}

/**
 * Compute the next `display_order` slot for a sibling group. Returns 0 when
 * the table is empty for that scope. Best-effort: a concurrent insert could
 * collide; the UI sorts by `display_order, created_at` so the visual impact
 * of a tie is deterministic. Exported so `upload.kbImage` can share the
 * same logic for `kb_images` rows without duplicating it.
 */
export async function nextDisplayOrder(
    table: "kb_folders" | "kb_items" | "kb_images",
    filters: Record<string, string | null>,
): Promise<number> {
    let query = getSupabase()
        .from(table)
        .select("display_order")
        .order("display_order", { ascending: false })
        .limit(1);
    for (const [col, val] of Object.entries(filters)) {
        query = val === null ? query.is(col, null) : query.eq(col, val);
    }
    const { data } = await query;
    const top = (data as Array<{ display_order: number }> | null)?.[0]?.display_order;
    return typeof top === "number" ? top + 1 : 0;
}

function safeFilename(name: string): string {
    // Strip path separators and control chars; cap length. Storage keys go
    // into a URL — anything weird here would force callers to URL-encode.
    // eslint-disable-next-line no-control-regex
    return name.replace(/[\\/]+/g, "_").replace(/[\u0000-\u001f]/g, "").slice(0, 200) || "file";
}

export const kbFolders = {
    async list(): Promise<{ data: KbFolder[]; error: Error | null }> {
        try {
            const userId = await getCurrentUserId();
            if (!userId) throw new Error("You must be signed in.");
            const { data, error } = await getSupabase()
                .from("kb_folders")
                .select(FOLDER_COLS)
                .eq("user_id", userId)
                .order("display_order", { ascending: true });
            if (error) throw error;
            return { data: (data as KbFolder[]) ?? [], error: null };
        } catch (err) {
            return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async create(input: { name: string; parent_id?: string | null }): Promise<{ data: KbFolder | null; error: Error | null }> {
        try {
            const userId = await getCurrentUserId();
            if (!userId) throw new Error("You must be signed in.");
            const parentId = input.parent_id ?? null;
            const display_order = await nextDisplayOrder("kb_folders", {
                user_id: userId,
                parent_id: parentId,
            });
            const { data, error } = await getSupabase()
                .from("kb_folders")
                .insert({
                    user_id: userId,
                    parent_id: parentId,
                    name: input.name,
                    kind: "manual",
                    display_order,
                })
                .select(FOLDER_COLS)
                .single();
            if (error) throw error;
            return { data: data as KbFolder, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async update(
        id: string,
        patch: Partial<Pick<KbFolder, "name" | "parent_id" | "display_order" | "use_for_ai">>,
    ): Promise<{ data: KbFolder | null; error: Error | null }> {
        try {
            // Defensive: a folder can't be its own parent (the SQL CHECK
            // constraint also enforces this; we fail fast to give a friendly
            // error instead of a constraint-violation toast).
            if (patch.parent_id && patch.parent_id === id) {
                throw new Error("A folder cannot be its own parent.");
            }
            const { data, error } = await getSupabase()
                .from("kb_folders")
                .update(patch)
                .eq("id", id)
                .select(FOLDER_COLS)
                .single();
            if (error) throw error;
            return { data: data as KbFolder, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async remove(id: string): Promise<{ error: Error | null }> {
        try {
            const { error } = await getSupabase()
                .from("kb_folders")
                .delete()
                .eq("id", id);
            if (error) throw error;
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

export const kbItems = {
    async list(folderId: string): Promise<{ data: KbItem[]; error: Error | null }> {
        try {
            const { data, error } = await getSupabase()
                .from("kb_items")
                .select(ITEM_COLS)
                .eq("folder_id", folderId)
                .order("display_order", { ascending: true });
            if (error) throw error;
            return { data: (data as KbItem[]) ?? [], error: null };
        } catch (err) {
            return { data: [], error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async createText(input: { folder_id: string; title?: string | null; content: string }): Promise<{ data: KbItem | null; error: Error | null }> {
        try {
            const userId = await getCurrentUserId();
            if (!userId) throw new Error("You must be signed in.");
            const display_order = await nextDisplayOrder("kb_items", {
                folder_id: input.folder_id,
            });
            const { data, error } = await getSupabase()
                .from("kb_items")
                .insert({
                    user_id: userId,
                    folder_id: input.folder_id,
                    type: "text",
                    title: input.title ?? null,
                    content: input.content,
                    source: "manual",
                    status: "ready",
                    display_order,
                })
                .select(ITEM_COLS)
                .single();
            if (error) throw error;
            return { data: data as KbItem, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async update(
        id: string,
        patch: Partial<Pick<KbItem, "title" | "content" | "caption" | "folder_id" | "display_order">>,
    ): Promise<{ data: KbItem | null; error: Error | null }> {
        try {
            const { data, error } = await getSupabase()
                .from("kb_items")
                .update(patch)
                .eq("id", id)
                .select(ITEM_COLS)
                .single();
            if (error) throw error;
            return { data: data as KbItem, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    async remove(id: string): Promise<{ error: Error | null }> {
        try {
            const sb = getSupabase();
            // Pull `type` + `url` so we can clean up storage objects after
            // the row is gone. We do the row delete first so RLS protects
            // against deleting another user's storage object via a guessed
            // id.
            const { data: existingRaw, error: fetchErr } = await sb
                .from("kb_items")
                .select("type,url")
                .eq("id", id)
                .maybeSingle();
            if (fetchErr) throw fetchErr;
            const existing = existingRaw as { type?: KbItem["type"]; url?: string | null } | null;

            const { error: delErr } = await sb.from("kb_items").delete().eq("id", id);
            if (delErr) throw delErr;

            // Best-effort storage cleanup. We don't surface a failure here
            // because the row is already gone; a stranded blob is harmless
            // and can be reaped by a later sweep.
            const url = existing?.url;
            const type = existing?.type;
            if (url && (type === "image" || type === "file")) {
                const bucket = type === "image" ? KB_IMAGES_BUCKET : KB_FILES_BUCKET;
                const path = extractStoragePath(url, bucket);
                if (path) {
                    void sb.storage.from(bucket).remove([path]);
                }
            }
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
    /**
     * Upload a file (PDF or image) into a KB folder. Inserts a `kb_items`
     * row pointing at the uploaded object.
     *   - images go to the public `kb-images` bucket and store a public URL
     *   - files (PDF/etc.) go to the private `kb-files` bucket and store the
     *     raw object path; consumers create signed URLs on demand
     */
    async upload(file: File, folderId: string, opts: { title?: string; caption?: string } = {}): Promise<{ data: KbItem | null; error: Error | null }> {
        try {
            const userId = await getCurrentUserId();
            if (!userId) throw new Error("You must be signed in.");

            const isImage = file.type.startsWith("image/");
            const bucket = isImage ? KB_IMAGES_BUCKET : KB_FILES_BUCKET;
            const path = `${userId}/${Date.now()}-${safeFilename(file.name)}`;

            const sb = getSupabase();
            const { error: upErr } = await sb.storage
                .from(bucket)
                .upload(path, file, { contentType: file.type, upsert: false });
            if (upErr) throw upErr;

            const url = isImage
                ? sb.storage.from(bucket).getPublicUrl(path).data?.publicUrl ?? path
                : path;

            const display_order = await nextDisplayOrder("kb_items", { folder_id: folderId });
            const { data, error } = await sb
                .from("kb_items")
                .insert({
                    user_id: userId,
                    folder_id: folderId,
                    type: isImage ? "image" : "file",
                    title: opts.title ?? null,
                    caption: opts.caption ?? "",
                    url,
                    mime_type: file.type,
                    file_size: file.size,
                    source: "upload",
                    status: "ready",
                    display_order,
                })
                .select(ITEM_COLS)
                .single();
            if (error) {
                // Roll back the storage upload so we don't leave orphans.
                void sb.storage.from(bucket).remove([path]);
                throw error;
            }
            return { data: data as KbItem, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

/**
 * Turn a stored `url` value back into the storage object path so we can
 * call `.remove([path])`.
 *
 * Two shapes the row can carry:
 *   - `kb-images`: a full public URL produced by `getPublicUrl()` —
 *     `<base>/storage/v1/object/public/<bucket>/<path>`
 *   - `kb-files`:  the raw object path (no scheme), because the bucket is
 *     private and consumers create signed URLs on demand.
 *
 * Anything else (different scheme, malformed input, foreign URL) returns
 * `null` so the caller skips the storage delete instead of accidentally
 * trying to remove the wrong key.
 */
function extractStoragePath(url: string, bucket: string): string | null {
    const marker = `/storage/v1/object/public/${bucket}/`;
    const idx = url.indexOf(marker);
    if (idx !== -1) return url.slice(idx + marker.length);
    // Raw path: no scheme, no leading slash, doesn't start with the marker
    // segment. Treat it as the object key for buckets we know store paths.
    if (bucket === KB_FILES_BUCKET && !/^[a-z][a-z0-9+.-]*:\/\//i.test(url) && !url.startsWith("/")) {
        return url;
    }
    return null;
}

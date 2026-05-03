/**
 * Upload helpers — Supabase Storage edition.
 *
 * Bucket conventions (created in the dashboard, policies in
 * `supabase/migrations/0002_rls_policies.sql` and `0004_knowledge_base.sql`):
 *   - `avatars`   → public-read; per-user folder `{auth.uid()}/...`
 *   - `kb-images` → public-read; per-user folder `{auth.uid()}/...`
 *
 * Avatar files are stored at a deterministic path
 *   `avatars/{user_id}/avatar.{ext}`
 * with `upsert: true`, so re-uploading the same file replaces the previous
 * version without a separate delete. The returned URL gets a `?t=<unix-ms>`
 * cache-buster appended by the *caller* (existing convention in
 * `ProfileTab.tsx`); we don't bake one into the URL itself.
 *
 * `kbImage` uploads to the `kb-images` bucket and inserts a row in
 * `public.kb_images`. The two-step write is rolled back (storage object
 * removed) if the row insert fails.
 */

import { getSupabase } from "@/lib/supabase";
import type { KbImage } from "./kbImages";
import { nextDisplayOrder } from "./kb";

const AVATAR_BUCKET = "avatars";
const KB_IMAGES_BUCKET = "kb-images";
const ALLOWED_AVATAR_TYPES = new Set([
    "image/png",
    "image/jpeg",
    "image/jpg",
    "image/webp",
    "image/gif",
]);
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;

function extFor(file: File): string {
    // Prefer the actual filename extension when present and short
    // (1–5 chars, lowercase alphanumeric — covers png/jpg/jpeg/webp/gif).
    // Otherwise fall back to the MIME subtype (e.g. "image/jpeg" → "jpeg").
    const dot = file.name.lastIndexOf(".");
    if (dot !== -1 && dot < file.name.length - 1) {
        const ext = file.name.slice(dot + 1).toLowerCase();
        if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
    }
    const sub = file.type.split("/")[1] ?? "bin";
    return sub.toLowerCase();
}

async function getCurrentUserId(): Promise<string | null> {
    try {
        const { data } = await getSupabase().auth.getSession();
        return data.session?.user?.id ?? null;
    } catch {
        return null;
    }
}

export const upload = {
    /**
     * Upload an avatar image. Returns `{ url }` on success — caller is
     * responsible for persisting `url` into `profiles.avatar_url`.
     */
    async avatar(file: File): Promise<{ url: string | null; error: Error | null }> {
        try {
            // ── Defensive client-side validation ────────────────────────
            // Server-side limits are enforced by Supabase (bucket settings)
            // but we surface a friendly error before burning a network round
            // trip.
            if (!ALLOWED_AVATAR_TYPES.has(file.type)) {
                throw new Error("Unsupported image type. Use PNG, JPEG, WebP, or GIF.");
            }
            if (file.size > MAX_AVATAR_BYTES) {
                throw new Error("Image must be under 5 MB.");
            }

            const userId = await getCurrentUserId();
            if (!userId) throw new Error("You must be signed in to upload an avatar.");

            const path = `${userId}/avatar.${extFor(file)}`;
            const sb = getSupabase();

            const { error: uploadError } = await sb.storage
                .from(AVATAR_BUCKET)
                .upload(path, file, {
                    upsert: true,
                    contentType: file.type,
                    cacheControl: "3600",
                });
            if (uploadError) throw uploadError;

            // `avatars` is public-read per RLS migration → no signed URL needed.
            const { data } = sb.storage.from(AVATAR_BUCKET).getPublicUrl(path);
            const url = data?.publicUrl ?? null;
            if (!url) throw new Error("Upload succeeded but Supabase returned no public URL.");

            return { url, error: null };
        } catch (err) {
            return {
                url: null,
                error: err instanceof Error ? err : new Error(String(err)),
            };
        }
    },

    /**
     * Delete the current user's avatar from storage. Caller is responsible for
     * clearing `profiles.avatar_url` afterwards (matches the legacy contract).
     *
     * We list the user's folder and remove every object in it so we don't
     * leave orphans behind when a user switches between file extensions
     * (`avatar.png` → `avatar.jpg`).
     */
    async deleteAvatar(): Promise<{ error: Error | null }> {
        try {
            const userId = await getCurrentUserId();
            if (!userId) throw new Error("You must be signed in to delete an avatar.");

            const sb = getSupabase();
            const { data: list, error: listErr } = await sb.storage
                .from(AVATAR_BUCKET)
                .list(userId);
            if (listErr) throw listErr;

            const paths = (list ?? [])
                .filter((entry) => entry?.name)
                .map((entry) => `${userId}/${entry.name}`);

            if (paths.length > 0) {
                const { error: removeErr } = await sb.storage
                    .from(AVATAR_BUCKET)
                    .remove(paths);
                if (removeErr) throw removeErr;
            }
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },

    /**
     * Upload a knowledge-base / chat-banner image.
     *
     * Two-step Supabase write:
     *   1. Upload the binary to the public `kb-images` bucket at
     *      `{auth.uid()}/{ts}-{filename}` (matches the path convention in
     *      `0004_knowledge_base.sql`'s storage policies).
     *   2. Insert a `kb_images` row pointing at the resulting public URL.
     *      `display_order` is auto-assigned (max + 1 within the same user).
     *
     * If step 2 fails we best-effort delete the storage object so we don't
     * leave orphans. Step 1 failures are surfaced as-is.
     */
    async kbImage(file: File, caption = ""): Promise<{ data: KbImage | null; error: Error | null }> {
        try {
            if (!file.type.startsWith("image/")) {
                throw new Error("Only image files are supported.");
            }
            if (file.size > MAX_AVATAR_BYTES) {
                throw new Error("Image must be under 5 MB.");
            }
            const userId = await getCurrentUserId();
            if (!userId) throw new Error("You must be signed in to upload an image.");

            const sb = getSupabase();
            const safeName = file.name.replace(/[\\/]+/g, "_").slice(0, 200) || "image";
            const path = `${userId}/${Date.now()}-${safeName}`;

            const { error: uploadError } = await sb.storage
                .from(KB_IMAGES_BUCKET)
                .upload(path, file, {
                    upsert: false,
                    contentType: file.type,
                    cacheControl: "3600",
                });
            if (uploadError) throw uploadError;

            const url = sb.storage.from(KB_IMAGES_BUCKET).getPublicUrl(path).data?.publicUrl;
            if (!url) {
                void sb.storage.from(KB_IMAGES_BUCKET).remove([path]);
                throw new Error("Upload succeeded but Supabase returned no public URL.");
            }

            const nextOrder = await nextDisplayOrder("kb_images", { user_id: userId });

            const { data, error } = await sb
                .from("kb_images")
                .insert({
                    user_id: userId,
                    url,
                    caption,
                    display_order: nextOrder,
                })
                .select("id,url,caption,display_order,created_at")
                .single();
            if (error) {
                void sb.storage.from(KB_IMAGES_BUCKET).remove([path]);
                throw error;
            }
            return { data: data as KbImage, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

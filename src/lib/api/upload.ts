/**
 * Upload helpers — Supabase Storage edition.
 *
 * Bucket conventions match `0002_rls_policies.sql`:
 *   - `avatars`   → public-read; per-user folder `{auth.uid()}/...`
 *   - `kb-images` → private; per-user folder `{auth.uid()}/...`
 *
 * Avatar files are stored at a deterministic path
 *   `avatars/{user_id}/avatar.{ext}`
 * with `upsert: true`, so re-uploading the same file replaces the previous
 * version without a separate delete. The returned URL gets a `?t=<unix-ms>`
 * cache-buster appended by the *caller* (existing convention in
 * `ProfileTab.tsx`); we don't bake one into the URL itself.
 *
 * NOTE: `kbImage` is intentionally NOT yet ported to Supabase Storage. The
 * `kb_images` table doesn't exist in the Supabase migrations yet (added in a
 * later phase together with the kb folder/items schema), and it would be a
 * dead-end to upload to a bucket without somewhere to record the row. Until
 * then, `kbImage` keeps talking to the legacy Express endpoint via
 * `apiFetch`, which now sends the live Supabase access token as its
 * `Authorization` header (see `src/lib/api/client.ts`).
 */

import { getSupabase } from "@/lib/supabase";
import { API_BASE, loadSession, saveSession, notifyListeners } from "./client";
import type { KbImage } from "./kbImages";

const AVATAR_BUCKET = "avatars";
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
     * Still routes through the legacy Express endpoint until the `kb_images`
     * table is added to the Supabase schema (later phase). The fetch helper
     * now attaches the Supabase access token, so the legacy server-side
     * authentication keeps working.
     */
    async kbImage(file: File, caption = ""): Promise<{ data: KbImage | null; error: Error | null }> {
        try {
            const session = loadSession();
            const formData = new FormData();
            formData.append("image", file);
            if (caption) formData.append("caption", caption);

            const headers: Record<string, string> = {};
            if (session?.token) headers["Authorization"] = `Bearer ${session.token}`;

            const res = await fetch(`${API_BASE}/upload/kb-image`, {
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
            if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
            return { data: json, error: null };
        } catch (err) {
            return { data: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

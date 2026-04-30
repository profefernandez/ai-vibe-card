/**
 * Upload helpers: avatar (POST/DELETE) and kb-image binary upload.
 *
 * Both upload functions enforce client-side file type and size guards
 * as a first line of defense before the request ever leaves the browser.
 * The server performs its own validation independently.
 */

import { API_BASE, loadSession, saveSession, notifyListeners, apiFetch } from "./client";
import type { KbImage } from "./kbImages";

const ALLOWED_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5 MB

export const upload = {
    /** Upload an avatar image file. Returns { url } on success. */
    async avatar(file: File): Promise<{ url: string | null; error: Error | null }> {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return {
                url: null,
                error: new Error("Only JPEG, PNG, WebP, or GIF images are allowed."),
            };
        }
        if (file.size > MAX_IMAGE_BYTES) {
            return { url: null, error: new Error("Image must be under 5 MB.") };
        }

        try {
            const session = loadSession();
            const formData = new FormData();
            formData.append("avatar", file);

            const headers: Record<string, string> = {};
            if (session?.token) {
                headers["Authorization"] = `Bearer ${session.token}`;
            }

            const res = await fetch(`${API_BASE}/upload/avatar`, {
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
            return { url: json.url, error: null };
        } catch (err) {
            return { url: null, error: err instanceof Error ? err : new Error(String(err)) };
        }
    },

    /** Delete the current avatar. */
    async deleteAvatar(): Promise<{ error: Error | null }> {
        try {
            await apiFetch("/upload/avatar", { method: "DELETE" });
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },

    /** Upload a knowledge-base / chat-banner image. Returns the new row. */
    async kbImage(file: File, caption = ""): Promise<{ data: KbImage | null; error: Error | null }> {
        if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
            return {
                data: null,
                error: new Error("Only JPEG, PNG, WebP, or GIF images are allowed."),
            };
        }
        if (file.size > MAX_IMAGE_BYTES) {
            return { data: null, error: new Error("Image must be under 5 MB.") };
        }

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

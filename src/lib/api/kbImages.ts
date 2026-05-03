/**
 * Knowledge-base image rows: list / public list / update / remove.
 *
 * Backed by Supabase table `kb_images` and storage bucket `kb-images`
 * (see `supabase/migrations/0004_knowledge_base.sql`). The public-read path
 * (`listPublic`) relies on the `kb_images_public_select` RLS policy, which
 * gates rows by `profiles.is_published = true` for the same `user_id`.
 */

import { getSupabase } from "@/lib/supabase";

export interface KbImage {
    id: string;
    url: string;
    caption: string;
    display_order: number;
    created_at?: string;
}

export const kbImages = {
    /** List the signed-in user's images, ordered by `display_order`. */
    async list(): Promise<{ data: KbImage[]; error: Error | null }> {
        try {
            const sb = getSupabase();
            const { data: sessionData } = await sb.auth.getSession();
            const userId = sessionData.session?.user?.id;
            if (!userId) throw new Error("You must be signed in.");

            const { data, error } = await sb
                .from("kb_images")
                .select("id,url,caption,display_order,created_at")
                .eq("user_id", userId)
                .order("display_order", { ascending: true });
            if (error) throw error;
            return { data: (data as KbImage[]) ?? [], error: null };
        } catch (err) {
            return {
                data: [],
                error: err instanceof Error ? err : new Error(String(err)),
            };
        }
    },

    /**
     * Anonymous-friendly read of a published profile's images. RLS does the
     * `is_published = true` check in the database; we only need to filter by
     * `user_id`.
     */
    async listPublic(userId: string): Promise<{ data: KbImage[]; error: Error | null }> {
        try {
            const { data, error } = await getSupabase()
                .from("kb_images")
                .select("id,url,caption,display_order,created_at")
                .eq("user_id", userId)
                .order("display_order", { ascending: true });
            if (error) throw error;
            return { data: (data as KbImage[]) ?? [], error: null };
        } catch (err) {
            return {
                data: [],
                error: err instanceof Error ? err : new Error(String(err)),
            };
        }
    },

    async update(
        id: string,
        patch: Partial<Pick<KbImage, "caption" | "display_order">>,
    ): Promise<{ error: Error | null }> {
        try {
            const { error } = await getSupabase()
                .from("kb_images")
                .update(patch)
                .eq("id", id);
            if (error) throw error;
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },

    async remove(id: string): Promise<{ error: Error | null }> {
        try {
            const { error } = await getSupabase()
                .from("kb_images")
                .delete()
                .eq("id", id);
            if (error) throw error;
            return { error: null };
        } catch (err) {
            return { error: err instanceof Error ? err : new Error(String(err)) };
        }
    },
};

/**
 * Knowledge Base API — folders + items.
 *
 * Backed by `kb_folders` and `kb_items` (migration 1700000012000_kb_unified).
 * The owner's KB is what the AI eventually grounds against; for now these
 * routes just provide CRUD so the admin UI can populate the tables.
 *
 * GET    /api/kb/folders                 — list owner's folders
 * POST   /api/kb/folders                 — create a folder
 * PATCH  /api/kb/folders/:id             — rename / reorder / move
 * DELETE /api/kb/folders/:id             — delete folder + cascade items
 *
 * GET    /api/kb/items?folder_id=...     — list items in a folder
 * POST   /api/kb/items                   — create a text item (manual entry)
 * PATCH  /api/kb/items/:id               — edit caption/title/content/order
 * DELETE /api/kb/items/:id               — delete item (file cleanup in upload route)
 *
 * File-backed items (image / file) are created via /api/kb/upload — see kbUpload.ts.
 */

import { Router } from "express";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { logger } from "../logger.js";

export const router = Router();

// ─── Folders ──────────────────────────────────────────────────────────────────

router.get("/folders", requireAuth, async (req: AuthRequest, res) => {
    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `SELECT id, parent_id, name, kind, source, use_for_ai, decorative, display_order, created_at, updated_at
                   FROM kb_folders
                  WHERE user_id = $1
                  ORDER BY display_order ASC, created_at ASC`,
                [req.user!.id],
            ),
        );
        res.json(rows);
    } catch (err) {
        logger.error({ err }, "kb folder list error");
        res.status(500).json({ error: "Failed to list folders" });
    }
});

router.post("/folders", requireAuth, async (req: AuthRequest, res) => {
    const name = typeof req.body?.name === "string" ? req.body.name.trim().slice(0, 200) : "";
    const parentId = typeof req.body?.parent_id === "string" ? req.body.parent_id : null;
    const kind = req.body?.kind === "scrape" || req.body?.kind === "system" ? req.body.kind : "manual";

    if (!name) return res.status(400).json({ error: "Name required" });

    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `INSERT INTO kb_folders (user_id, organization_id, parent_id, name, kind, display_order)
                 VALUES ($1, $2, $3, $4, $5,
                         COALESCE((SELECT MAX(display_order) + 1 FROM kb_folders WHERE user_id = $1 AND parent_id IS NOT DISTINCT FROM $3), 0))
                 RETURNING id, parent_id, name, kind, source, use_for_ai, decorative, display_order, created_at, updated_at`,
                [req.user!.id, req.user!.organizationId, parentId, name, kind],
            ),
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        logger.error({ err }, "kb folder create error");
        res.status(500).json({ error: "Failed to create folder" });
    }
});

router.patch("/folders/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof req.body?.name === "string") {
        values.push(req.body.name.trim().slice(0, 200));
        updates.push(`name = $${values.length}`);
    }
    if ("parent_id" in (req.body ?? {})) {
        values.push(req.body.parent_id ?? null);
        updates.push(`parent_id = $${values.length}`);
    }
    if (typeof req.body?.display_order === "number") {
        values.push(req.body.display_order);
        updates.push(`display_order = $${values.length}`);
    }
    if (typeof req.body?.use_for_ai === "boolean") {
        values.push(req.body.use_for_ai);
        updates.push(`use_for_ai = $${values.length}`);
    }
    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    values.push(id, req.user!.id);
    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `UPDATE kb_folders SET ${updates.join(", ")}
                  WHERE id = $${values.length - 1} AND user_id = $${values.length}
                  RETURNING id, parent_id, name, kind, source, use_for_ai, decorative, display_order, created_at, updated_at`,
                values,
            ),
        );
        if (rows.length === 0) return res.status(404).json({ error: "Not found" });
        res.json(rows[0]);
    } catch (err) {
        logger.error({ err }, "kb folder update error");
        res.status(500).json({ error: "Failed to update folder" });
    }
});

router.delete("/folders/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        const { rowCount } = await req.withClient!((c) =>
            c.query(`DELETE FROM kb_folders WHERE id = $1 AND user_id = $2`, [id, req.user!.id]),
        );
        if (rowCount === 0) return res.status(404).json({ error: "Not found" });
        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "kb folder delete error");
        res.status(500).json({ error: "Failed to delete folder" });
    }
});

// ─── Items ────────────────────────────────────────────────────────────────────

router.get("/items", requireAuth, async (req: AuthRequest, res) => {
    const folderId = typeof req.query.folder_id === "string" ? req.query.folder_id : null;
    if (!folderId) return res.status(400).json({ error: "folder_id required" });

    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `SELECT id, folder_id, type, title, content, url, mime_type, file_size, caption,
                        source, source_url, status, metadata, display_order, created_at, updated_at
                   FROM kb_items
                  WHERE user_id = $1 AND folder_id = $2
                  ORDER BY display_order ASC, created_at ASC`,
                [req.user!.id, folderId],
            ),
        );
        res.json(rows);
    } catch (err) {
        logger.error({ err }, "kb item list error");
        res.status(500).json({ error: "Failed to list items" });
    }
});

router.post("/items", requireAuth, async (req: AuthRequest, res) => {
    // Manual text entry only — file/image rows are inserted by the upload route.
    const folderId = typeof req.body?.folder_id === "string" ? req.body.folder_id : null;
    const title = typeof req.body?.title === "string" ? req.body.title.trim().slice(0, 500) : null;
    const content = typeof req.body?.content === "string" ? req.body.content : "";

    if (!folderId) return res.status(400).json({ error: "folder_id required" });
    if (!content.trim()) return res.status(400).json({ error: "content required" });

    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `INSERT INTO kb_items (user_id, organization_id, folder_id, type, title, content, source, status, display_order)
                 VALUES ($1, $2, $3, 'text', $4, $5, 'manual', 'ready',
                         COALESCE((SELECT MAX(display_order) + 1 FROM kb_items WHERE folder_id = $3), 0))
                 RETURNING id, folder_id, type, title, content, url, mime_type, file_size, caption,
                           source, source_url, status, metadata, display_order, created_at, updated_at`,
                [req.user!.id, req.user!.organizationId, folderId, title, content],
            ),
        );
        res.status(201).json(rows[0]);
    } catch (err) {
        logger.error({ err }, "kb item create error");
        res.status(500).json({ error: "Failed to create item" });
    }
});

router.patch("/items/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const updates: string[] = [];
    const values: unknown[] = [];

    if (typeof req.body?.title === "string") {
        values.push(req.body.title.trim().slice(0, 500));
        updates.push(`title = $${values.length}`);
    }
    if (typeof req.body?.content === "string") {
        values.push(req.body.content);
        updates.push(`content = $${values.length}`);
    }
    if (typeof req.body?.caption === "string") {
        values.push(req.body.caption.slice(0, 500));
        updates.push(`caption = $${values.length}`);
    }
    if (typeof req.body?.folder_id === "string") {
        values.push(req.body.folder_id);
        updates.push(`folder_id = $${values.length}`);
    }
    if (typeof req.body?.display_order === "number") {
        values.push(req.body.display_order);
        updates.push(`display_order = $${values.length}`);
    }
    if (updates.length === 0) return res.status(400).json({ error: "No fields to update" });

    values.push(id, req.user!.id);
    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `UPDATE kb_items SET ${updates.join(", ")}
                  WHERE id = $${values.length - 1} AND user_id = $${values.length}
                  RETURNING id, folder_id, type, title, content, url, mime_type, file_size, caption,
                            source, source_url, status, metadata, display_order, created_at, updated_at`,
                values,
            ),
        );
        if (rows.length === 0) return res.status(404).json({ error: "Not found" });
        res.json(rows[0]);
    } catch (err) {
        logger.error({ err }, "kb item update error");
        res.status(500).json({ error: "Failed to update item" });
    }
});

router.delete("/items/:id", requireAuth, async (req: AuthRequest, res) => {
    // We let the file cleanup be a best-effort follow-up — the row is the
    // source of truth, and a leftover file just wastes disk.
    const { id } = req.params;
    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `DELETE FROM kb_items WHERE id = $1 AND user_id = $2 RETURNING url, type`,
                [id, req.user!.id],
            ),
        );
        if (rows.length === 0) return res.status(404).json({ error: "Not found" });

        // Best-effort file unlink for image/file types
        if (rows[0].type !== "text" && typeof rows[0].url === "string" && rows[0].url.startsWith("/uploads/")) {
            try {
                const fs = await import("node:fs");
                const path = await import("node:path");
                const { fileURLToPath } = await import("node:url");
                const __filename = fileURLToPath(import.meta.url);
                const UPLOADS_DIR = path.resolve(path.dirname(__filename), "..", "uploads");
                const filename = rows[0].url.split("/").pop();
                if (filename) fs.unlinkSync(path.join(UPLOADS_DIR, filename));
            } catch { /* file already gone */ }
        }
        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "kb item delete error");
        res.status(500).json({ error: "Failed to delete item" });
    }
});

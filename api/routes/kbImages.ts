/**
 * Knowledge-base image library.
 * The slideshow that rotates inside the chat panel — uploaded by the
 * card owner, cycled per-turn on the visitor side.
 *
 * POST   /api/upload/kb-image     — multipart upload (field "image")
 * GET    /api/kb-images           — list current user's images, ordered
 * PATCH  /api/kb-images/:id       — update caption or display_order
 * DELETE /api/kb-images/:id       — remove file + row
 *
 * Files live under /uploads/kb-{userId}-{uuid}.{ext} and are served
 * statically by Express.
 */

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "url";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { serviceDb } from "../db.js";
import { logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024;

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req: AuthRequest, file, cb) => {
        const userId = req.user?.id ?? "unknown";
        const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
        cb(null, `kb-${userId}-${randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_MIME.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only JPEG, PNG, WebP, and GIF images are allowed"));
        }
    },
});

export const uploadRouter = Router();
export const router = Router();

// ─────────────────────────────────────────────────────────────────────────────
// Upload (mounted under /api/upload/kb-image)
// ─────────────────────────────────────────────────────────────────────────────
uploadRouter.post(
    "/",
    requireAuth,
    (req, res, next) => {
        upload.single("image")(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({ error: "File too large (max 5 MB)" });
                }
                return res.status(400).json({ error: err.message });
            }
            if (err) return res.status(400).json({ error: err.message });
            next();
        });
    },
    async (req: AuthRequest, res) => {
        if (!req.file) return res.status(400).json({ error: "No file uploaded" });
        const userId = req.user!.id;
        const orgId = req.user!.organizationId;
        const url = `/uploads/${req.file.filename}`;
        const caption = typeof req.body?.caption === "string" ? req.body.caption.slice(0, 200) : "";

        try {
            const { rows } = await req.withClient!((c) =>
                c.query(
                    `INSERT INTO kb_images (user_id, organization_id, url, caption, display_order)
                     VALUES ($1, $2, $3, $4, COALESCE((SELECT MAX(display_order) + 1 FROM kb_images WHERE user_id = $1), 0))
                     RETURNING id, url, caption, display_order, created_at`,
                    [userId, orgId, url, caption],
                ),
            );
            res.json(rows[0]);
        } catch (err) {
            logger.error({ err }, "kb-image upload error");
            // Clean up the file we just wrote — DB row didn't land
            try { fs.unlinkSync(path.join(UPLOADS_DIR, req.file.filename)); } catch { /* ignore */ }
            res.status(500).json({ error: "Failed to save image" });
        }
    },
);

// ─────────────────────────────────────────────────────────────────────────────
// CRUD (mounted under /api/kb-images)
// ─────────────────────────────────────────────────────────────────────────────

// Public read for the visitor chat panel — no auth, scoped by owner user_id.
// Uses serviceDb so RLS doesn't filter the result to zero rows.
router.get("/public/:userId", async (req, res) => {
    const { userId } = req.params;
    if (!/^[0-9a-f-]{36}$/i.test(userId)) {
        return res.status(400).json({ error: "Invalid user id" });
    }
    try {
        const { rows } = await serviceDb.query(
            `SELECT id, url, caption, display_order
               FROM kb_images
              WHERE user_id = $1
              ORDER BY display_order ASC, created_at ASC`,
            [userId],
        );
        res.json(rows);
    } catch (err) {
        logger.error({ err }, "kb-image public list error");
        res.status(500).json({ error: "Failed to list images" });
    }
});

router.get("/", requireAuth, async (req: AuthRequest, res) => {
    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `SELECT id, url, caption, display_order, created_at
                   FROM kb_images
                  WHERE user_id = $1
                  ORDER BY display_order ASC, created_at ASC`,
                [req.user!.id],
            ),
        );
        res.json(rows);
    } catch (err) {
        logger.error({ err }, "kb-image list error");
        res.status(500).json({ error: "Failed to list images" });
    }
});

router.patch("/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    const updates: string[] = [];
    const values: unknown[] = [];
    if (typeof req.body?.caption === "string") {
        values.push(req.body.caption.slice(0, 200));
        updates.push(`caption = $${values.length}`);
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
                `UPDATE kb_images SET ${updates.join(", ")}
                  WHERE id = $${values.length - 1} AND user_id = $${values.length}
                  RETURNING id, url, caption, display_order, created_at`,
                values,
            ),
        );
        if (rows.length === 0) return res.status(404).json({ error: "Not found" });
        res.json(rows[0]);
    } catch (err) {
        logger.error({ err }, "kb-image update error");
        res.status(500).json({ error: "Failed to update image" });
    }
});

router.delete("/:id", requireAuth, async (req: AuthRequest, res) => {
    const { id } = req.params;
    try {
        const { rows } = await req.withClient!((c) =>
            c.query(
                `DELETE FROM kb_images WHERE id = $1 AND user_id = $2 RETURNING url`,
                [id, req.user!.id],
            ),
        );
        if (rows.length === 0) return res.status(404).json({ error: "Not found" });
        const filename = rows[0].url.split("/").pop();
        if (filename) {
            try { fs.unlinkSync(path.join(UPLOADS_DIR, filename)); } catch { /* file already gone */ }
        }
        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "kb-image delete error");
        res.status(500).json({ error: "Failed to delete image" });
    }
});

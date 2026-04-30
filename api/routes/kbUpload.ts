/**
 * KB file upload — PDFs and images become kb_items rows.
 *
 * POST /api/kb/upload   — multipart "file" field, plus folder_id form field.
 *                         Inserts a kb_items row with type='file' (PDF) or
 *                         'image'. For PDFs, extracts text into `content`
 *                         so the AI can ground on it. The original file is
 *                         stored under /uploads/ for visitor display.
 *
 * Files live under /uploads/kb-{userId}-{uuid}.{ext}, served statically.
 */

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "url";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const ALLOWED_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const ALLOWED_FILE = ["application/pdf"];
const MAX_SIZE = 15 * 1024 * 1024; // 15 MB — PDFs run bigger than avatars

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req: AuthRequest, file, cb) => {
        const userId = req.user?.id ?? "unknown";
        const ext = path.extname(file.originalname).toLowerCase() || "";
        cb(null, `kb-${userId}-${randomUUID()}${ext}`);
    },
});

const upload = multer({
    storage,
    limits: { fileSize: MAX_SIZE },
    fileFilter: (_req, file, cb) => {
        if (ALLOWED_IMAGE.includes(file.mimetype) || ALLOWED_FILE.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error("Only PDFs and JPEG/PNG/WebP/GIF images are allowed"));
        }
    },
});

export const router = Router();

router.post(
    "/",
    requireAuth,
    (req, res, next) => {
        upload.single("file")(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({ error: "File too large (max 15 MB)" });
                }
                return res.status(400).json({ error: err.message });
            }
            if (err) return res.status(400).json({ error: err.message });
            next();
        });
    },
    async (req: AuthRequest, res) => {
        const file = req.file;
        if (!file) return res.status(400).json({ error: "No file uploaded" });
        const folderId = typeof req.body?.folder_id === "string" ? req.body.folder_id : null;
        if (!folderId) {
            try { fs.unlinkSync(file.path); } catch { /* ignore */ }
            return res.status(400).json({ error: "folder_id required" });
        }

        const userId = req.user!.id;
        const orgId = req.user!.organizationId;
        const url = `/uploads/${file.filename}`;
        const isImage = ALLOWED_IMAGE.includes(file.mimetype);
        const itemType = isImage ? "image" : "file";
        const title = typeof req.body?.title === "string"
            ? req.body.title.trim().slice(0, 500)
            : file.originalname.slice(0, 500);
        const caption = typeof req.body?.caption === "string" ? req.body.caption.slice(0, 500) : "";

        // PDF text extraction — best-effort. On failure we still create the
        // row so the file is at least visible / downloadable; the AI just
        // won't have body text to ground on for that doc.
        let content: string | null = null;
        if (file.mimetype === "application/pdf") {
            try {
                const buf = fs.readFileSync(file.path);
                const { PDFParse } = await import("pdf-parse");
                const parser = new PDFParse({ data: new Uint8Array(buf) });
                const result = await parser.getText();
                content = (result.text || "").trim() || null;
            } catch (err) {
                logger.warn({ err, file: file.filename }, "pdf text extraction failed");
            }
        }

        try {
            const { rows } = await req.withClient!((c) =>
                c.query(
                    `INSERT INTO kb_items (
                        user_id, organization_id, folder_id, type, title, content,
                        url, mime_type, file_size, caption, source, status, display_order
                     )
                     VALUES (
                        $1, $2, $3, $4, $5, $6,
                        $7, $8, $9, $10, 'upload', 'ready',
                        COALESCE((SELECT MAX(display_order) + 1 FROM kb_items WHERE folder_id = $3), 0)
                     )
                     RETURNING id, folder_id, type, title, content, url, mime_type, file_size, caption,
                               source, source_url, status, metadata, display_order, created_at, updated_at`,
                    [
                        userId, orgId, folderId, itemType, title, content,
                        url, file.mimetype, file.size, caption,
                    ],
                ),
            );
            res.status(201).json(rows[0]);
        } catch (err) {
            logger.error({ err }, "kb upload db error");
            try { fs.unlinkSync(file.path); } catch { /* ignore */ }
            res.status(500).json({ error: "Failed to save file" });
        }
    },
);

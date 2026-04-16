/**
 * Avatar upload route.
 * POST   /api/upload/avatar  — upload a profile photo (multipart/form-data)
 * DELETE /api/upload/avatar  — remove the profile photo
 * GET    /uploads/*          — served statically by Express in index.ts
 */

import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { db } from "../db.js";
import { logger } from "../logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.resolve(__dirname, "..", "uploads");

// Ensure uploads directory exists
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Only allow common image types
const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const MAX_SIZE = 5 * 1024 * 1024; // 5 MB

const storage = multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOADS_DIR),
    filename: (req: AuthRequest, file, cb) => {
        const userId = req.user?.id ?? "unknown";
        const ext = path.extname(file.originalname).toLowerCase() || ".jpg";
        // Deterministic name — one avatar per user, overwrites previous
        cb(null, `avatar-${userId}${ext}`);
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

export const router = Router();

/**
 * POST /api/upload/avatar
 * Accepts multipart field "avatar". Saves the file and updates profiles.avatar_url.
 */
router.post(
    "/avatar",
    requireAuth,
    (req, res, next) => {
        upload.single("avatar")(req, res, (err) => {
            if (err instanceof multer.MulterError) {
                if (err.code === "LIMIT_FILE_SIZE") {
                    return res.status(413).json({ error: "File too large (max 5 MB)" });
                }
                return res.status(400).json({ error: err.message });
            }
            if (err) {
                return res.status(400).json({ error: err.message });
            }
            next();
        });
    },
    async (req: AuthRequest, res) => {
        if (!req.file) {
            return res.status(400).json({ error: "No file uploaded" });
        }

        const userId = req.user!.id;
        const avatarUrl = `/uploads/${req.file.filename}`;

        try {
            // Remove any old avatar files for this user (different extension)
            const files = fs.readdirSync(UPLOADS_DIR);
            for (const f of files) {
                if (f.startsWith(`avatar-${userId}`) && f !== req.file.filename) {
                    fs.unlinkSync(path.join(UPLOADS_DIR, f));
                }
            }

            // Update the profile row
            await db.query(
                `UPDATE profiles SET avatar_url = $1, updated_at = NOW() WHERE user_id = $2`,
                [avatarUrl, userId]
            );

            res.json({ url: avatarUrl });
        } catch (err) {
            logger.error({ err }, "avatar upload error");
            res.status(500).json({ error: "Failed to save avatar" });
        }
    }
);

/**
 * DELETE /api/upload/avatar
 * Removes the avatar file and clears profiles.avatar_url.
 */
router.delete("/avatar", requireAuth, async (req: AuthRequest, res) => {
    const userId = req.user!.id;

    try {
        // Remove all avatar files for this user
        const files = fs.readdirSync(UPLOADS_DIR);
        for (const f of files) {
            if (f.startsWith(`avatar-${userId}`)) {
                fs.unlinkSync(path.join(UPLOADS_DIR, f));
            }
        }

        // Clear the avatar URL in the DB
        await db.query(
            `UPDATE profiles SET avatar_url = '', updated_at = NOW() WHERE user_id = $1`,
            [userId]
        );

        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "avatar delete error");
        res.status(500).json({ error: "Failed to delete avatar" });
    }
});

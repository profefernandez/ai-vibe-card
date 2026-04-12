/**
 * Express API server — runs on your Scala Hosting VPS.
 *
 * Start with:  node api/index.js   (after tsc or ts-node)
 * Or add to your SPanel startup: node /var/www/aivibe/api/index.js
 *
 * Required environment variables (set in server .env or SPanel secrets):
 *   DATABASE_URL   postgresql://aivibe_user:<password>@127.0.0.1:5432/aivibe_db
 *   JWT_SECRET     <32+ char random string>
 *   PORT           (optional, defaults to 3001)
 *   FIRECRAWL_API_KEY  <key>     (for scrape-site)
 *   AI_API_KEY         <key>     (for query-content — OpenAI compatible)
 *   AI_API_URL         https://... (AI gateway base URL)
 *   AI_MODEL           <model name>
 */

import express from "express";
import cors from "cors";
import rateLimit from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { router as authRouter } from "./routes/auth.js";
import { router as tablesRouter } from "./routes/tables.js";
import { router as functionsRouter } from "./routes/functions/index.js";
import { router as uploadRouter } from "./routes/upload.js";
import { db } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim())
    : ["http://localhost:8080", "http://localhost:3001"];
app.use(cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (server-to-server, curl, mobile apps)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("Not allowed by CORS"));
        }
    },
}));
app.use(express.json({ limit: "2mb" }));

// Rate limiters
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many attempts, please try again later" } });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: "Too many requests, please slow down" } });

// ── Static file serving for uploaded avatars ──────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/tables", tablesRouter);
app.use("/api/functions/lemonade-chat", chatLimiter);
app.use("/api/functions", functionsRouter);
app.use("/api/upload", uploadRouter);

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Dynamic robots.txt — renders structured JSON into standard robots.txt format
app.get("/robots.txt", async (_req, res) => {
    try {
        const { rows } = await db.query(
            `SELECT robots_txt FROM profiles LIMIT 1`
        );
        const directives = rows[0]?.robots_txt ?? [{ userAgent: "*", rules: [{ action: "allow", path: "/" }] }];
        const lines: string[] = [];
        for (const group of directives) {
            lines.push(`User-agent: ${group.userAgent}`);
            for (const rule of group.rules || []) {
                lines.push(`${rule.action === "disallow" ? "Disallow" : "Allow"}: ${rule.path}`);
            }
            lines.push("");
        }
        res.type("text/plain").send(lines.join("\n"));
    } catch {
        res.type("text/plain").send("User-agent: *\nAllow: /\n");
    }
});

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`AI Vibe Card API listening on port ${PORT}`);
});

export default app;

/**
 * Express API server.
 *
 * Required environment variables:
 *   NODE_ENV           production | development
 *   DATABASE_URL       postgresql://user:pass@host:5432/db
 *   JWT_SECRET         32+ char random string
 *   ENCRYPTION_KEY     64-char hex string (32 bytes)
 *   PORT               default 3001
 *   HOST               default 127.0.0.1 (set to 0.0.0.0 inside Docker)
 *   CORS_ORIGINS       comma-separated list of allowed origins
 *   LOG_LEVEL          debug | info | warn | error   (default info in prod)
 *
 * External integrations (optional depending on features):
 *   FIRECRAWL_API_KEY, AI_API_URL, AI_API_KEY, AI_MODEL,
 *   LEMONADE_API_KEY, LEMONADE_CONTENT_ID, LEMONADE_SECURITY_ID,
 *   REFRESH_SECRET
 */

import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import jwt from "jsonwebtoken";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";

import { logger } from "./logger.js";
import { router as authRouter } from "./routes/auth.js";
import { router as tablesRouter } from "./routes/tables.js";
import { router as functionsRouter } from "./routes/functions/index.js";
import { router as uploadRouter } from "./routes/upload.js";
import { router as cardRouter } from "./routes/card.js";
import { db } from "./db.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ── Startup validation ────────────────────────────────────────────────────────
function fatal(msg: string): never {
    logger.fatal(msg);
    process.exit(1);
}

if (!process.env.NODE_ENV) {
    logger.warn("NODE_ENV is not set — defaulting to development. Set NODE_ENV=production in prod.");
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) fatal("Missing required environment variable: DATABASE_URL");

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) fatal("Missing required environment variable: JWT_SECRET");
if (JWT_SECRET.length < 32) fatal("JWT_SECRET must be at least 32 characters");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64 || !/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)) {
    fatal(
        'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
            'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
    );
}

const app = express();
const PORT = Number(process.env.PORT ?? 3001);
const HOST = process.env.HOST ?? "127.0.0.1";

// ── Request logging with correlation IDs ─────────────────────────────────────
app.use(
    pinoHttp({
        logger,
        genReqId: (req, res) => {
            const existing = req.headers["x-request-id"];
            const id = typeof existing === "string" && existing.length > 0 ? existing : randomUUID();
            res.setHeader("x-request-id", id);
            return id;
        },
        customLogLevel: (_req, res, err) => {
            if (err || res.statusCode >= 500) return "error";
            if (res.statusCode >= 400) return "warn";
            return "info";
        },
    }),
);

// ── CORS ─────────────────────────────────────────────────────────────────────
const ALLOWED_ORIGINS = process.env.CORS_ORIGINS
    ? process.env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean)
    : ["http://localhost:8080", "http://localhost:3001"];

app.use(
    cors({
        origin: (origin, callback) => {
            if (!origin || ALLOWED_ORIGINS.includes(origin)) {
                callback(null, true);
            } else {
                callback(new Error("Not allowed by CORS"));
            }
        },
    }),
);
app.use(express.json({ limit: "2mb" }));

// ── Security headers ─────────────────────────────────────────────────────────
app.use((_req, res, next) => {
    res.setHeader("Strict-Transport-Security", "max-age=63072000; includeSubDomains; preload");
    res.setHeader(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; frame-src https:; connect-src 'self' https:; font-src 'self' https:; object-src 'none'; base-uri 'self'; form-action 'self'",
    );
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader("X-XSS-Protection", "1; mode=block");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    next();
});

// CSRF — validate Origin header on state-changing requests
app.use((req, res, next) => {
    if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin || ALLOWED_ORIGINS.includes(origin)) return next();
    res.status(403).json({ error: "Forbidden: origin not allowed" });
});

// ── Rate limiters ────────────────────────────────────────────────────────────
function userOrIpKey(req: Request): string {
    try {
        const header = req.headers.authorization;
        if (header?.startsWith("Bearer ")) {
            const payload = jwt.verify(header.slice(7), JWT_SECRET!) as { sub?: string };
            if (payload?.sub) return `user:${payload.sub}`;
        }
    } catch {
        /* fall through to IP */
    }
    return ipKeyGenerator(req.ip ?? "unknown");
}

const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many attempts, please try again later" } });
const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: "Too many requests, please slow down" }, keyGenerator: userOrIpKey });
const queryContentLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: "Too many queries, please slow down" }, keyGenerator: userOrIpKey });
const connectLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Too many connection requests, please try again later" } });
const connectionQueryLimiter = rateLimit({ windowMs: 60 * 1000, max: 15, message: { error: "Too many AI queries, please slow down" }, keyGenerator: userOrIpKey });

// ── Static uploads ───────────────────────────────────────────────────────────
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ── Health / readiness ───────────────────────────────────────────────────────
// Liveness: process is up. Cheap, always responds.
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// Readiness: dependencies reachable. Used by Docker healthcheck and load balancers.
app.get("/api/ready", async (_req, res) => {
    try {
        await db.query("SELECT 1");
        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "readiness check failed");
        res.status(503).json({ ok: false, error: "database unreachable" });
    }
});

// ── Routes ───────────────────────────────────────────────────────────────────
app.use("/api/auth", authLimiter, authRouter);
app.use("/api/functions/lemonade-chat", chatLimiter);
app.use("/api/functions/query-content", queryContentLimiter);
app.use("/api/card/:slug/connect", connectLimiter);
app.use("/api/connections/:id/query", connectionQueryLimiter);

app.use("/api/tables", tablesRouter);
app.use("/api/functions", functionsRouter);
app.use("/api/upload", uploadRouter);
app.use("/api/card", cardRouter);
app.use("/api/connections", cardRouter);

// Dynamic robots.txt — renders structured JSON into standard robots.txt format
app.get("/robots.txt", async (_req, res) => {
    try {
        const { rows } = await db.query(`SELECT robots_txt FROM profiles LIMIT 1`);
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

// ── 404 handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
    res.status(404).json({ error: "Not found", path: req.path });
});

// ── Centralized error handler ────────────────────────────────────────────────
// Must be last, must have 4 args for Express to recognise it as an error handler.
app.use((err: unknown, req: Request, res: Response, _next: NextFunction) => {
    const reqId = (req as Request & { id?: string }).id;
    const isProd = process.env.NODE_ENV === "production";

    if (err instanceof Error && err.message === "Not allowed by CORS") {
        return res.status(403).json({ error: "Origin not allowed", requestId: reqId });
    }

    logger.error({ err, reqId, path: req.path, method: req.method }, "unhandled error");

    if (res.headersSent) return;
    res.status(500).json({
        error: isProd ? "Internal server error" : (err instanceof Error ? err.message : String(err)),
        requestId: reqId,
    });
});

// ── Start + graceful shutdown ────────────────────────────────────────────────
const server = app.listen(PORT, HOST, () => {
    logger.info({ host: HOST, port: PORT, env: process.env.NODE_ENV ?? "development" }, "API listening");
});

const SHUTDOWN_TIMEOUT_MS = 15_000;

function shutdown(signal: string): void {
    logger.info({ signal }, "shutdown initiated");

    const forceExit = setTimeout(() => {
        logger.error("shutdown timed out — forcing exit");
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    forceExit.unref();

    server.close(async (err) => {
        if (err) logger.error({ err }, "error closing HTTP server");
        try {
            await db.end();
            logger.info("db pool closed; exiting cleanly");
            process.exit(0);
        } catch (closeErr) {
            logger.error({ err: closeErr }, "error closing db pool");
            process.exit(1);
        }
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
process.on("unhandledRejection", (reason) => {
    logger.error({ err: reason }, "unhandledRejection");
});
process.on("uncaughtException", (err) => {
    logger.fatal({ err }, "uncaughtException — shutting down");
    shutdown("uncaughtException");
});

export default app;

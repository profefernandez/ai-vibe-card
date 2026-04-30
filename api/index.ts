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

import express, { type Express, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { pinoHttp } from "pino-http";
import { createHash, randomUUID } from "node:crypto";

import { logger } from "./logger.js";
import { verifyJwtWithRotation } from "./middleware/auth.js";
import { attachDbHelper, db, serviceDb } from "./db.js";
import { router as authRouter } from "./routes/auth.js";
import { router as tablesRouter } from "./routes/tables.js";
import { router as functionsRouter } from "./routes/functions.js";
import { router as uploadRouter } from "./routes/upload.js";
import { router as kbImagesRouter, uploadRouter as kbImageUploadRouter } from "./routes/kbImages.js";
import { router as kbRouter } from "./routes/kb.js";
import { router as kbUploadRouter } from "./routes/kbUpload.js";
import { router as cardRouter } from "./routes/card.js";
import { router as feedbackRouter } from "./routes/feedback.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config();

// ── Startup validation ────────────────────────────────────────────────────────
function fatal(msg: string): never {
    logger.fatal(msg);
    process.exit(1);
}

/**
 * Validate required env vars. Called from `createApp()` so tests that
 * preset env in setup files get the same checks the prod entry path does.
 * Exported for the rare integration-test scenario that wants to assert
 * validation behaviour directly.
 */
export function validateEnv(): void {
    if (!process.env.NODE_ENV) {
        logger.warn("NODE_ENV is not set — defaulting to development. Set NODE_ENV=production in prod.");
    }

    if (!process.env.DATABASE_URL) fatal("Missing required environment variable: DATABASE_URL");

    const JWT_SECRET = process.env.JWT_SECRET;
    if (!JWT_SECRET) fatal("Missing required environment variable: JWT_SECRET");
    if (JWT_SECRET.length < 32) fatal("JWT_SECRET must be at least 32 characters");

    // Optional rotation secret. When set, requireAuth verifies tokens against
    // JWT_SECRET first and falls back to JWT_SECRET_PREVIOUS — letting us roll
    // the signing key without immediately invalidating every active session.
    // Sign paths always use JWT_SECRET. Rotation procedure documented in
    // CODEBASE.md.
    const JWT_SECRET_PREVIOUS = process.env.JWT_SECRET_PREVIOUS;
    if (JWT_SECRET_PREVIOUS && JWT_SECRET_PREVIOUS.length < 32) {
        fatal("JWT_SECRET_PREVIOUS must be at least 32 characters when set");
    }

    const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY;
    if (!ENCRYPTION_KEY || ENCRYPTION_KEY.length !== 64 || !/^[0-9a-f]{64}$/i.test(ENCRYPTION_KEY)) {
        fatal(
            'ENCRYPTION_KEY must be a 64-character hex string (32 bytes). ' +
                'Generate with: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
        );
    }
}

/**
 * Build the Express app with all middleware and routes wired up. Does NOT
 * call `listen()`. Use this from tests via `test/helpers/build-app.ts`; the
 * production entry path below also calls it before binding the port.
 */
export function createApp(): Express {
    validateEnv();

    const app = express();

    // Exactly one trusted hop in front of us: the `web` nginx container in
    // docker-compose, which sets X-Forwarded-For. Trusting `1` (not 'uniquelocal')
    // prevents anything else on the docker bridge from spoofing X-Forwarded-For.
    app.set("trust proxy", 1);

    // ── Request logging with correlation IDs ─────────────────────────────────
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

    // ── CORS ─────────────────────────────────────────────────────────────────
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

    // Phase 6 plumbing: bind req.withClient so any route handler can run a
    // transaction with RLS context (SET LOCAL app.user_id / app.org_id) without
    // each handler re-implementing the dance. Pre-RLS this is a no-op shape
    // change; once policies are enabled (Phase 6c+), every authed db query must
    // flow through this helper to be visible.
    app.use(attachDbHelper);

    // ── Security headers (helmet) ────────────────────────────────────────────
    //
    // CSP directives are built from observed usage (grep of src/ + api/), not
    // memory. Notes per directive:
    //   default-src 'self'      — fall-through deny for anything not listed.
    //   script-src 'self'       — Vite emits hashed external modules; no inline.
    //   style-src 'self' 'unsafe-inline' https://fonts.googleapis.com
    //                           — Tailwind / framer-motion inject inline style
    //                             attributes; Google Fonts CSS is loaded from
    //                             fonts.googleapis.com via index.css @import.
    //   font-src 'self' https://fonts.gstatic.com data:
    //                           — Google Fonts ships woff2 from fonts.gstatic.com;
    //                             data: needed for some shadcn icon fonts.
    //   img-src 'self' data: https: blob:
    //                           — Avatars, QR codes (api.qrserver.com), scraped
    //                             site images (arbitrary HTTPS hosts), and
    //                             blob: for client-side image previews.
    //   connect-src 'self'      — Browser only talks to same-origin /api. Every
    //                             cross-origin fetch (OpenAI, Anthropic, Lemonade,
    //                             Firecrawl) is performed server-side. If the
    //                             frontend ever calls a vendor directly, add it.
    //   frame-src 'self' https: — `cta_embed` is owner-supplied DOMPurify-allowed
    //                             iframe HTML; Calendly is the common case but
    //                             Loom/YouTube/Vimeo/Google Calendar are all
    //                             reasonable. Locked to HTTPS only.
    //   object-src 'none'       — no Flash / plugins.
    //   base-uri 'self'         — neutralizes <base href> hijack.
    //   form-action 'self'      — no third-party form posts.
    app.use(
        helmet({
            contentSecurityPolicy: {
                useDefaults: false,
                directives: {
                    "default-src": ["'self'"],
                    "script-src": ["'self'"],
                    "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
                    "font-src": ["'self'", "https://fonts.gstatic.com", "data:"],
                    "img-src": ["'self'", "data:", "https:", "blob:"],
                    "connect-src": ["'self'"],
                    "frame-src": ["'self'", "https:"],
                    // Nothing should embed *us*. (frame-src governs what we
                    // embed; frame-ancestors governs who embeds us — different
                    // direction. Replaces the prior X-Frame-Options: DENY.)
                    "frame-ancestors": ["'none'"],
                    "object-src": ["'none'"],
                    "base-uri": ["'self'"],
                    "form-action": ["'self'"],
                },
            },
            // Restore the stricter X-Frame-Options that the manual config used.
            // Helmet defaults this to SAMEORIGIN; we have no reason to be framed.
            frameguard: { action: "deny" },
            // Match the prior Referrer-Policy. Helmet defaults to no-referrer
            // which is stricter, but breaks 3rd-party referer-aware analytics
            // we may add later. strict-origin-when-cross-origin sends the
            // origin only on cross-origin nav and full URL same-origin —
            // sane default that doesn't leak paths externally.
            referrerPolicy: { policy: "strict-origin-when-cross-origin" },
            // Helmet's defaults give us HSTS (long max-age + includeSubDomains +
            // preload), X-Content-Type-Options, Referrer-Policy strict-origin-
            // when-cross-origin, and X-Frame-Options DENY. Cross-Origin-*
            // policies default to same-origin — fine for an SPA + JSON API.
            // X-XSS-Protection is intentionally omitted (deprecated, can
            // introduce its own vulnerabilities); we rely on CSP instead.
        }),
    );

    // Permissions-Policy: helmet sets a basic one, but we're stricter — disable
    // camera/mic/geo since none of our flows use them.
    app.use((_req, res, next) => {
        res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
        next();
    });

    // (CSRF Origin check removed: auth is Bearer-token-only; no cookies are set
    // anywhere in the API — verified by grep of res.cookie / Set-Cookie. The
    // previous half-check let through requests with no Origin header at all,
    // which is more misleading than helpful. CORS already restricts origins
    // for browser-initiated requests via the `cors` middleware above.)

    // ── Rate limiters ────────────────────────────────────────────────────────
    function userOrIpKey(req: Request): string {
        const header = req.headers.authorization;
        if (header?.startsWith("Bearer ")) {
            const payload = verifyJwtWithRotation<{ sub?: string }>(header.slice(7));
            if (payload?.sub) return `user:${payload.sub}`;
        }
        return ipKeyGenerator(req.ip ?? "unknown");
    }

    const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: "Too many attempts, please try again later" } });
    const chatLimiter = rateLimit({ windowMs: 60 * 1000, max: 30, message: { error: "Too many requests, please slow down" }, keyGenerator: userOrIpKey });
    const queryContentLimiter = rateLimit({ windowMs: 60 * 1000, max: 20, message: { error: "Too many queries, please slow down" }, keyGenerator: userOrIpKey });
    const connectLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: "Too many connection requests, please try again later" } });
    const connectionQueryLimiter = rateLimit({ windowMs: 60 * 1000, max: 15, message: { error: "Too many AI queries, please slow down" }, keyGenerator: userOrIpKey });

    // Cron endpoint protection. Auth is via REFRESH_SECRET (validated inside the
    // handler), but we still rate-limit per token so a leaked secret can't be
    // used to hammer Firecrawl. Key on the SHA-256 of the bearer so we never
    // store the secret itself in the limiter map.
    const refreshLimiter = rateLimit({
        windowMs: 60 * 1000,
        max: 5,
        message: { error: "Too many refresh requests" },
        keyGenerator: (req) => {
            const header = req.headers.authorization;
            if (header?.startsWith("Bearer ")) {
                return `refresh:${createHash("sha256").update(header.slice(7)).digest("hex")}`;
            }
            return ipKeyGenerator(req.ip ?? "unknown");
        },
    });

    // ── Static uploads ───────────────────────────────────────────────────────
    app.use("/uploads", express.static(path.join(__dirname, "uploads")));

    // ── Health / readiness ───────────────────────────────────────────────────
    // Liveness: process is up. Cheap, always responds.
    app.get("/api/health", (_req, res) => res.json({ ok: true }));

    // Readiness: dependencies reachable. Used by Docker healthcheck and load balancers.
    app.get("/api/ready", async (_req, res) => {
        try {
            // Healthcheck on the regular pool — service pool reuses the same
            // backing process when DATABASE_URL_SERVICE is unset, so checking
            // db is sufficient and avoids hitting the BYPASSRLS path on every
            // ping.
            await db.query("SELECT 1");
            res.json({ ok: true });
        } catch (err) {
            logger.error({ err }, "readiness check failed");
            res.status(503).json({ ok: false, error: "database unreachable" });
        }
    });

    // ── Routes ───────────────────────────────────────────────────────────────
    app.use("/api/auth", authLimiter, authRouter);
    app.use("/api/functions/lemonade-chat", chatLimiter);
    app.use("/api/functions/query-content", queryContentLimiter);
    app.use("/api/functions/refresh-sites", refreshLimiter);
    // Reuse refreshLimiter for prune-logs — same bearer-secret auth model, same
    // keying strategy. Cap is per-token, so the two cron endpoints share a
    // budget; 5/min is generous for either.
    app.use("/api/functions/prune-logs", refreshLimiter);
    app.use("/api/card/:slug/connect", connectLimiter);
    app.use("/api/connections/:id/query", connectionQueryLimiter);

    app.use("/api/tables", tablesRouter);
    app.use("/api/functions", functionsRouter);
    app.use("/api/upload", uploadRouter);
    app.use("/api/upload/kb-image", kbImageUploadRouter);
    app.use("/api/kb-images", kbImagesRouter);
    app.use("/api/kb", kbRouter);
    app.use("/api/kb/upload", kbUploadRouter);
    app.use("/api/card", cardRouter);
    app.use("/api/connections", cardRouter);
    app.use("/api/feedback", feedbackRouter);

    // Dynamic robots.txt — renders structured JSON into standard robots.txt format.
    // Public, unauthenticated endpoint: uses serviceDb so RLS (once enabled)
    // doesn't filter the lookup to zero rows.
    app.get("/robots.txt", async (_req, res) => {
        try {
            const { rows } = await serviceDb.query(`SELECT robots_txt FROM profiles LIMIT 1`);
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

    // ── 404 handler ──────────────────────────────────────────────────────────
    app.use((req, res) => {
        res.status(404).json({ error: "Not found", path: req.path });
    });

    // ── Centralized error handler ────────────────────────────────────────────
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

    return app;
}

/**
 * Bind the port and install signal handlers. Separated from `createApp()`
 * so tests can build the app without spawning a listener or installing
 * process-wide handlers (which would leak between Vitest test files).
 */
export function start(): void {
    const app = createApp();
    const PORT = Number(process.env.PORT ?? 3001);
    const HOST = process.env.HOST ?? "127.0.0.1";

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
                await Promise.all([db.end(), serviceDb.end()]);
                logger.info("db pools closed; exiting cleanly");
                process.exit(0);
            } catch (closeErr) {
                logger.error({ err: closeErr }, "error closing db pools");
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
}

// ── Entry point guard ─────────────────────────────────────────────────────────
// Only bind the port when this module is the process entry — i.e. invoked via
// `tsx watch index.ts` (dev) or `node dist/index.js` (prod). Importing it from
// a test (which does `import { createApp } from "../../index.js"`) must NOT
// start a listener.
//
// `process.argv[1]` is the script path the runtime resolved; comparing the
// resolved file URL against `import.meta.url` is the standard Node ESM
// pattern. Falls back to a safe no-op if argv is unexpected.
const entryPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
const thisPath = fileURLToPath(import.meta.url);
if (entryPath === thisPath) {
    start();
}

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
import dotenv from "dotenv";
import { router as authRouter } from "./routes/auth.js";
import { router as tablesRouter } from "./routes/tables.js";
import { router as functionsRouter } from "./routes/functions/index.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "2mb" }));

// ── Routes ────────────────────────────────────────────────────────────────────
app.use("/api/auth", authRouter);
app.use("/api/tables", tablesRouter);
app.use("/api/functions", functionsRouter);

// Health check
app.get("/api/health", (_req, res) => res.json({ ok: true }));

// ── Start ─────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
    console.log(`AI Vibe Card API listening on port ${PORT}`);
});

export default app;

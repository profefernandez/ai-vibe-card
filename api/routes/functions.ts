/**
 * Express router mounting all function handlers.
 * POST /api/functions/:name
 */

import { Router } from "express";
import { requireAuth } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { handler as queryContent } from "./query-content.js";
import { handler as scrapeSite } from "./scrape-site.js";
import { handler as testApiConnection } from "./test-api-connection.js";
import { handler as lemonadeChat } from "./lemonade-chat.js";
import { handler as refreshSites } from "./refresh-sites.js";
import { handler as pruneLogs } from "./prune-logs.js";
import { handler as verifyDomain } from "./verify-domain.js";

export const router = Router();

// Read-only function: any signed-in member can search their org's content.
router.post("/query-content", requireAuth, queryContent);

// Mutating / privileged: scraping, verifying domain ownership, and probing
// stored API keys are all owner/admin work. A `member` role (when we issue
// it) should not be able to trigger paid Firecrawl crawls or read decrypted
// vendor keys via the test-connection path.
const adminOnly = requireRole("owner", "admin");
router.post("/scrape-site", requireAuth, adminOnly, scrapeSite);
router.post("/test-api-connection", requireAuth, adminOnly, testApiConnection);
router.post("/verify-domain", requireAuth, adminOnly, verifyDomain);

// Public-facing visitor chat — auth handled inside the handler (none required).
router.post("/lemonade-chat", lemonadeChat);
// Cron endpoints — auth via REFRESH_SECRET inside the handler.
router.post("/refresh-sites", refreshSites);
router.post("/prune-logs", pruneLogs);

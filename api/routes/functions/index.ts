/**
 * Express router mounting all function handlers.
 * POST /api/functions/:name
 */

import { Router } from "express";
import { requireAuth } from "../../middleware/auth.js";
import { handler as queryContent } from "./query-content.js";
import { handler as scrapeSite } from "./scrape-site.js";
import { handler as testApiConnection } from "./test-api-connection.js";
import { handler as lemonadeChat } from "./lemonade-chat.js";
import { handler as refreshSites } from "./refresh-sites.js";

export const router = Router();

router.post("/query-content", requireAuth, queryContent);
router.post("/scrape-site", requireAuth, scrapeSite);
router.post("/test-api-connection", requireAuth, testApiConnection);
router.post("/lemonade-chat", lemonadeChat);  // public-facing (visitor chat)
router.post("/refresh-sites", refreshSites);

/**
 * Express router mounting all function handlers.
 * POST /api/functions/:name
 */

import { Router } from "express";
import { handler as queryContent } from "./query-content.js";
import { handler as scrapeSite } from "./scrape-site.js";
import { handler as testApiConnection } from "./test-api-connection.js";
import { handler as lemonadeChat } from "./lemonade-chat.js";
import { handler as refreshSites } from "./refresh-sites.js";

export const router = Router();

router.post("/query-content", queryContent);
router.post("/scrape-site", scrapeSite);
router.post("/test-api-connection", testApiConnection);
router.post("/lemonade-chat", lemonadeChat);
router.post("/refresh-sites", refreshSites);

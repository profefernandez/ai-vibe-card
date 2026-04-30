/**
 * Test entry into the production Express wiring. We chose the Preferred
 * approach in PR-E1: api/index.ts now exports `createApp()`, and this helper
 * just calls it. No middleware/route duplication — drift between the
 * tested app and the running server is structurally impossible.
 */

import type { Express } from "express";
import { createApp } from "../../index.js";

export function buildApp(): Express {
    return createApp();
}

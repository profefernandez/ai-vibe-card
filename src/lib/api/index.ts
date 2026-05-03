/**
 * Composes the apiClient aggregator and re-exports public types/values.
 * Drop-in replacement for the old monolithic src/lib/apiClient.ts.
 */

export { auth } from "./auth";
export { functions } from "./functions";
export { upload } from "./upload";
export { kbImages, type KbImage } from "./kbImages";
export { kbFolders, kbItems, type KbFolder, type KbItem } from "./kb";
export { from, rpc, type DbResult, type QueryBuilder } from "./tables";
export type { Session, User, AuthEvent, AuthListener } from "./client";
export { loadSession, saveSession } from "./client";

import { auth } from "./auth";
import { functions } from "./functions";
import { upload } from "./upload";
import { kbImages } from "./kbImages";
import { kbFolders, kbItems } from "./kb";
import { from, rpc } from "./tables";

export const apiClient = {
    auth,
    functions,
    upload,
    kbImages,
    kb: { folders: kbFolders, items: kbItems },
    from,
    rpc,
};

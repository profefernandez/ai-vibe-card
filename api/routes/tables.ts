/**
 * Generic table CRUD handler.
 *
 * GET    /api/tables/:table          SELECT with optional filter/order/limit/select
 * POST   /api/tables/:table          INSERT row(s)
 * PATCH  /api/tables/:table          UPDATE rows matching filter
 * DELETE /api/tables/:table          DELETE rows matching filter
 * POST   /api/tables/:table/upsert   UPSERT with onConflict column
 *
 * Query params:
 *   filter   col=eq.value  (repeatable)
 *   order    col.asc | col.desc
 *   limit    number
 *   select   comma-separated columns (default *)
 *
 * All write operations require a valid JWT (requireAuth middleware).
 * The user_id or owner_id is injected from the token for tables that need it.
 *
 * SECURITY: table names are allowlisted to prevent injection.
 */

import { Router } from "express";
import type { PoolClient } from "pg";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { requireRole } from "../middleware/requireRole.js";
import { encrypt } from "../lib/crypto.js";
import { randomUUID } from "node:crypto";
import { logger } from "../logger.js";

export const router = Router();

// ── Allowed tables ────────────────────────────────────────────────────────────
// `connections` is intentionally NOT exposed here. Connection lifecycle now
// lives outside the generic Express table surface, and exposing it here would
// recreate the asymmetric IDOR window we closed earlier.
const ALLOWED_TABLES = new Set([
    "profiles",
    "sites",
    "site_pages",
    "content_blocks",
    "ai_preferences",
    "api_connections",
]);

// ── Column allowlist per table (prevents arbitrary column injection) ───────────
// All non-listed columns are stripped on INSERT/UPDATE.
// "id" is always safe to read but never writable.
const TABLE_COLUMNS: Record<string, string[]> = {
    profiles: ["user_id", "display_name", "tagline", "bio", "avatar_url", "cta_url", "cta_label", "cta_embed", "social_links", "services", "card_layout", "font_family", "theme", "accent_color", "seo_title", "seo_description", "og_image_url", "twitter_handle", "robots_txt", "slug", "ai_query_enabled", "show_qr_scan_link", "updated_at"],
    sites: ["user_id", "domain", "name", "verified", "verification_token", "verification_method", "verified_at", "verification_expires_at", "scrape_status", "page_count", "share_usage_limit", "last_scraped_at", "refresh_interval_hours", "updated_at"],
    site_pages: ["site_id", "url", "title", "markdown", "html", "metadata"],
    content_blocks: ["site_id", "page_id", "heading", "body", "images", "category", "tags", "visibility", "block_order"],
    ai_preferences: ["user_id", "system_prompt", "rules", "personality", "response_style", "prompt_injection_rules", "safety_protocol", "updated_at"],
    api_connections: ["user_id", "provider", "api_key_encrypted", "model_name", "is_active"],
};

// JSONB columns must be JSON.stringify'd before being passed to pg as a parameter,
// otherwise the driver serializes JS arrays/objects with Postgres array syntax,
// which jsonb refuses. text[] columns (images, tags) intentionally stay as arrays.
const JSONB_COLUMNS: Record<string, Set<string>> = {
    profiles: new Set(["social_links", "services", "robots_txt"]),
    site_pages: new Set(["metadata"]),
    ai_preferences: new Set(["rules", "prompt_injection_rules"]),
};

function serializeJsonbColumns(table: string, row: Record<string, unknown>): Record<string, unknown> {
    const jsonbCols = JSONB_COLUMNS[table];
    if (!jsonbCols) return row;
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(row)) {
        if (jsonbCols.has(k) && v !== null && typeof v !== "string") {
            out[k] = JSON.stringify(v);
        } else {
            out[k] = v;
        }
    }
    return out;
}


function validateTable(table: string, res: any): boolean {
    if (!ALLOWED_TABLES.has(table)) {
        res.status(400).json({ error: "Unknown table" });
        return false;
    }
    return true;
}

/** Check if a column name is in the allowlist for the given table */
function isAllowedColumn(table: string, col: string): boolean {
    const allowed = TABLE_COLUMNS[table];
    return !!allowed && (allowed.includes(col) || col === "id" || col === "created_at");
}

/** Parse ?filter=col=eq.value into WHERE clauses (validates columns against allowlist) */
function parseFilters(table: string, rawFilters: string | string[] | undefined): {
    clauses: string[];
    values: unknown[];
} {
    const filters = rawFilters
        ? Array.isArray(rawFilters)
            ? rawFilters
            : [rawFilters]
        : [];
    const clauses: string[] = [];
    const values: unknown[] = [];
    for (const f of filters) {
        const m = f.match(/^([a-zA-Z_]+)=eq\.(.+)$/);
        if (m && isAllowedColumn(table, m[1])) {
            values.push(m[2]);
            clauses.push(`"${m[1]}" = $${values.length}`);
        }
    }
    return { clauses, values };
}

/** Strip input keys to only allowed columns */
function pickColumns(table: string, data: Record<string, unknown>): Record<string, unknown> {
    const allowed = TABLE_COLUMNS[table] ?? [];
    return Object.fromEntries(Object.entries(data).filter(([k]) => allowed.includes(k)));
}

/** Get the ownership column for a table (if any) */
function ownerColumn(table: string): string | null {
    if (["profiles", "sites", "ai_preferences", "api_connections"].includes(table)) return "user_id";
    return null;
}

/**
 * Tables scoped to an organization. On INSERT/UPSERT the organization_id is
 * taken from the authenticated session (never trusted from the client).
 */
const ORG_SCOPED_TABLES = new Set(["profiles", "sites", "ai_preferences", "api_connections"]);

/** Tables where ownership is enforced via site_id → sites.user_id */
const SITE_OWNED_TABLES = new Set(["site_pages", "content_blocks"]);

/** Add site ownership WHERE clause for site_pages/content_blocks */
function addSiteOwnership(table: string, userId: string, clauses: string[], values: unknown[]): void {
    if (SITE_OWNED_TABLES.has(table)) {
        values.push(userId);
        clauses.push(`"site_id" IN (SELECT id FROM sites WHERE user_id = $${values.length})`);
    }
}

/** Verify all site_ids in rows belong to the authenticated user */
async function verifySiteOwnership(client: PoolClient, table: string, rows: Record<string, unknown>[], userId: string): Promise<boolean> {
    if (!SITE_OWNED_TABLES.has(table)) return true;
    const siteIds = [...new Set(rows.map((r) => r.site_id).filter(Boolean))];
    if (siteIds.length === 0) return false;
    const { rows: owned } = await client.query(
        `SELECT id FROM sites WHERE id = ANY($1) AND user_id = $2`,
        [siteIds, userId],
    );
    return owned.length === siteIds.length;
}

// ── SELECT ─────────────────────────────────────────────────────────────────────
// All reads require JWT and are scoped to the authenticated user's data.
router.get("/:table", requireAuth, async (req: AuthRequest, res) => {
    const { table } = req.params;
    if (!validateTable(table, res)) return;

    const { filter, order, limit, select } = req.query as Record<string, string | string[]>;
    const { clauses, values } = parseFilters(table, filter);

    // Enforce ownership — user can only read their own rows
    const ownCol = ownerColumn(table);
    if (ownCol) {
        values.push(req.user!.id);
        clauses.push(`"${ownCol}" = $${values.length}`);
    }
    addSiteOwnership(table, req.user!.id, clauses, values);

    // Validate select columns against allowlist
    let cols = "*";
    if (typeof select === "string") {
        const requested = select.split(",").map((c) => c.trim());
        const valid = requested.filter((c) => isAllowedColumn(table, c));
        if (valid.length === 0) {
            res.status(400).json({ error: "No valid columns in select" });
            return;
        }
        cols = valid.map((c) => `"${c}"`).join(", ");
    }

    let sql = `SELECT ${cols} FROM "${table}"`;
    if (clauses.length) sql += ` WHERE ${clauses.join(" AND ")}`;

    // Validate order column against allowlist
    if (typeof order === "string") {
        const [col, dir] = order.split(".");
        if (!isAllowedColumn(table, col)) {
            res.status(400).json({ error: "Invalid order column" });
            return;
        }
        sql += ` ORDER BY "${col}" ${dir === "desc" ? "DESC" : "ASC"}`;
    }
    if (typeof limit === "string" && /^\d+$/.test(limit)) {
        sql += ` LIMIT ${parseInt(limit, 10)}`;
    }

    try {
        const rows = await req.withClient!((c) => c.query(sql, values).then((r) => r.rows));
        // Strip raw API keys from api_connections responses
        if (table === "api_connections") {
            for (const row of rows) {
                if (row.api_key_encrypted) {
                    row.api_key_encrypted = "••••••••";
                }
            }
        }
        res.json(rows);
    } catch (err) {
        logger.error({ err }, "SELECT error");
        res.status(500).json({ error: "Query failed" });
    }
});

// ── INSERT ─────────────────────────────────────────────────────────────────────
router.post("/:table", requireAuth, requireRole("owner", "admin"), async (req: AuthRequest, res) => {
    const { table } = req.params;
    if (!validateTable(table, res)) return;

    const raw = req.body as Record<string, unknown> | Record<string, unknown>[];
    const rows = Array.isArray(raw) ? raw : [raw];

    // Force ownership column to authenticated user
    const ownCol = ownerColumn(table);

    const cleaned = rows.map((r) => {
        const c = pickColumns(table, r);
        if (ownCol) c[ownCol] = req.user!.id;
        if (ORG_SCOPED_TABLES.has(table)) c.organization_id = req.user!.organizationId;
        // Encrypt API keys before storage
        if (table === "api_connections" && typeof c.api_key_encrypted === "string" && c.api_key_encrypted) {
            c.api_key_encrypted = encrypt(c.api_key_encrypted);
        }
        // Auto-generate verification token for new sites
        if (table === "sites") {
            c.verification_token = randomUUID();
            const expires = new Date();
            expires.setDate(expires.getDate() + 7);
            c.verification_expires_at = expires.toISOString();
        }
        return serializeJsonbColumns(table, c);
    });
    if (cleaned.length === 0 || Object.keys(cleaned[0]).length === 0) {
        res.status(400).json({ error: "No valid columns provided" });
        return;
    }

    const colNames = Object.keys(cleaned[0]);
    const valPlaceholders = cleaned
        .map((_, ri) => `(${colNames.map((_, ci) => `$${ri * colNames.length + ci + 1}`).join(", ")})`)
        .join(", ");
    const flatValues = cleaned.flatMap((r) => colNames.map((c) => r[c]));
    const colList = colNames.map((c) => `"${c}"`).join(", ");
    const sql = `INSERT INTO "${table}" (${colList}) VALUES ${valPlaceholders} RETURNING *`;

    try {
        const inserted = await req.withClient!(async (c) => {
            // Verify site ownership for site_pages/content_blocks INSIDE the
            // same transaction as the INSERT — both queries see the same
            // RLS context, and a TOCTOU between check and write can't slip in.
            if (SITE_OWNED_TABLES.has(table)) {
                const valid = await verifySiteOwnership(c, table, rows, req.user!.id);
                if (!valid) {
                    throw new SiteOwnershipError();
                }
            }
            return (await c.query(sql, flatValues)).rows;
        });
        res.status(201).json(inserted.length === 1 ? inserted[0] : inserted);
    } catch (err) {
        if (err instanceof SiteOwnershipError) {
            res.status(403).json({ error: "Access denied: site_id does not belong to you" });
            return;
        }
        logger.error({ err }, "INSERT error");
        res.status(500).json({ error: "Insert failed" });
    }
});

class SiteOwnershipError extends Error { }

// ── UPDATE ─────────────────────────────────────────────────────────────────────
router.patch("/:table", requireAuth, requireRole("owner", "admin"), async (req: AuthRequest, res) => {
    const { table } = req.params;
    if (!validateTable(table, res)) return;

    const { filter } = req.query as Record<string, string | string[]>;
    const { clauses, values } = parseFilters(table, filter);
    if (clauses.length === 0) {
        res.status(400).json({ error: "At least one filter is required for UPDATE" });
        return;
    }

    // Enforce ownership — user can only update their own rows
    const ownCol = ownerColumn(table);
    if (ownCol) {
        values.push(req.user!.id);
        clauses.push(`"${ownCol}" = $${values.length}`);
    }
    addSiteOwnership(table, req.user!.id, clauses, values);

    const cleanedRaw = pickColumns(table, req.body as Record<string, unknown>);
    if (Object.keys(cleanedRaw).length === 0) {
        res.status(400).json({ error: "No valid columns to update" });
        return;
    }
    // Encrypt API keys before storage
    if (table === "api_connections" && typeof cleanedRaw.api_key_encrypted === "string" && cleanedRaw.api_key_encrypted) {
        cleanedRaw.api_key_encrypted = encrypt(cleanedRaw.api_key_encrypted);
    }
    const cleaned = serializeJsonbColumns(table, cleanedRaw);

    const setClauses = Object.keys(cleaned).map((col) => {
        values.push(cleaned[col]);
        return `"${col}" = $${values.length}`;
    });

    const sql = `UPDATE "${table}" SET ${setClauses.join(", ")} WHERE ${clauses.join(" AND ")}`;
    try {
        await req.withClient!((c) => c.query(sql, values));
        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "UPDATE error");
        res.status(500).json({ error: "Update failed" });
    }
});

// ── DELETE ─────────────────────────────────────────────────────────────────────
router.delete("/:table", requireAuth, requireRole("owner", "admin"), async (req: AuthRequest, res) => {
    const { table } = req.params;
    if (!validateTable(table, res)) return;

    const { filter } = req.query as Record<string, string | string[]>;
    const { clauses, values } = parseFilters(table, filter);
    if (clauses.length === 0) {
        res.status(400).json({ error: "At least one filter is required for DELETE" });
        return;
    }

    // Enforce ownership — user can only delete their own rows
    const ownCol = ownerColumn(table);
    if (ownCol) {
        values.push(req.user!.id);
        clauses.push(`"${ownCol}" = $${values.length}`);
    }
    addSiteOwnership(table, req.user!.id, clauses, values);

    const sql = `DELETE FROM "${table}" WHERE ${clauses.join(" AND ")}`;
    try {
        await req.withClient!((c) => c.query(sql, values));
        res.json({ ok: true });
    } catch (err) {
        logger.error({ err }, "DELETE error");
        res.status(500).json({ error: "Delete failed" });
    }
});

// ── UPSERT ─────────────────────────────────────────────────────────────────────
router.post("/:table/upsert", requireAuth, requireRole("owner", "admin"), async (req: AuthRequest, res) => {
    const { table } = req.params;
    if (!validateTable(table, res)) return;

    const { data, onConflict } = req.body as {
        data: Record<string, unknown>;
        onConflict?: string;
    };
    if (!data || typeof data !== "object") {
        res.status(400).json({ error: "data object is required" });
        return;
    }

    const cleanedRaw = pickColumns(table, data);

    // Force ownership column to authenticated user
    const ownCol = ownerColumn(table);
    if (ownCol) cleanedRaw[ownCol] = req.user!.id;
    if (ORG_SCOPED_TABLES.has(table)) cleanedRaw.organization_id = req.user!.organizationId;

    const cleaned = serializeJsonbColumns(table, cleanedRaw);
    const colNames = Object.keys(cleaned);
    if (colNames.length === 0) {
        res.status(400).json({ error: "No valid columns provided" });
        return;
    }

    const colList = colNames.map((c) => `"${c}"`).join(", ");
    const valPlaceholders = colNames.map((_, i) => `$${i + 1}`).join(", ");
    const flatValues = colNames.map((c) => cleaned[c]);

    // Validate onConflict column against allowlist
    const conflictCol = typeof onConflict === "string" && isAllowedColumn(table, onConflict)
        ? `"${onConflict}"`
        : '"id"';

    const updateSet = colNames
        .filter((c) => c !== onConflict && c !== "id")
        .map((c) => `"${c}" = EXCLUDED."${c}"`)
        .join(", ");

    const sql = `
    INSERT INTO "${table}" (${colList})
    VALUES (${valPlaceholders})
    ON CONFLICT (${conflictCol}) DO UPDATE SET ${updateSet}
    RETURNING *
  `;

    try {
        const upserted = await req.withClient!(async (c) => (await c.query(sql, flatValues)).rows);
        res.json(upserted[0] ?? null);
    } catch (err) {
        logger.error({ err }, "UPSERT error");
        res.status(500).json({ error: "Upsert failed" });
    }
});

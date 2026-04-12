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
import { db } from "../db.js";
import { requireAuth, type AuthRequest } from "../middleware/auth.js";
import { encrypt } from "../lib/crypto.js";

export const router = Router();

// ── Allowed tables ────────────────────────────────────────────────────────────
const ALLOWED_TABLES = new Set([
    "profiles",
    "sites",
    "site_pages",
    "content_blocks",
    "ai_preferences",
    "api_connections",
    "received_cards",
]);

// ── Column allowlist per table (prevents arbitrary column injection) ───────────
// All non-listed columns are stripped on INSERT/UPDATE.
// "id" is always safe to read but never writable.
const TABLE_COLUMNS: Record<string, string[]> = {
    profiles: ["user_id", "display_name", "tagline", "bio", "avatar_url", "cta_url", "cta_label", "cta_embed", "social_links", "card_layout", "theme", "accent_color", "seo_title", "seo_description", "og_image_url", "twitter_handle", "robots_txt", "updated_at"],
    sites: ["user_id", "domain", "name", "scrape_status", "page_count", "share_usage_limit", "last_scraped_at", "refresh_interval_hours", "updated_at"],
    site_pages: ["site_id", "url", "title", "markdown", "html", "metadata"],
    content_blocks: ["site_id", "page_id", "heading", "body", "images", "category", "tags", "visibility", "block_order"],
    ai_preferences: ["user_id", "system_prompt", "rules", "personality", "response_style", "prompt_injection_rules", "safety_protocol", "updated_at"],
    api_connections: ["user_id", "provider", "api_key_encrypted", "model_name", "is_active"],
    received_cards: ["owner_id", "sender_name", "sender_domain", "sender_avatar", "sender_tagline", "notes", "usage_count", "usage_limit"],
};


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
    if (table === "received_cards") return "owner_id";
    // site_pages and content_blocks use site_id — ownership verified via site table
    return null;
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
        const result = await db.query(sql, values);
        // Strip raw API keys from api_connections responses
        if (table === "api_connections") {
            for (const row of result.rows) {
                if (row.api_key_encrypted) {
                    row.api_key_encrypted = "••••••••";
                }
            }
        }
        res.json(result.rows);
    } catch (err) {
        console.error("SELECT error:", err);
        res.status(500).json({ error: "Query failed" });
    }
});

// ── INSERT ─────────────────────────────────────────────────────────────────────
router.post("/:table", requireAuth, async (req: AuthRequest, res) => {
    const { table } = req.params;
    if (!validateTable(table, res)) return;

    const raw = req.body as Record<string, unknown> | Record<string, unknown>[];
    const rows = Array.isArray(raw) ? raw : [raw];

    // Force ownership column to authenticated user
    const ownCol = ownerColumn(table);
    const cleaned = rows.map((r) => {
        const c = pickColumns(table, r);
        if (ownCol) c[ownCol] = req.user!.id;
        // Encrypt API keys before storage
        if (table === "api_connections" && typeof c.api_key_encrypted === "string" && c.api_key_encrypted) {
            c.api_key_encrypted = encrypt(c.api_key_encrypted);
        }
        return c;
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
        const result = await db.query(sql, flatValues);
        res.status(201).json(result.rows.length === 1 ? result.rows[0] : result.rows);
    } catch (err) {
        console.error("INSERT error:", err);
        res.status(500).json({ error: "Insert failed" });
    }
});

// ── UPDATE ─────────────────────────────────────────────────────────────────────
router.patch("/:table", requireAuth, async (req: AuthRequest, res) => {
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

    const cleaned = pickColumns(table, req.body as Record<string, unknown>);
    if (Object.keys(cleaned).length === 0) {
        res.status(400).json({ error: "No valid columns to update" });
        return;
    }
    // Encrypt API keys before storage
    if (table === "api_connections" && typeof cleaned.api_key_encrypted === "string" && cleaned.api_key_encrypted) {
        cleaned.api_key_encrypted = encrypt(cleaned.api_key_encrypted);
    }

    const setClauses = Object.keys(cleaned).map((col, i) => {
        values.push(cleaned[col]);
        return `"${col}" = $${values.length}`;
    });

    const sql = `UPDATE "${table}" SET ${setClauses.join(", ")} WHERE ${clauses.join(" AND ")}`;
    try {
        await db.query(sql, values);
        res.json({ ok: true });
    } catch (err) {
        console.error("UPDATE error:", err);
        res.status(500).json({ error: "Update failed" });
    }
});

// ── DELETE ─────────────────────────────────────────────────────────────────────
router.delete("/:table", requireAuth, async (req: AuthRequest, res) => {
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

    const sql = `DELETE FROM "${table}" WHERE ${clauses.join(" AND ")}`;
    try {
        await db.query(sql, values);
        res.json({ ok: true });
    } catch (err) {
        console.error("DELETE error:", err);
        res.status(500).json({ error: "Delete failed" });
    }
});

// ── UPSERT ─────────────────────────────────────────────────────────────────────
router.post("/:table/upsert", requireAuth, async (req: AuthRequest, res) => {
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

    const cleaned = pickColumns(table, data);

    // Force ownership column to authenticated user
    const ownCol = ownerColumn(table);
    if (ownCol) cleaned[ownCol] = req.user!.id;

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
        const result = await db.query(sql, flatValues);
        res.json(result.rows[0] ?? null);
    } catch (err) {
        console.error("UPSERT error:", err);
        res.status(500).json({ error: "Upsert failed" });
    }
});

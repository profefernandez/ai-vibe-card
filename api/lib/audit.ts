/**
 * Lightweight audit-log writer.
 * Inserts into the existing audit_log table (OWASP A09).
 * Fire-and-forget — errors are logged but never block the request.
 */

import { db } from "../db.js";
import { logger } from "../logger.js";

export interface AuditEntry {
    userId?: string | null;
    action: string;
    tableName?: string;
    recordId?: string;
    ip?: string;
    userAgent?: string;
    meta?: Record<string, unknown>;
}

export function logAudit(entry: AuditEntry): void {
    const { userId, action, tableName, recordId, ip, userAgent, meta } = entry;
    db.query(
        `INSERT INTO audit_log (user_id, action, table_name, record_id, new_values, ip_address, user_agent)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [
            userId ?? null,
            action,
            tableName ?? "",
            recordId ?? null,
            meta ? JSON.stringify(meta) : null,
            ip ?? null,
            userAgent ?? null,
        ],
    ).catch((err) => logger.error({ err }, "audit_log write failed"));
}

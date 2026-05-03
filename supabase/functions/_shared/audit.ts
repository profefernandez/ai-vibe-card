// Minimal `audit_log` writer for Edge Functions.
//
// The legacy Express server has a richer audit helper (queues, retries,
// pino logger). For Edge Functions we keep it simple: best-effort insert
// via the service-role client. Failures are swallowed and logged to the
// Edge Function's stdout — losing an audit row is preferable to failing
// the user-facing request.
//
// Caller is responsible for sanitising `meta` (no secrets, no full request
// bodies). The shape mirrors the Node helper's column names so the table
// stays consistent across both writers.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

export interface AuditEntry {
    userId: string | null;
    action: string;
    tableName?: string;
    recordId?: string | null;
    ip?: string | null;
    userAgent?: string | null;
    meta?: Record<string, unknown>;
}

export async function logAudit(
    serviceClient: SupabaseClient,
    entry: AuditEntry,
): Promise<void> {
    try {
        const { error } = await serviceClient.from("audit_log").insert({
            user_id: entry.userId,
            action: entry.action,
            table_name: entry.tableName ?? "",
            record_id: entry.recordId ?? null,
            ip_address: entry.ip ?? null,
            user_agent: entry.userAgent ?? null,
            new_values: entry.meta ?? null,
        });
        if (error) {
            console.warn("audit_log insert failed:", error.message);
        }
    } catch (err) {
        console.warn("audit_log insert threw:", err);
    }
}

/** Pull a best-effort client IP from common proxy headers. */
export function clientIp(req: Request): string | null {
    const forwarded = req.headers.get("x-forwarded-for");
    if (forwarded) return forwarded.split(",")[0].trim() || null;
    return req.headers.get("x-real-ip") ?? null;
}

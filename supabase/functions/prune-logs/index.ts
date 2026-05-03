// prune-logs — retention sweep for the audit / feedback tables.
//
// POST (no body required)
//
// Auth: shared bearer secret sent via the `Authorization: Bearer …`
// header, timing-safe compared. There is no JWT — deploy with
// `--no-verify-jwt` so the SPanel cron job (or any caller that holds
// the secret) can hit it directly. Same secret as `refresh-sites` so
// cron jobs share one credential, matching the legacy server's
// behaviour.
//
// Behaviour matches `api/routes/prune-logs.ts`:
//   - audit_log         → drop rows  > 180 days
//   - ai_feedback       → drop rows  > 365 days
//   - feedback_consumed → drop rows  >  30 days
//
// The legacy handler also pruned a `sessions` table — that's an
// app-managed Express table that does not exist in Supabase (Supabase
// auth manages its own `auth.sessions` schema, which we are not allowed
// to touch from a service-role client). It is intentionally omitted.
//
// Deletes are chunked at 10k rows with a 100-iteration cap (1M rows /
// table / run) inside the SECURITY DEFINER RPC `prune_old_rows`. The
// table whitelist + retention windows live in
// `supabase/migrations/0007_prune_logs_helpers.sql`.

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { getServiceClient } from "../_shared/auth.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";

const TARGETS = ["audit_log", "ai_feedback", "feedback_consumed"] as const;
type Target = typeof TARGETS[number];

// ── Constant-time bearer-secret compare ─────────────────────────────────────
function timingSafeEqualStr(a: string, b: string): boolean {
    const aBuf = new TextEncoder().encode(a);
    const bBuf = new TextEncoder().encode(b);
    if (aBuf.length !== bBuf.length) return false;
    let diff = 0;
    for (let i = 0; i < aBuf.length; i++) diff |= aBuf[i] ^ bBuf[i];
    return diff === 0;
}

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;
    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    // ── Bearer-secret auth ──────────────────────────────────────────────
    const expected = Deno.env.get("REFRESH_SECRET");
    if (!expected) {
        return jsonResponse({ error: "REFRESH_SECRET not configured" }, 500);
    }
    const authHeader = req.headers.get("authorization") ?? "";
    if (!authHeader.toLowerCase().startsWith("bearer ")) {
        return jsonResponse({ error: "Invalid refresh secret" }, 401);
    }
    const provided = authHeader.slice(7);
    if (!timingSafeEqualStr(provided, expected)) {
        return jsonResponse({ error: "Invalid refresh secret" }, 401);
    }

    const serviceOrErr = getServiceClient();
    if (serviceOrErr instanceof Response) return serviceOrErr;
    const serviceClient = serviceOrErr;

    const deleted: Record<Target, number> = {
        audit_log: 0,
        ai_feedback: 0,
        feedback_consumed: 0,
    };
    const errors: Record<string, string> = {};

    // Each target gets its own try/catch so one table failing doesn't
    // abort the others — rotation should make as much progress as it can.
    for (const target of TARGETS) {
        try {
            const { data, error } = await serviceClient.rpc("prune_old_rows", {
                target,
                chunk_size: 10_000,
                max_iterations: 100,
            });
            if (error) throw new Error(error.message);
            deleted[target] = typeof data === "number" ? data : Number(data) || 0;
        } catch (err) {
            const message = err instanceof Error ? err.message : "unknown";
            console.error("prune-logs: target failed", { target, message });
            errors[target] = message;
        }
    }

    // Best-effort audit row so an operator can see when the sweep last ran.
    await logAudit(serviceClient, {
        userId: null,
        action: "prune_logs",
        tableName: "audit_log",
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
        meta: { deleted, errors: Object.keys(errors).length ? errors : undefined },
    });

    const status = Object.keys(errors).length === 0 ? 200 : 207;
    return jsonResponse(
        Object.keys(errors).length ? { deleted, errors } : { deleted },
        status,
    );
});

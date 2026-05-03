// connection-respond — owner approves or declines a pending connection.
//
// POST { id: UUID, status: "approved" | "declined" }
//
// Auth: caller's JWT. The UPDATE could go through RLS (owner can update
// their own row) but we still need a service-role lookup of the
// requester's email + the owner's display name for the approval email,
// so the whole flow lives in this Edge Function.
//
// Mirrors `api/routes/card.ts:227-277`: same allowed statuses, same 404
// behaviour when the row isn't pending or owner_id doesn't match, same
// audit action (`connection_${status}`).

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";
import { connectionApprovedEmail, lookupUserEmail, sendEmail } from "../_shared/email.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface RequestBody {
    id?: unknown;
    status?: unknown;
}

interface UpdatedRow {
    id: string;
    status: "approved" | "declined";
    requester_id: string;
}

interface OwnerProfile {
    display_name: string | null;
}

Deno.serve(async (req: Request) => {
    const preflight = handlePreflight(req);
    if (preflight) return preflight;
    if (req.method !== "POST") {
        return jsonResponse({ error: "Method not allowed" }, 405);
    }

    const auth = await requireUser(req);
    if (auth instanceof Response) return auth;
    const { user, serviceClient } = auth;

    let body: RequestBody;
    try {
        body = (await req.json()) as RequestBody;
    } catch {
        return jsonResponse({ error: "Invalid JSON body" }, 400);
    }

    const id = typeof body.id === "string" ? body.id : "";
    const status = body.status;
    if (!id || !UUID_RE.test(id)) {
        return jsonResponse({ error: "Invalid connection id" }, 400);
    }
    if (status !== "approved" && status !== "declined") {
        return jsonResponse({ error: "Status must be 'approved' or 'declined'" }, 400);
    }

    const nowIso = new Date().toISOString();
    const patch: Record<string, unknown> = {
        status,
        updated_at: nowIso,
    };
    if (status === "approved") {
        patch.approved_at = nowIso;
    }

    // Belt-and-braces: explicit owner_id + status filter (RLS already
    // enforces owner_id, but mirroring the legacy WHERE clause keeps the
    // 404-on-not-pending behaviour identical).
    const { data: rows, error: updErr } = await serviceClient
        .from("connections")
        .update(patch)
        .eq("id", id)
        .eq("owner_id", user.id)
        .eq("status", "pending")
        .select("id, status, requester_id");
    if (updErr) {
        console.error("connection-respond: update failed:", updErr.message);
        return jsonResponse({ error: "Failed to update connection" }, 500);
    }
    if (!rows || rows.length === 0) {
        return jsonResponse({ error: "Connection not found or not pending" }, 404);
    }
    const updated = rows[0] as UpdatedRow;

    // ── Best-effort approval email ──────────────────────────────────────
    if (status === "approved") {
        try {
            const requesterEmail = await lookupUserEmail(serviceClient, updated.requester_id);
            if (requesterEmail) {
                const { data: ownerProfile } = await serviceClient
                    .from("profiles")
                    .select("display_name")
                    .eq("user_id", user.id)
                    .maybeSingle<OwnerProfile>();
                const ownerName = ownerProfile?.display_name?.trim() || "Someone";
                sendEmail(connectionApprovedEmail(requesterEmail, ownerName)).catch(
                    () => { /* best effort */ },
                );
            }
        } catch (err) {
            console.warn("connection-respond: email lookup threw:", err);
        }
    }

    await logAudit(serviceClient, {
        userId: user.id,
        action: `connection_${status}`,
        tableName: "connections",
        recordId: updated.id,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
    });

    return jsonResponse({ id: updated.id, status: updated.status });
});

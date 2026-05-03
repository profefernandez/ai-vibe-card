// connection-request — authenticated card-to-card request.
//
// POST { slug: string, message?: string }
//
// Auth: caller's JWT. Uses the service-role client because we need to:
//   - Read `auth.users.email` for the recipient (anon can't see it).
//   - Re-open a previously declined row (RLS doesn't let the requester
//     UPDATE — only the owner can — so the "decline → re-request as
//     UPDATE" path stays server-side here).
//
// Mirrors the legacy Express handler in `api/routes/card.ts:113-195`:
// same status codes (400/404/409), same 500-char message clamp, same
// audit action (`connection_request`).

import { handlePreflight, jsonResponse } from "../_shared/cors.ts";
import { requireUser } from "../_shared/auth.ts";
import { logAudit, clientIp } from "../_shared/audit.ts";
import { connectionRequestEmail, sendEmail } from "../_shared/email.ts";

const SLUG_RE = /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/i;

interface RequestBody {
    slug?: unknown;
    message?: unknown;
}

interface ProfileRow {
    user_id: string;
}

interface ConnectionRow {
    id: string;
    status: "pending" | "approved" | "declined";
}

interface RequesterProfile {
    display_name: string | null;
}

interface OwnerUser {
    email: string | null;
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

    const slug = typeof body.slug === "string" ? body.slug : "";
    if (!slug || slug.length > 100 || !SLUG_RE.test(slug)) {
        return jsonResponse({ error: "Invalid slug" }, 400);
    }

    const rawMessage = typeof body.message === "string" ? body.message : "";
    // Strip control chars + clamp to 500 chars (matches legacy handler).
    const safeMessage = rawMessage
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .trim()
        .slice(0, 500);

    // ── Find the card owner by slug ─────────────────────────────────────
    const { data: profile, error: profileErr } = await serviceClient
        .from("profiles")
        .select("user_id")
        .ilike("slug", slug)
        .maybeSingle<ProfileRow>();
    if (profileErr) {
        console.error("connection-request: profile lookup failed:", profileErr.message);
        return jsonResponse({ error: "Failed to send connection request" }, 500);
    }
    if (!profile) {
        return jsonResponse({ error: "Card not found" }, 404);
    }
    const ownerId = profile.user_id;

    if (ownerId === user.id) {
        return jsonResponse({ error: "Cannot connect with yourself" }, 400);
    }

    // ── Existing connection (either direction) ──────────────────────────
    const { data: existing, error: existErr } = await serviceClient
        .from("connections")
        .select("id, status, requester_id, owner_id")
        .or(
            `and(requester_id.eq.${user.id},owner_id.eq.${ownerId}),and(requester_id.eq.${ownerId},owner_id.eq.${user.id})`,
        )
        .limit(1);
    if (existErr) {
        console.error("connection-request: existing lookup failed:", existErr.message);
        return jsonResponse({ error: "Failed to send connection request" }, 500);
    }

    if (existing && existing.length > 0) {
        const conn = existing[0] as ConnectionRow;
        if (conn.status === "approved") {
            return jsonResponse({ error: "Already connected" }, 409);
        }
        if (conn.status === "pending") {
            return jsonResponse({ error: "Connection request already pending" }, 409);
        }
        // Declined → re-open as pending.
        const { error: updErr } = await serviceClient
            .from("connections")
            .update({ status: "pending", message: safeMessage, updated_at: new Date().toISOString() })
            .eq("id", conn.id);
        if (updErr) {
            console.error("connection-request: re-open failed:", updErr.message);
            return jsonResponse({ error: "Failed to send connection request" }, 500);
        }
        return jsonResponse({ id: conn.id, status: "pending" });
    }

    // ── Create new request ──────────────────────────────────────────────
    const { data: newConn, error: insErr } = await serviceClient
        .from("connections")
        .insert({ requester_id: user.id, owner_id: ownerId, message: safeMessage })
        .select("id, status")
        .single<ConnectionRow>();
    if (insErr || !newConn) {
        console.error("connection-request: insert failed:", insErr?.message);
        return jsonResponse({ error: "Failed to send connection request" }, 500);
    }

    // ── Best-effort notification email ──────────────────────────────────
    try {
        const { data: ownerUser } = await serviceClient.auth.admin.getUserById(ownerId);
        const ownerEmail = (ownerUser?.user as { email?: string } | null)?.email ?? null;
        const { data: requesterProfile } = await serviceClient
            .from("profiles")
            .select("display_name")
            .eq("user_id", user.id)
            .maybeSingle<RequesterProfile>();
        if (ownerEmail) {
            const requesterName = requesterProfile?.display_name?.trim() || "Someone";
            sendEmail(connectionRequestEmail(ownerEmail, requesterName, safeMessage)).catch(
                () => { /* best effort */ },
            );
        } else {
            // Fall back to a `users` table if the legacy schema still has one.
            const { data: legacyUser } = await serviceClient
                .from("users")
                .select("email")
                .eq("id", ownerId)
                .maybeSingle<OwnerUser>();
            if (legacyUser?.email) {
                const requesterName = requesterProfile?.display_name?.trim() || "Someone";
                sendEmail(connectionRequestEmail(legacyUser.email, requesterName, safeMessage)).catch(
                    () => { /* best effort */ },
                );
            }
        }
    } catch (err) {
        console.warn("connection-request: email lookup threw:", err);
    }

    await logAudit(serviceClient, {
        userId: user.id,
        action: "connection_request",
        tableName: "connections",
        recordId: newConn.id,
        ip: clientIp(req),
        userAgent: req.headers.get("user-agent"),
    });

    return jsonResponse({ id: newConn.id, status: newConn.status }, 201);
});

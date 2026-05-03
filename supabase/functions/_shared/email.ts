// Email helper for connection notifications — Edge Function port of
// `api/lib/email.ts`.
//
// Uses `denomailer` for SMTP (the closest 1:1 of `nodemailer` we have on
// Deno). All sends are best-effort: if SMTP isn't configured or the send
// fails we log to stdout and resolve `false` — the caller never throws.
//
// Body templates and HTML escaping are byte-identical to the Node version
// so users see consistent mail across runtimes during the cutover.

import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export interface EmailOpts {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

interface SmtpConfig {
    host: string;
    port: number;
    user: string;
    pass: string;
    from: string;
}

function readSmtpConfig(): SmtpConfig | null {
    const host = Deno.env.get("SMTP_HOST");
    const user = Deno.env.get("SMTP_USER");
    const pass = Deno.env.get("SMTP_PASS");
    if (!host || !user || !pass) return null;
    const port = parseInt(Deno.env.get("SMTP_PORT") ?? "587", 10);
    const from = Deno.env.get("SMTP_FROM") ?? user;
    return { host, port, user, pass, from };
}

export async function sendEmail(opts: EmailOpts): Promise<boolean> {
    const cfg = readSmtpConfig();
    if (!cfg) {
        console.info("email: SMTP not configured — skipping", {
            to: opts.to,
            subject: opts.subject,
        });
        return false;
    }
    let client: SMTPClient | null = null;
    try {
        client = new SMTPClient({
            connection: {
                hostname: cfg.host,
                port: cfg.port,
                tls: cfg.port === 465,
                auth: { username: cfg.user, password: cfg.pass },
            },
        });
        await client.send({
            from: cfg.from,
            to: opts.to,
            subject: opts.subject,
            content: opts.text,
            html: opts.html,
        });
        return true;
    } catch (err) {
        console.warn("email: failed to send:", err);
        return false;
    } finally {
        try {
            await client?.close();
        } catch {
            /* ignore */
        }
    }
}

/** Light HTML escape — identical char set to `api/lib/email.ts`.
 *
 * The legacy Node helper *strips* these characters rather than replacing
 * them with entities (`&lt;` etc.). We deliberately match that behaviour
 * byte-for-byte so that mail rendered by either runtime looks the same
 * during the cutover. Templates only ever interpolate trusted-ish
 * display fields (display name, message) — never user-supplied HTML —
 * so stripping is a safe (if blunt) escape strategy.
 */
function esc(s: string): string {
    return s.replace(/[<>&"']/g, "");
}

export function connectionRequestEmail(
    ownerEmail: string,
    requesterName: string,
    message: string,
): EmailOpts {
    const safeRequester = esc(requesterName);
    const safeMessage = esc(message);
    return {
        to: ownerEmail,
        subject: `New connection request from ${safeRequester}`,
        text: `${safeRequester} wants to connect with you.\n\n${safeMessage ? `Message: ${safeMessage}\n\n` : ""}Log in to your dashboard to approve or decline this request.`,
        html: `<p><strong>${safeRequester}</strong> wants to connect with you.</p>${safeMessage ? `<p>Message: ${safeMessage}</p>` : ""}<p>Log in to your dashboard to approve or decline this request.</p>`,
    };
}

export function connectionApprovedEmail(
    requesterEmail: string,
    ownerName: string,
): EmailOpts {
    const safeName = esc(ownerName);
    return {
        to: requesterEmail,
        subject: `${safeName} accepted your connection request`,
        text: `${safeName} has accepted your connection request. You are now connected!`,
        html: `<p><strong>${safeName}</strong> has accepted your connection request. You are now connected!</p>`,
    };
}

/**
 * Resolve a user's email by id, with a graceful fallback path.
 *
 * Primary source is Supabase Auth (`auth.users`) via the admin API,
 * which is where every Supabase-managed user lives. As a defence in
 * depth — and to support installs that still have legacy `users` rows
 * with a populated `email` column — we fall back to a `users` table
 * read if the admin lookup didn't return one. Both reads use the
 * service-role client and are best-effort: any throw / missing row
 * resolves to `null` so the caller's main flow (creating a connection
 * row, approving a request) never fails because of an email lookup.
 */
export async function lookupUserEmail(
    serviceClient: { auth: { admin: { getUserById: (id: string) => Promise<unknown> } }; from: (table: string) => unknown },
    userId: string,
): Promise<string | null> {
    try {
        // deno-lint-ignore no-explicit-any
        const adminApi = serviceClient.auth.admin as any;
        const result = await adminApi.getUserById(userId);
        const email = result?.data?.user?.email;
        if (typeof email === "string" && email) return email;
    } catch (err) {
        console.warn("email: auth.admin.getUserById threw:", err);
    }
    try {
        // deno-lint-ignore no-explicit-any
        const builder = (serviceClient.from("users") as any)
            .select("email")
            .eq("id", userId)
            .maybeSingle();
        const { data } = await builder;
        const email = data?.email;
        if (typeof email === "string" && email) return email;
    } catch (err) {
        console.warn("email: legacy users table lookup threw:", err);
    }
    return null;
}

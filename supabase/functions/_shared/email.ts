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

/** Light HTML escape — identical char set to `api/lib/email.ts`. */
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

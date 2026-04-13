/**
 * Email service for connection notifications.
 *
 * Uses nodemailer with SMTP settings from environment variables.
 * If SMTP is not configured, emails are silently skipped (logged only).
 */

import nodemailer from "nodemailer";

const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || "587", 10);
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER;

const isConfigured = !!(SMTP_HOST && SMTP_USER && SMTP_PASS);

const transporter = isConfigured
    ? nodemailer.createTransport({
          host: SMTP_HOST,
          port: SMTP_PORT,
          secure: SMTP_PORT === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
    : null;

interface EmailOpts {
    to: string;
    subject: string;
    text: string;
    html?: string;
}

export async function sendEmail(opts: EmailOpts): Promise<boolean> {
    if (!transporter) {
        console.log(`[email] SMTP not configured — skipping email to ${opts.to}: ${opts.subject}`);
        return false;
    }
    try {
        await transporter.sendMail({
            from: SMTP_FROM,
            to: opts.to,
            subject: opts.subject,
            text: opts.text,
            html: opts.html,
        });
        return true;
    } catch (err) {
        console.error("[email] Failed to send:", err);
        return false;
    }
}

export function connectionRequestEmail(ownerEmail: string, requesterName: string, message: string): EmailOpts {
    const safeRequester = requesterName.replace(/[<>&"']/g, "");
    const safeMessage = message.replace(/[<>&"']/g, "");
    return {
        to: ownerEmail,
        subject: `New connection request from ${safeRequester}`,
        text: `${safeRequester} wants to connect with you.\n\n${safeMessage ? `Message: ${safeMessage}\n\n` : ""}Log in to your dashboard to approve or decline this request.`,
        html: `<p><strong>${safeRequester}</strong> wants to connect with you.</p>${safeMessage ? `<p>Message: ${safeMessage}</p>` : ""}<p>Log in to your dashboard to approve or decline this request.</p>`,
    };
}

export function connectionApprovedEmail(requesterEmail: string, ownerName: string): EmailOpts {
    const safeName = ownerName.replace(/[<>&"']/g, "");
    return {
        to: requesterEmail,
        subject: `${safeName} accepted your connection request`,
        text: `${safeName} has accepted your connection request. You are now connected!`,
        html: `<p><strong>${safeName}</strong> has accepted your connection request. You are now connected!</p>`,
    };
}

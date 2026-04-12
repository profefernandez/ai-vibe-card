/**
 * sanitize-content — strip dangerous HTML/script from scraped text before storage.
 * Works on raw markdown and plain text fields.
 */

/** Remove script tags, event handlers, data URIs, and other dangerous patterns */
export function sanitizeContent(text: string | null): string | null {
    if (!text) return text;

    let cleaned = text;

    // Remove <script>...</script> blocks (including multiline)
    cleaned = cleaned.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, "");

    // Remove HTML event handlers (onclick, onerror, onload, etc.)
    cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*["'][^"']*["']/gi, "");
    cleaned = cleaned.replace(/\s+on[a-z]+\s*=\s*\{[^}]*\}/gi, "");

    // Remove javascript: protocol URIs
    cleaned = cleaned.replace(/javascript\s*:/gi, "");

    // Remove data:text/html URIs (XSS vector)
    cleaned = cleaned.replace(/data\s*:\s*text\/html[^"'\s)>]*/gi, "");

    // Remove <iframe>, <object>, <embed>, <applet>, <form> tags
    cleaned = cleaned.replace(/<\/?(iframe|object|embed|applet|form)\b[^>]*>/gi, "");

    // Remove <style> blocks
    cleaned = cleaned.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, "");

    // Remove <link> tags with rel="import" or rel="stylesheet" (potential exfil)
    cleaned = cleaned.replace(/<link\b[^>]*>/gi, "");

    // Remove base tags (can redirect all relative URLs)
    cleaned = cleaned.replace(/<base\b[^>]*>/gi, "");

    return cleaned;
}

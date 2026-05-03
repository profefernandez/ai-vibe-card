// sanitize-content — strip dangerous HTML/script from scraped text before
// storage. Deno port of `api/lib/sanitize-content.ts`, with two extra
// hardenings flagged by CodeQL on the port:
//
//   1. Closing `</script>` / `</style>` are matched with `\s*` so
//      `</script >` (whitespace before `>`) is removed too —
//      `js/bad-tag-filter` finding.
//
//   2. The whole pattern set runs in a stable-fixpoint loop. A naïve
//      single-pass replace is bypassable by nesting tokens
//      (`<scr<script>ipt>` → after one pass → `<script>`,
//      `oonclickn` → `on…`, etc.) which CodeQL classifies as
//      `js/incomplete-multi-character-sanitization`. We keep replacing
//      until the input no longer changes; capped at 16 iterations for
//      pathological inputs.
//
// Keep the regex set in sync with `api/lib/sanitize-content.ts` so that
// re-scraping a row that the legacy server already cleaned is
// idempotent. The legacy file should pick up the same hardenings the
// next time it's touched.

const PATTERNS: [RegExp, string][] = [
    // <script>…</script> blocks (multiline; tolerate attributes/whitespace
    // in close tag — browsers accept </script foo bar>).
    [/<script\b[^>]*>[\s\S]*?<\/script\b[^>]*>/gi, ""],
    // Stray closing/opening script tags left after nested removal
    [/<\/?script\b[^>]*>/gi, ""],

    // HTML event handlers (onclick, onerror, …)
    [/\s+on[a-z]+\s*=\s*["'][^"']*["']/gi, ""],
    [/\s+on[a-z]+\s*=\s*\{[^}]*\}/gi, ""],

    // javascript: protocol URIs
    [/javascript\s*:/gi, ""],

    // data:text/html URIs (XSS vector)
    [/data\s*:\s*text\/html[^"'\s)>]*/gi, ""],

    // <iframe>, <object>, <embed>, <applet>, <form>
    [/<\/?(iframe|object|embed|applet|form)\b[^>]*>/gi, ""],

    // <style> blocks (tolerate attributes/whitespace in close tag)
    [/<style\b[^>]*>[\s\S]*?<\/style\b[^>]*>/gi, ""],
    // Stray <style> / </style> left after nested removal
    [/<\/?style\b[^>]*>/gi, ""],

    // <link> tags (rel="import" / rel="stylesheet" can be exfil vectors)
    [/<link\b[^>]*>/gi, ""],

    // <base> tags can redirect every relative URL on the page
    [/<base\b[^>]*>/gi, ""],
];

const MAX_ITERATIONS = 16;

export function sanitizeContent(text: string | null): string | null {
    if (!text) return text;

    let cleaned = text;
    for (let i = 0; i < MAX_ITERATIONS; i++) {
        let next = cleaned;
        for (const [re, repl] of PATTERNS) {
            next = next.replace(re, repl);
        }
        if (next === cleaned) return next;
        cleaned = next;
    }
    return cleaned;
}


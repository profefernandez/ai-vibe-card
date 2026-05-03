/**
 * SSRF-safe HTTP + DNS for Edge Functions (Deno).
 *
 * Port of `api/lib/safe-fetch.ts` to the Deno runtime, with two changes
 * dictated by the platform:
 *
 *   1. Deno's built-in `fetch` does NOT expose a hook equivalent to undici's
 *      `connect.lookup`, so we cannot pin a TCP connection to a specific IP
 *      from userland. Instead, we lean on three layers of defence:
 *
 *        a. The Deno Deploy / Supabase Edge runtime sandbox blocks outbound
 *           connections to private + link-local ranges at the host level.
 *        b. We resolve A + AAAA via DNS-over-HTTPS (Cloudflare 1.1.1.1) and
 *           refuse any hostname that points at a forbidden range — even if
 *           only one record does (mixed-result rebinding).
 *        c. Redirects are followed manually with per-hop revalidation.
 *
 *      The residual TOCTOU window between our DoH validation and the fetch
 *      is small (a fresh DNS resolution at connect time would have to race
 *      our DoH lookup), and any connection that does win the race is still
 *      blocked by the sandbox.
 *
 *   2. DNS_TXT verification has no Node-style `dns.resolveTxt` here, so we
 *      expose a `dnsTxt()` helper backed by the same DoH endpoint.
 *
 * The set of forbidden IP ranges mirrors `isForbiddenIPv4` / `isForbiddenIPv6`
 * in the legacy module byte for byte — keep them in sync.
 */

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;
const DOH_ENDPOINT = "https://cloudflare-dns.com/dns-query";

// ── Errors ──────────────────────────────────────────────────────────────────

export type SafeFetchReason =
    | "invalid_url"
    | "invalid_protocol"
    | "dns_failure"
    | "private_address"
    | "too_many_redirects"
    | "timeout"
    | "network";

export class SafeFetchError extends Error {
    constructor(public readonly reason: SafeFetchReason, message: string) {
        super(message);
        this.name = "SafeFetchError";
    }
}

// ── IP-range checks (kept in sync with api/lib/safe-fetch.ts) ──────────────

const IPV4_RE = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function ipFamily(ip: string): 4 | 6 | 0 {
    if (IPV4_RE.test(ip)) return 4;
    // Naive IPv6 check — accepts the textual forms DoH returns.
    if (/^[0-9a-fA-F:]+$/.test(ip) && ip.includes(":")) return 6;
    return 0;
}

function isForbiddenIPv4(ip: string): boolean {
    const m = ip.match(IPV4_RE);
    if (!m) return true;
    const parts = [Number(m[1]), Number(m[2]), Number(m[3]), Number(m[4])];
    if (parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b, c] = parts;

    if (a === 0) return true;                                 // 0.0.0.0/8
    if (a === 10) return true;                                // 10/8 RFC1918
    if (a === 100 && b >= 64 && b <= 127) return true;        // 100.64/10 CGNAT
    if (a === 127) return true;                               // 127/8 loopback
    if (a === 169 && b === 254) return true;                  // 169.254/16 link-local + cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true;         // 172.16/12 RFC1918
    if (a === 192 && b === 0) return true;                    // 192.0.0/24, 192.0.2/24
    if (a === 192 && b === 168) return true;                  // 192.168/16 RFC1918
    if (a === 198 && (b === 18 || b === 19)) return true;     // 198.18/15 benchmarking
    if (a === 198 && b === 51 && c === 100) return true;      // 198.51.100/24 TEST-NET-2
    if (a === 203 && b === 0 && c === 113) return true;       // 203.0.113/24 TEST-NET-3
    if (a >= 224 && a <= 239) return true;                    // 224/4 multicast
    if (a >= 240) return true;                                // 240/4 reserved + broadcast
    return false;
}

function isForbiddenIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();
    if (lower === "::" || lower === "::1") return true;
    if (lower.startsWith("::ffff:")) {
        const v4 = lower.slice(7);
        if (ipFamily(v4) === 4) return isForbiddenIPv4(v4);
        return true;
    }
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;        // fc00::/7 ULA
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;        // fe80::/10 link-local
    if (lower.startsWith("ff")) return true;                  // ff00::/8 multicast
    if (lower.startsWith("64:ff9b:")) return true;            // NAT64 well-known
    if (lower.startsWith("2002:")) return true;               // 6to4
    return false;
}

function isForbiddenIp(ip: string): boolean {
    const fam = ipFamily(ip);
    if (fam === 4) return isForbiddenIPv4(ip);
    if (fam === 6) return isForbiddenIPv6(ip);
    return true;
}

// ── DNS-over-HTTPS helpers ──────────────────────────────────────────────────

interface DohAnswer {
    name: string;
    type: number;
    TTL: number;
    data: string;
}
interface DohResponse {
    Status: number;
    Answer?: DohAnswer[];
}

async function doh(name: string, type: "A" | "AAAA" | "TXT"): Promise<DohAnswer[]> {
    const url = `${DOH_ENDPOINT}?name=${encodeURIComponent(name)}&type=${type}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5_000);
    try {
        const res = await fetch(url, {
            headers: { accept: "application/dns-json" },
            signal: controller.signal,
        });
        if (!res.ok) {
            throw new SafeFetchError("dns_failure", `DoH ${type} for ${name} returned ${res.status}`);
        }
        const body = (await res.json()) as DohResponse;
        // Status 0 = NOERROR; 3 = NXDOMAIN. Treat anything else as failure too,
        // but return [] for NOERROR with no Answer (e.g. host has only AAAA
        // when we asked for A) so the caller can combine v4 + v6 results.
        if (body.Status !== 0 && body.Status !== 3) {
            throw new SafeFetchError("dns_failure", `DoH ${type} for ${name} status ${body.Status}`);
        }
        return body.Answer ?? [];
    } catch (err) {
        if (err instanceof SafeFetchError) throw err;
        if (controller.signal.aborted) {
            throw new SafeFetchError("dns_failure", `DoH ${type} for ${name} timed out`);
        }
        throw new SafeFetchError("dns_failure", `DoH ${type} for ${name} failed: ${err instanceof Error ? err.message : "unknown"}`);
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Look up TXT records for a name via DoH. Returns one string per TXT RR.
 *
 * DoH wraps each `data` string in quotes; long TXT records (>255 bytes)
 * arrive as multiple quoted segments concatenated within a single `data`
 * field, e.g. `"part one" "part two"`. We strip the outer quotes and the
 * inter-segment `" "` so the caller sees the joined value of each RR.
 * Multiple TXT RRs (e.g. one per provider) remain separate array entries.
 */
export async function dnsTxt(name: string): Promise<string[]> {
    const answers = await doh(name, "TXT");
    return answers
        .filter((a) => a.type === 16) // TXT
        .map((a) => {
            // Some resolvers return concatenated quoted segments:
            //   "\"part one\" \"part two\""  → strip quotes, drop separators
            return a.data
                .replace(/^"/, "")
                .replace(/"$/, "")
                .replace(/"\s+"/g, "");
        });
}

interface ResolvedHost {
    ip: string;
    family: 4 | 6;
}

/**
 * Resolve + validate a hostname without performing a fetch. Used by
 * scrape-site to refuse obviously-bad hostnames before handing the URL off
 * to Firecrawl (which performs the actual crawl from their infra).
 *
 * Throws `SafeFetchError` on a forbidden / unresolvable host.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
    await resolveAndValidate(hostname);
}

async function resolveAndValidate(rawHostname: string): Promise<ResolvedHost> {
    const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
        ? rawHostname.slice(1, -1)
        : rawHostname;

    // Literal IP — validate directly, no DoH round trip.
    const literal = ipFamily(hostname);
    if (literal === 4 || literal === 6) {
        if (isForbiddenIp(hostname)) {
            throw new SafeFetchError("private_address", `Refusing to connect to ${hostname}`);
        }
        return { ip: hostname, family: literal };
    }

    const [aRecords, aaaaRecords] = await Promise.all([
        doh(hostname, "A").catch(() => [] as DohAnswer[]),
        doh(hostname, "AAAA").catch(() => [] as DohAnswer[]),
    ]);
    const v4 = aRecords.filter((a) => a.type === 1).map((a) => a.data);
    const v6 = aaaaRecords.filter((a) => a.type === 28).map((a) => a.data);

    if (v4.length === 0 && v6.length === 0) {
        throw new SafeFetchError("dns_failure", `No A/AAAA records for ${hostname}`);
    }
    for (const ip of [...v4, ...v6]) {
        if (isForbiddenIp(ip)) {
            throw new SafeFetchError(
                "private_address",
                `Hostname ${hostname} resolves to a forbidden address (${ip})`,
            );
        }
    }
    if (v4.length > 0) return { ip: v4[0], family: 4 };
    return { ip: v6[0], family: 6 };
}

// ── safeFetch ───────────────────────────────────────────────────────────────

export interface SafeFetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Uint8Array;
    timeoutMs?: number;
    userAgent?: string;
}

export interface SafeFetchResponse {
    ok: boolean;
    status: number;
    headers: Headers;
    text(): Promise<string>;
    json(): Promise<unknown>;
}

function parseAndValidateUrl(input: string): URL {
    let url: URL;
    try {
        url = new URL(input);
    } catch {
        throw new SafeFetchError("invalid_url", `Could not parse URL: ${input}`);
    }
    if (url.protocol !== "http:" && url.protocol !== "https:") {
        throw new SafeFetchError("invalid_protocol", `Disallowed protocol: ${url.protocol}`);
    }
    return url;
}

export async function safeFetch(
    rawUrl: string,
    options: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let currentUrl = rawUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const url = parseAndValidateUrl(currentUrl);
        // Per-hop hostname re-validation. Each redirect Location is checked
        // afresh — no shortcut on the second hop.
        await resolveAndValidate(url.hostname);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const headers: Record<string, string> = {
            "user-agent": options.userAgent ?? "SafeFetch/1.0",
            ...(options.headers ?? {}),
        };

        try {
            const res = await fetch(url.toString(), {
                method: options.method ?? "GET",
                headers,
                body: options.body,
                redirect: "manual",
                signal: controller.signal,
            });

            if (res.status >= 300 && res.status < 400 && res.headers.has("location")) {
                if (hop >= MAX_REDIRECTS) {
                    throw new SafeFetchError(
                        "too_many_redirects",
                        `Exceeded ${MAX_REDIRECTS} redirects starting from ${rawUrl}`,
                    );
                }
                const next = new URL(res.headers.get("location")!, url).toString();
                currentUrl = next;
                continue;
            }

            return {
                ok: res.ok,
                status: res.status,
                headers: res.headers,
                text: () => res.text(),
                json: () => res.json(),
            };
        } catch (err) {
            if (err instanceof SafeFetchError) throw err;
            if (controller.signal.aborted) {
                throw new SafeFetchError("timeout", `Request to ${url.hostname} timed out after ${timeoutMs}ms`);
            }
            const detail = err instanceof Error ? err.message : "network error";
            throw new SafeFetchError("network", detail);
        } finally {
            clearTimeout(timer);
        }
    }

    throw new SafeFetchError("too_many_redirects", "Redirect loop");
}

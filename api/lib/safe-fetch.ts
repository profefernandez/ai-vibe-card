/**
 * SSRF-safe fetch.
 *
 * The threat: a user supplies a domain that the server is going to fetch
 * (domain verification, scrape target). Without protection an attacker can
 * point that domain at:
 *   - cloud metadata     (169.254.169.254)
 *   - localhost          (127.0.0.0/8, ::1)
 *   - the docker bridge  (172.17/16 etc.)
 *   - link-local         (169.254/16, fe80::/10)
 *   - other RFC1918      (10/8, 192.168/16)
 *   - CGNAT              (100.64/10)
 *
 * A naïve hostname regex (the original `scrape-site.ts` defence) catches
 * literal IPs but misses:
 *   - hostnames that resolve to private IPs
 *   - hostnames whose DNS A/AAAA mix public + private records
 *   - DNS rebinding: hostname resolves to a public IP at validation time,
 *     then to a private IP when fetch re-resolves at TCP connect time
 *   - HTTP redirects to private IPs
 *
 * What this module does:
 *   1. Validate URL parses + http(s) protocol
 *   2. Resolve EVERY A and AAAA record. Reject if any single record falls in
 *      a forbidden range. (Catches mixed-record attacks.)
 *   3. Pick one validated IP and pin the connection to it via an undici
 *      Agent whose `connect.lookup` callback always returns that IP. This
 *      closes the resolve→connect TOCTOU.
 *   4. `redirect: 'manual'`. Each redirect's Location is re-validated end
 *      to end. Maximum 5 hops. Original Host header preserved for TLS SNI.
 *   5. 10 s AbortController timeout per hop.
 *
 * Vendor APIs (Firecrawl, OpenAI, Anthropic, …) should NOT use this — they
 * have known good hostnames and the IP pinning would just slow them down.
 * Reserve `safeFetch` for fetches whose target URL came from user input.
 */

import { promises as dns } from "node:dns";
import { isIP } from "node:net";
import { Agent, fetch as undiciFetch, type Dispatcher } from "undici";

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface SafeFetchOptions {
    method?: string;
    headers?: Record<string, string>;
    body?: string | Buffer | Uint8Array;
    timeoutMs?: number;
    /** Custom User-Agent (default: SafeFetch/1.0) */
    userAgent?: string;
}

export interface SafeFetchResponse {
    ok: boolean;
    status: number;
    headers: Headers;
    text(): Promise<string>;
    json(): Promise<unknown>;
}

export class SafeFetchError extends Error {
    constructor(public reason: SafeFetchReason, message: string) {
        super(message);
        this.name = "SafeFetchError";
    }
}

export type SafeFetchReason =
    | "invalid_url"
    | "invalid_protocol"
    | "dns_failure"
    | "private_address"
    | "too_many_redirects"
    | "timeout"
    | "network";

// ── IP-range checks ─────────────────────────────────────────────────────────

/** True if the literal IP belongs to a range we refuse to connect to. */
function isForbiddenIp(ip: string): boolean {
    const family = isIP(ip);
    if (family === 4) return isForbiddenIPv4(ip);
    if (family === 6) return isForbiddenIPv6(ip);
    return true; // unknown family — refuse
}

function isForbiddenIPv4(ip: string): boolean {
    const parts = ip.split(".").map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
    const [a, b] = parts;

    // 0.0.0.0/8 — "this network"
    if (a === 0) return true;
    // 10.0.0.0/8 — RFC1918
    if (a === 10) return true;
    // 100.64.0.0/10 — CGNAT
    if (a === 100 && b >= 64 && b <= 127) return true;
    // 127.0.0.0/8 — loopback
    if (a === 127) return true;
    // 169.254.0.0/16 — link-local + cloud metadata
    if (a === 169 && b === 254) return true;
    // 172.16.0.0/12 — RFC1918 (covers docker default bridge 172.17/16)
    if (a === 172 && b >= 16 && b <= 31) return true;
    // 192.0.0.0/24, 192.0.2.0/24 — IETF / TEST-NET-1
    if (a === 192 && b === 0) return true;
    // 192.168.0.0/16 — RFC1918
    if (a === 192 && b === 168) return true;
    // 198.18.0.0/15 — benchmarking
    if (a === 198 && (b === 18 || b === 19)) return true;
    // 198.51.100.0/24 — TEST-NET-2
    if (a === 198 && b === 51 && parts[2] === 100) return true;
    // 203.0.113.0/24 — TEST-NET-3
    if (a === 203 && b === 0 && parts[2] === 113) return true;
    // 224.0.0.0/4 — multicast
    if (a >= 224 && a <= 239) return true;
    // 240.0.0.0/4 — reserved (incl. broadcast 255.255.255.255)
    if (a >= 240) return true;

    return false;
}

function isForbiddenIPv6(ip: string): boolean {
    const lower = ip.toLowerCase();

    // ::, ::1 — unspecified, loopback
    if (lower === "::" || lower === "::1") return true;
    // ::ffff:x.x.x.x — IPv4-mapped, validate the embedded v4
    if (lower.startsWith("::ffff:")) {
        const v4 = lower.slice(7);
        if (isIP(v4) === 4) return isForbiddenIPv4(v4);
        return true;
    }
    // fc00::/7 — unique local
    if (/^f[cd][0-9a-f]{2}:/.test(lower)) return true;
    // fe80::/10 — link-local
    if (/^fe[89ab][0-9a-f]:/.test(lower)) return true;
    // ff00::/8 — multicast
    if (lower.startsWith("ff")) return true;
    // 64:ff9b::/96 — NAT64 of well-known prefix; IPv4 portion can land in private
    //   (we err on the safe side and reject the whole prefix)
    if (lower.startsWith("64:ff9b:")) return true;
    // 2002::/16 — 6to4 (deprecated but if seen, embeds an IPv4 — refuse)
    if (lower.startsWith("2002:")) return true;

    return false;
}

// ── Resolve + validate hostname ─────────────────────────────────────────────

interface ResolvedHost {
    /** The IP we'll pin the connection to. */
    ip: string;
    /** 4 or 6. */
    family: 4 | 6;
}

/**
 * Resolve + validate a hostname without performing a fetch. Throws
 * SafeFetchError on a forbidden / unresolvable host. Useful when the actual
 * HTTP request will be made by an external service (e.g. Firecrawl) but you
 * still want to refuse obviously-bad hostnames at submission time.
 */
export async function assertPublicHost(hostname: string): Promise<void> {
    await resolveAndValidate(hostname);
}

async function resolveAndValidate(rawHostname: string): Promise<ResolvedHost> {
    // URL.hostname keeps the brackets on IPv6 literals ("[::1]"). Strip them
    // before any IP / DNS handling.
    const hostname = rawHostname.startsWith("[") && rawHostname.endsWith("]")
        ? rawHostname.slice(1, -1)
        : rawHostname;

    // If the URL host is already a literal IP, validate it directly.
    const literal = isIP(hostname);
    if (literal === 4 || literal === 6) {
        if (isForbiddenIp(hostname)) {
            throw new SafeFetchError("private_address", `Refusing to connect to ${hostname}`);
        }
        return { ip: hostname, family: literal as 4 | 6 };
    }

    let v4: string[] = [];
    let v6: string[] = [];
    try {
        v4 = await dns.resolve4(hostname).catch(() => [] as string[]);
        v6 = await dns.resolve6(hostname).catch(() => [] as string[]);
    } catch (err) {
        throw new SafeFetchError("dns_failure", `DNS failure for ${hostname}`);
    }
    if (v4.length === 0 && v6.length === 0) {
        throw new SafeFetchError("dns_failure", `No A/AAAA records for ${hostname}`);
    }

    // Reject if ANY record is forbidden — defends against split-horizon /
    // mixed-result rebinding where one record is public and another private.
    for (const ip of [...v4, ...v6]) {
        if (isForbiddenIp(ip)) {
            throw new SafeFetchError(
                "private_address",
                `Hostname ${hostname} resolves to a forbidden address (${ip})`,
            );
        }
    }

    // Prefer v4 (more reliable on most networks). Pin to the first record.
    if (v4.length > 0) return { ip: v4[0], family: 4 };
    return { ip: v6[0], family: 6 };
}

// ── Per-target undici Agent that pins the IP ────────────────────────────────
//
// undici's `connect.lookup` is the same shape as `dns.lookup`. We hand back
// the pre-validated IP regardless of what hostname undici asks about, so the
// TCP connect cannot resolve to anything else (no rebinding window). TLS
// SNI/cert verification still uses the original hostname because we leave
// `servername` to undici's defaults — it derives that from the URL.

function pinnedAgent(target: ResolvedHost): Dispatcher {
    // Defensive: redirects are handled at the safeFetch layer (manual mode +
    // per-hop revalidation). The Agent itself is left at default redirect
    // behaviour because `redirect: "manual"` on the fetch call already
    // suppresses auto-follow.
    return new Agent({
        connect: {
            // Undici's lookup mirrors dns.lookup. When `options.all` is true
            // the callback expects an array of {address, family}; otherwise
            // (address, family). Handle both signatures so we work across
            // undici versions.
            lookup: (_hostname, options, cb) => {
                if (options && (options as { all?: boolean }).all) {
                    (cb as unknown as (err: Error | null, addresses: { address: string; family: number }[]) => void)(
                        null,
                        [{ address: target.ip, family: target.family }],
                    );
                } else {
                    cb(null, target.ip, target.family);
                }
            },
        },
    });
}

// ── Main entry point ────────────────────────────────────────────────────────

export async function safeFetch(
    rawUrl: string,
    options: SafeFetchOptions = {},
): Promise<SafeFetchResponse> {
    const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let currentUrl = rawUrl;

    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const url = parseAndValidateUrl(currentUrl);
        const target = await resolveAndValidate(url.hostname);
        const agent = pinnedAgent(target);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeoutMs);

        const headers = {
            "user-agent": options.userAgent ?? "SafeFetch/1.0",
            ...(options.headers ?? {}),
        };

        try {
            const res = await undiciFetch(url.toString(), {
                method: options.method ?? "GET",
                headers,
                body: options.body,
                redirect: "manual",
                signal: controller.signal,
                dispatcher: agent,
            });

            // Follow 3xx redirects manually so each Location is revalidated.
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

            // Non-redirect terminal response — wrap in a minimal interface.
            return {
                ok: res.ok,
                status: res.status,
                headers: res.headers as unknown as Headers,
                text: () => res.text(),
                json: () => res.json(),
            };
        } catch (err) {
            if (err instanceof SafeFetchError) throw err;
            if (controller.signal.aborted) {
                throw new SafeFetchError("timeout", `Request to ${url.hostname} timed out after ${timeoutMs}ms`);
            }
            // Surface the cause when present — undici wraps the real error
            // (TLS / ECONNRESET / etc.) under .cause. Without this the caller
            // just sees "fetch failed" with no context.
            const cause = err instanceof Error && (err as Error & { cause?: unknown }).cause;
            const detail = cause instanceof Error ? cause.message : (err instanceof Error ? err.message : "network error");
            throw new SafeFetchError("network", detail);
        } finally {
            clearTimeout(timer);
            await agent.close().catch(() => { /* nothing */ });
        }
    }

    // Unreachable — the loop either returns or throws.
    throw new SafeFetchError("too_many_redirects", "Redirect loop");
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

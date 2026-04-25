/**
 * Smoke test for api/lib/safe-fetch.ts. Run with:
 *   cd api && npx tsx scripts/test-safe-fetch.ts
 *
 * Not part of the build / migration pipeline — kept here for manual
 * verification of SSRF guards. CI may pick this up later if we add
 * a network-allowed test job.
 */

import { safeFetch, SafeFetchError, assertPublicHost } from "../lib/safe-fetch.js";

let passed = 0;
let failed = 0;

async function expectReject(label: string, url: string, expectedReason?: string) {
    try {
        await safeFetch(url, { timeoutMs: 5000 });
        console.error(`✗ ${label} — expected throw, got success`);
        failed++;
    } catch (err) {
        if (err instanceof SafeFetchError) {
            const reasonOk = !expectedReason || err.reason === expectedReason;
            console.log(`✓ ${label} — ${err.reason}${reasonOk ? "" : ` (expected ${expectedReason})`}`);
            if (reasonOk) passed++;
            else failed++;
        } else {
            console.error(`✗ ${label} — wrong error type: ${err}`);
            failed++;
        }
    }
}

async function expectAssertReject(label: string, host: string) {
    try {
        await assertPublicHost(host);
        console.error(`✗ ${label} — expected throw`);
        failed++;
    } catch (err) {
        if (err instanceof SafeFetchError && err.reason === "private_address") {
            console.log(`✓ ${label} — private_address`);
            passed++;
        } else {
            console.error(`✗ ${label} — wrong error: ${err}`);
            failed++;
        }
    }
}

async function expectAccept(label: string, url: string) {
    try {
        const res = await safeFetch(url, { timeoutMs: 8000 });
        console.log(`✓ ${label} — status ${res.status}`);
        passed++;
    } catch (err) {
        console.error(`✗ ${label} — unexpected throw: ${err instanceof Error ? err.stack : err}`);
        failed++;
    }
}

async function main() {
    // ── Literal private IPs ────────────────────────────────────────────────
    await expectReject("rejects 127.0.0.1",       "http://127.0.0.1/",        "private_address");
    await expectReject("rejects 10.0.0.1",        "http://10.0.0.1/",         "private_address");
    await expectReject("rejects 172.17.0.1",      "http://172.17.0.1/",       "private_address");
    await expectReject("rejects 192.168.1.1",     "http://192.168.1.1/",      "private_address");
    await expectReject("rejects 169.254.169.254", "http://169.254.169.254/",  "private_address");
    await expectReject("rejects 100.64.0.1",      "http://100.64.0.1/",       "private_address");
    await expectReject("rejects 0.0.0.0",         "http://0.0.0.0/",          "private_address");
    await expectReject("rejects ::1",             "http://[::1]/",            "private_address");
    await expectReject("rejects fe80::1",         "http://[fe80::1]/",        "private_address");
    await expectReject("rejects fc00::1",         "http://[fc00::1]/",        "private_address");

    // ── Disallowed protocols / parsing ─────────────────────────────────────
    await expectReject("rejects file://",         "file:///etc/passwd",       "invalid_protocol");
    await expectReject("rejects gopher://",       "gopher://example.com/",    "invalid_protocol");
    await expectReject("rejects malformed url",   "not a url",                "invalid_url");

    // ── Hostnames that resolve to private IPs ──────────────────────────────
    // localhost typically resolves to 127.0.0.1 / ::1
    await expectReject("rejects 'localhost' hostname", "http://localhost/", "private_address");

    // ── assertPublicHost direct API ────────────────────────────────────────
    await expectAssertReject("assertPublicHost: 127.0.0.1", "127.0.0.1");
    await expectAssertReject("assertPublicHost: localhost", "localhost");

    // ── Public hostname acceptance (network-dependent) ─────────────────────
    // example.com is the IETF-reserved example domain — stable and public.
    await expectAccept("accepts example.com", "https://example.com/");

    console.log(`\n${passed} passed, ${failed} failed`);
    process.exit(failed === 0 ? 0 : 1);
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});

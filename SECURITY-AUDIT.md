# Security Audit

**Date:** 2026-04-25
**Scope:** `npm audit` on repo root (frontend) and `api/` (backend).

## Counts

| Workspace | low | moderate | high | critical |
| --------- | --- | -------- | ---- | -------- |
| root      | 3   | 4        | 0    | 0        |
| api       | 0   | 0        | 0    | 0        |

No high or critical findings in either workspace, so `npm audit fix` was not run (per audit policy: only auto-fix high/critical without major-version bumps).

## High / Critical findings

None.

## Moderate findings on root (deferred)

All moderate advisories on root are dev-only (build/test toolchain) and the only `fixAvailable` paths are SemVer-major upgrades. Deferring per policy.

| Package    | Advisory                              | Fix path             | Status                          |
| ---------- | ------------------------------------- | -------------------- | ------------------------------- |
| dompurify  | GHSA-39q2-94rc-95cp et al.            | minor bump available | deferred (transitive, low risk) |
| esbuild    | GHSA-67mh-4wv8-2f99 (dev server only) | vite@8 (major bump)  | deferred — major bump           |
| postcss    | GHSA-qx2v-qp2m-jg93                   | minor bump available | deferred (transitive, low risk) |
| vite       | GHSA-4w7w-66w2-5vf9 (dev server only) | vite@8 (major bump)  | deferred — major bump           |

## Low findings on root (deferred)

`@tootallnate/once`, `http-proxy-agent`, `jsdom` — all reachable only as `jsdom` transitives in the test toolchain; fix requires `jsdom@29` (major). Deferred.

## Verification

- `npm run build` (in `api/`): clean.
- `npx tsc --noEmit -p tsconfig.app.json` (root): pre-existing errors only (AiTrainingTab, ApiConnectorTab, ProfileTab, HeroSection — unrelated to this audit).

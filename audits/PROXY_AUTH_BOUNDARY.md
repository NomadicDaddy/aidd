---
title: 'Reverse-Proxy / Loopback Trust Boundary Audit'
last_updated: '2026-06-28'
version: '1.1'
category: 'Security'
priority: 'Critical'
estimated_time: '1-2 hours'
frequency: 'Per-release'
lifecycle: 'pre-release'
---

# Reverse-Proxy / Loopback Trust Boundary Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing guard, falsify every "by design" rationale, never score from a green gate.

Audits the boundary where aidd's web control plane decides whether a caller is a trusted direct loopback client or an untrusted off-box caller arriving through a reverse proxy. This is the exact control whose CRITICAL reverse-proxy auth bypass was closed on commit `25d60d0f`, a bypass that an earlier audit scored clean by reading the config default and the "loopback-only, by design" comment instead of the guard. Do not repeat that failure: open `bearerTokenGuard.ts` and trace the forwarded request.

## Executive Summary

**Critical Priorities**

- **Fail closed on forwarded requests**: a request carrying any reverse-proxy header with no valid token MUST be rejected, even when the transport peer is loopback (the proxy).
- **Trust the transport, not the headers**: the loopback decision MUST come from the kernel-reported peer (`server.requestIP`), never from a spoofable `X-Forwarded-For` / `X-Real-IP` / `Forwarded` value.
- **Complete forwarded-header detection**: detection MUST be case-insensitive and cover all reverse-proxy header families, or a proxy that uses an uncovered header silently re-enables the loopback exemption.
- **Universal guard mount**: the guard MUST gate all of `/api/*` with no route registered ahead of it.

**Essential Standards**

- The `?token=` query-string exemption is allowed ONLY on the WebSocket upgrade path, never on the rest of the HTTP API.
- Token comparison is timing-safe.
- The WebSocket `open()` handler runs the **same** authorization predicate as the HTTP guard (defense in depth: the global `onBeforeHandle` may not fire for upgrades).

## Applicability & Scope

aidd's web API is reachable two ways: **directly on loopback** (the local browser UI, the local MCP server, the chat bridge; all over `127.0.0.1` with no forwarding headers) AND **through a Caddy reverse proxy** that terminates a public/remote connection and forwards to `127.0.0.1:<port>`. The security model hinges on one invariant: the exemption that lets direct loopback callers skip the bearer token must **NOT** extend to proxied callers, because behind a proxy the transport peer is always loopback and would otherwise trust the entire network the proxy fronts.

This audit applies **fleet-wide** to any aidd-derived web backend that may sit behind a reverse proxy. It is in-scope even for single-user local tools: the moment a proxy is placed in front (a common "expose my dashboard" step), the loopback exemption becomes the entire attack surface.

This audit is the aidd reduced-equivalent of a multi-user RBAC audit (see AUDIT_METHODOLOGY Rule 4): the single `web.authToken` stands in for role guards, and this boundary is where it is enforced.

**Out of scope (audited elsewhere):** loopback/remote **bind-default enforcement** (whether the listener binds `127.0.0.1` unless `allowRemote` is set) and the **HTTP-request origin guard** belong to [SECURITY.md §15 (Local-Tool Control Surface)](./SECURITY.md#15-local-tool-control-surface). This audit covers only the per-request forwarded-vs-loopback token decision and the WS upgrade's own origin gate.

## Pre-Audit Setup

```bash
# Locate the guard, its mount, and the WS upgrade authorizer
grep -rn "isPeerAuthorized\|isForwardedRequest\|requestIP\|WS_UPGRADE_PATH" backend/src/ --include="*.ts"

# Confirm the guard is mounted before any route .use()
grep -n "createBearerTokenGuardPlugin\|createHealthRoutes\|create\w*Routes" backend/src/server.ts

# Confirm token comparison is timing-safe (no === on secrets)
grep -rn "timingSafeEqual\|authToken ===" backend/src/plugins/bearerTokenGuard.ts
```

---

## 1. Fail-Closed Behavior on Forwarded Requests

| Check | Criteria                                                                                                                                                      | Remediation                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | A forwarded request with **no** token is rejected even when no `web.authToken` is configured (cannot expose an unauthenticated control plane through a proxy) | Verify `isPeerAuthorized` returns `false` for forwarded + no-token in the no-token-configured branch (`bearerTokenGuard.ts:102-103`) |
| `[ ]` | A forwarded request with a token is accepted ONLY when the token matches                                                                                      | Verify the forwarded branch calls `tokensMatch(providedToken, web.authToken)` (`bearerTokenGuard.ts:103`)                            |
| `[ ]` | The forwarded branch is reached **before** the loopback shortcut, so a forwarded request can never fall through to the loopback exemption                     | Verify the `if (requestIsForwarded)` early-return precedes the `isLoopbackAddress` check (`bearerTokenGuard.ts:102` precedes `:106`) |
| `[ ]` | Guard rejection sets HTTP 401 (not a silent pass, not a 200)                                                                                                  | Verify `set.status = 401` on the failure path (`bearerTokenGuard.ts:131-132`)                                                        |

## 2. Forwarded-Request Detection Coverage

| Check | Criteria                                                                                                                                       | Remediation                                                                                                                                                                                                      |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Detection covers `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Real-IP`, and RFC-7239 `Forwarded`                             | Verify `FORWARDING_HEADER_NAMES` lists all five families (`bearerTokenGuard.ts:51-57`)                                                                                                                           |
| `[ ]` | Detection is case-insensitive (a proxy sending `X-Forwarded-For` vs `x-forwarded-for` is treated identically)                                  | Verify header names are lowercased and read via the Fetch `Headers.get()` path, which is case-insensitive (`bearerTokenGuard.ts:60-69, 72-79`)                                                                   |
| `[ ]` | An empty-valued forwarding header (`X-Forwarded-For:` with no value) does not bypass detection in a way that re-enables the loopback exemption | Verify `isForwardedRequest` treats `''` as present-but-empty and confirm intended semantics: empty value returns `false` (`bearerTokenGuard.ts:75-78`); assess whether an empty header should count as forwarded |
| `[ ]` | Header **values** are never parsed to make the trust decision, only header **presence**                                                        | Verify no code reads `x-forwarded-for`'s value to derive a peer address for the loopback check                                                                                                                   |

## 3. Transport-Peer Loopback Decision

| Check | Criteria                                                                                                              | Remediation                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The loopback determination uses the kernel transport peer (`server.requestIP(request).address`), NOT any header value | Verify `peerAddress` is sourced from `server?.requestIP(request)?.address` (`bearerTokenGuard.ts:116`)                     |
| `[ ]` | Loopback matching covers `127.0.0.0/8`, `::1`, and IPv4-mapped loopback (`::ffff:127.0.0.1`)                          | Verify `isLoopbackAddress` strips the `::ffff:` prefix and delegates to `isLoopbackHostname` (`bearerTokenGuard.ts:30-32`) |
| `[ ]` | A null/undefined peer address does not default to "loopback" (fails closed when the peer cannot be resolved)          | Verify the loopback branch requires a truthy `peerAddress` before granting (`bearerTokenGuard.ts:106`)                     |

## 4. Guard Mount Universality

| Check | Criteria                                                                                              | Remediation                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The guard is always mounted (not conditional on a token being configured)                             | Verify `createBearerTokenGuardPlugin(...)` is unconditionally `.use()`d (`server.ts:91`)                                           |
| `[ ]` | The guard runs as a global `onBeforeHandle` so it fires for every `/api/*` route                      | Verify `{ as: 'global' }` on `onBeforeHandle` and the `/api/` path gate (`bearerTokenGuard.ts:111-115`)                            |
| `[ ]` | No application route is registered **before** the guard in the plugin chain                           | Verify every `create*Routes()` `.use()` comes after the guard `.use()` (`server.ts:91` precedes `:97-115`)                         |
| `[ ]` | Non-`/api/` paths (static assets, SPA fallback) are intentionally exempt and serve no privileged data | Verify the early `return` for non-`/api/` paths is correct and static serving leaks nothing privileged (`bearerTokenGuard.ts:115`) |

## 5. WebSocket Upgrade Parity

| Check | Criteria                                                                                                                    | Remediation                                                                                                                                                                                                                                                                                                                              |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The WS `open()` handler runs the **same** `isPeerAuthorized` predicate as the HTTP guard                                    | Verify `isWebSocketUpgradeAuthorized` delegates to `isPeerAuthorized` (`ws.ts:31-37`) and is invoked in `open()` (`ws.ts:58-67`)                                                                                                                                                                                                         |
| `[ ]` | A forwarded WS upgrade obeys the same fail-closed rule (loopback exemption voided)                                          | Verify `isForwardedRequest(upgrade.headers)` is passed through (`ws.ts:35`)                                                                                                                                                                                                                                                              |
| `[ ]` | The `?token=` query token is accepted ONLY on the WS upgrade path, never on other `/api/*` routes                           | Verify `WS_UPGRADE_PATH` gates query-token reading in the HTTP guard (`bearerTokenGuard.ts:42-43, 118-119`)                                                                                                                                                                                                                              |
| `[ ]` | The WS handler does not silently trust the global guard to have run (enforces independently)                                | Verify the comment and the explicit gate in `open()` (`ws.ts:56-67`)                                                                                                                                                                                                                                                                     |
| `[ ]` | The WS origin allowlist is enforced **independently of** the token gate (a valid token does not exempt a disallowed origin) | Verify `allowedOrigins = buildAllowedOrigins(web)` (`ws.ts:41`) and that `open()` closes with `1008 'origin not allowed'` for an origin absent from the set (`ws.ts:68-71`), as a separate gate from the token check. Scope: WS only; the HTTP origin guard is audited in [SECURITY.md §15](./SECURITY.md#15-local-tool-control-surface) |

## 6. Token Comparison Safety

| Check | Criteria                                                                                     | Remediation                                                               |
| ----- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `[ ]` | Token comparison uses constant-time equality, not `===`                                      | Verify `tokensMatch` uses `timingSafeEqual` (`bearerTokenGuard.ts:34-40`) |
| `[ ]` | Length mismatch is handled before `timingSafeEqual` (which throws on unequal-length buffers) | Verify the early length-check return (`bearerTokenGuard.ts:38`)           |
| `[ ]` | A missing/empty provided token is rejected, not coerced to a match                           | Verify `if (!provided) return false` (`bearerTokenGuard.ts:35`)           |

---

## BREAK-THE-ASSUMPTION (mandatory)

Per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Rules 1-3, you MUST construct and trace the request that defeats "loopback-only, by design." Scoring from `server.ts`'s own "Loopback-only listener" comment (`server.ts:80`) or from the config default (`web.authToken` unset) is **explicitly forbidden**; that is the exact reasoning that produced the `25d60d0f` false-clean. Each scenario below must end in **passed** (401, control held) or **blocked** (slipped through, finding) with the deciding `file:line`.

1. **Caddy-forwarded, no token (the core bypass).** Build a request with a **loopback transport peer** (as Caddy → `127.0.0.1` produces), header `X-Forwarded-For: <attacker-ip>`, and **no** `Authorization`. Trace it through `isForwardedRequest` → `isPeerAuthorized`. It MUST return 401 at `bearerTokenGuard.ts:103` (forwarded + no token configured → `false`). If it reaches the loopback shortcut at `:106`, that is a CRITICAL finding.

2. **Casing variants.** Repeat with `X-Forwarded-For`, `X-FORWARDED-FOR`, and `x-forwarded-for`. All MUST be detected as forwarded (Fetch `Headers.get` is case-insensitive; `bearerTokenGuard.ts:64-66`). Any casing that evades detection and re-enables the loopback exemption is a finding.

3. **Empty `X-Forwarded-For:`.** Send the header with an empty value. Determine whether `isForwardedRequest` counts it as forwarded (`bearerTokenGuard.ts:75-78` treats `''` as not-present). Decide and record whether an empty forwarding header should fail closed; if a real proxy can emit an empty value while still forwarding off-box traffic, the current `value !== ''` check is a finding.

4. **Alternate `Forwarded:` header.** Repeat scenario 1 using only the RFC-7239 `Forwarded: for=<attacker>` header (no `X-Forwarded-*`). It MUST be detected (`forwarded` is in `FORWARDING_HEADER_NAMES`, `bearerTokenGuard.ts:56`) and fail closed.

5. **WS upgrade parity.** Repeat scenario 1 as a WebSocket upgrade to `/api/v1/ws` with `?token=` absent and a forwarding header present. The `open()` handler MUST close with code 1008 `unauthorized` (`ws.ts:64-66`). A forwarded upgrade that connects is a CRITICAL finding.

6. **WS origin enforcement (token does not exempt origin).** Open a WebSocket upgrade to `/api/v1/ws` carrying a **valid** `?token=` (passes the token gate) but an `Origin` header **not** in `buildAllowedOrigins(web)` (`ws.ts:41`). After `isWebSocketUpgradeAuthorized` returns true, the origin check MUST still close the upgrade with code 1008 `origin not allowed` (`ws.ts:68-71`). A connection that opens because the valid token short-circuited the origin gate is a finding. (Scope: WS only; the HTTP-request origin guard is falsified in [SECURITY.md §15](./SECURITY.md#15-local-tool-control-surface).)

Any scenario that slips past is a finding; record it with severity per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md). A report with fewer than five recorded falsification outcomes here is incomplete and invalid (AUDIT_METHODOLOGY Scoring validity).

---

## False Positives Considered and Rejected

This section is REQUIRED: if you found zero false-positive candidates, state that explicitly. Record candidates you traced and rejected, with the by-design rationale, so a later reviewer does not re-flag them.

| Candidate                                                                                                                          | Disposition                                                                                                                                                                                                                                                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty forwarding header (`X-Forwarded-For:` with no value) treated as **not forwarded** (`bearerTokenGuard.ts:77`, `value !== ''`) | **Record and assess, not an auto-finding.** Counting only non-empty forwarding headers is a deliberate design choice (an empty header is indistinguishable from no header). Falsify scenario 3 against a real proxy: if a proxy in the deployment can emit an empty forwarding header while still relaying off-box traffic, the `value !== ''` check becomes a finding; absent that, it is by design. |

---

## Audit Output

When this audit discovers an issue requiring code changes, create a `feature.json` file under `.aidd/features/` following the schema and severity mapping in [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md):

- Directory and `id`: `audit-proxy-auth-boundary-{unix_timestamp}-{descriptive-slug}` (the `id` MUST match the directory name exactly).
- `auditSource`: `"PROXY_AUTH_BOUNDARY"`, `category`: `"Audit"`, `passes`: `false`, `status`: `"backlog"`.
- `priority` / `auditSeverity` per the Critical=1 / High=2 / Medium=3 / Low=4 mapping.
- `description` MUST carry the falsification evidence: the deciding `file:line` (e.g. `bearerTokenGuard.ts:103`) and the concrete request that was traced.
- `spec` MUST contain actionable remediation steps.

A reverse-proxy auth bypass (a forwarded request reaching privileged routes without a valid token) is **Critical**. Incomplete forwarded-header coverage or a header-derived loopback decision is **Critical** or **High** depending on exploitability. A missing falsification record for the "loopback-only" rationale is itself a finding (incomplete audit) per AUDIT_METHODOLOGY.

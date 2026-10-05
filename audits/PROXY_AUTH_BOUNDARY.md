---
title: 'Reverse-Proxy / Loopback Trust Boundary Audit'
last_updated: '2026-10-01'
version: '1.3'
category: 'Security'
priority: 'Critical'
estimated_time: '1-2 hours'
frequency: 'Per-release'
lifecycle: 'pre-release'
---

# Reverse-Proxy / Loopback Trust Boundary Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing guard, falsify every "by design" rationale, never score from a green gate.

Audits the boundary where aidd's web control plane decides whether a caller is a trusted direct loopback client or an untrusted off-box caller arriving through a reverse proxy. This is the control an audit scores clean by mistake when it reads the config default and the "loopback-only, by design" comment instead of the guard, while a reverse-proxy auth bypass sits behind that comment. Do not make that mistake: open `bearerTokenGuard.ts` and trace the forwarded request.

**Citations in this audit name a symbol and its file, not a line.** Line numbers drift with every edit; a symbol either resolves or it does not. Locate each symbol in the live file, then cite the `file:line` you actually read in the report (AUDIT_METHODOLOGY Rule 1). A named symbol that no longer exists in the named file must be resolved before scoring: decide whether the control moved or was removed, and record which. Unless a row says otherwise, symbols are in `backend/src/plugins/bearerTokenGuard.ts`.

## Executive Summary

**Critical Priorities**

- **Fail closed on forwarded requests**: a request carrying any reverse-proxy header with no valid token MUST be rejected, even when the transport peer is loopback (the proxy).
- **Trust the transport, not the headers**: the loopback decision MUST come from the kernel-reported peer (`server.requestIP`), never from a spoofable `X-Forwarded-For` / `X-Real-IP` / `Forwarded` value.
- **Complete forwarded-header detection**: detection MUST be case-insensitive and cover all reverse-proxy header families, or a proxy that uses an uncovered header silently re-enables the loopback exemption.
- **Universal guard mount**: the guard MUST gate all of `/api/*` with no route registered ahead of it.
- **A tokenless panel never leaves loopback**: with no `web.authToken` and `allowRemote` false, the guard grants direct callers without consulting the peer address. That is safe only while the listener is loopback-bound, so `assertWebAuthTokenPresent` MUST refuse to start a remote-bound panel that has no token.

**Essential Standards**

- The `?token=` query-string exemption is allowed ONLY on the WebSocket upgrade paths listed in `WS_UPGRADE_PATHS`, never on the rest of the HTTP API. One of those paths is an interactive terminal; every entry must be justified on its own.
- Token comparison is timing-safe.
- Every WebSocket `open()` handler runs the **same** authorization predicate as the HTTP guard (defense in depth: the global `onBeforeHandle` may not fire for upgrades).

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Applicability and Scope](#applicability--scope)
3. [Pre-Audit Setup](#pre-audit-setup)
4. [Fail-Closed Behavior](#1-fail-closed-behavior-on-forwarded-requests)
5. [Forwarded-Request Detection](#2-forwarded-request-detection-coverage)
6. [Transport-Peer Loopback Decision](#3-transport-peer-loopback-decision)
7. [Guard Mount Universality](#4-guard-mount-universality)
8. [WebSocket Upgrade Parity](#5-websocket-upgrade-parity)
9. [Token Comparison Safety](#6-token-comparison-safety)
10. [Break the Assumption](#break-the-assumption-mandatory)
11. [False Positives](#false-positives-considered-and-rejected)
12. [Audit Checklist](#audit-checklist)
13. [Report Template](#report-template)
14. [Deliverables](#deliverables)

## Applicability & Scope

aidd's web API is reachable two ways: **directly on loopback** (the local browser UI, the local MCP server, the chat bridge; all over `127.0.0.1` with no forwarding headers) AND **through a Caddy reverse proxy** that terminates a public/remote connection and forwards to `127.0.0.1:<port>`. The security model hinges on one invariant: the exemption that lets direct loopback callers skip the bearer token must **NOT** extend to proxied callers, because behind a proxy the transport peer is always loopback and would otherwise trust the entire network the proxy fronts.

This audit applies **fleet-wide** to any aidd-derived web backend that may sit behind a reverse proxy. It is in-scope even for single-user local tools: the moment a proxy is placed in front (a common "expose my dashboard" step), the loopback exemption becomes the entire attack surface.

This audit is the aidd reduced-equivalent of a multi-user RBAC audit (see AUDIT_METHODOLOGY Rule 4): the single `web.authToken` stands in for role guards, and this boundary is where it is enforced.

**Out of scope (audited elsewhere):** loopback/remote **bind-default enforcement** (whether the listener binds `127.0.0.1` unless `allowRemote` is set) belongs to [SECURITY.md §15 (Local-Tool Control Surface)](./SECURITY.md#15-local-tool-control-surface). This audit covers the per-request forwarded-vs-loopback token decision, the HTTP request's `Host` and `Origin` gates (a page in the operator's own browser reaching the loopback listener, by DNS rebinding or by a cross-origin request; scenarios 10-11), each WS upgrade's own origin gate, and the one start-time precondition the token decision now relies on: `assertWebAuthTokenPresent` (see §3). The tokenless branch of `isPeerAuthorized` is only as sound as that precondition and the bind default together, so a finding against either in SECURITY.md §15 is also a finding here.

## Pre-Audit Setup

```bash
# Locate the guard, its mount, the WS upgrade authorizer, and the start-time token assertion
grep -rn "isPeerAuthorized\|isForwardedRequest\|requestIP\|WS_UPGRADE_PATHS\|isWebSocketUpgradeAuthorized\|assertWebAuthTokenPresent" backend/src/ --include="*.ts"

# Enumerate EVERY WebSocket route. Each one must appear in WS_UPGRADE_PATHS and in §5.
grep -rn "\.ws(" backend/src/ --include="*.ts"

# Confirm the guard is mounted before any route .use()
grep -n "createBearerTokenGuardPlugin\|createHealthRoutes\|create\w*Routes" backend/src/server.ts

# Confirm token comparison is timing-safe (no === on secrets)
grep -rn "timingSafeEqual\|authToken ===" backend/src/plugins/bearerTokenGuard.ts
```

---

## 1. Fail-Closed Behavior on Forwarded Requests

| Check | Criteria                                                                                                                                                      | Remediation                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A forwarded request with **no** token is rejected even when no `web.authToken` is configured (cannot expose an unauthenticated control plane through a proxy) | Verify the `if (requestIsForwarded)` branch of `isPeerAuthorized` returns `false` when `web.authToken` is unset                                                                        |
| `[ ]` | A forwarded request with a token is accepted ONLY when the token matches                                                                                      | Verify the same branch returns `tokensMatch(providedToken, web.authToken)` when a token is configured                                                                                  |
| `[ ]` | The forwarded branch is reached **before** every loopback or tokenless grant, so a forwarded request can never fall through to either                         | Verify `if (requestIsForwarded)` is the first statement of `isPeerAuthorized` and returns in both arms, ahead of the `if (!web.authToken)` branch and the `isLoopbackAddress` shortcut |
| `[ ]` | Guard rejection sets HTTP 401 (not a silent pass, not a 200)                                                                                                  | Verify `set.status = 401` on the failure path of the `onBeforeHandle` in `createBearerTokenGuardPlugin`                                                                                |

## 2. Forwarded-Request Detection Coverage

| Check | Criteria                                                                                                                                       | Remediation                                                                                                                                                                                                                                                                                                                                          |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Detection covers `X-Forwarded-For`, `X-Forwarded-Host`, `X-Forwarded-Proto`, `X-Real-IP`, and RFC-7239 `Forwarded`                             | Verify `FORWARDING_HEADER_NAMES` lists all five families                                                                                                                                                                                                                                                                                             |
| `[ ]` | Detection is case-insensitive (a proxy sending `X-Forwarded-For` vs `x-forwarded-for` is treated identically)                                  | Verify the names in `FORWARDING_HEADER_NAMES` are lowercase and `readHeader` reads them through the Fetch `Headers.get()` path, which is case-insensitive. `readHeader` also accepts a plain record (the WS upgrade passes one): confirm the record handed in by each `open()` handler has lowercased keys, because that path is an exact-key lookup |
| `[ ]` | An empty-valued forwarding header (`X-Forwarded-For:` with no value) does not bypass detection in a way that re-enables the loopback exemption | Verify `isForwardedRequest` treats `''` as present-but-empty and confirm intended semantics: empty value returns `false` (the `value !== ''` test); assess whether an empty header should count as forwarded                                                                                                                                         |
| `[ ]` | Header **values** are never parsed to make the trust decision, only header **presence**                                                        | Verify no code reads `x-forwarded-for`'s value to derive a peer address for the loopback check                                                                                                                                                                                                                                                       |

## 3. Transport-Peer Loopback Decision

After the forwarded branch, `isPeerAuthorized` decides differently depending on whether a token is configured and whether `allowRemote` is set. Audit each case below; they do not share a rule.

| Check | Criteria                                                                                                                                                                                                                           | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The loopback determination uses the kernel transport peer (`server.requestIP(request).address`), NOT any header value                                                                                                              | Verify `peerAddress` is sourced from `server?.requestIP(request)?.address` in `createBearerTokenGuardPlugin`, and from `ws.remoteAddress` in each WS `open()` handler                                                                                                                                                                                                                                                                                                                                                 |
| `[ ]` | Loopback matching covers `127.0.0.0/8`, `::1`, and IPv4-mapped loopback (`::ffff:127.0.0.1`)                                                                                                                                       | Verify `isLoopbackAddress` strips the `::ffff:` prefix and delegates to `isLoopbackHostname`                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `[ ]` | **Token configured, direct request**: a null/undefined peer address does not default to "loopback"                                                                                                                                 | Verify the shortcut is `peerAddress && isLoopbackAddress(peerAddress)` and that a null peer falls through to `tokensMatch`, so an unresolvable peer must present the token                                                                                                                                                                                                                                                                                                                                            |
| `[ ]` | **No token, `allowRemote` true**: the panel is held to loopback peers and fails closed on an unresolvable peer                                                                                                                     | Verify the `if (!web.authToken)` branch returns `Boolean(peerAddress && isLoopbackAddress(peerAddress))` when `web.allowRemote` is set. This is the second line behind `assertWebAuthTokenPresent`, for a config that reaches the guard some other way                                                                                                                                                                                                                                                                |
| `[ ]` | **No token, `allowRemote` false** (the default local panel): the guard grants a direct request **without consulting the peer address**. This is by design and is NOT a "fails closed on null peer" control; do not score it as one | Verify `if (!web.allowRemote) return true` and read the comment above it: `server.requestIP` returns nothing when the app is driven without a listening server, so a peer check here would refuse the default setup. Record this as a by-design disposition with a falsification record (scenario 8): the grant is safe only because the forwarded branch runs first AND the listener is loopback-bound. A change that makes this branch reachable by a forwarded request, or by a remote-bound listener, is CRITICAL |
| `[ ]` | A remote-bound panel with no token cannot start                                                                                                                                                                                    | Verify `assertWebAuthTokenPresent` (`backend/src/startHelpers.ts`) throws when `web.allowRemote` is true and `web.authToken` is missing or blank after `trim()`, and that `startWebServer` (`backend/src/start.ts`) calls it before the database is opened and before `app.listen`. This assertion is what keeps a tokenless panel off the network. Its removal, a move to after `listen`, or a new start path that skips it is CRITICAL and silent: nothing else fails                                               |
| `[ ]` | A loopback-only config cannot name a non-loopback bind address                                                                                                                                                                     | Verify the web config resolver (`shared/src/config/resolve.ts`) throws when `web.hostname` is not loopback and `allowRemote` is false. Together with the row above, this is why the tokenless grant never answers the network. Bind-default depth is audited in SECURITY.md §15; here, confirm only that the check exists                                                                                                                                                                                             |
| `[ ]` | The guard is never mounted with a config that silently selects the tokenless grant                                                                                                                                                 | Verify what `createWebServer` (`backend/src/server.ts`) passes to `createBearerTokenGuardPlugin`. It falls back to `{ allowRemote: false }` when `context.config.web` is absent, which selects the tokenless grant; confirm `startWebServer` always supplies a resolved web config so that fallback is reachable only without a listening server                                                                                                                                                                      |

## 4. Guard Mount Universality

| Check | Criteria                                                                                              | Remediation                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The guard is always mounted (not conditional on a token being configured)                             | Verify `createBearerTokenGuardPlugin(...)` is unconditionally `.use()`d in `createWebServer` (`backend/src/server.ts`)                                    |
| `[ ]` | The guard runs as a global `onBeforeHandle` so it fires for every `/api/*` route                      | Verify `{ as: 'global' }` on `onBeforeHandle` and the `url.pathname.startsWith('/api/')` gate in `createBearerTokenGuardPlugin`                           |
| `[ ]` | No application route is registered **before** the guard in the plugin chain                           | Verify every `create*Routes()` `.use()` in `createWebServer` comes after the guard `.use()`, including `createTerminalRoutes` and `createWebSocketRoutes` |
| `[ ]` | Non-`/api/` paths (static assets, SPA fallback) are intentionally exempt and serve no privileged data | Verify the early `return` for non-`/api/` paths is correct and static serving leaks nothing privileged                                                    |

## 5. WebSocket Upgrade Parity

There is more than one WebSocket route. `WS_UPGRADE_PATHS` is a `Set`; at the time of writing it holds `/api/v1/ws` (the broadcast hub, `backend/src/routes/ws.ts`) and `/api/v1/terminal/ws` (an interactive PTY session, `backend/src/routes/terminal.ts`). Read the live set and the live `.ws(` routes; do not assume these two. Run every row below once per route.

| Check | Criteria                                                                                                                                                                                                                                     | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The set of query-token paths and the set of WebSocket routes are the same set                                                                                                                                                                | List every `.ws(` route under `backend/src/` with its full path, and every entry in `WS_UPGRADE_PATHS`. An entry with no matching WS route is a finding (an HTTP path that would accept a query-string token). A WS route missing from the set must still enforce its own gate in `open()`; record it                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `[ ]` | **Every** WS `open()` handler runs the **same** `isPeerAuthorized` predicate as the HTTP guard                                                                                                                                               | Verify `isWebSocketUpgradeAuthorized` (`ws.ts`) delegates to `isPeerAuthorized`, and that the `open()` handler in `createWebSocketRoutes` (`ws.ts`) AND the `open()` handler in `createTerminalRoutes` (`terminal.ts`) each call it and `ws.close(1008, ...)` then `return` on failure, before any other work. For the terminal that means before `manager.attach`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `[ ]` | A forwarded WS upgrade obeys the same fail-closed rule (loopback exemption voided) on every route                                                                                                                                            | Verify `isForwardedRequest(upgrade.headers)` is passed through in `isWebSocketUpgradeAuthorized`, and that each handler passes the real upgrade headers (`ws.data.headers`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `[ ]` | The `?token=` query token is accepted ONLY on WS upgrade paths, never on other `/api/*` routes                                                                                                                                               | Verify `WS_UPGRADE_PATHS.has(url.pathname)` gates query-token reading in `createBearerTokenGuardPlugin`. Confirm the terminal's REST routes (`/api/v1/terminal/shells`, `/api/v1/terminal/sessions`) are NOT in the set and so take a header token only                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `[ ]` | Each entry in `WS_UPGRADE_PATHS` is individually justified. A query string is the weakest place to carry a credential: it is written to reverse-proxy access logs and can be retained by the browser, where an `Authorization` header is not | For each entry record (a) what the socket grants and (b) why a query token is acceptable for it. `/api/v1/ws` carries broadcast events and acknowledges messages. `/api/v1/terminal/ws` writes client frames to a shell (`manager.write` in `terminal.ts`), so a leaked token is command execution as the operator. Browsers cannot set headers on a WebSocket handshake, so a query token may be the only option; that explains the design, it does not close the question. Do not inherit the disposition made for the data socket. For the terminal path, record a deliberate decision that covers: whether the deployment's proxy logs query strings, whether aidd's own request log does (verify `backend/src/plugins/requestId.ts` logs `url.pathname` only, never `url.search`), and whether the token is long-lived. An unexamined terminal entry is an incomplete audit                                                                                                                                                                                                                  |
| `[ ]` | The WS handlers do not silently trust the global guard to have run (enforce independently)                                                                                                                                                   | Verify the explicit gate and its comment in both `open()` handlers (`ws.ts`, `terminal.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `[ ]` | The WS origin allowlist is enforced **independently of** the token gate on every route (a valid token does not exempt a disallowed origin)                                                                                                   | Verify `allowedOrigins = buildAllowedOrigins(web)` in both `createWebSocketRoutes` and `createTerminalRoutes`, and that each `open()` closes with `1008 'origin not allowed'` for an origin absent from the set, as a separate gate after the token check. Note the gate is `origin && !allowedOrigins.has(origin)`: an upgrade with **no** `Origin` header passes it. Assess that for each route. For any direct loopback upgrade the token gate grants without a token, whether or not one is configured: a tokenless local panel grants every direct caller, and a token-configured panel takes the `peerAddress && isLoopbackAddress(peerAddress)` shortcut. A web page in the operator's browser always connects that way, so the origin gate is the only thing between that page and the socket, and configuring a token does not add a second control against it. Browsers always send `Origin` on a WebSocket handshake, so the gap is non-browser callers on the same machine. Scope: WS only; the HTTP request's `Host` and `Origin` gates are BREAK-THE-ASSUMPTION scenarios 10 and 11 |

## 6. Token Comparison Safety

| Check | Criteria                                                                                     | Remediation                                                                  |
| ----- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `[ ]` | Token comparison uses constant-time equality, not `===`                                      | Verify `tokensMatch` uses `timingSafeEqual`                                  |
| `[ ]` | Length mismatch is handled before `timingSafeEqual` (which throws on unequal-length buffers) | Verify the early length-check return in `tokensMatch`                        |
| `[ ]` | A missing/empty provided token is rejected, not coerced to a match                           | Verify `if (!provided) return false` as the first statement of `tokensMatch` |

---

## BREAK-THE-ASSUMPTION (mandatory)

Per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Rules 1-3, you MUST construct and trace the request that defeats "loopback-only, by design." Scoring from any comment in `server.ts` (the block above the plugin chain in `createWebServer` describes the listener as single-operator and loopback by default; an earlier revision read "Loopback-only listener") or from the config default (`web.authToken` unset) is **explicitly forbidden**; that is the exact reasoning that produced the `25d60d0f` false-clean. Each scenario below must end in **passed** (control held) or **blocked** (slipped through, finding) with the deciding `file:line`.

1. **Caddy-forwarded, no token (the core bypass).** Build a request with a **loopback transport peer** (as Caddy → `127.0.0.1` produces), header `X-Forwarded-For: <attacker-ip>`, and **no** `Authorization`. Trace it through `isForwardedRequest` → `isPeerAuthorized`. It MUST return 401, decided in the `if (requestIsForwarded)` branch (forwarded + no token configured → `false`). If it reaches the tokenless grant (`if (!web.allowRemote) return true`) or the `isLoopbackAddress` shortcut, that is a CRITICAL finding.

2. **Casing variants.** Repeat with `X-Forwarded-For`, `X-FORWARDED-FOR`, and `x-forwarded-for`. All MUST be detected as forwarded (Fetch `Headers.get` is case-insensitive; see `readHeader`). Any casing that evades detection and re-enables the loopback exemption is a finding.

3. **Empty `X-Forwarded-For:`.** Send the header with an empty value. Determine whether `isForwardedRequest` counts it as forwarded (its `value !== ''` test treats `''` as not-present). Decide and record whether an empty forwarding header should fail closed; if a real proxy can emit an empty value while still forwarding off-box traffic, the current `value !== ''` check is a finding.

4. **Alternate `Forwarded:` header.** Repeat scenario 1 using only the RFC-7239 `Forwarded: for=<attacker>` header (no `X-Forwarded-*`). It MUST be detected (`forwarded` is in `FORWARDING_HEADER_NAMES`) and fail closed.

5. **WS upgrade parity, broadcast socket.** Repeat scenario 1 as a WebSocket upgrade to `/api/v1/ws` with `?token=` absent and a forwarding header present. The upgrade MUST be refused: 401 from the HTTP guard if it fires for the upgrade, otherwise `open()` in `createWebSocketRoutes` (`ws.ts`) closing with code 1008 `unauthorized`. A forwarded upgrade that connects is a CRITICAL finding.

6. **WS upgrade parity, terminal socket.** Repeat scenario 5 against `/api/v1/terminal/ws?session=<id>`. The upgrade MUST be refused: 401 from the HTTP guard, otherwise `open()` in `createTerminalRoutes` (`terminal.ts`) closing with code 1008 `not allowed` **before** `manager.attach` runs. A forwarded, tokenless upgrade that attaches to a PTY is remote command execution: CRITICAL. Trace this route on its own; a pass on scenario 5 says nothing about a second handler.

7. **WS origin enforcement (token does not exempt origin), both sockets.** Open an upgrade to `/api/v1/ws` carrying a **valid** `?token=` (passes the token gate) but an `Origin` header **not** in `buildAllowedOrigins(web)`. After `isWebSocketUpgradeAuthorized` returns true, the upgrade MUST still be refused: 403 from the origin guard (`createOriginGuardPlugin`, `backend/src/plugins/originGuard.ts`, mounted for every panel) if it fires for the upgrade, otherwise the origin check in `open()` closing with code 1008 `origin not allowed`. Repeat against `/api/v1/terminal/ws`. Then repeat the terminal case with a direct loopback peer, a hostile `Origin`, and no token presented, on both the default tokenless local panel (no `web.authToken`) and a token-configured panel: the token gate grants by design in both, so the origin gate is the whole control, and a socket that attaches is a CRITICAL finding (a web page in the operator's browser reaching a shell). (Scope: WS only; the HTTP request's `Host` and `Origin` gates are scenarios 10 and 11.)

8. **Tokenless panel, remote bind (the control that replaced "null peer fails closed").** Take a config with `web.allowRemote: true` and no `web.authToken`. (a) Trace `startWebServer` (`start.ts`): `assertWebAuthTokenPresent` (`startHelpers.ts`) MUST throw before the database opens or anything listens → expected **passed**. (b) Assume the assertion were bypassed and trace a direct request from a non-loopback peer, then one with a null peer, through the `if (!web.authToken)` branch of `isPeerAuthorized`: both MUST return `false`. (c) Take the default config (`allowRemote` false, no token) and a null peer: the guard returns `true` by design. Record that as the by-design disposition it is, with the two facts that make it safe: the forwarded branch already ran, and the resolver refuses a non-loopback `web.hostname` without `allowRemote`. If (a) does not throw, a tokenless control plane can bind to the network: CRITICAL.

9. **Query token off the WS paths.** Send `GET /api/v1/terminal/sessions?token=<valid>` and `POST /api/v1/terminal/sessions?token=<valid>` with a forwarding header and no `Authorization`. Both MUST return 401: the path is not in `WS_UPGRADE_PATHS`, so the query token is never read. A 200 means a query-string credential can create or list terminal sessions over plain HTTP: finding.

10. **DNS rebinding against the default panel.** Take the default config (`allowRemote` false, no token). A page at `attacker.example` re-points its own name at `127.0.0.1`; its requests then arrive from a **loopback peer, with no forwarding headers and no foreign `Origin`** (the browser treats them as same-origin). Send `GET /api/v1/health` and `POST /api/v1/runs/directive` with `Host: attacker.example:<port>` and nothing else. Both MUST return 401, decided by the bearer guard's trusted-host test (`buildTrustedRequestHost`, `backend/src/originPolicy.ts`) before `isPeerAuthorized`'s loopback grant. Repeat on a token-configured panel: the foreign `Host` MUST still need the token. Every check that keys on the peer, forwarding headers or `Origin` passes this request, so if no `Host` check exists the page can launch agent runs, rewrite settings and shut the panel down: CRITICAL.

11. **Cross-origin simple request.** On the default panel, send a body-less `POST /api/v1/admin/shutdown` from a direct loopback peer with `Host: 127.0.0.1:<port>` and `Origin: http://attacker.example`. This is what a form or `fetch(..., {mode: 'no-cors'})` on any site in the operator's browser produces: a CORS-simple request, sent without a preflight. It MUST return 403 from the origin guard (`createOriginGuardPlugin`), which must be mounted for every panel, not only when `allowRemote` is set. A guard that passes requests without an `Origin` is acceptable only because browsers always send `Origin` on a cross-origin POST; record that reasoning. A shutdown, or any other state change, that runs is CRITICAL.

Any scenario that slips past is a finding; record it with severity per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md). A report that does not record an outcome for every scenario above, and for every WebSocket route found in §5, is incomplete and invalid (AUDIT_METHODOLOGY Scoring validity).

---

## False Positives Considered and Rejected

This section is REQUIRED: if you found zero false-positive candidates, state that explicitly. Record candidates you traced and rejected, with the by-design rationale, so a later reviewer does not re-flag them.

| Candidate                                                                                                                      | Disposition                                                                                                                                                                                                                                                                                                                                                                                           |
| ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Empty forwarding header (`X-Forwarded-For:` with no value) treated as **not forwarded** (`isForwardedRequest`, `value !== ''`) | **Record and assess, not an auto-finding.** Counting only non-empty forwarding headers is a deliberate design choice (an empty header is indistinguishable from no header). Falsify scenario 3 against a real proxy: if a proxy in the deployment can emit an empty forwarding header while still relaying off-box traffic, the `value !== ''` check becomes a finding; absent that, it is by design. |

---

## Audit Checklist

- [ ] A forwarded HTTP request with no valid token fails closed before the loopback exemption.
- [ ] Every supported forwarding-header family and casing variant reaches the forwarded branch.
- [ ] The trust decision uses the transport peer, never a forwarded header value.
- [ ] The tokenless grant is recorded as by design, and `assertWebAuthTokenPresent` is confirmed to run before anything listens.
- [ ] The global guard covers every `/api/*` route and is mounted before route registration.
- [ ] Every WebSocket route (broadcast and terminal) repeats the authorization predicate and enforces origin independently.
- [ ] Every `WS_UPGRADE_PATHS` entry maps to a WebSocket route and has its own recorded justification for accepting a query-string token.
- [ ] Token comparison is timing-safe and rejects missing or unequal-length values.
- [ ] All nine mandatory falsification outcomes include their deciding `file:line`.
- [ ] False-positive candidates and their dispositions are recorded explicitly.

## Report Template

```markdown
# Reverse-Proxy / Loopback Trust Boundary Audit Report - YYYY-MM-DD

## Executive Summary

- Application and deployment shape: [name / direct loopback / reverse proxy]
- Overall result: [Pass / Findings / N/A]
- Critical or high findings: [count]

## Falsification Outcomes

| Scenario | Request shape                | Outcome          | Deciding evidence |
| -------- | ---------------------------- | ---------------- | ----------------- |
| [name]   | [peer, headers, token, path] | [passed/blocked] | [file:line]       |

## Findings

| Severity | Boundary failure | Evidence    | Remediation       |
| -------- | ---------------- | ----------- | ----------------- |
| [level]  | [description]    | [file:line] | [specific change] |

## False Positives Considered and Rejected

- [candidate and disposition, or None]
```

## Deliverables

- The completed report with a concrete falsification outcome for every mandatory scenario.
- `file:line` evidence for every finding and every by-design disposition.
- A valid `feature.json` record for each confirmed code change, using the rules below.

## Audit Output Rules

When this audit discovers an issue requiring code changes, create a `feature.json` file under `.aidd/features/` following the schema and severity mapping in [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md):

- Directory and `id`: `audit-proxy-auth-boundary-{unix_timestamp}-{descriptive-slug}` (the `id` MUST match the directory name exactly).
- `auditSource`: `"PROXY_AUTH_BOUNDARY"`, `category`: `"Audit"`, `passes`: `false`, `status`: `"backlog"`.
- `priority` / `auditSeverity` per the Critical=1 / High=2 / Medium=3 / Low=4 mapping.
- `description` MUST carry the falsification evidence: the deciding `file:line` as read from the live file (e.g. the forwarded branch of `isPeerAuthorized`, `bearerTokenGuard.ts`) and the concrete request that was traced.
- `spec` MUST contain actionable remediation steps.

A reverse-proxy auth bypass (a forwarded request reaching privileged routes without a valid token) is **Critical**. A remote-bound panel that can start with no token, or an unauthenticated or cross-origin attach to the terminal socket, is **Critical**. Incomplete forwarded-header coverage or a header-derived loopback decision is **Critical** or **High** depending on exploitability. A missing falsification record for the "loopback-only" rationale is itself a finding (incomplete audit) per AUDIT_METHODOLOGY.

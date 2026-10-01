---
title: 'Outbound SSRF - Provider & Webhook Egress Audit'
last_updated: '2026-10-01'
version: '1.2'
category: 'Security'
priority: 'Critical'
estimated_time: '1-2 hours'
frequency: 'Per-release'
lifecycle: 'pre-release'
---

# Outbound SSRF: Provider & Webhook Egress Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing guard, falsify every "by design" rationale, never score from a green gate.

Audits aidd's outbound HTTP requests: the LLM provider `baseUrl` that the agent client `fetch()`es, and the webhook / bridge targets the channel processes call. The trust assumption "config is single-user-local, so the URLs in it are safe" is exactly the kind of by-design rationale that must be falsified (AUDIT_METHODOLOGY Rule 2), because a misconfigured or attacker-influenced `baseUrl` turns aidd into an SSRF pivot.

## Table of Contents

- [Executive Summary](#executive-summary)
- [Spernakit Applicability](#spernakit-applicability)
- [Applicability & Scope](#applicability--scope)
- [Pre-Audit Setup](#pre-audit-setup)
- [1. Call-Time `baseUrl` Validation](#1-call-time-baseurl-validation)
- [2. Webhook & Bridge Egress](#2-webhook--bridge-egress)
- [3. Redirect Handling](#3-redirect-handling)
- [4. Outbound Timeouts & Resource Bounds](#4-outbound-timeouts--resource-bounds)
- [5. Outbound Error-Body Disclosure](#5-outbound-error-body-disclosure)
- [BREAK-THE-ASSUMPTION (mandatory)](#break-the-assumption-mandatory)
- [N/A Exit Criteria](#na-exit-criteria)
- [Deliverables / Report Template](#deliverables--report-template)

## Executive Summary

A single shared guard must run immediately before outbound `fetch()` on every egress path. This audit verifies that the guard remains wired at every import and call site. Priority is **Critical** because a dropped import, reordered call, or uncovered egress path enables a metadata-pivot SSRF.

**Citations in this audit name a symbol and its file, not a line.** Line numbers drift with every edit; a symbol either resolves or it does not. Locate each symbol in the live file, then cite the `file:line` you actually read in the report (AUDIT_METHODOLOGY Rule 1). A named symbol that no longer exists in the named file must be resolved before scoring: decide whether the control moved or was removed, and record which.

**Critical Priorities (verify, do not assume)**

- **Call-time validation is wired**: confirm the shared guard `assertSafeAgentBaseUrl` (`shared/src/security/ssrfGuard.ts`) is actually called at call time: in `OpenAICompatibleAgentClient.complete` (`shared/src/agent/client/openai.ts`), as the statement immediately before the provider `fetch()`, and at resolution in `resolveDirectAiCall` (`shared/src/agent/directAi.ts`). A `baseUrl` written directly into `config.json` bypasses the settings-write validator, so the call-time guard is the load-bearing control.
- **The metadata pivot is blocked**: confirm `BLOCKED_METADATA_HOSTS` (`ssrfGuard.ts`) still carries every credential endpoint listed in §1 (the IMDS addresses and the ECS / EKS container-credential addresses) and that `normalizeHostForBlocklist` is applied so evasions (IPv4-mapped IPv6, bare-integer / hex IPs, bracketed hosts) resolve to the canonical form.
- **Cover every egress**: provider calls, the Telegram bridge, the internal API client, and the CLI app-URL probe all reach the network. Confirm each applies the same outbound policy (guard, redirect policy, timeout), and that any egress path added since the last audit is covered.

**Essential Standards (verify)**

- Redirects are not followed to private/metadata targets on **any** egress path (see §3), not only the provider `fetch()`.
- Every outbound `fetch()` carries a timeout even when its caller supplies no signal (see §4). A path that falls back to no signal is a regression.
- Outbound error bodies are size-bounded before they are read into memory (`readBoundedProviderBody`) and `scrubSecrets()`-wrapped before they reach logs or UI (see §5).

## Spernakit Applicability

This audit applies **fleet-wide** to any spernakit/aidd-derived backend that issues outbound provider or webhook requests. It is the outbound counterpart to PROXY_AUTH_BOUNDARY's inbound boundary. Any derived app that exposes a configurable provider `baseUrl`, a configurable webhook target, or a chat bridge inherits the same SSRF surface and must run this framework. An app with no such egress may record N/A only under the evidence-bearing exit in [N/A Exit Criteria](#na-exit-criteria).

## Applicability & Scope

The provider `baseUrl` and webhook targets come from `~/.aidd/config.json` and per-project config; aidd `fetch()`es them directly with no proxy in between. Even on a single-user-local install, a tricked or misconfigured `baseUrl` turns aidd into an SSRF pivot against:

- **Loopback**: `127.0.0.1:<aidd-port>` reaches aidd's own control plane (and, behind the proxy boundary, anything else on the box).
- **Link-local cloud metadata**: `169.254.169.254`, `100.100.100.200`, etc. (credential theft).
- **Private LAN**: `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`, `.internal` hosts.

**Control to verify (do not assume; confirm the wiring):** `assertSafeAgentBaseUrl` in `shared/src/security/ssrfGuard.ts` is the shared guard; it throws whatever `agentBaseUrlValidationError` (same file) returns, and that function holds the protocol check, the normalization, and the blocklist test. Settings-write callers reach it through `backend/src/services/settings/validation.ts`, which imports it from the **package name** `'aidd-shared'` (not a relative path) and re-exports it; `assertDirectAiResolvable` (`validation.ts`) and `backend/src/services/settings/configUpdate.ts` call it on writes. On the **call path** it is called in `OpenAICompatibleAgentClient.complete` (`shared/src/agent/client/openai.ts`, before `fetch()`) and in `resolveDirectAiCall` (`shared/src/agent/directAi.ts`, at resolution). Confirm those imports and call sites are present so a `baseUrl` written directly to `config.json` cannot reach `fetch()` unvalidated; see §1.

**Documented accepted residual (verify it is still the design, not a gap):** the guard blocks cloud-**metadata** hosts only (`BLOCKED_METADATA_HOSTS`, `ssrfGuard.ts`). Private / loopback / `fe80::` link-local ranges and DNS-rebinding (a name that later resolves to a blocked IP) are **deliberately permitted** to support self-hosted Ollama / vLLM inference servers (the module header's design note, the doc comment on `BLOCKED_METADATA_HOSTS`, and the doc comment on `normalizeHostForBlocklist`, all in `ssrfGuard.ts`). This is an intentional residual, not an open finding; confirm the design note still states it and that no requirement has since demanded a stricter list.

**Runtime note:** `redirect: 'error'` and `AbortSignal.timeout(...)` are Bun-native `fetch` features (WHATWG fetch, not Node's `http` module), so these controls hold under the Bun worker runtime that the web backend uses.

## Pre-Audit Setup

```bash
# Every import and call of the shared guard. The backend and CLI import it from the
# package name 'aidd-shared'; shared/ imports the relative ssrfGuard.ts path. Both
# spellings are the same implementation - a hit under either is not a duplicate.
grep -rn "assertSafeAgentBaseUrl\|agentBaseUrlValidationError" shared/src/ backend/src/ cli/src/ --include="*.ts"

# Find the outbound provider fetch and confirm the guard precedes it
grep -rn "fetch\|baseUrl\|chat/completions" shared/src/agent/ --include="*.ts"

# Confirm the shared guard internals (blocklist + normalization) still live in one place
grep -rn "BLOCKED_METADATA_HOSTS\|normalizeHostForBlocklist" shared/src/ backend/src/ cli/src/ --include="*.ts"

# Enumerate outbound fetches, including injected fetchers (fetchImpl) and aliased or
# fallback references such as `(options.fetchImpl ?? fetch)(url)`, which the call-shaped
# pattern alone does not match. Any hit not listed in §1-§2 is a new egress path and
# must be audited before scoring.
grep -rn "fetch[A-Za-z]*(\|?? fetch\b\|= fetch\b\|api.telegram.org\|webhook" shared/src/ backend/src/ cli/src/ --include="*.ts"

# Check redirect handling and outbound timeouts (flag any fetch with no redirect policy or no signal)
grep -rn "redirect:\|AbortSignal\|AbortController\|signal" shared/src/agent/ backend/src/bridge/ backend/src/channels/ cli/src/orchestrator/run/app-url-probe.ts --include="*.ts"
```

---

## 1. Call-Time `baseUrl` Validation

| Check | Criteria                                                                                                                               | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | The provider `baseUrl` is validated against the SSRF guard **at call time**, immediately before `fetch()`                              | Confirm `assertSafeAgentBaseUrl(this.config.baseUrl, ...)` is the statement directly before the `this.fetchImpl(...)` call in `OpenAICompatibleAgentClient.complete` (`openai.ts`). A regression (removed call / reordered after `fetch`) reopens the Critical; flag as a finding                                                                                                                                                                                                                                                                                                                                                                                                    |
| `[ ]` | The resolution that produces `baseUrl` also validates it                                                                               | Confirm `resolveDirectAiCall` (`directAi.ts`) assembles `baseUrl` from `directAi.baseUrl`, the provider config, and the provider defaults, and then calls `assertSafeAgentBaseUrl` on the result before returning. A missing call here is a finding                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `[ ]` | The shared guard is imported on the call path (not relying on the settings-write path alone: config.json edits bypass settings writes) | Confirm the imports: `openai.ts` imports from `../../security/ssrfGuard.ts` and `directAi.ts` from `../security/ssrfGuard.ts`; the settings path imports it from `'aidd-shared'` and re-exports it (`validation.ts`). A dropped import silently disables the control                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `[ ]` | There is exactly ONE blocklist implementation, shared by the write path and the call path                                              | Confirm `BLOCKED_METADATA_HOSTS` and `normalizeHostForBlocklist` are defined only in `shared/src/security/ssrfGuard.ts`. Backend and CLI callers import the guard from the package name `'aidd-shared'` (re-exported through `shared/src/security/index.ts`), so a grep for the relative path will not find them; that is the same implementation, not a copy. A second definition of the blocklist or the normalizer anywhere is a finding (drift risk)                                                                                                                                                                                                                             |
| `[ ]` | The denylist blocks the cloud-metadata and container-credential endpoints                                                              | Confirm `BLOCKED_METADATA_HOSTS` (`ssrfGuard.ts`) contains all nine: `169.254.169.254` (AWS / Azure / GCP IMDS), `fd00:ec2::254` (AWS IMDSv6), `169.254.170.2` (AWS ECS container credentials), `169.254.170.23` and `fd00:ec2::23` (AWS EKS Pod Identity), `100.100.100.200` (Alibaba), `metadata.google.internal`, `metadata.goog`, and the bare search-domain shorthand `metadata`. Also confirm the `.metadata.google.internal` suffix test in `agentBaseUrlValidationError`. A removed entry is a finding; the ECS / EKS entries are credential endpoints, so losing them is as serious as losing IMDS. An entry added since this list was written is not a finding - record it |
| `[ ]` | Only `http:` / `https:` URLs pass                                                                                                      | Confirm the protocol check in `agentBaseUrlValidationError` rejects every other scheme before the host is examined                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `[ ]` | Blocklist normalization resists evasion (IPv4-mapped IPv6, bare-integer / hex IPs, bracketed hosts, trailing dot)                      | Confirm `normalizeHostForBlocklist` (`ssrfGuard.ts`) is applied to `url.hostname` inside `agentBaseUrlValidationError`, before the `BLOCKED_METADATA_HOSTS.has(...)` test, and that `assertSafeAgentBaseUrl` throws on any non-null result                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `[ ]` | The DOCUMENTED accepted residual is verified, not silently widened                                                                     | Confirm the module header and the `BLOCKED_METADATA_HOSTS` doc comment in `ssrfGuard.ts` still state that private/loopback ranges are intentionally not blocked, for self-hosted Ollama/vLLM, and that the `normalizeHostForBlocklist` doc comment still states that DNS names resolving to a blocked IP are intentionally not handled. Link-local is permitted by omission from the blocklist, not by a stated note; do not report its absence from the comments. This is an accepted residual, NOT a finding; record it as a verified by-design decision per AUDIT_METHODOLOGY                                                                                                     |

## 2. Webhook & Bridge Egress

| Check | Criteria                                                                                                                          | Verification                                                                                                                                                                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | Telegram bridge outbound target is a fixed, trusted host (not user-controllable into a private target)                            | Confirm `createTelegramClient` (`backend/src/bridge/telegram.ts`) builds `https://api.telegram.org/bot${botToken}` from `botToken` only, and that the token is interpolated after the `/bot` path prefix, so it cannot alter the authority (the host is fixed whatever the token contains)                                                 |
| `[ ]` | The Telegram bridge runs the shared guard on the URL it is about to request                                                       | Confirm the inner `call` function in `createTelegramClient` runs `assertSafeAgentBaseUrl(requestUrl, ...)` on the assembled request URL before `fetchImpl`. The guard is defense in depth here: it rejects only the metadata hosts, so it does not replace the fixed-host check in the row above. A removed or reordered call is a finding |
| `[ ]` | Any configurable webhook target applies the same metadata denylist as provider `baseUrl`                                          | Confirm each configurable webhook URL passes through `assertSafeAgentBaseUrl` or an equivalent before `fetch()` (none present today; flag any newly added one)                                                                                                                                                                             |
| `[ ]` | The internal API client (`apiClient.ts`) targeting `127.0.0.1` is intentionally loopback and not exposed to user-controlled hosts | Confirm `createApiClient` (`backend/src/channels/apiClient.ts`) hardcodes `http://127.0.0.1:${web.port}`: the loopback target is by design. Confirm its inner `request` function and `isBackendReachable` both run `assertSafeAgentBaseUrl` on the assembled URL before `fetchImpl`, and that `path`/`body` cannot redirect the host       |
| `[ ]` | The CLI app-URL probe validates the address it is handed                                                                          | Confirm `probeAppUrl` (`cli/src/orchestrator/run/app-url-probe.ts`) runs `assertSafeAgentBaseUrl(appUrl, ...)` before `fetchImpl`. The address comes from launch context, not a constant, so the guard is the control                                                                                                                      |
| `[ ]` | Bridge poll/send calls cannot be redirected at a private target by a malicious Telegram-API response                              | Confirm `getUpdates` and `sendMessage` only go through `call` against the fixed base and never request a response-supplied URL (`telegram.ts`)                                                                                                                                                                                             |

## 3. Redirect Handling

| Check | Criteria                                                                                         | Verification                                                                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Outbound provider `fetch()` does not transparently follow redirects to a private/metadata target | Confirm `redirect: 'error'` is set in the `fetch()` init inside `OpenAICompatibleAgentClient.complete` (`openai.ts`) so a 30x to `169.254.169.254` is rejected, not followed. A regression here is a finding                                                                                    |
| `[ ]` | The Telegram bridge and the internal API client carry the same redirect policy                   | Confirm `redirect: 'error'` in the init built by `call` (`telegram.ts`), in the init built by `request` (`apiClient.ts`), and in the `isBackendReachable` probe (`apiClient.ts`). The guard validates only the first URL; without this option a 30x from any of these moves the request past it |
| `[ ]` | The CLI app-URL probe does not follow redirects                                                  | Confirm `redirect: 'manual'` in `probeAppUrl` (`app-url-probe.ts`). `'manual'` returns the 30x without following it, which is sufficient here because the probe only asks whether something answered and cancels the body; a change to the default (follow) is a finding                        |
| `[ ]` | The redirect policy is a Bun-native fetch feature and holds under the worker runtime             | Confirm `redirect: 'error'` is WHATWG-fetch (Bun-native), so it applies in the Bun worker; a port to Node `http` would need a manual re-check                                                                                                                                                   |

## 4. Outbound Timeouts & Resource Bounds

| Check | Criteria                                                                             | Verification                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Provider `fetch()` carries an abort/timeout signal                                   | Confirm the `AbortController` + `setTimeout` wrapper in `completeDirectAiText` (`directAi.ts`) passes `controller.signal` to `client.complete`, and that `complete` passes that `signal` into the `fetch()` init (`openai.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `[ ]` | The internal API client health probe is bounded                                      | Confirm `AbortSignal.timeout(options.healthTimeoutMs ?? BACKEND_HEALTH_TIMEOUT_MS)` on `isBackendReachable` (`apiClient.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `[ ]` | Telegram requests default to a timeout when the caller supplies no signal            | Confirm the init built by `call` sets `signal: signal ?? AbortSignal.timeout(requestTimeoutMs)` (`telegram.ts`). `call`'s `signal` parameter is still optional in its signature, so the signature alone looks unbounded: the default is applied at the call, and that expression is what to verify. Confirm `getUpdates` bounds the long poll with its own `AbortSignal.timeout` (server timeout plus `longPollGraceMs`) and `sendMessage` builds a per-attempt `AbortSignal.timeout(requestTimeoutMs)`, each combined with the caller's signal through `AbortSignal.any`. A path that reaches `fetchImpl` with no signal is a regression finding |
| `[ ]` | Internal API client requests default to a timeout when the caller supplies no signal | Confirm `request` in `createApiClient` (`apiClient.ts`) always builds `AbortSignal.timeout(requestOptions.timeoutMs ?? requestTimeoutMs)` and combines it with any caller signal through `AbortSignal.any`, so a caller-supplied signal can shorten the bound but never remove it. A path that reaches `fetchImpl` with no signal is a regression finding                                                                                                                                                                                                                                                                                         |
| `[ ]` | Caller-supplied timeout overrides stay finite                                        | Enumerate callers passing `timeoutMs` to the API client. The Director chat post in `createBridgeHandler` (`telegram.ts`) and the MCP Director chat tool (`backend/src/mcp/tools.ts`) both pass `DIRECTOR_CHAT_TIMEOUT_MS` (30 minutes, defined in `apiClient.ts`) by design for multi-call model turns; record each as a verified by-design bound. A caller passing `Infinity`, `0`, or a long value with no stated reason is a finding                                                                                                                                                                                                           |
| `[ ]` | The CLI app-URL probe is bounded                                                     | Confirm `AbortSignal.timeout(PROBE_TIMEOUT_MS)` and the `response.body?.cancel()` in `probeAppUrl` (`app-url-probe.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

## 5. Outbound Error-Body Disclosure

| Check | Criteria                                                                                                                                                  | Verification                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A provider response body is size-bounded before it is held in memory (a hostile or misbehaving provider cannot stream an unbounded body into the process) | Confirm the error path and the non-streaming success path in `complete` (`openai.ts`) both read through `readBoundedProviderBody(response)` (`shared/src/agent/client/boundedBody.ts`), never `response.text()` / `response.json()`. Confirm the helper throws once the byte count passes its ceiling and cancels the reader. A direct unbounded read is a finding                                            |
| `[ ]` | Outbound error response bodies are not echoed verbatim into logs/UI (an internal service's response can leak through an SSRF probe)                       | Confirm the provider error body is passed through `scrubSecrets(...)` and then truncated to `MAX_ERROR_BODY_CHARS` before interpolation into the thrown `Error` (`openai.ts`). Verify the scrub covers the relevant secret patterns and is not bypassed                                                                                                                                                       |
| `[ ]` | Bridge error details surfaced to chat are bounded and do not leak internal probe results                                                                  | Confirm `parseErrorDetail` (`apiClient.ts`) bounds a non-JSON error body with `text.slice(0, 200)`, and that `sendMessage` clips every outgoing message, including the error reply built in `createBridgeHandler`, to `TELEGRAM_MESSAGE_LIMIT` (`telegram.ts`)                                                                                                                                                |
| `[ ]` | The Telegram request URL, which embeds the bot token, does not reach logs or chat through a transport error                                               | Confirm the `catch` in `call` rethrows through `redactTelegramUrlError` (`backend/src/bridge/telegramRetry.ts`) for every failure raised inside its `try` that is not a `TelegramApiError`. The `assertSafeAgentBaseUrl` call sits outside that `try`, so a guard error is not redacted: confirm the guard's messages cannot carry the token for this URL (its metadata-host message names the hostname only) |

---

## BREAK-THE-ASSUMPTION (mandatory)

Per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Rules 1-3, you MUST falsify the "single-user trusted config, so `baseUrl` is safe" rationale by tracing a hostile `baseUrl` to the actual `fetch()` and confirming the guard **blocks** it. The presence of the guard is not evidence on its own; you must re-trace the path and confirm the guard is still on it. Each scenario must end in **passed** (request blocked before egress, with the deciding `file:line`) or **blocked** (request issued: a regression finding).

1. **Metadata pivot via config.json.** Set `providers.<x>.baseUrl` to `http://169.254.169.254/latest/meta-data/` **directly in `config.json`** (bypassing the settings-write validator). Trace `resolveDirectAiCall` (`directAi.ts`: assembles `baseUrl`, then calls `assertSafeAgentBaseUrl`) and `OpenAICompatibleAgentClient.complete` (`openai.ts`: calls the guard, then `fetch()`). Confirm `agentBaseUrlValidationError` returns the metadata-endpoint error and `assertSafeAgentBaseUrl` throws it (`ssrfGuard.ts`) before egress → expected **passed**. If the request is issued, the call-time guard regressed: Critical finding.

2. **Container-credential pivot.** Repeat scenario 1 with `http://169.254.170.2/v2/credentials/` (AWS ECS) and with `http://169.254.170.23/` (EKS Pod Identity). Both are in `BLOCKED_METADATA_HOSTS` → expected **passed**. A request that is issued means an entry was dropped from the list: Critical finding, same class as scenario 1.

3. **Loopback control-plane pivot.** Set `providers.<x>.baseUrl` to `http://127.0.0.1:<aidd-port>/api/v1/` directly in `config.json` and trace the same path. This is the **documented accepted residual**: the guard intentionally permits loopback (design note on `BLOCKED_METADATA_HOSTS`, `ssrfGuard.ts`), so the request IS issued by design. Record it as a verified accepted residual (Ollama/vLLM support), and confirm PROXY_AUTH_BOUNDARY's inbound bearer guard is the compensating control for the control-plane reach; do NOT score it as an open SSRF finding unless that compensating control is also absent.

4. **Partially attacker-influenced config (the "trusted config" falsification).** Document a concrete scenario where `config.json` is not fully operator-controlled: (a) a **synced/shared** `~/.aidd/config.json` (dotfiles repo, team template); (b) a **project-level** `baseUrl` override committed to a cloned repo; (c) a **prompt-injected settings write** where the agent is steered into writing a provider `baseUrl`. For each, trace the metadata case to the guard and confirm it is blocked by the blocklist test in `agentBaseUrlValidationError` (`ssrfGuard.ts`). This is the falsification record that retires "config is single-user, therefore safe"; note that the residual (loopback/private) remains reachable by design, so the compensating inbound control is the relevant defense there.

5. **Redirect pivot.** Point `baseUrl` at an attacker host that 302-redirects `/chat/completions` to `http://169.254.169.254/…`. Trace the `fetch()` init in `complete` (`openai.ts`): `redirect: 'error'` makes `fetch()` reject the redirect rather than follow it → expected **passed**. Confirm the option is still set; a regression to the platform default (follow) reopens the redirect SSRF. Repeat the read for the Telegram `call` init and the API client `request` init (§3).

6. **Caller supplies no signal.** Trace `sendMessage` → `call` (`telegram.ts`) and `get` → `request` (`apiClient.ts`) with no caller signal, against an endpoint that accepts the connection and never answers. Each MUST abort on its default timeout → expected **passed**. Both paths were unbounded in an earlier revision of this code and have since been bounded; a request that can hang is a regression finding, not a known open issue.

7. **Unbounded provider body.** Point `baseUrl` at a host that answers `500` and streams an endless body. Trace the `!response.ok` branch in `complete` (`openai.ts`): `readBoundedProviderBody` MUST throw at its byte ceiling → expected **passed**. A read that buffers the whole body is a finding.

Any scenario that issues a request to a metadata host is a regression finding; record it with severity per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md). A report lacking a falsification record for the "trusted config" rationale is incomplete and invalid (AUDIT_METHODOLOGY Scoring validity).

---

## N/A Exit Criteria

An app may record this audit as **N/A** only with evidence, never with "single-user local tool" as the stated reason (AUDIT_METHODOLOGY forbids N/A from a rationale rather than a fact). To exit N/A, the report MUST confirm there is **no configurable outbound `baseUrl`, webhook target, or chat bridge**:

```bash
# Must return nothing app-configurable (no provider baseUrl, no webhook URL, no bridge fetch)
grep -rn "baseUrl\|webhook\|api.telegram.org\|fetch[A-Za-z]*(" backend/src shared/src cli/src --include="*.ts"
```

Record the grep output (or its emptiness) as the evidence. If any configurable outbound `baseUrl` or egress path exists, the audit is **in scope** and must be run.

## Deliverables / Report Template

When this audit discovers an issue requiring code changes, create a `feature.json` file under `.aidd/features/` following the schema and severity mapping in [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md):

- Directory and `id`: `audit-outbound-ssrf-{unix_timestamp}-{descriptive-slug}` (the `id` MUST match the directory name exactly).
- `auditSource`: `"OUTBOUND_SSRF"`, `category`: `"Audit"`, `passes`: `false`, `status`: `"backlog"`.
- `priority` / `auditSeverity` per the Critical=1 / High=2 / Medium=3 / Low=4 mapping.
- `affectedFiles` should list the egress path (e.g. `shared/src/agent/client/openai.ts`, `shared/src/agent/directAi.ts`, `backend/src/channels/apiClient.ts`) and the shared guard that gates it (`shared/src/security/ssrfGuard.ts`).
- `description` MUST carry the falsification evidence: the deciding `file:line` as read from the live file (the call-time guard and the `redirect` option both sit in `complete`, `openai.ts`) and the concrete `baseUrl` that was traced.
- `spec` MUST contain actionable remediation steps (e.g. restore the dropped `assertSafeAgentBaseUrl` call before `fetch()`; restore the default `AbortSignal.timeout` in `apiClient.ts` `request` / Telegram `call`).

**Report skeleton** (the report MUST follow this structure; the older freeform reports lacked it):

```markdown
# OUTBOUND_SSRF Audit Report - <commit-sha>

**Date:** <YYYY-MM-DD> **Auditor:** <name/agent> **Verdict:** <PASS | FINDINGS | N/A>

## Scope confirmation

- Egress paths in scope: <provider baseUrl | webhook | Telegram bridge | apiClient | CLI app-URL probe>
- N/A justification (if N/A): <grep evidence - never "single-user local tool">

## Checklist results

| §   | Check                             | Result    | Deciding file:line |
| --- | --------------------------------- | --------- | ------------------ |
| 1   | Call-time guard wired (openai.ts) | pass/fail | ...                |
| ... | ...                               | ...       | ...                |

## BREAK-THE-ASSUMPTION falsification record

1. Metadata pivot via config.json - passed/blocked @ <file:line>
2. Container-credential pivot - passed/blocked @ <file:line>
3. Loopback residual - verified accepted residual @ <file:line>
4. Trusted-config falsification - passed/blocked @ <file:line>
5. Redirect pivot - passed/blocked @ <file:line>
6. No-signal default timeout - passed/blocked @ <file:line>
7. Unbounded provider body - passed/blocked @ <file:line>

## Accepted residuals (verified by-design)

- Loopback/private/link-local + DNS-rebinding permitted for Ollama/vLLM (ssrfGuard.ts design note @ <file:line>)

## Findings

<one block per finding, with severity, deciding file:line, and feature.json id>
```

A `baseUrl` that reaches `fetch()` unvalidated and can hit cloud metadata is a **Critical** regression. An outbound `fetch()` that can run with no timeout (a regression of the defaults in `apiClient.ts` `request` or Telegram `call`), an unbounded provider body read, or a verbatim error-body echo is **Medium** to **High** by exploitability. A missing falsification record for the "trusted config" rationale is itself a finding (incomplete audit) per AUDIT_METHODOLOGY.

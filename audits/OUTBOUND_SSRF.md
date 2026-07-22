---
title: 'Outbound SSRF - Provider & Webhook Egress Audit'
last_updated: '2026-06-28'
version: '1.1'
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

A single shared guard must run immediately before outbound `fetch()` on every provider call path. This audit verifies that the guard remains wired at every import and call site. Priority is **Critical** because a dropped import, reordered call, or uncovered egress path enables a metadata-pivot SSRF.

**Critical Priorities (verify, do not assume)**

- **Call-time validation is wired**: confirm the shared guard `assertSafeAgentBaseUrl` (`shared/src/security/ssrfGuard.ts:77-95`) is actually called at call time: in `shared/src/agent/client/openai.ts:60` (before the `fetch()` at `openai.ts:61`) and at resolution in `shared/src/agent/directAi.ts:128`. A `baseUrl` written directly into `config.json` bypasses the settings-write validator, so the call-time guard is the load-bearing control.
- **The metadata pivot is blocked**: confirm `BLOCKED_METADATA_HOSTS` (`ssrfGuard.ts:25-31`) covers the canonical credential-theft endpoints (`169.254.169.254` and friends) and that `normalizeHostForBlocklist` (`ssrfGuard.ts:42-67`) is applied so evasions (IPv4-mapped IPv6, bare-integer / hex IPs, bracketed hosts) resolve to the canonical form.
- **Cover every egress**: provider calls, webhook targets, and the Telegram bridge all reach the network. Confirm each genuinely-configurable egress applies the same outbound policy, and that any new egress path added since the last audit is covered.

**Essential Standards (verify)**

- Redirects are not followed to private/metadata targets (`redirect: 'error'` at `openai.ts:74`).
- Provider/bridge `fetch()` calls that take untrusted-latency hosts carry an outbound timeout; flag the two genuinely-unbounded paths (see §4).
- Outbound error bodies are not echoed verbatim into logs or UI (they can carry probe results from internal services); confirm the provider body is `scrubSecrets()`-wrapped (`openai.ts:80`).

## Spernakit Applicability

This audit applies **fleet-wide** to any spernakit/aidd-derived backend that issues outbound provider or webhook requests. It is the outbound counterpart to PROXY_AUTH_BOUNDARY's inbound boundary. Any derived app that exposes a configurable provider `baseUrl`, a configurable webhook target, or a chat bridge inherits the same SSRF surface and must run this framework. An app with no such egress may record N/A only under the evidence-bearing exit in [N/A Exit Criteria](#na-exit-criteria).

## Applicability & Scope

The provider `baseUrl` and webhook targets come from `~/.aidd/config.json` and per-project config; aidd `fetch()`es them directly with no proxy in between. Even on a single-user-local install, a tricked or misconfigured `baseUrl` turns aidd into an SSRF pivot against:

- **Loopback**: `127.0.0.1:<aidd-port>` reaches aidd's own control plane (and, behind the proxy boundary, anything else on the box).
- **Link-local cloud metadata**: `169.254.169.254`, `100.100.100.200`, etc. (credential theft).
- **Private LAN**: `10.0.0.0/8`, `192.168.0.0/16`, `172.16.0.0/12`, `.internal` hosts.

**Control to verify (do not assume; confirm the wiring):** `assertSafeAgentBaseUrl` in `shared/src/security/ssrfGuard.ts:77-95` is the shared guard. It is re-exported by `backend/src/services/settings/validation.ts:11` for settings-write callers (`validation.ts:36`) and called on the **call path** in `shared/src/agent/client/openai.ts:60` (before `fetch()`) and `shared/src/agent/directAi.ts:128` (at resolution). Confirm those imports and call sites are present so a `baseUrl` written directly to `config.json` cannot reach `fetch()` unvalidated; see §1.

**Documented accepted residual (verify it is still the design, not a gap):** the guard blocks cloud-**metadata** hosts only (`BLOCKED_METADATA_HOSTS`, `ssrfGuard.ts:25-31`). Private / loopback / `fe80::` link-local ranges and DNS-rebinding (a name that later resolves to a blocked IP) are **deliberately permitted** to support self-hosted Ollama / vLLM inference servers (design note, `ssrfGuard.ts:12-15, 18-24, 36-38`). This is an intentional residual, not an open finding; confirm the design note still states it and that no requirement has since demanded a stricter list.

**Runtime note:** `redirect: 'error'` and `AbortSignal.timeout(...)` are Bun-native `fetch` features (WHATWG fetch, not Node's `http` module), so these controls hold under the Bun worker runtime that the web backend uses.

## Pre-Audit Setup

```bash
# Confirm the call path imports AND calls the shared guard (both call sites must hit)
grep -rn "assertSafeAgentBaseUrl" shared/src/ backend/src/

# Find the outbound provider fetch and confirm the guard precedes it
grep -rn "fetch\|baseUrl\|chat/completions" shared/src/agent/ --include="*.ts"

# Confirm the shared guard internals (blocklist + normalization) still live in one place
grep -rn "BLOCKED_METADATA_HOSTS\|normalizeHostForBlocklist" shared/src/security/

# Find webhook / bridge outbound targets
grep -rn "fetch\|api.telegram.org\|webhook" backend/src/bridge/ backend/src/channels/ --include="*.ts"

# Check redirect handling and outbound timeouts (flag any fetch with no signal)
grep -rn "redirect\|AbortSignal.timeout\|AbortController\|signal" shared/src/agent/ backend/src/bridge/ backend/src/channels/ --include="*.ts"
```

---

## 1. Call-Time `baseUrl` Validation

| Check | Criteria                                                                                                                               | Verification                                                                                                                                                                                                                                                                                 |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The provider `baseUrl` is validated against the SSRF guard **at call time**, immediately before `fetch()`                              | Confirm `assertSafeAgentBaseUrl(...)` runs at `openai.ts:60`, before the `fetch()` at `openai.ts:61`. A regression (removed call / reordered after `fetch`) reopens the Critical; flag as a finding                                                                                          |
| `[ ]` | The resolution that produces `baseUrl` also validates it                                                                               | Confirm `resolveDirectAiCall` (`directAi.ts:102-162`) assembles `baseUrl` (`directAi.ts:113-114`) and then calls `assertSafeAgentBaseUrl` (`directAi.ts:128`). A missing call here is a finding                                                                                              |
| `[ ]` | The shared guard is imported on the call path (not relying on the settings-write path alone: config.json edits bypass settings writes) | Confirm the imports: `openai.ts:12` and `directAi.ts:5` both import from `../security/ssrfGuard.ts`; the settings path re-exports the same guard (`validation.ts:3, 11`). A dropped import silently disables the control                                                                     |
| `[ ]` | There is exactly ONE blocklist implementation, shared by the write path and the call path                                              | Confirm the canonical guard lives only in `shared/src/security/ssrfGuard.ts` and `validation.ts:11` re-exports it; a divergent/duplicated copy is a finding (drift risk)                                                                                                                     |
| `[ ]` | The denylist blocks the cloud-metadata endpoints                                                                                       | Confirm `BLOCKED_METADATA_HOSTS` (`ssrfGuard.ts:25-31`) covers `169.254.169.254`, `100.100.100.200`, `fd00:ec2::254`, `metadata.google.internal`, `metadata.goog`                                                                                                                            |
| `[ ]` | Blocklist normalization resists evasion (IPv4-mapped IPv6, bare-integer / hex IPs, bracketed hosts)                                    | Confirm `normalizeHostForBlocklist` (`ssrfGuard.ts:42-67`) is applied inside `assertSafeAgentBaseUrl` (`ssrfGuard.ts:89`)                                                                                                                                                                    |
| `[ ]` | The DOCUMENTED accepted residual is verified, not silently widened                                                                     | Confirm the design note (`ssrfGuard.ts:12-15, 18-24`) still states that private/loopback/link-local and DNS-rebinding are intentionally permitted for self-hosted Ollama/vLLM. This is an accepted residual, NOT a finding; record it as a verified by-design decision per AUDIT_METHODOLOGY |

## 2. Webhook & Bridge Egress

| Check | Criteria                                                                                                                          | Verification                                                                                                                                                             |
| ----- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | Telegram bridge outbound target is a fixed, trusted host (not user-controllable into a private target)                            | Confirm `createTelegramClient` builds `https://api.telegram.org/bot${botToken}` from `botToken` only (`telegram.ts:43-44`); confirm `botToken` cannot inject a host      |
| `[ ]` | Any configurable webhook target applies the same metadata denylist as provider `baseUrl`                                          | Confirm each configurable webhook URL passes through `assertSafeAgentBaseUrl` or an equivalent before `fetch()` (none present today; flag any newly added one)           |
| `[ ]` | The internal API client (`apiClient.ts`) targeting `127.0.0.1` is intentionally loopback and not exposed to user-controlled hosts | Confirm `createApiClient` hardcodes `http://127.0.0.1:${web.port}` (`apiClient.ts:42`): the loopback target is by design; confirm `path`/`body` cannot redirect the host |
| `[ ]` | Bridge poll/send calls cannot be redirected at a private target by a malicious Telegram-API response                              | Confirm the bridge only calls the fixed base and does not follow response-supplied URLs (`telegram.ts:46-83`)                                                            |

## 3. Redirect Handling

| Check | Criteria                                                                                         | Verification                                                                                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Outbound provider `fetch()` does not transparently follow redirects to a private/metadata target | Confirm `redirect: 'error'` is set on the provider `fetch()` (`openai.ts:74`) so a 30x to `169.254.169.254` is rejected, not followed. A regression here is a finding |
| `[ ]` | The redirect policy is a Bun-native fetch feature and holds under the worker runtime             | Confirm `redirect: 'error'` is WHATWG-fetch (Bun-native), so it applies in the Bun worker; a port to Node `http` would need a manual re-check                         |

## 4. Outbound Timeouts & Resource Bounds

| Check | Criteria                                                                   | Verification                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Provider `fetch()` carries an abort/timeout signal                         | Confirm the `AbortController` + `setTimeout` wrapper around `client.complete` (`directAi.ts:207-208`) reaches the fetch `signal` (`openai.ts:75`)                                                                                                                                                                                                                                                             |
| `[ ]` | The internal API client health probe is bounded                            | Confirm `AbortSignal.timeout(2000)` on `isBackendReachable` (`apiClient.ts:84`)                                                                                                                                                                                                                                                                                                                               |
| `[ ]` | Genuinely-unbounded bridge/client paths are identified (do not over-claim) | Two paths take NO signal: Telegram `sendMessage` → `call` (`telegram.ts:75-82`; `call`'s `signal` is optional, `telegram.ts:46-53`) and `apiClient.ts` `request()` `fetch()` (`apiClient.ts:54`). Note `getUpdates` IS bounded (`AbortSignal.timeout`, `telegram.ts:67`) and `isBackendReachable` IS bounded (`apiClient.ts:84`); only these two are unbounded. Assess and, if confirmed, record as a finding |

## 5. Outbound Error-Body Disclosure

| Check | Criteria                                                                                                                            | Verification                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | Outbound error response bodies are not echoed verbatim into logs/UI (an internal service's response can leak through an SSRF probe) | Confirm the provider error body is wrapped in `scrubSecrets(...)` before interpolation into the thrown `Error` (`openai.ts:80-83`). Verify the scrub covers the relevant secret patterns and is not bypassed |
| `[ ]` | Bridge error details surfaced to chat are bounded and do not leak internal probe results                                            | Confirm `telegram.ts:130-132` and `apiClient.ts:38` (`text.slice(0, 200)`) bound the echoed detail                                                                                                           |

---

## BREAK-THE-ASSUMPTION (mandatory)

Per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Rules 1-3, you MUST falsify the "single-user trusted config, so `baseUrl` is safe" rationale by tracing a hostile `baseUrl` to the actual `fetch()` and confirming the guard **blocks** it. The remediation (commit `f3a91786`) is not evidence on its own; you must re-trace the path and confirm the guard is still on it. Each scenario must end in **passed** (request blocked before egress, with the deciding `file:line`) or **blocked** (request issued: a regression finding).

1. **Metadata pivot via config.json.** Set `providers.<x>.baseUrl` to `http://169.254.169.254/latest/meta-data/` **directly in `config.json`** (bypassing the settings-write validator). Trace `resolveDirectAiCall` (`directAi.ts:113-114` assembles it → `directAi.ts:128` calls `assertSafeAgentBaseUrl`) and `OpenAICompatibleAgentClient.complete` (`openai.ts:60` calls the guard → `openai.ts:61` `fetch()`). Confirm the guard throws on the metadata host (`ssrfGuard.ts:90`) before egress → expected **passed**. If the request is issued, the call-time guard regressed: Critical finding.

2. **Loopback control-plane pivot.** Set `providers.<x>.baseUrl` to `http://127.0.0.1:<aidd-port>/api/v1/` directly in `config.json` and trace the same path. This is the **documented accepted residual**: the guard intentionally permits loopback (`ssrfGuard.ts:18-24`), so the request IS issued by design. Record it as a verified accepted residual (Ollama/vLLM support), and confirm PROXY_AUTH_BOUNDARY's inbound bearer guard is the compensating control for the control-plane reach; do NOT score it as an open SSRF finding unless that compensating control is also absent.

3. **Partially attacker-influenced config (the "trusted config" falsification).** Document a concrete scenario where `config.json` is not fully operator-controlled: (a) a **synced/shared** `~/.aidd/config.json` (dotfiles repo, team template); (b) a **project-level** `baseUrl` override committed to a cloned repo; (c) a **prompt-injected settings write** where the agent is steered into writing a provider `baseUrl`. For each, trace the metadata case to the guard and confirm it is blocked at `ssrfGuard.ts:90`. This is the falsification record that retires "config is single-user, therefore safe"; note that the residual (loopback/private) remains reachable by design, so the compensating inbound control is the relevant defense there.

4. **Redirect pivot.** Point `baseUrl` at an attacker host that 302-redirects `/chat/completions` to `http://169.254.169.254/…`. Trace `openai.ts:61-77`: `redirect: 'error'` (`openai.ts:74`) makes `fetch()` reject the redirect rather than follow it → expected **passed**. Confirm the option is still set; a regression to the platform default (follow) reopens the redirect SSRF.

Any scenario that issues a request to a metadata host is a regression finding; record it with severity per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md). A report lacking a falsification record for the "trusted config" rationale is incomplete and invalid (AUDIT_METHODOLOGY Scoring validity).

---

## N/A Exit Criteria

An app may record this audit as **N/A** only with evidence, never with "single-user local tool" as the stated reason (AUDIT_METHODOLOGY forbids N/A from a rationale rather than a fact). To exit N/A, the report MUST confirm there is **no configurable outbound `baseUrl`, webhook target, or chat bridge**:

```bash
# Must return nothing app-configurable (no provider baseUrl, no webhook URL, no bridge fetch)
grep -rn "baseUrl\|webhook\|api.telegram.org\|fetch(" backend/src shared/src --include="*.ts"
```

Record the grep output (or its emptiness) as the evidence. If any configurable outbound `baseUrl` or egress path exists, the audit is **in scope** and must be run.

## Deliverables / Report Template

When this audit discovers an issue requiring code changes, create a `feature.json` file under `.aidd/features/` following the schema and severity mapping in [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md):

- Directory and `id`: `audit-outbound-ssrf-{unix_timestamp}-{descriptive-slug}` (the `id` MUST match the directory name exactly).
- `auditSource`: `"OUTBOUND_SSRF"`, `category`: `"Audit"`, `passes`: `false`, `status`: `"backlog"`.
- `priority` / `auditSeverity` per the Critical=1 / High=2 / Medium=3 / Low=4 mapping.
- `affectedFiles` should list the egress path (e.g. `shared/src/agent/client/openai.ts`, `shared/src/agent/directAi.ts`, `backend/src/channels/apiClient.ts`) and the shared guard that gates it (`shared/src/security/ssrfGuard.ts`).
- `description` MUST carry the falsification evidence: the deciding `file:line` (e.g. `openai.ts:60` for the call-time guard, `openai.ts:74` for redirect) and the concrete `baseUrl` that was traced.
- `spec` MUST contain actionable remediation steps (e.g. restore the dropped `assertSafeAgentBaseUrl` call before `fetch()`; add an `AbortSignal.timeout` to `apiClient.ts` `request()` / Telegram `sendMessage`).

**Report skeleton** (the report MUST follow this structure; the older freeform reports lacked it):

```markdown
# OUTBOUND_SSRF Audit Report - <commit-sha>

**Date:** <YYYY-MM-DD> **Auditor:** <name/agent> **Verdict:** <PASS | FINDINGS | N/A>

## Scope confirmation

- Egress paths in scope: <provider baseUrl | webhook | Telegram bridge | apiClient>
- N/A justification (if N/A): <grep evidence - never "single-user local tool">

## Checklist results

| §   | Check                                | Result    | Deciding file:line |
| --- | ------------------------------------ | --------- | ------------------ |
| 1   | Call-time guard wired (openai.ts:60) | pass/fail | ...                |
| ... | ...                                  | ...       | ...                |

## BREAK-THE-ASSUMPTION falsification record

1. Metadata pivot via config.json - passed/blocked @ <file:line>
2. Loopback residual - verified accepted residual @ ssrfGuard.ts:18-24
3. Trusted-config falsification - passed/blocked @ <file:line>
4. Redirect pivot - passed/blocked @ openai.ts:74

## Accepted residuals (verified by-design)

- Loopback/private/link-local + DNS-rebinding permitted for Ollama/vLLM (ssrfGuard.ts:12-24)

## Findings

<one block per finding, with severity, deciding file:line, and feature.json id>
```

A `baseUrl` that reaches `fetch()` unvalidated and can hit cloud metadata is a **Critical** regression. A genuinely-unbounded outbound `fetch()` (`apiClient.ts` `request()`, Telegram `sendMessage`) or a verbatim error-body echo is **Medium** to **High** by exploitability. A missing falsification record for the "trusted config" rationale is itself a finding (incomplete audit) per AUDIT_METHODOLOGY.

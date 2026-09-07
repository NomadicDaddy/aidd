---
title: 'Secret Handling, Log Redaction, and Retention Audit'
last_updated: '2026-08-30'
version: '1.2'
category: 'Security'
priority: 'Critical'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Secret Handling, Log Redaction, and Retention Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

Focused audit of how a tool that brokers AI provider calls handles secrets at rest, in flight, and over time: provider API keys and bearer tokens, the local config file, the AI-call log, the data-movement trace, and the run/invocation history. The governing assumption under test is **"secrets are scrubbed, by design"**; this audit exists to falsify that claim against real on-disk artifacts, not to confirm it from the scrubber's own source.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Applicability and Scope](#applicability--scope)
3. [Reference Implementation](#reference-implementation-aidd)
4. [Pre-Audit Setup](#pre-audit-setup)
5. [Scrub Pattern Coverage](#1-scrub-pattern-coverage)
6. [Scrub Application at Write Sites](#2-scrub-application-at-write-sites)
7. [Data-Movement Trace](#3-data-movement-trace)
8. [Config File at Rest](#4-config-file-at-rest)
9. [Token Exposure on the Control Surface](#5-token-exposure-on-the-control-surface)
10. [Retention and Rotation Bounds](#6-retention--rotation-bounds)
11. [Break the Assumption](#break-the-assumption-mandatory)
12. [Audit Checklist](#audit-checklist)
13. [Report Template](#report-template)
14. [Deliverables](#deliverables)

## Applicability & Scope

This audit applies **fleet-wide to any app that handles secrets and writes logs**: provider API keys, bearer tokens, `Authorization` headers, OAuth/webhook secrets, or any credential that can transit a log line, a broadcast frame, a trace, or a persisted run record. It is **not** Spernakit-specific and is **not** limited to multi-user deployments: a single-user local tool that holds a provider key and appends to `logs/ai-calls.jsonl` is squarely in scope. Run it wherever a credential can be written somewhere it can later be read.

For aidd specifically (Class B: single-user local CLI + embedded Elysia control panel + spawned agent subprocesses): the secret surface is the provider/`directAi` API keys, the optional `web.authToken`, the Telegram `botToken`, the AI-call log, the data-movement trace header, and `~/.aidd/config.json` / the project `.aidd/aidd.config.json`. The reference implementations cited below are aidd's; in other apps, map each check to the equivalent scrubber/logger/config-writer and verify the same property holds.

## Reference Implementation (aidd)

| Concern                | File                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------- |
| Scrub patterns         | `shared/src/lib/secretScrubber.ts` (re-exported by `backend/src/services/secretScrubber.ts`) |
| Pre-broadcast WS scrub | `backend/src/webSocketHub.ts`                                                                |
| AI-call log writer     | `shared/src/lib/aiCallLog.ts`                                                                |
| Data-movement trace    | `backend/src/services/dataMovementTrace.ts`                                                  |
| Settings DTO redaction | `backend/src/services/settings/dtoShaping.ts`, `backend/src/routes/settings.ts`              |
| Config persistence     | `backend/src/services/settingsService.ts`                                                    |

## Pre-Audit Setup

### Verification Commands

```bash
# Enumerate the scrub patterns actually defined
grep -n "pattern:" shared/src/lib/secretScrubber.ts

# Confirm where scrubSecrets is actually called (must include WS broadcast + run output capture)
grep -rn "scrubSecrets" backend/src/ shared/src/ --include="*.ts"

# Confirm the AI-call log writer never serializes request/response bodies
grep -n "request\|response\|body\|messages\|prompt" shared/src/lib/aiCallLog.ts

# Find every place a real key/token could be written to disk
grep -rn "appendFile\|writeFile\|console\.log\|process.stdout.write" backend/src/ shared/src/ --include="*.ts" | grep -iv "test\|spec"

# Inspect the live AI-call log and backend log for surviving secrets (run AFTER a real provider call)
grep -aoE "sk-[A-Za-z0-9_-]{8}|Bearer [A-Za-z0-9._-]{8}|Authorization" logs/ai-calls.jsonl logs/*.log backend.log 2>/dev/null | head

# Check config-file permissions (POSIX-ONLY — see note below)
ls -l ~/.aidd/config.json .aidd/aidd.config.json 2>/dev/null
stat -c '%a %n' ~/.aidd/config.json 2>/dev/null
```

> **Windows host note**: `ls -l` / `stat -c` are POSIX-only and **no-op on win32** (the bits they report are meaningless on NTFS). On a Windows dev host these greps return nothing; that is **not** a clean result. Run the perms checks (§4 #1, §4 #2) on a POSIX target, or treat them as **un-verified** rather than passing. Do not score §4 "clean" from a Windows run.

---

## 1. Scrub Pattern Coverage

| Check | Criteria                                                                                | Remediation                                                 |
| ----- | --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `[ ]` | Scrub patterns cover provider API keys (`sk-…`, `AKIA…`, `AIza…`, `ghp_`/`github_pat_`) | Add missing provider prefixes to `SECRET_RULES`             |
| `[ ]` | Scrub patterns cover `Bearer <token>`                                                   | Verify the `Bearer\s+…` rule matches the real token charset |
| `[ ]` | Scrub patterns cover the `Authorization:` header form                                   | Verify the `Authorization:\s*\S+` rule reaches header lines |
| `[ ]` | Generic key/secret/token/password key-value rule is present and case-insensitive        | Verify the `\b(api[_-]?key\|secret\|token\|password…)` rule |

> Cite the live rule set from `shared/src/lib/secretScrubber.ts` by line. As of this writing the rules are at `shared/src/lib/secretScrubber.ts:8-21`. A pattern existing is necessary but **not sufficient**; Section 2 verifies it is actually applied at every write site.

## 2. Scrub Application at Write Sites

| Check | Criteria                                                                                        | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `scrubSecrets` is applied to **all** WS frames before broadcast, not only one message type      | `backend/src/webSocketHub.ts` defines `deepScrubValue()` (`:17-26`) which recurses every string in every frame, and `broadcast()` (`:44-61`) calls `JSON.stringify(deepScrubValue(message))` **unconditionally** (`:50`) with no `type` gate. **Verify the invariant still holds**: the deep-scrub call is present and ungated, and **no broadcast path bypasses `WebSocketHub.broadcast`** (every emitter goes through the hub: `broadcastService.ts` holds a single `WebSocketHub` and delegates; grep for raw `peer.send`/`ws.send` outside the hub). If any frame is emitted without passing through `deepScrubValue`, that is a finding |
| `[ ]` | Run / subprocess output capture is scrubbed **before** persist and **before** broadcast         | Trace the run-output pipeline; confirm scrub happens at capture, not only at the hub                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `[ ]` | `logs/ai-calls.jsonl` writes cannot contain a raw secret                                        | The `AiCallLogEntry` shape (`shared/src/lib/aiCallLog.ts:29-54`) carries only metadata (`model`, `inputTokens`/`outputTokens`, `provider`, `error`, `runId`, …); `logAiCall`/`logAiCallSync` (`:112-155`) `JSON.stringify` exactly that entry; confirm no request/response body or header is ever added to `AiCallLogEntry`; if `error` (`:33`) can embed a provider error body containing the key, scrub it before logging                                                                                                                                                                                                                  |
| `[ ]` | Backend logger redacts secret fields and never logs raw config                                  | Verify the structured logger's redact paths cover `apiKey`, `authToken`, `token`, `botToken`, `authorization`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `[ ]` | No `console.log`/`process.stdout.write` of a raw key, token, or whole config object on any path | Grep and inspect each hit                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## 3. Data-Movement Trace

| Check | Criteria                                                                                                  | Remediation                                                                                                                                                                                                                                                                                                                                   |
| ----- | --------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The trace never stores raw secret values                                                                  | `backend/src/services/dataMovementTrace.ts` redacts keys matching `SENSITIVE_KEY_PATTERN` (`:28-29`) inside `sanitizeObject` (`:65-73`, the `[redacted]` substitution); confirm the pattern covers `authorization\|bearer\|cookie\|credential\|jwt\|key\|password\|private\|secret\|session\|token` and is applied to every summarized object |
| `[ ]` | String values are summarized (length/preview), not dumped whole                                           | `summarizeTraceValue` (`dataMovementTrace.ts:75-110`) returns a `{length, preview, type}` shape; confirm preview truncation (`MAX_STRING_LENGTH` = 120, `:27`) cannot leak a full short token (a token ≤ 120 chars is previewed **whole**)                                                                                                    |
| `[ ]` | A non-sensitive **value** that happens to contain a secret (e.g. a URL with `?token=…`) is still scrubbed | Key-name redaction misses secrets embedded in otherwise-innocent values; verify `safeTraceTarget` (`dataMovementTrace.ts:112-134`) reduces URLs to their `pathname` (dropping the query string) and consider running `scrubSecrets` over string previews in `summarizeTraceValue`                                                             |

## 4. Config File at Rest

| Check | Criteria                                                                                                            | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | `~/.aidd/config.json` (and project `.aidd/aidd.config.json`) is written with restricted perms (`0o600`)             | **Regression guard** (this was fixed): `backend/src/services/settingsService.ts:56-58` already calls `writeFile(this.configPath, …, { mode: 0o600 })`. Verify the `{ mode: 0o600 }` option is **still present** on this write; the file holds plaintext provider API keys, `web.authToken`, and `botToken`, so dropping the mode regresses to `0o666 & ~umask` (world/group readable on POSIX). If a split `*.secrets.json` sibling is in use (see applicability note below), apply the same `0o600` requirement to its writer |
| `[ ]` | The directory holding the config is not world-traversable                                                           | **Still-open gap**: `settingsService.ts:52` calls `mkdir(dirname(this.configPath), { recursive: true })` with **no `mode`**; the config directory (`~/.aidd/` or project `.aidd/`) is created at the umask default (typically `0o755`, world-traversable). Pass `{ mode: 0o700 }` so the directory is owner-only, and verify any split `*.secrets.json` sibling's parent directory (e.g. `config/`) is likewise not world-traversable                                                                                          |
| `[ ]` | No secret is written to a second location (backup/temp/`.bak`) without the same perms, and the config is gitignored | Trace any atomic-write/temp-file path and confirm perms carry over. **Also verify the config (and any `*.secrets.json` sibling) is gitignored and never committed**: grep `.gitignore` for the config path, and `git log --all -- <config-path>` / `git ls-files <config-path>` to confirm no historical commit ever captured a plaintext key                                                                                                                                                                                  |

> **Spernakit applicability**: if the app stores secrets in a **split `*.secrets.json` sibling** file (STACK.md split-secrets pattern: `config/{slug}.secrets.json`, read via `getSecret('dot.path')`, referenced from the main config by an `apiKeyRef`), apply every §4 at-rest/permissions check (`0o600` file mode, `0o700` parent dir, no unprotected backup/temp copy, gitignored + never committed) to that sibling file too. aidd itself does not use this split today, so the checks above target the single `config.json`.

## 5. Token Exposure on the Control Surface

| Check | Criteria                                                                          | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | `web.authToken` is **not** logged at startup                                      | Grep boot path for `authToken`; confirm only presence (boolean), not the value, is ever logged                                                                                                                                                                                                                                                                                                                                                   |
| `[ ]` | `GET /api/v1/settings/config` does **not** echo the raw token or any provider key | `backend/src/routes/settings.ts:131` returns `settingsService.getConfig()`, which routes through `buildSettingsDto`; `backend/src/services/settings/dtoShaping.ts` emits `apiKeyConfigured`/`botTokenConfigured`/`authTokenConfigured` **booleans** (directAi `:54`, telegram `:84`, providers `:104`, `authToken` `:117`) instead of the secret. Verify every secret field is collapsed to a `*Configured` boolean and no raw value path exists |
| `[ ]` | The WS query-token (`?token=…`) is not written to access logs                     | `backend/src/routes/ws.ts` accepts `?token=` on the upgrade; confirm the upgrade URL/query is not logged verbatim anywhere                                                                                                                                                                                                                                                                                                                       |

## 6. Retention & Rotation Bounds

| Check | Criteria                                                                             | Remediation                                                                                                                                                                                                            |
| ----- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `logs/ai-calls.jsonl` has a size-based rotation bound                                | `shared/src/lib/aiCallLog.ts:60-61,161-223` rotates at `DEFAULT_MAX_FILE_SIZE_BYTES` (10 MB) keeping `DEFAULT_MAX_ROTATED_FILES` (5) copies; confirm this is wired into both the async and sync write paths            |
| `[ ]` | Other backend run logs (`backend.log`, per-run logs) have a rotation/retention bound | Flag any log writer that appends unbounded with no rotation                                                                                                                                                            |
| `[ ]` | DB run / invocation / event tables have a retention or pruning policy                | Flag unbounded growth; compare to the `system_metrics`-style cap. If run/invocation rows accumulate forever with no `cleanup`/`prune`/TTL task, that is a finding (unbounded growth of records that may embed prompts) |

---

## BREAK-THE-ASSUMPTION (mandatory)

The closing exercise. **Do not** sign off "secrets are scrubbed, by design" from reading `secretScrubber.ts`. Falsify it against real artifacts:

1. Make a real provider call through the tool (a `directAi` surface or a CLI run that hits an API key).
2. `grep -a` the **actual** `logs/ai-calls.jsonl`, `backend.log`, and any per-run log for the real key prefix (`sk-…`, `AKIA…`, `AIza…`, `ghp_…`) and for `Bearer`/`Authorization`.
3. `grep -a` the persisted run/invocation rows (dump the SQLite table) for the same prefixes.

Treat **any** surviving secret as a finding. Specific failure modes to actively hunt:

- A secret nested inside a JSON request/error body where the scrubber regex never runs (e.g. a provider error response embedded in `AiCallLogEntry.error`, or a captured stderr blob the run-output scrubber didn't reach).
- A **broadcast path that bypasses the hub's deep-scrub**: `webSocketHub.ts` now deep-scrubs every string of every frame in `broadcast()` (`:50`), so the historical "only `run_output` is scrubbed" bug is closed. The live failure mode is an emitter that calls `peer.send`/`ws.send` directly (or any new broadcast helper) **without** going through `WebSocketHub.broadcast`; such a frame is sent in the clear. Grep for raw socket sends outside `webSocketHub.ts` and confirm none carry frame payloads.
- A secret carried as a **value** under an innocent key name, which key-name redaction in `dataMovementTrace.ts` does not catch.
- A token in a URL query string (`?token=`, `?key=`) that survives because only header/prefix patterns matched.

If you find none, you must state **what you actually grepped** (file paths + the exact key prefix searched) and that the live artifacts were clean, not merely that the code "looks like it scrubs."

**Guard against a self-inflicted leak**: this audit instructs you to record _surviving key prefixes_ in the report. Before saving any audit-report `.md` artifact (and any emitted `feature.json` description), grep your own report for the **real** key prefixes (`sk-…`, `AKIA…`, `AIza…`, `ghp_…`, `github_pat_…`, `Bearer …`) and confirm only a redacted/truncated marker (e.g. `sk-…` placeholder, not the full token) is written. A report that quotes a live secret value verbatim is itself a finding.

> **Gate note**: a report that does **not** contain a BREAK-THE-ASSUMPTION block stating the exact artifact paths grepped and the exact key prefixes searched (the "what you actually grepped" evidence above) is **incomplete** and must not be scored as clean. Falsification against live artifacts is mandatory, not optional.

---

## Audit Checklist

### Critical

- [ ] Live `logs/ai-calls.jsonl` / `backend.log` contain **no** surviving provider key or bearer token after a real run
- [ ] No raw secret persisted in DB run/invocation rows
- [ ] WS frames are deep-scrubbed before broadcast for **every** frame type (verify `broadcast()` calls `deepScrubValue` unconditionally and no emitter bypasses `WebSocketHub.broadcast`)
- [ ] `~/.aidd/config.json` written with `0o600` (holds plaintext provider keys + `web.authToken` + `botToken`)
- [ ] `web.authToken` never logged at startup; `/api/v1/settings/config` returns `*Configured` booleans, not raw secrets

### High

- [ ] Scrub patterns cover all provider key prefixes + `Bearer` + `Authorization`
- [ ] Run/subprocess output scrubbed before persist AND before broadcast
- [ ] `AiCallLogEntry` carries only metadata: no request/response body, no headers
- [ ] Data-movement trace redacts sensitive keys and truncates value previews

### Medium

- [ ] `~/.aidd/` directory created `0o700` (currently created with no mode; open gap); temp/backup writes inherit restricted perms
- [ ] Config (and any `*.secrets.json` sibling) is gitignored and absent from git history
- [ ] Audit report `.md` / `feature.json` artifacts redact surviving key values (no verbatim live secret)
- [ ] Data-movement trace scrubs secrets embedded in otherwise-innocent values (URL query tokens)
- [ ] `logs/ai-calls.jsonl` rotation wired into both async and sync write paths

### Low

- [ ] WS query-token not written to access logs
- [ ] Backend logger redact paths cover `apiKey`/`authToken`/`token`/`botToken`/`authorization`

---

## Report Template

```markdown
# Secret Handling, Log Redaction, and Retention Audit Report - YYYY-MM-DD

## Executive Summary

**Application**: {app-name}
**Overall Score**: [Score]/100
**Risk Level**: [LOW/MEDIUM/HIGH/CRITICAL]
**Critical Issues Found**: [Count]
**High Priority Issues Found**: [Count]

## Break-the-Assumption Result

- Provider call exercised: [yes/no - surface]
- Artifacts grepped: [paths]
- Key prefixes searched: [`sk-…`, `Bearer`, …]
- Surviving secrets: [none / list with file:line]

## Category Breakdown

### 1. Scrub Pattern Coverage - [Score]/15

### 2. Scrub Application at Write Sites - [Score]/25

### 3. Data-Movement Trace - [Score]/15

### 4. Config File at Rest - [Score]/15

### 5. Token Exposure on Control Surface - [Score]/15

### 6. Retention & Rotation Bounds - [Score]/15

| Finding       | Severity | Location    | Remediation |
| ------------- | -------- | ----------- | ----------- |
| {Description} | {Level}  | {File:Line} | {Fix}       |

## False Positives Considered and Rejected

This section is REQUIRED. If zero candidates, state so explicitly.

| Candidate                 | Disposition                                                                                               |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| {Pattern, with path:line} | **Not a finding.** {Rationale - confirmed scrubbed at a downstream write site, or value never persisted.} |
```

## Deliverables

For every finding requiring code changes, emit a `feature.json` under `.aidd/features/audit-{audit_name_lower}-{unix_timestamp}-{slug}/` per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md): `auditSource` `"SECRET_HANDLING_RETENTION"`, `category` `"Audit"`, and a `description` carrying the `file:line` evidence and the concrete pattern observed (including, for break-the-assumption findings, the exact artifact and key prefix that survived).

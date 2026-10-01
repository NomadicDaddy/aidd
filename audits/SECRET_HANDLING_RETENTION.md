---
title: 'Secret Handling, Log Redaction, and Retention Audit'
last_updated: '2026-10-01'
version: '1.3'
category: 'Security'
priority: 'Critical'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Secret Handling, Log Redaction, and Retention Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation, falsify every "by design"/"N/A" rationale, never score from a green gate, and back every absence claim with a known-positive control.

## Executive Summary

Focused audit of how a tool that brokers AI provider calls handles secrets at rest, in flight, and over time: provider API keys and bearer tokens, the local config file, the environment handed to subprocesses, the AI-call log, the data-movement trace, and the run and invocation history. The governing assumption under test is **"secrets are scrubbed, by design"**. This audit exists to falsify that claim against the real write paths and real artifacts, not to confirm it from the scrubber's own source.

Two different things can go wrong, and scrubbing addresses only the first:

1. **A secret is written somewhere it can later be read**: a log, a transcript, a database row, a broadcast frame. Scrubbing on the way to disk addresses this.
2. **A secret is disclosed to the model provider at the moment a tool returns it**: an agent reads the config file or prints its environment, and the tool result travels upstream. Scrubbing the transcript afterwards cannot recall it. Only keeping the secret out of the agent's reach addresses this: a stripped subprocess environment, a path boundary, credentials kept out of files an agent can read.

**Citations in this audit name a symbol and its file, not a line.** Line numbers drift with every edit; a symbol either resolves or it does not. Locate each symbol in the live file, then cite the `file:line` you actually read in the report (AUDIT_METHODOLOGY Rule 1). A named symbol that no longer exists in the named file must be resolved before scoring: decide whether the control moved or was removed, and record which.

## Rules for the Auditor's Own Handling of Secrets

These bind the audit itself. A report that breaks one is a finding against the report.

- **Never read, print, copy, or hash a real credential.** Do not open a real config file, secrets file, `.env` file, key store, or private pattern file to look at its contents. Do not dump a real process environment. Read the **source code** that handles secrets; never the secrets.
- **Use synthetic sentinel values in a disposable fixture.** To test a write path, invent a value that has the shape of a credential and is obviously fake, feed it through the code under test in a scratch directory, and look for the sentinel. Assemble the sentinel at runtime from parts so the fixture file itself does not contain a string a commit guard would reject. Delete the fixture afterwards.
- **Scan live artifacts by shape, and report location only.** When checking real logs or rows for surviving secrets, use a search that reports the file and a count (or file and line number), never the matched text. A finding names the file, the line, and which rule matched. It never quotes the value.
- **File metadata is not file content.** Checking a file's permission bits, its presence in `.gitignore`, or whether git tracks it does not require reading it.
- **If a real secret is found**, do not copy it into the report, a feature record, a note, a message, or a commit. Record where it is and what kind it is, tell the owner it must be rotated, and stop handling it.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Rules for the Auditor's Own Handling of Secrets](#rules-for-the-auditors-own-handling-of-secrets)
3. [Applicability and Scope](#applicability--scope)
4. [Reference Implementation](#reference-implementation-aidd)
5. [Pre-Audit Setup](#pre-audit-setup)
6. [Scrub Pattern Coverage](#1-scrub-pattern-coverage)
7. [Scrub Application at Write Sites](#2-scrub-application-at-write-sites)
8. [Data-Movement Trace](#3-data-movement-trace)
9. [Config File at Rest](#4-config-file-at-rest)
10. [Token Exposure on the Control Surface](#5-token-exposure-on-the-control-surface)
11. [Retention and Rotation Bounds](#6-retention--rotation-bounds)
12. [Subprocess Environment and Agent Reach](#7-subprocess-environment-and-agent-reach)
13. [Disclosure and Commit Gates](#8-disclosure-and-commit-gates)
14. [Break the Assumption](#break-the-assumption-mandatory)
15. [Audit Checklist](#audit-checklist)
16. [Report Template](#report-template)
17. [Deliverables](#deliverables)

## Applicability & Scope

This audit applies **fleet-wide to any project that handles secrets and writes logs**: provider API keys, bearer tokens, `Authorization` headers, OAuth or webhook secrets, signing keys, or any credential that can reach a log line, a broadcast frame, a trace, a persisted record, or a subprocess. It is not Spernakit-specific and not limited to multi-user deployments: a single-user local tool that holds a provider key and appends to a log is in scope. Run it wherever a credential can be written somewhere it can later be read, or handed to a process that does not need it.

**aidd** (single-user local CLI, embedded Elysia control panel, spawned agent subprocesses). The secret surface is: provider and `directAi` API keys; the optional `web.authToken`; the Telegram `botToken`; the environment passed to tool and backend subprocesses; the AI-call log; run transcripts and iteration records; the data-movement trace header; and the user-level config file `~/.aidd/config.json`. The web token and the bot token can be supplied by environment variable instead of the file (`WEB_AUTH_TOKEN_ENV` and `TELEGRAM_BOT_TOKEN_ENV` in `shared/src/config/env-secrets.ts`), which is the preferred arrangement because the config file is readable by any agent that can read the home directory. A project-level `.aidd/aidd.config.json` is filtered by `restrictProjectConfig` (`shared/src/config/read.ts`): establish from that function exactly which fields a project config may still supply, and whether any of them is a credential. The reference implementations cited below are aidd's.

**Spernakit and derived applications.** Map each check to the equivalent: the pino redaction in `backend/src/utils/logger.ts`, the split secrets file `config/{slug}.secrets.json` and the environment-injected `SECRET_CONFIG_KEYS` (`backend/src/config/configSecrets.ts`), the commit-time leak guard under `.githooks/`, and the application's own log, audit-trail, and backup retention. Sections 1-6 and 8 apply. Section 7 applies wherever the application spawns a child process; the agent-specific rows are N/A with evidence unless the application runs agents.

**Other projects** (a CLI, a static site, a mobile app). Apply the sections whose surface exists. A static site has build-time secrets and a deploy pipeline but no runtime log. A mobile app has secrets in build profiles and in device storage, and anything bundled into the binary is public. Record N/A per section with the evidence that the surface is absent.

## Reference Implementation (aidd)

| Concern                              | Symbol and file                                                                                                                                                                                |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Scrub patterns                       | `SECRET_RULES`, `scrubSecrets`, `scrubSecretFields`, `StreamingSecretScrubber` in `shared/src/lib/secretScrubber.ts` (`backend/src/services/secretScrubber.ts` re-exports `scrubSecrets` only) |
| Pre-broadcast WebSocket scrub        | `WebSocketHub.broadcast` in `backend/src/webSocketHub.ts`                                                                                                                                      |
| Backend structured logger            | `webLogger` in `backend/src/logger.ts`                                                                                                                                                         |
| AI-call log writer                   | `AiCallLogEntry`, `logAiCallSync`, `rotateSync` in `shared/src/lib/aiCallLog.ts`; the call site in `shared/src/agent/client/openai.ts`                                                         |
| Run transcript and iteration records | `cli/src/orchestrator/active-run-log.ts`, `cli/src/metadata/log-cleaner.ts`, `shared/src/metadata/store/runHistory.ts`                                                                         |
| Data-movement trace                  | `backend/src/services/dataMovementTrace.ts`                                                                                                                                                    |
| Settings DTO redaction               | `buildSettingsDto` in `backend/src/services/settings/dtoShaping.ts`; `backend/src/routes/settings.ts`                                                                                          |
| Config persistence                   | `updateConfig` and `getConfig` in `backend/src/services/settingsService.ts`                                                                                                                    |
| Environment-supplied credentials     | `applyEnvSecrets` in `shared/src/config/env-secrets.ts`                                                                                                                                        |
| Subprocess environment               | `buildToolSubprocessEnv`, `buildBackendSubprocessEnv`, `runtimeEnvKeys`, `backendEnvKeys` in `shared/src/subprocess-env.ts`                                                                    |
| Agent bash policy                    | `checkBashWorkspacePolicy` and `HOME_ENV_DUMP_PATTERN` in `shared/src/agent/tools/shell-policy.ts`                                                                                             |
| Retention constants                  | `shared/src/retention.ts`                                                                                                                                                                      |
| Retention sweep                      | `sweepRetention` in `backend/src/services/retention/cleanup.ts`; `createRetentionScheduler` in `scheduler.ts`; wired in `backend/src/start.ts`                                                 |
| Backend log rotation                 | `backend/src/services/backendLogRotation.ts`; `scripts/lib/start-web/log-rotation.ts`                                                                                                          |
| Credential-disclosure gate           | `scripts/check-credential-disclosure.ts`; `scripts/lib/credential-disclosure/`                                                                                                                 |
| Commit-time leak guard               | `.githooks/leak-guard.sh`; self-test `scripts/check-leak-guard.sh`                                                                                                                             |

## Pre-Audit Setup

### Verification Commands

```bash
# Enumerate the scrub rules actually defined
grep -n "pattern:" shared/src/lib/secretScrubber.ts

# Every call of the scrubber (must include the WebSocket hub, the logger, the run log, the run history)
grep -rn "scrubSecrets\|scrubSecretFields\|StreamingSecretScrubber" backend/src/ shared/src/ cli/src/ --include="*.ts"

# The fields the AI-call log entry can carry
grep -n "request\|response\|body\|messages\|prompt\|error" shared/src/lib/aiCallLog.ts

# Every place something is written to disk or stdout
grep -rn "appendFile\|writeFile\|console\.log\|process.stdout.write" backend/src/ shared/src/ cli/src/ --include="*.ts" | grep -iv "test\|spec"

# Raw socket sends that do not go through the hub
grep -rn "\.send(" backend/src/ --include="*.ts"

# Every subprocess environment: the two builders, and any spread of the parent environment
grep -rn "buildToolSubprocessEnv\|buildBackendSubprocessEnv\|\.\.\.process\.env" backend/src/ shared/src/ cli/src/ --include="*.ts"

# Shape scan of live artifacts: files and counts ONLY. Never print the matched text (-o) and
# never open the file to look. A non-zero count is a finding located by file; stop there.
grep -acE "sk-[A-Za-z0-9_-]{16}|Bearer [A-Za-z0-9._-]{8}|Authorization:[[:space:]]*[A-Za-z0-9]|AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{20}|github_pat_[A-Za-z0-9_]{20}|AIza[A-Za-z0-9_-]{20}|api\.telegram\.org/bot[0-9]" logs/ai-calls.jsonl logs/*.log 2>/dev/null

# Config-file permissions: metadata only, POSIX only (see note below)
ls -l ~/.aidd/config.json 2>/dev/null
stat -c '%a %n' ~/.aidd ~/.aidd/config.json 2>/dev/null

# Is the config, or any secrets file, tracked or ever committed? (names only)
git ls-files | grep -iE "config\.json$|secrets\.json$|\.env$"
```

> **Windows host note**: `ls -l` and `stat -c` report POSIX mode bits, which are meaningless on NTFS. On a Windows host these commands print nothing useful, and that is **not** a clean result. Run the permission checks (Section 4) on a POSIX target, or record them as **un-verified**. On Windows, access is governed by the file's ACL: record who can read the user-profile directory that holds the config, without reading the file.

> **Absence claims**: "no secret is written here" and "no other code spreads the environment" rest on empty searches. Run each search's known-positive control first (AUDIT_METHODOLOGY Rule 5). For the shape scan, the control is a scratch file holding a runtime-assembled sentinel of each shape, scanned with the same command. The scan hides errors, so a file that does not exist prints nothing: confirm each scanned file exists and is not empty, and record a log that has never been written as **un-verified**, not clean.

---

## 1. Scrub Pattern Coverage

| Check | Criteria                                                                                                                                                                                                       | Remediation                                                                                                                                                                                            |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | `SECRET_RULES` covers provider key prefixes (`sk-`, `AKIA`, `AIza`, `ghp_`, `github_pat_`)                                                                                                                     | Add missing prefixes. Record the minimum length each rule requires: a real key shorter than the rule's minimum is not redacted                                                                         |
| `[ ]` | Every provider aidd can be configured for has a key format that some rule matches                                                                                                                              | List the providers from the provider registry and the keys named in `backendEnvKeys`. A provider whose keys have no distinctive prefix is caught only by the key-name rule or not at all: record which |
| `[ ]` | `SECRET_RULES` covers `Bearer <token>` and the `Authorization:` header form                                                                                                                                    | Verify the rules match the real token character set                                                                                                                                                    |
| `[ ]` | The bot-token-in-URL form is covered (the `api.telegram.org/bot...` rule)                                                                                                                                      | Confirm the rule keeps the host and redacts the token                                                                                                                                                  |
| `[ ]` | The key-value rule (`SECRET_KEY` and `ASSIGNMENT`) is present, case-insensitive, and covers the field names the config uses: `apiKey`, `authToken`, `botToken`, `token`, `secret`, `password`, `authorization` | Verify against the config schema's secret field names                                                                                                                                                  |
| `[ ]` | `scrubSecretFields` redacts by **field name** at every depth, and `scrubSecrets` parses a complete JSON envelope first                                                                                         | Confirm a secret nested inside JSON inside a string is redacted without breaking the JSON                                                                                                              |
| `[ ]` | `StreamingSecretScrubber` handles a secret split across chunk boundaries, and its `DANGEROUS_SUFFIX` stays in step with `SECRET_RULES`                                                                         | A rule added to one and not the other leaks a split secret. Test with a sentinel cut at each position                                                                                                  |
| `[ ]` | Prefix rules are anchored so they do not redact ordinary text                                                                                                                                                  | Over-redaction is a correctness defect, not a security one. Record it at Medium or below                                                                                                               |

> A pattern existing is necessary but **not sufficient**. Section 2 verifies it is applied at every write site.

## 2. Scrub Application at Write Sites

| Check | Criteria                                                                                           | Remediation                                                                                                                                                                                                                                                                                                                                                     |
| ----- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Every frame is scrubbed before broadcast, whatever its type                                        | `WebSocketHub.broadcast` serializes `scrubSecretFields(message)` with no `type` gate. Verify that call is present and ungated                                                                                                                                                                                                                                   |
| `[ ]` | No emitter bypasses `WebSocketHub.broadcast`                                                       | List every raw `.send(` outside the hub. The acknowledgement frames in `backend/src/routes/ws.ts` and the terminal frames in `backend/src/routes/terminal.ts` and `backend/src/services/terminal/` are sent directly: for each, establish what the payload can contain and whether leaving it unscrubbed is a recorded decision (Section 7 covers the terminal) |
| `[ ]` | Run and subprocess output is scrubbed **before** it is persisted and **before** it is broadcast    | Trace the run-output path: the streamed log in `cli/src/orchestrator/active-run-log.ts`, the iteration records in `shared/src/metadata/store/runHistory.ts`, the cleaner in `cli/src/metadata/log-cleaner.ts`. Confirm scrubbing happens at capture, not only at the hub                                                                                        |
| `[ ]` | `logs/ai-calls.jsonl` cannot contain a raw secret                                                  | `AiCallLogEntry` carries metadata only (model, token counts, provider, host, sizes, error fields, run id). `logAiCallSync` serializes exactly that entry. Confirm no request or response body or header field has been added, and that the `error` and `errorCause` values are passed through `scrubSecrets` at the call site in `openai.ts`                    |
| `[ ]` | Every writer of an AI-call log entry scrubs its error fields                                       | List every caller of `logAiCallSync`. A new caller that passes a raw provider error body is a finding                                                                                                                                                                                                                                                           |
| `[ ]` | The backend logger redacts secret fields and never logs raw config                                 | `webLogger` has pino `redact` paths and a `streamWrite` hook that runs `scrubSecretFields` over the serialized line. Verify both, that between them `apiKey`, `authToken`, `token`, `botToken`, and `authorization` are redacted at any depth, and that the request log records the URL path without its query string                                           |
| `[ ]` | No `console.log` or `process.stdout.write` of a raw key, token, or whole config object on any path | Inspect each search hit                                                                                                                                                                                                                                                                                                                                         |
| `[ ]` | An error message that reaches an operator or a log never embeds a secret through a URL or a header | Check errors built from request URLs, provider responses, and child-process output                                                                                                                                                                                                                                                                              |

## 3. Data-Movement Trace

| Check | Criteria                                                                   | Remediation                                                                                                                                                                                                                                                                       |
| ----- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The trace never stores raw secret values                                   | `sanitizeObject` replaces the value of any key matching `SENSITIVE_KEY_PATTERN` with a redaction marker. Confirm the pattern covers authorization, bearer, cookie, credential, jwt, key, password, private, secret, session, and token, and is applied to every summarized object |
| `[ ]` | String values are summarized and scrubbed, not dumped whole                | `summarizeTraceValue` passes a string through `scrubSecrets` and truncates the preview at `MAX_STRING_LENGTH`. Confirm the scrub is still there: without it a short token is previewed whole                                                                                      |
| `[ ]` | A secret carried as a **value** under an innocent key name is still caught | Key-name redaction does not see it; the `scrubSecrets` call on the preview is the control. A value with no recognizable shape (an opaque token under a key named `value`) is not caught: record that limit                                                                        |
| `[ ]` | A URL target loses its query string                                        | `safeTraceTarget` reduces a URL to its `pathname` and an absolute file path to its base name. Confirm both, and that a token placed in a URL **path** segment is considered                                                                                                       |
| `[ ]` | The trace is off unless enabled, and its header is bounded                 | Record how tracing is enabled, and the event and size caps (`MAX_EVENTS`, `MAX_HEADER_CHARS`)                                                                                                                                                                                     |

## 4. Config File at Rest

| Check | Criteria                                                                                            | Remediation                                                                                                                                                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The user-level config is written with owner-only permissions                                        | **Regression guard**: `updateConfig` in `settingsService.ts` passes `mode: 0o600` to `writeFile`. Verify the option is still present. The file can hold provider API keys, `web.authToken`, and the bot token in plain text                                                |
| `[ ]` | The directory holding the config is owner-only                                                      | **Regression guard**: `updateConfig` passes `mode: 0o700` to `mkdir`. Verify it is still present                                                                                                                                                                           |
| `[ ]` | The modes take effect on a file or directory that **already exists**                                | `mode` on `writeFile` and `mkdir` applies only at creation. A config first created by hand, by an installer, or by an older version keeps its looser mode. Check whether any path tightens an existing file, and on a POSIX target read the actual mode bits               |
| `[ ]` | Every other writer of the config uses the same modes                                                | List every code path that writes the user-level config, in the backend, the CLI, and scripts. One writer without the mode is a finding                                                                                                                                     |
| `[ ]` | A project-level config that can hold a credential is protected to the same standard                 | `restrictProjectConfig` decides which fields `.aidd/aidd.config.json` may supply. If any of them is a credential, apply every check in this section to that file too. It sits inside a repository, where an agent working on the project can read it and git can commit it |
| `[ ]` | Saving settings never copies an environment-supplied credential into the file                       | `getConfig` overlays the environment (`applyEnvSecrets`) for display; `updateConfig` reads the raw file. Verify the write path never starts from the overlaid config                                                                                                       |
| `[ ]` | Credentials that can be supplied by environment are not also required to be in the file             | Confirm the startup error for a missing remote-access token directs the operator to the environment variable, not to the config file (`assertWebAuthTokenPresent` in `backend/src/startHelpers.ts`)                                                                        |
| `[ ]` | No secret is written to a second location (backup, temp file, `.bak`) without the same protection   | Trace any atomic-write or temp-file path and confirm the mode carries over                                                                                                                                                                                                 |
| `[ ]` | The config, and any secrets file, is ignored by git and was never committed                         | Check `.gitignore` for the path, then `git ls-files <path>` and `git log --all --oneline -- <path>` (names and commit ids only). A committed secret stays in history after the file is removed: that is a finding requiring rotation                                       |
| `[ ]` | Secret files are excluded from backups and mirrors, or the backup is protected to the same standard | An ignored file is not thereby excluded from a backup. Record what copies the directory and where                                                                                                                                                                          |

> **Spernakit applicability**: an application that stores secrets in a split `config/{slug}.secrets.json` (read through `getSecret`, referenced from the main config by a reference field) applies every Section 4 check to that file: owner-only file and directory, no unprotected copy, ignored by git, never committed. aidd does not use the split file.

## 5. Token Exposure on the Control Surface

| Check | Criteria                                                                          | Remediation                                                                                                                                                                                                                                                                                                                         |
| ----- | --------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `web.authToken` is not logged at startup                                          | Search the boot path (`backend/src/start.ts`, `startHelpers.ts`) for the token. Only its presence may be logged, never the value                                                                                                                                                                                                    |
| `[ ]` | The settings read endpoint does not echo any secret                               | The `GET /config` route in `backend/src/routes/settings.ts` returns `settingsService.getConfig()`, which goes through `buildSettingsDto`. That function emits `apiKeyConfigured`, `botTokenConfigured`, and `authTokenConfigured` booleans. Verify every secret field is reduced to a boolean and no raw value has another path out |
| `[ ]` | The settings write endpoint does not return the secret it was just given          | Read the update route's response shape                                                                                                                                                                                                                                                                                              |
| `[ ]` | The WebSocket query token is not written to a log                                 | `backend/src/routes/ws.ts` accepts `?token=` on the upgrade, because a browser cannot set a header on that handshake. Confirm no log records the upgrade URL with its query. The request log uses the path only                                                                                                                     |
| `[ ]` | A query-string token is accepted only where it must be                            | `WS_UPGRADE_PATHS` in `backend/src/plugins/bearerTokenGuard.ts` lists the paths. Any other path that accepts a query token is a finding (see PROXY_AUTH_BOUNDARY)                                                                                                                                                                   |
| `[ ]` | The frontend does not persist the token where other origins or extensions read it | Record where the browser client keeps the token and for how long                                                                                                                                                                                                                                                                    |

## 6. Retention & Rotation Bounds

aidd's bounds live in `shared/src/retention.ts`. Read the constants; do not copy the figures from this table into a report without checking them.

| Data                                                       | Bound, as last verified                                                                                           | Enforced by                                                         |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Run transcripts under the web data directory's `run-logs`  | Terminal runs expire after 90 days (`TRANSCRIPT_MAX_AGE_MS`); total size capped at 1 GiB (`TRANSCRIPT_MAX_BYTES`) | `sweepTranscripts` in `retention/cleanup.ts`                        |
| Run, pipeline-session, and invocation rows                 | Terminal rows expire after one year (`EXECUTION_HISTORY_MAX_AGE_MS`)                                              | `pruneHistory` in `retention/cleanup.ts`                            |
| Detached backend logs (`backend.log`, `backend.error.log`) | Rotate at 10 MiB, five archives, archives removed after 30 days (`BACKEND_LOG_*`)                                 | `backendLogRotation.ts` and `scripts/lib/start-web/log-rotation.ts` |
| `logs/ai-calls.jsonl`                                      | Rotates at 10 MB, five rotated files (`DEFAULT_MAX_FILE_SIZE_BYTES`, `DEFAULT_MAX_ROTATED_FILES`)                 | `logAiCallSync` and `rotateSync` in `aiCallLog.ts`                  |

| Check | Criteria                                                                                   | Remediation                                                                                                                                                                                                                                   |
| ----- | ------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | The retention sweep is wired, not only defined                                             | `backend/src/start.ts` creates the scheduler, runs it at startup, and passes its `request` hook to the run lifecycle. Confirm all three. A sweep that only runs when the panel is running leaves a CLI-only installation unswept: record that |
| `[ ]` | A sweep failure is visible                                                                 | The scheduler catches and logs a failed sweep. Confirm a persistently failing sweep would be noticed, not only logged once per attempt                                                                                                        |
| `[ ]` | The transcript sweep only deletes files inside the transcript root                         | `sweepTranscripts` filters candidates with `isInside`. Confirm a `logPath` pointing elsewhere is never removed                                                                                                                                |
| `[ ]` | Active (non-terminal) runs are never pruned, and their transcripts are not removed for age | Confirm the status filters in `sweepTranscripts` and `pruneHistory`                                                                                                                                                                           |
| `[ ]` | `logs/ai-calls.jsonl` rotation is count-bounded and, if required, age-bounded              | Rotation keeps a fixed number of files with no age limit. Record whether a retention period is required for this log and whether one exists                                                                                                   |
| `[ ]` | Every other log writer has a bound                                                         | Flag any writer that appends with no rotation                                                                                                                                                                                                 |
| `[ ]` | Every table that can hold prompt or output text has a retention rule                       | List the tables in the schema. For each one not covered by `pruneHistory` (for example step results, chat messages, telemetry), record whether it grows without bound and whether it can embed prompt text                                    |
| `[ ]` | Project-side records have a stated lifetime                                                | Iteration records under a project's `.aidd/iterations` are written into the project, not the panel's data directory. Record what, if anything, prunes them, and whether they are ignored by git                                               |
| `[ ]` | Deleting a run removes its transcript and its derived records together                     | Confirm no orphaned copy of the content survives the row                                                                                                                                                                                      |

---

## 7. Subprocess Environment and Agent Reach

A secret an agent can read is a secret sent to the model provider. The controls here keep secrets out of reach; scrubbing cannot substitute for them.

aidd builds two environments in `shared/src/subprocess-env.ts`:

- `buildToolSubprocessEnv` returns only `runtimeEnvKeys`: path, system, home-directory, temp, and shell variables. No provider key and no aidd credential. This is the environment of the agent `bash` tool and of pipeline shell steps.
- `buildBackendSubprocessEnv` returns `backendEnvKeys`: the runtime keys plus a **named** allowlist of provider credentials and per-CLI configuration variables that the external coding CLIs need. It is a list of exact names with no prefix wildcard. The web token and bot token variables are deliberately in neither list.

| Check | Criteria                                                                                                                                                                                                                                   | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `runtimeEnvKeys` contains no credential-bearing name                                                                                                                                                                                       | Read the list. Every entry is a path, a directory, or a shell setting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `[ ]` | `backendEnvKeys` is a list of exact names, each with a stated provider or toolchain reason, and no prefix loop                                                                                                                             | A wildcard such as "every variable starting with a provider prefix" forwards unrelated variables and is a finding                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `[ ]` | The aidd-consumed credentials (`WEB_AUTH_TOKEN_ENV`, `TELEGRAM_BOT_TOKEN_ENV`) are in neither list                                                                                                                                         | Confirm, and confirm a test pins their absence                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `[ ]` | Every subprocess spawn passes an explicit `env` built by one of the two builders                                                                                                                                                           | List every spawn. A spawn with no `env` option inherits the full parent environment. A spread of the parent environment is allowed only where it is marked and justified: the operator's own terminal session (`backend/src/services/terminal/sessionManager.ts`) is the one sanctioned case. Confirm `scripts/check-env-spread.ts` enforces the marker                                                                                                                                                                                                                      |
| `[ ]` | **The stripped tool environment is verified directly, with synthetic values.** Call `buildToolSubprocessEnv` with a synthetic source object that contains a sentinel under each name in `backendEnvKeys` and under an arbitrary other name | The result must contain none of the sentinels except those under `runtimeEnvKeys` names. The function takes its source as a parameter, so no real environment is involved. Do the same for `buildBackendSubprocessEnv` and confirm it returns only named keys. Its source is the **second** parameter; the first is an override map that is merged in as given, so a source passed first comes back whole and proves nothing                                                                                                                                                 |
| `[ ]` | **The command filter is not relied on to stop an environment dump.** `HOME_ENV_DUMP_PATTERN` denies `printenv` only when it is bare (followed by the end of the command or a separator) or names a home-directory variable                 | Test with `checkBashWorkspacePolicy`, which executes nothing: `printenv` redirected to a workspace file, `printenv <other name>`, `printenv <other name> <home name>`, `env`, `set`, and `export -p`. As last verified each is allowed. Record each verdict. A form that prints the whole environment, or a home-directory variable, defeats the purpose the pattern's own comment states: file each one. The filter is not what keeps provider keys out of the output; the stripped environment in the previous row is, so the severity follows what that environment holds |
| `[ ]` | The in-process agent loop does not itself hold provider keys in a place a tool can read                                                                                                                                                    | `NativeBackend` runs the loop inside the CLI process, which holds whatever environment it was started with: the backend allowlist for a web-launched run (`detachedSpawnPlan.ts`), the operator's whole shell environment for a run started from a terminal. Confirm its tools spawn with `buildToolSubprocessEnv`, and that no tool returns the loop's own `process.env` or the resolved config object                                                                                                                                                                      |
| `[ ]` | An agent cannot read the user-level config through a tool                                                                                                                                                                                  | The home-reference denial and the workspace path boundary are the controls (AGENT_TOOL_SANDBOX). The home-directory variables are present in the tool environment, so the denial of references to them is load-bearing. Cross-reference that audit's result; do not re-score it here                                                                                                                                                                                                                                                                                         |
| `[ ]` | **External CLI backends are outside the tool boundary.** They receive provider keys by design and run with their own shell and file tools                                                                                                  | For those runs, nothing in aidd prevents the agent from printing its environment or reading the home directory. The remaining controls are keeping credentials out of files, keeping aidd's own tokens out of the backend environment, and the disclosure gate in Section 8. Record this residual plainly                                                                                                                                                                                                                                                                    |
| `[ ]` | The operator terminal's full environment and unscrubbed output are a recorded decision                                                                                                                                                     | The terminal is the operator's own shell. Confirm it cannot be reached by an agent tool or an unauthenticated peer, and that its output is not persisted to a transcript or log                                                                                                                                                                                                                                                                                                                                                                                              |

## 8. Disclosure and Commit Gates

| Check | Criteria                                                                                                       | Remediation                                                                                                                                                                                                                                                                                                    |
| ----- | -------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A gate detects a retained run artifact that records a tool reading a credential store and getting content back | aidd: `check:credential-disclosure`. It looks at the **shape** of the record (a tool call naming a path in `CREDENTIAL_PATHS`, followed by a non-refused result with content), because scrubbed artifacts look clean after the disclosure has already happened. It never prints or hashes a value              |
| `[ ]` | The gate's scan roots match where artifacts actually accumulate                                                | `SCAN_ROOTS` in `scripts/lib/credential-disclosure/scan.ts`. A run that writes artifacts elsewhere is unscanned. Both roots are ignored by git, so in a fresh clone or in CI there is nothing to scan: the gate prints a skip line and still exits clean. Do not cite that result as evidence (Phase 0, wired) |
| `[ ]` | `CREDENTIAL_PATHS` covers the credential stores an agent could reach on this target                            | Compare the list with the real stores: the user-level config, key files, cloud credential files, package-manager auth files, dotenv files. A store not listed is not detected                                                                                                                                  |
| `[ ]` | The baseline can only shrink, and carries a reason                                                             | A new entry in the baseline is a disclosure that already happened, and whatever it names must be rotated. Confirm the gate refuses a baseline without a reason and reports entries that no longer disclose                                                                                                     |
| `[ ]` | A commit-time guard rejects secret formats in staged additions                                                 | `.githooks/leak-guard.sh`: generic secret formats and key material in tier 1, private literals in tier 2 loaded from outside the repository. Read the script. Do **not** open the tier-2 pattern file                                                                                                          |
| `[ ]` | The guard is installed and fails closed                                                                        | Confirm the hook path is configured in this clone, that a configured but unreadable private pattern file stops the commit, and that the self-test (`check:leak-guard`) is part of the normal gate. A clone with hooks not installed has no guard                                                               |
| `[ ]` | The guard's limits are recorded                                                                                | It scans staged additions only: not history, not files added before it existed, and not content staged and then committed with hooks bypassed. A staged secret is already in the object store and in any backup of the repository directory before the hook runs                                               |
| `[ ]` | Screenshots and other binary artifacts that can show a secret are covered by a rule or a guard                 | Record what stops a screenshot of a settings page or a terminal from being committed                                                                                                                                                                                                                           |

---

## BREAK-THE-ASSUMPTION (mandatory)

The closing exercise. **Do not** sign off "secrets are scrubbed, by design" from reading `secretScrubber.ts`. Falsify it with synthetic sentinels in a disposable fixture, then check the live artifacts by shape.

**Part A: sentinels through the real write paths.** In a scratch directory, build sentinel values at runtime: one per `SECRET_RULES` shape, one opaque value with no recognizable shape, and one placed in a URL query string. Then, calling the real functions:

1. Pass each sentinel through `scrubSecrets`, `scrubSecretFields` (as a field value, as a nested value, and inside JSON inside a string), and `StreamingSecretScrubber` (split at every position). Record which survive.
2. Build an `AiCallLogEntry` the way the call site does, with a sentinel embedded in an error message and in an error cause, and confirm what would be written.
3. Pass an object carrying sentinels under innocent key names through `summarizeTraceValue` and `safeTraceTarget`.
4. Serialize a frame carrying a sentinel in each field the way `WebSocketHub.broadcast` does.
5. Log an object carrying a sentinel under a redacted key, an unredacted key, and inside an `Error`, to a `webLogger`-configured logger writing to a scratch destination.
6. Call `buildToolSubprocessEnv` and `buildBackendSubprocessEnv` with a synthetic source object (Section 7).

**Part B: live artifacts, by shape, location only.** Run the count-only shape scan from Pre-Audit Setup against the real logs, transcripts, and iteration records. For the run and invocation rows, query the database in place with a pattern match that returns row ids and counts only; do not export the rows to a file. A non-zero count is a finding located by file and line number, or by table and row id. Do not print or copy the match.

Specific failure modes to hunt:

- A secret nested inside a JSON request or error body where the text rules never ran: a provider error embedded in `AiCallLogEntry.error`, or a captured stderr blob the run-output scrubber did not reach.
- An emitter that sends on a socket **without** going through `WebSocketHub.broadcast`.
- A secret carried as a **value** under an innocent key name, with no recognizable shape.
- A token in a URL query string or path segment that survives because only header and prefix rules matched.
- A key shorter than a rule's minimum length, or from a provider whose keys have no prefix.
- A subprocess spawned with no explicit environment.
- An artifact that is clean on disk but records a tool reading a credential store: the disclosure gate's case.

If you find none, state **what you actually ran**: the functions called, the sentinel shapes used, the files scanned, the patterns searched, and the known-positive control for each scan.

**Guard against a self-inflicted leak.** Before saving the report or any `feature.json`, scan your own output with the same shape scan. A report may contain rule names, file paths, line numbers, and obviously synthetic sentinels. It must not contain a real credential value, in full or in part.

> **Gate note**: a report with no BREAK-THE-ASSUMPTION block stating what was run, what was scanned, and each control is **incomplete** and must not be scored as clean.

---

## Audit Checklist

### Critical

- [ ] Live logs, transcripts, and iteration records contain **no** string of a credential shape (count-only scan, with its control)
- [ ] No raw secret persisted in run or invocation rows
- [ ] Every broadcast frame is scrubbed by `WebSocketHub.broadcast`, and every direct socket send is accounted for
- [ ] The user-level config is written `0o600` in a `0o700` directory by every writer
- [ ] `web.authToken` is never logged; the settings endpoint returns `*Configured` booleans, not raw secrets
- [ ] The tool subprocess environment contains no provider key or aidd credential (verified with synthetic values)
- [ ] The audit itself read no real secret and its report quotes none

### High

- [ ] Scrub rules cover every configured provider's key format, `Bearer`, and `Authorization`
- [ ] Run and subprocess output is scrubbed before persist AND before broadcast
- [ ] `AiCallLogEntry` carries only metadata, and its error fields are scrubbed at every call site
- [ ] The data-movement trace redacts sensitive keys, scrubs string previews, and drops URL query strings
- [ ] Every spawn passes an explicit environment; the only environment spread is the marked operator terminal
- [ ] The backend environment allowlist is exact names with no wildcard, and excludes aidd's own tokens
- [ ] The disclosure gate's scan roots and credential paths match this target, and its pass is not vacuous
- [ ] A committed secret, if any, is reported for rotation

### Medium

- [ ] File and directory modes take effect on a config that already exists
- [ ] Config and any secrets file are ignored by git and absent from history
- [ ] Every log, transcript, and table that can hold prompt text has a retention bound, and the sweep is wired
- [ ] The commit-time guard is installed in this clone and fails closed
- [ ] The residual for external CLI backends is recorded
- [ ] The command filter's allowed environment-dump forms are each recorded and filed, with the stripped environment named as the control that limits what they expose

### Low

- [ ] The WebSocket query token is not written to a log
- [ ] The backend logger redacts `apiKey`, `authToken`, `token`, `botToken`, and `authorization`
- [ ] Over-redaction of ordinary text is recorded

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

- Sentinel shapes used: [rule names; no values]
- Functions exercised: [list]
- Sentinels that survived: [none / write path and rule]
- Live artifacts scanned: [paths]
- Patterns searched: [shapes]
- Known-positive control for each scan: [what it found, where]
- Surviving matches: [none / file:line and rule name only - never the value]

## Category Breakdown

### 1. Scrub Pattern Coverage - [Score]/10

### 2. Scrub Application at Write Sites - [Score]/20

### 3. Data-Movement Trace - [Score]/10

### 4. Config File at Rest - [Score]/15

### 5. Token Exposure on Control Surface - [Score]/10

### 6. Retention & Rotation Bounds - [Score]/10

### 7. Subprocess Environment and Agent Reach - [Score]/15

### 8. Disclosure and Commit Gates - [Score]/10

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

For every finding requiring code changes, emit a `feature.json` under `.aidd/features/audit-{audit_name_lower}-{unix_timestamp}-{slug}/` per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md): `auditSource` `"SECRET_HANDLING_RETENTION"`, `category` `"Audit"`, and a `description` carrying the `file:line` evidence and the concrete pattern observed. For a surviving secret, the description names the artifact, the line, and the rule that matched. It never contains the value.

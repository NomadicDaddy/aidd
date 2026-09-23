---
title: 'Agent Tool Sandbox & Target-Repo Prompt-Injection Audit'
last_updated: '2026-09-13'
version: '1.2'
category: 'Security'
priority: 'Critical'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Agent Tool Sandbox Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation, falsify every "by design" rationale, never score from a green gate.

The agent's `bash` and file tools run **with the operator's own OS privileges** inside a target repository. There is no kernel sandbox, no container, no dropped-privilege user. The entire sandbox is two software boundaries enforced in TypeScript before a subprocess is spawned:

1. A **workspace-path boundary** - every path the model names must resolve inside the project `cwd` (`resolveWorkspacePath` in `constants.ts`, `checkBashWorkspacePolicy` in `shell-policy.ts`).
2. A **`$HOME`/`~` denial** - home-directory and user-profile references are rejected outright because they expand to a path that cannot be statically bounded (`HOME_REFERENCE_PATTERN` in `shell-policy.ts`).

This audit treats **all target-repo content as untrusted input**, including any prompt, README, comment, commit message, or tool description authored inside the target repo. A hostile repo can ask the agent to read `~/.aidd/config.json` (provider API keys, web token), write outside the workspace, or smuggle a path past the regex. The sandbox is only as strong as the weakest path-naming construct it fails to bound - so every checklist item below is a **VERIFY against the live regex/resolver**, not a trust of its comment.

> **Scope boundaries.** This audit covers **aidd's own TypeScript tool boundary** (the `bash`/file tools the model calls in-process). It does **not** cover the spawned coding-CLI's internal permission mode: aidd launches each CLI without any `--dangerously-skip-permissions`/bypass flag, so there is no such flag to hunt for here. Outbound network egress from a tool subprocess is owned by [OUTBOUND_SSRF.md](./OUTBOUND_SSRF.md) - do not add an egress section to this audit. Destructive-git protection overlaps with [GIT_DESTRUCTIVE_SAFETY.md](./GIT_DESTRUCTIVE_SAFETY.md); this audit only confirms the bash-layer deny-list exists (§1), it does not re-derive that audit's scope.

## Executive Summary

**Critical Priorities**

- **Path-boundary completeness**: every shell construct that can name a path (redirect, `cd`/`pushd`, command substitution, glob, `cp`/`mv`/`tee` args) is bounded or denied - no un-checked escape.
- **`$HOME`/`~` denial robustness**: `HOME_REFERENCE_PATTERN` catches the double-quoted `"$HOME"` form (the policy strips single-quotes only), `${HOME...}`, `~`, `~user`, `%USERPROFILE%`, `$env:USERPROFILE`.
- **Secret-stripped subprocess env**: `buildToolSubprocessEnv` hands tools only runtime/shell vars - provider API keys and the web token are absent, so `env`/`printenv` in a tool `bash` cannot read them.
- **Dispatcher-level mutation gate**: `write_file`/`edit_file`/`bash` are refused at the dispatcher when `allowFileEdits` is off, not merely omitted from the advertised tool list.
- **Operator-controlled edit flag**: `allowFileEdits` flows from JSON config / operator settings, never from a model-supplied argument.

**Essential Standards**

- The target repo (and any prompt authored in it) is untrusted; the sandbox must hold even when the model is actively trying to escape on its behalf.
- Read/write/edit/glob/list all funnel through `resolveWorkspacePath`, which rejects absolute paths, drive-letter paths, and `..` traversal.
- A runaway `bash` is bounded by a timeout plus `killProcessTree`.

## Applicability & Scope

Applies to **agent-orchestration tools** (a target with an agent bash/file tool, a git-destructive run pipeline, and a multi-run state machine). **N/A for plain web apps - record N/A, do not flag absence.** A generic CRUD web app has no agent tool surface, no `resolveWorkspacePath`, and no `HOME_REFERENCE_PATTERN`; the absence of these controls is not a finding there. State the classification at the top of the report.

Within aidd this audit governs:

- `shared/src/agent/tools/shell-policy.ts` - `checkBashWorkspacePolicy`, `HOME_REFERENCE_PATTERN`, `HOME_ENV_DUMP_PATTERN`, `DANGEROUS_CONSTRUCT_PATTERN`, `DESTRUCTIVE_GIT_PATTERN`, the redirect/`cd`/absolute-path sweeps
- `shared/src/agent/tools/shell-policy-redirects.ts` - `maskNullOutputRedirects` (literal `/dev/null` output-sink exception applied before those sweeps)
- `shared/src/agent/tools/shell.ts` - `runBash`, `grepWorkspace` (now hold only execution; all policy/regex lives in `shell-policy.ts` / `shell-policy-redirects.ts`)
- `shared/src/agent/tools/filesystem.ts` - `readWorkspaceFile`, `writeWorkspaceFile`, `editWorkspaceFile`, `globWorkspace`, `listWorkspaceDirectory`
- `shared/src/agent/tools/constants.ts` - `resolveWorkspacePath`, `verifyRealPathWithinRoot` (symlink containment), `excludedSearchDirs`, output caps
- `shared/src/subprocess-env.ts` - `buildToolSubprocessEnv`, `buildBackendSubprocessEnv`
- `backend/src/services/director/chatAgentTools/` - `dispatch.ts` (the `allowFileEdits` gate), `definitions.ts` (`buildToolDefinitions`, `mutatingFileToolNames`)
- `backend/src/services/director/chatService.ts` - `allowFileEdits` provenance (`getConfig().director?.chat?.allowFileEdits === true`)
- `backend/src/services/run/launch.ts`, `backend/src/services/run/worktreeReap.ts`, `backend/src/services/run/detachedSpawnPlan.ts` - per-run worktree isolation and the `Bun.spawn` subprocess invariant

## Table of Contents

1. [Bash Path-Naming Constructs](#1-bash-path-naming-constructs)
2. [Home / User-Profile Denial](#2-home--user-profile-denial)
3. [Filesystem Tool Boundary](#3-filesystem-tool-boundary)
4. [Subprocess Environment Hygiene](#4-subprocess-environment-hygiene)
5. [Mutation Gating at the Dispatcher](#5-mutation-gating-at-the-dispatcher)
6. [Resource Bounds](#6-resource-bounds)
7. [Per-Run Worktree Isolation](#7-per-run-worktree-isolation)
8. [Subprocess Spawn Invariant](#8-subprocess-spawn-invariant)
9. [BREAK-THE-ASSUMPTION Scenarios](#9-break-the-assumption-scenarios)

## Pre-Audit Setup

### Verification Commands

```bash
# Read the path-policy, home-denial, dangerous-construct, and destructive-git regex directly
grep -n "HOME_REFERENCE_PATTERN\|HOME_ENV_DUMP_PATTERN\|DANGEROUS_CONSTRUCT_PATTERN\|ENCODING_UTILITY_PATTERN\|EVAL_CONSTRUCT_PATTERN\|DESTRUCTIVE_GIT_PATTERN\|checkBashWorkspacePolicy\|singleQuoteStripped\|redirectPattern\|cdPattern\|absolutePathPattern\|maskNullOutputRedirects" shared/src/agent/tools/shell-policy.ts shared/src/agent/tools/shell-policy-redirects.ts

# Confirm shell.ts now holds only execution (runBash timeout/killProcessTree, grepWorkspace)
grep -n "runBash\|grepWorkspace\|killProcessTree\|buildToolSubprocessEnv" shared/src/agent/tools/shell.ts

# Read the workspace path resolver + symlink containment used by every file tool
grep -n "resolveWorkspacePath\|verifyRealPathWithinRoot\|realpathSync\|excludedSearchDirs" shared/src/agent/tools/constants.ts

# Confirm the tool subprocess env strips provider keys
grep -n "buildToolSubprocessEnv\|runtimeEnvKeys\|backendEnvKeys" shared/src/subprocess-env.ts

# Confirm the dispatcher enforces the edit gate (not only the tool list)
grep -n "allowFileEdits\|mutatingFileToolNames\|dispatchFileTool" backend/src/services/director/chatAgentTools/dispatch.ts

# Trace where allowFileEdits originates (must be config/operator, never model arg)
grep -n "allowFileEdits" backend/src/services/director/chatService.ts

# Confirm per-run worktree isolation + the Bun.spawn invariant (never node:child_process)
grep -n "worktrees\|aidd/run-\|Bun.spawn" backend/src/services/run/launch.ts backend/src/services/run/worktreeReap.ts
```

---

## 1. Bash Path-Naming Constructs

`checkBashWorkspacePolicy` (`shared/src/agent/tools/shell-policy.ts`) runs in `runBash` **before** the command is handed to `Bun.spawn(['bash', '-c', command])` (`shell.ts:19-22`). It first blanks literal output redirects to `/dev/null` (`maskNullOutputRedirects` in `shell-policy-redirects.ts`) so a stderr sink is not judged as an out-of-workspace write; `runBash` still executes the original command. It then bounds several explicit construct families (destructive-git, dangerous-construct, home, printenv, redirect, `cd`/`pushd`, file-destination) and relies on the absolute-path sweep for the rest. Enumerate **every** way a shell command can name a path and confirm each is either bounded inside the workspace root or denied. The `/dev/null` exception is output-redirect-only: `cat /dev/null`, `rm /dev/null`, `</dev/null`, and `>/dev/null/../x` must still deny.

| Check | Criteria                                                                                                                                                                                                                           | Remediation                                                                                                                                                                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A **destructive git command** (`git reset --hard`, `git checkout .`, `git restore .`, `git clean -f…`) is denied - `DESTRUCTIVE_GIT_PATTERN` (`shell-policy.ts:74`, checked at `shell-policy.ts:85`) on the quote-stripped command | This is the bash-layer deny only; the full destructive-git threat model and write-allowlist diff live in [GIT_DESTRUCTIVE_SAFETY.md](./GIT_DESTRUCTIVE_SAFETY.md) - confirm the deny fires, do not re-derive that audit's scope                                   |
| `[ ]` | Output redirects `>` / `>>` are bounded - `redirectPattern` extracts the target and rejects out-of-workspace via `isPathWithinWorkspaceRoot`, after `maskNullOutputRedirects` has blanked only literal `/dev/null` output sinks    | If a redirect target escapes, fail the step; verify `&` (fd-dup) skip is not abusable; verify `2>/dev/null` is allowed and `>/dev/null/../outside` is not                                                                                                         |
| `[ ]` | Literal `/dev/null` **output** redirects (`>`, `>>`, `&>`, `&>>`, optional fd, optional quotes around `/dev/null`) are allowed - `maskNullOutputRedirects` (`shell-policy-redirects.ts`) blanks them for policy only               | Confirm `runBash` still executes the original command (output discarded, no workspace file named `null`). `cat /dev/null`, `cp file /dev/null`, `</dev/null`, `>/dev/null.txt`, and `>/dev/null/../x` remain denied. A general `/dev/null` exemption is a finding |
| `[ ]` | `cd` / `pushd` targets are bounded - `cdPattern` (`shell-policy.ts:136`) rejects an escaping target (`shell-policy.ts:143`)                                                                                                        | Confirm `cd ~`/`cd ..` are caught (via home-denial or the relative resolve)                                                                                                                                                                                       |
| `[ ]` | Absolute paths anywhere in the command are bounded - `absolutePathPattern` (`shell-policy.ts:126`) sweeps `/...` and `C:\...` tokens against the root (`shell-policy.ts:130`)                                                      | Verify `/proc/self/environ`, `/etc/passwd`, `C:\Users\<user>` are all rejected                                                                                                                                                                                    |
| `[ ]` | **Command substitution `$(...)` / backticks** - confirm whether a path inside `$(cat /etc/passwd)` is reached by the absolute sweep, or whether the inner command runs unbounded                                                   | If `$(...)` bodies are not statically inspected, document the exact bypass (likely finding)                                                                                                                                                                       |
| `[ ]` | **Heredoc** (`<<EOF ... EOF`) cannot redirect its body to an out-of-workspace path                                                                                                                                                 | Verify heredoc-to-file forms still pass through `redirectPattern`                                                                                                                                                                                                 |
| `[ ]` | `cp` / `mv` / `tee` / `install` destination args are bounded                                                                                                                                                                       | These are caught only if the destination is an absolute token; verify a relative `../` dest is caught by the root resolve                                                                                                                                         |
| `[ ]` | Glob expansion (`*`, `?`, `[...]`) cannot reach outside the workspace                                                                                                                                                              | Bash expands globs after the policy check; confirm an absolute-prefixed glob (`/etc/*`) is rejected as an absolute token                                                                                                                                          |
| `[ ]` | A relative token resolves against the workspace root, not the process cwd (`isPathWithinWorkspaceRoot`, `shell-policy.ts:276`)                                                                                                     | Verify `../../etc/passwd` resolves to an out-of-root `rel` starting with `..` and is rejected                                                                                                                                                                     |
| `[ ]` | The single/double-quote stripping (`shell-policy.ts:79`) used for the absolute-path sweep does not blind the sweep to a quoted absolute path                                                                                       | Verify `cat "/etc/passwd"` and `cat '/etc/passwd'` are still caught (quote body is replaced, leaving the token)                                                                                                                                                   |

> **Auditor note**: `checkBashWorkspacePolicy` is a **static lexical filter** over the command string, not a parsed shell AST. A construct the regex does not model would otherwise be unbounded - which is why the runtime-expansion families are denied outright rather than inspected: `DANGEROUS_CONSTRUCT_PATTERN` (`shell-policy.ts:39`, checked at `shell-policy.ts:92`) denies `eval`, `bash -c`/`sh -c`/`zsh -c`…, `exec`, and `source`; the `ENCODING_UTILITY_PATTERN` + `EVAL_CONSTRUCT_PATTERN` pair (`shell-policy.ts:49-51`, checked at `shell-policy.ts:97`) denies any command combining a base64/base32/xxd/od utility with an eval/subshell construct. **VERIFY these deny branches still fire** - construct the bypass command and confirm it is rejected, not merely that the regex looks present. A genuinely novel runtime-expansion form the two patterns do not model (e.g. a decode utility not in the encoding set piped into a construct not in the eval set) is still a finding, severity scaled to what it can reach.

---

## 2. Home / User-Profile Denial

`HOME_REFERENCE_PATTERN` (`shell-policy.ts:16`) is the control that stops `cat $HOME/.aidd/config.json` and `cat ~/.aidd/config.json` from exfiltrating machine-local provider keys and the web token. The denial check at `shell-policy.ts:104-107` tests a **single-quote-stripped** copy (`singleQuoteStripped`), deliberately leaving double-quoted content visible because `$HOME` expands inside double quotes; a secondary test on the unmodified command (`shell-policy.ts:114`) is defense-in-depth. The Windows home-drive forms (`$HOMEDRIVE`/`$HOMEPATH`, `${HOMEDRIVE}`, `%HOMEDRIVE%`, `$env:HOMEDRIVE`…) are now denied by the same pattern, and `printenv HOME` / bare `printenv` is denied by `HOME_ENV_DUMP_PATTERN` (`shell-policy.ts:26`, checked at `shell-policy.ts:121`).

| Check | Criteria | Remediation |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- | ---------------------------------------------------------------- |
| `[ ]` | Bare `$HOME` is caught - `\$HOME\b` branch | Verify `echo $HOME` / `cat $HOME/...` is rejected |
| `[ ]` | **Double-quoted `"$HOME"` is caught** - the policy strips single-quotes only (`shell-policy.ts:104`), so the `$HOME` inside `"..."` is still visible to the regex | Verify `cat "$HOME/.aidd/config.json"` is rejected. This is the headline case - confirm it, do not assume |
| `[ ]` | Brace form `${HOME}` / `${HOME:-/x}` is caught - `\$\{HOME[^}]*\}` branch | Verify `cat ${HOME}/.aidd/config.json` is rejected |
| `[ ]` | Tilde `~`, `~/`, `~user` is caught - the `(?:^                                                                                                            | [\s;                                                                                                                                                                                                      | &(\`<>"'=])~`branch | Verify`cat ~/.aidd/config.json`and`cat ~root/.x`are rejected |
|`[ ]`| Windows`%USERPROFILE%`and PowerShell`$env:USERPROFILE`are caught                                                                                      | Verify both branches reject their forms                                                                                                                                                                   |
|`[ ]`| Single-quoted`'$HOME'`is correctly **allowed** (literal, no expansion) and does not false-positive                                                      | Confirm the single-quote strip happens before the test so literals pass                                                                                                                                   |
| `[ ]`| Windows home-drive forms`$HOMEDRIVE`/`$HOMEPATH`(and`${HOMEDRIVE}`, `%HOMEDRIVE%`, `$env:HOMEDRIVE`…) are caught - explicit branches in `HOME_REFERENCE_PATTERN` (`shell-policy.ts:16-17`) | Verify `echo $HOMEDRIVE$HOMEPATH`is rejected; the`\bHOME\b`anchor must not swallow these, so they are listed explicitly - confirm the deny |
|`[ ]`|`printenv HOME`(and`printenv USERPROFILE`/`HOMEDRIVE`/`HOMEPATH`) plus a bare `printenv`env dump are caught - `HOME_ENV_DUMP_PATTERN` (`shell-policy.ts:26`, checked at `shell-policy.ts:121`) | Verify `printenv HOME`and a bare`printenv`are rejected, while a targeted`printenv PATH`is still allowed |
|`[ ]`| Remaining runtime-expansion smuggling - `${HOME//x/y}`, `eval $HOME`, `cat $(echo \$HOME)/…` - is denied at the construct layer, not the home layer |`eval`/subshell/encoding chains are denied by `DANGEROUS_CONSTRUCT_PATTERN` (`shell-policy.ts:39`) and the encoding+eval pair (`shell-policy.ts:49-51`); verify these fire so no decoded `$HOME` reaches bash |

---

## 3. Filesystem Tool Boundary

`resolveWorkspacePath` (`constants.ts:69`) is the chokepoint for `read_file`, `write_file`, `edit_file`, `glob`, and `list_directory` (`filesystem.ts:8,35,44,65,82`). It rejects absolute paths and drive-letter paths (`constants.ts:76`) and `..` escapes (`constants.ts:82`), then calls `verifyRealPathWithinRoot` (`constants.ts:44`, invoked at `constants.ts:87`) to close the symlink-escape gap.

| Check | Criteria                                                                                                                                                                                                                                                                                                                                                                                         | Remediation                                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `read_file` rejects absolute paths, drive-letter paths, and `..` traversal                                                                                                                                                                                                                                                                                                                       | Verify all three rejection branches fire                                                                                                                                                                                                                                                                                                                                         |
| `[ ]` | `write_file` and `edit_file` resolve through the same guard before any `writeFileSync` (`filesystem.ts:35,45`)                                                                                                                                                                                                                                                                                   | Confirm no write path bypasses `resolveWorkspacePath`                                                                                                                                                                                                                                                                                                                            |
| `[ ]` | `glob` and `list_directory` cannot enumerate outside the root (`filesystem.ts:65,82`)                                                                                                                                                                                                                                                                                                            | Verify the `path` arg passes through `resolveWorkspacePath`                                                                                                                                                                                                                                                                                                                      |
| `[ ]` | **Symlink escape is closed** - `verifyRealPathWithinRoot` (`constants.ts:44`) `realpathSync`-walks each existing ancestor of the resolved path and rejects when the real path escapes the realpath'd root (`constants.ts:53-54`); the leaf may not exist yet (new-file write), so only existing ancestors are checked. The root itself is realpath'd once (`resolveRealRoot`, `constants.ts:29`) | **VERIFY the containment still holds.** Create `./link -> ~/.aidd` (or `/etc`) inside the workspace, then `read_file ./link/config.json`, and confirm it is rejected with `Path escapes working directory via symlink`. A path that slips through (e.g. a symlink whose only escaping component is the non-existent leaf, or a realpath failure that is not denied) is a finding |
| `[ ]` | `write_file` auto-creates parent directories (`mkdirSync(recursive)`, `filesystem.ts:38`) only within the resolved (in-root) path                                                                                                                                                                                                                                                                | Confirm the resolved path is in-root before the mkdir - `resolveWorkspacePath` (incl. the symlink walk) runs first at `filesystem.ts:35`                                                                                                                                                                                                                                         |

---

## 4. Subprocess Environment Hygiene

`buildToolSubprocessEnv` (`subprocess-env.ts:96`) returns **only** `runtimeEnvKeys` (`subprocess-env.ts:26-46`): PATH, HOME, TEMP, etc. Provider API keys and per-CLI config overrides live in `backendEnvKeys` (`subprocess-env.ts:53-85`) and are handed **only** to backend CLI subprocesses via `buildBackendSubprocessEnv` (`subprocess-env.ts:102`), never to tool subprocesses.

| Check | Criteria                                                                                                                                                               | Remediation                                                                                                                                                                             |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `runBash` spawns with `env: buildToolSubprocessEnv()` (`shell.ts:24`), not `{ ...process.env }`                                                                        | Verify no `process.env` spread reaches the tool subprocess                                                                                                                              |
| `[ ]` | `grepWorkspace` spawns with `buildToolSubprocessEnv()` (`shell.ts:96`)                                                                                                 | Same                                                                                                                                                                                    |
| `[ ]` | `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `NATIVE_API_KEY`, `ZHIPU_API_KEY`, `XAI_API_KEY`, the web auth token, and CLI config overrides are **absent** from the tool env | Verify none of `backendEnvKeys` beyond the runtime set are picked for tools                                                                                                             |
| `[ ]` | `env` / `printenv` run inside a tool `bash` cannot print a provider key or the web token                                                                               | Concretely run `bash` with `env` and confirm the secret set is empty                                                                                                                    |
| `[ ]` | `HOME`/`USERPROFILE` ARE present in the tool env (needed by spawned binaries) but the home **path** is still denied by `HOME_REFERENCE_PATTERN` at the command layer   | Confirm the env exposing `HOME` does not undermine the path denial - the value is visible to a child process's own `$HOME`, but the policy blocks the model from naming it in a command |
| `[ ]` | No prefix-wildcard loop (`OPENAI_`, `CLAUDE_`) reintroduces an env spread (`subprocess-env.ts:48-52` policy comment, `// allow-env-spread-policy`)                     | Verify the allowlist is explicit and named                                                                                                                                              |

---

## 5. Mutation Gating at the Dispatcher

Mutating file tools (`write_file`, `edit_file`, `bash` - `mutatingFileToolNames`, `definitions.ts:6`) are gated **twice**: omitted from the advertised tool list when `allowFileEdits` is false (`buildToolDefinitions`, `definitions.ts:107-108`) **and** refused at the dispatcher (`dispatch.ts:203-209`). The dispatcher gate is the load-bearing one - the tool list is only a hint to the model.

| Check | Criteria                                                                                                                                                                                                                                                            | Remediation                                                                                           |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `[ ]` | `dispatchFileTool` refuses **all** file tools when `!dispatch.allowFileEdits` (`dispatch.ts:203`), even if the model calls a tool name it was never offered                                                                                                         | Verify the gate is on the dispatch path, not only the definition list                                 |
| `[ ]` | A model that hallucinates `write_file` with edits off still hits the `ERROR: direct file editing is disabled` refusal                                                                                                                                               | Confirm the refusal is returned before `executeTool` runs                                             |
| `[ ]` | `allowFileEdits` is operator/config-controlled - `allowChatFileEdits()` reads `getConfig().director?.chat?.allowFileEdits === true` (`chatService.ts:58`) and passes it into the dispatch context (`chatService.ts:224`), never from a model-supplied tool argument | Trace the provenance to this live path; if any model-controllable path can flip it, that is Critical. |
| `[ ]` | The default is **off** - the `=== true` strict comparison (`chatService.ts:58`) means any absent or non-`true` config value yields `false`                                                                                                                          | Confirm a fresh config (no `director.chat.allowFileEdits` key) has edits OFF                          |
| `[ ]` | Even with edits ON, file tools are project-scoped - `dispatchFileTool` requires `projectId` and resolves cwd via `ctx.resolveProjectPath` (`dispatch.ts:210-211`), so the workspace boundary still applies                                                          | Confirm `executeTool` runs against the resolved project cwd, re-applying `resolveWorkspacePath`       |

---

## 6. Resource Bounds

| Check | Criteria                                                                                                                                                                                                                                                                                    | Remediation                                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `[ ]` | `runBash` enforces a timeout (default 120s, `shell.ts:17`) and kills the tree on timeout (`killProcessTree`, `shell.ts:39`)                                                                                                                                                                 | Verify a runaway command is terminated, not leaked           |
| `[ ]` | Command output is truncated (`maxCommandOutputChars` 50k, `constants.ts:5`; applied at `shell.ts:59`) so a tool cannot blow the context window                                                                                                                                              | Confirm the cap fires before the result is returned          |
| `[ ]` | `grepWorkspace` excludes the full `excludedSearchDirs` set - `node_modules`, `.git`, `dist`, `build`, `.next`, `.aidd/iterations`, `data`, `coverage`, `.cache`, `vendor` (`constants.ts:6-17`, applied at `shell.ts:85-87`) - and caps file size (`--max-filesize 256K`, `shell.ts:82-83`) | Verify all 10 excluded dirs and the filesize cap are present |
| `[ ]` | `glob` caps at 500 matches (`filesystem.ts:72`)                                                                                                                                                                                                                                             | Confirm the cap                                              |

---

## 7. Per-Run Worktree Isolation

A web-launched **coding** run is isolated in its own git worktree, so an agent that escapes its in-tool path boundary still lands inside a per-run checkout, not the operator's primary clone. The worktree is deterministic - `worktrees/<runId>` under `web.dataDir` with branch `aidd/run-<runId>` (`launch.ts:103-104`), gated on `config.web.useWorktrees && mode === 'coding'` (`launch.ts:87`) - and reaped by the orphan sweeper via `reapRunWorktree` (`worktreeReap.ts:24`) when a supervising process dies without cleaning up.

| Check | Criteria                                                                                                                                                                                             | Remediation                                                                                                                |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A coding run gets a per-run worktree at `worktrees/<runId>` on branch `aidd/run-<runId>` when `web.useWorktrees` is on (`launch.ts:87,103-104`)                                                      | Confirm the path/branch are runId-derived and stored on the row for reaping                                                |
| `[ ]` | An agent inside the worktree cannot reach the **parent repo** working tree - only its own `aidd/run-<runId>` branch checkout is on disk at the run cwd                                               | Verify the run cwd is the worktree path, not the primary clone; the tool boundary (`resolveWorkspacePath`) is rooted there |
| `[ ]` | An agent cannot reach **sibling worktrees** (`worktrees/<otherRunId>`) - they live under the shared `worktrees/` dir but outside this run's cwd, so the path boundary denies `../` traversal to them | Confirm a sibling worktree path resolves out-of-root and is rejected                                                       |
| `[ ]` | An agent cannot reach `~/.aidd` from inside a worktree - the home-denial (`HOME_REFERENCE_PATTERN`) and absolute-path sweep apply identically regardless of worktree cwd                             | Confirm the worktree does not relocate or weaken the home/path boundary                                                    |
| `[ ]` | Orphaned worktrees are reaped, not leaked - `reapRunWorktree` (`worktreeReap.ts:24`) force-removes the worktree + branch and prunes (`worktreeReap.ts:30-33`)                                        | Confirm a run whose supervisor died is swept (a parked/conflict run is intentionally preserved)                            |

---

## 8. Subprocess Spawn Invariant

Every tool and run subprocess must spawn via **`Bun.spawn`**, never `node:child_process`. On Windows `node:child_process.spawn` inherits the HTTP listen socket and orphans the port until reboot (see the web-backend child-spawn hazard); `Bun.spawn` does not. The env handed to each spawn is the explicit allowlist from `subprocess-env.ts` - tools get the runtime-only set, backend CLIs get the named provider set - so no spawn carries a `{ ...process.env }` spread.

| Check | Criteria                                                                                                                              | Remediation                                                                                          |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `[ ]` | Tool subprocesses spawn via `Bun.spawn` with the scrubbed tool env - `runBash` (`shell.ts:22-24`), `grepWorkspace` (`shell.ts:94-96`) | Confirm neither uses `node:child_process` nor a `process.env` spread                                 |
| `[ ]` | Run subprocesses spawn via `Bun.spawn` - the detached launch (`launch.ts:175,178`) and worktree reaper (`worktreeReap.ts:6`)          | Verify no `node:child_process` import on the run-spawn path                                          |
| `[ ]` | The run-spawn env is the named backend allowlist - `buildBackendSubprocessEnv` (`detachedSpawnPlan.ts:73`), not a raw `process.env`   | Confirm provider keys flow only through the explicit `backendEnvKeys` set                            |
| `[ ]` | `grep -rn "child_process" backend/src shared/src` finds no production spawn path                                                      | Any `node:child_process.spawn` on a tool/run path is a Windows listen-socket orphan hazard - flag it |

---

## 9. BREAK-THE-ASSUMPTION Scenarios

> **Mandatory.** For each scenario below, construct the exact command and trace it through `checkBashWorkspacePolicy` / `resolveWorkspacePath` by hand (or run it against a scratch workspace). **Any scenario that reaches a secret outside the workspace - `~/.aidd/config.json`, `/proc/self/environ`, a provider key - is a finding.** Never score from "the regex looks right"; the regex is a lexical filter and lexical filters have gaps.

1. **(a) Double-quoted home read** - `cat "$HOME/.aidd/config.json"`. The policy strips single-quotes only (`shell-policy.ts:104`), so `$HOME` inside double quotes remains visible to `HOME_REFERENCE_PATTERN`. **Confirm it is rejected.** If it is NOT, this is Critical (provider-key exfiltration).

2. **(b) Brace-expansion home read** - `cat ${HOME}/.aidd/config.json`. Verify the `\$\{HOME[^}]*\}` branch (`shell-policy.ts:16`) fires.

3. **(c) In-workspace symlink to home** - create `./link -> ~/.aidd` inside the workspace, then `read_file` / `cat ./link/config.json`. This was the prior live finding; it is now **remediated** by `verifyRealPathWithinRoot` (`constants.ts:44`, called from `resolveWorkspacePath` at `constants.ts:87`), which `realpathSync`-walks existing ancestors and rejects when the real target escapes the realpath'd root (`constants.ts:53-54`). **VERIFY the realpath containment still holds** - construct the symlink and confirm `read_file ./link/config.json` is rejected with `Path escapes working directory via symlink`. A path that slips the walk (e.g. an escaping non-existent leaf, or a `realpathSync` failure that is not denied) is a finding.

4. **(d) Base64 / eval-smuggled path** - `eval "$(echo Y2F0ICRIT01FLy5haWRkL2NvbmZpZy5qc29u | base64 -d)"` (decodes to `cat $HOME/.aidd/config.json`). The decoded string never appears as a literal token, so a lexical home check cannot see it - which is why the **construct itself is denied** rather than inspected: `DANGEROUS_CONSTRUCT_PATTERN` (`shell-policy.ts:39`, checked at `shell-policy.ts:92`) rejects the `eval`, and the `ENCODING_UTILITY_PATTERN` + `EVAL_CONSTRUCT_PATTERN` pair (`shell-policy.ts:49-51`, checked at `shell-policy.ts:97`) rejects the `base64 | eval` chain. **VERIFY the dangerous-construct deny still holds** - confirm the command is rejected before bash runs. A runtime-expansion form neither pattern models is still a finding, severity scaled to reachability.

5. **(e) Absolute / proc redirect (POSIX)** - `cat /proc/self/environ` and `printenv > /tmp/leak.txt`. Verify the absolute-path sweep (`shell-policy.ts:126`) rejects `/proc/self/environ`, the redirect sweep (`shell-policy.ts:149`) rejects `> /tmp/leak.txt`, and `printenv` is independently denied by `HOME_ENV_DUMP_PATTERN` (`shell-policy.ts:121`). Then confirm the env that **would** leak via `/proc/self/environ` is the stripped tool env (Section 4) - defense in depth, not a single point of failure.

For each: record the exact command, the policy branch that should catch it (with `file:line`), the observed disposition, and - when a bypass exists - what it reaches. A bypass that reaches only the stripped tool env is lower severity than one that reaches `~/.aidd/config.json`.

---

## Audit Checklist

### Critical Checks

- [ ] `cat "$HOME/.aidd/config.json"` (double-quoted) is rejected by `HOME_REFERENCE_PATTERN`
- [ ] No bash construct (`$(...)`, eval, base64-decode) reaches an out-of-workspace path unbounded
- [ ] In-workspace symlink to `~/.aidd` is rejected by `verifyRealPathWithinRoot` (realpath containment) - does NOT yield the real config
- [ ] Every tool/run subprocess spawns via `Bun.spawn` (never `node:child_process`) with a scrubbed/named env
- [ ] `buildToolSubprocessEnv` strips every provider key and the web token from tool subprocesses
- [ ] Mutating file tools refused at the dispatcher when `allowFileEdits` is off
- [ ] `allowFileEdits` is config/operator-controlled, never model-controlled

### High Priority Checks

- [ ] All `cd`/`pushd`/redirect/absolute-path constructs bounded or denied
- [ ] `resolveWorkspacePath` rejects absolute, drive-letter, and `..` paths for every file tool
- [ ] `${HOME}`, `~`, `~user`, `%USERPROFILE%`, `$env:USERPROFILE` all denied
- [ ] No prefix-wildcard env loop reintroduces a `{ ...process.env }`-equivalent spread

### Medium Priority Checks

- [ ] `runBash` timeout + `killProcessTree` bound a runaway
- [ ] Output/grep/glob caps prevent context-window exhaustion
- [ ] File tools remain project-scoped even with edits enabled

---

## Deliverables

### Required Outputs

1. Agent-tool-sandbox audit report in `.aidd/audit-reports/AGENT_TOOL_SANDBOX-YYYY-MM-DD.md`
2. A feature.json file under `.aidd/features/` for each finding requiring code changes
3. A completed BREAK-THE-ASSUMPTION table: each scenario, the catching branch (`file:line`), observed disposition, and what a bypass reaches

### Output Format

Each finding becomes a feature.json under `.aidd/features/audit-{audit_name_lower}-{unix_timestamp}-{descriptive-slug}/feature.json`, with `priority`/`auditSeverity` mapped per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) (Critical=1, High=2, Medium=3, Low=4), `category` = `"Audit"`, `auditSource` = `"AGENT_TOOL_SANDBOX"`, `passes` = `false`, and a `description` carrying the `file:line` evidence and the concrete construct or scenario observed. The `id` field MUST exactly match the feature directory name.

### Success Criteria

- [ ] 0 unbounded path-naming constructs that reach outside the workspace
- [ ] 0 home-reference forms that evade `HOME_REFERENCE_PATTERN`
- [ ] 0 provider keys / web token readable from a tool subprocess env
- [ ] Every BREAK-THE-ASSUMPTION scenario constructed and dispositioned with `file:line` evidence

## False Positives Considered and Rejected

This section is REQUIRED - if you found zero false-positive candidates, state that explicitly. Common candidates to document: `HOME`/`USERPROFILE` present in the tool env (intentional - needed by spawned binaries; the _path_ is still denied at the command layer); single-quoted `'$HOME'` allowed (literal, no expansion); the `&`-prefixed redirect skip (fd duplication, not a file path); literal `>/dev/null` output redirects.

| Candidate                                                                                                   | Disposition                                                                                                                                                                                                                                                                                                                                                                          |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Literal `>/dev/null`, `2>/dev/null`, `&>/dev/null` (and `>>` / `&>>` / quoted `/dev/null`) output redirects | **Not a finding.** `/dev/null` is a shell sink, not a workspace path. `maskNullOutputRedirects` (`shell-policy-redirects.ts`) blanks only those output redirects — word-bounded, no CR/Unicode whitespace, no expansions — before policy evaluation; `runBash` still executes the original command. `/dev/null` as an argument, input redirect, or `>/dev/null/../x` remains denied. |
| {Description of the flagged pattern, with path:line}                                                        | **Not a finding.** {Rationale - reference the documented trade-off, framework behavior, or defense-in-depth layer that compensates.}                                                                                                                                                                                                                                                 |

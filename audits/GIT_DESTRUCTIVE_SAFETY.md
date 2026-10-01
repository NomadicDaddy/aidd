---
title: 'Git-Destructive Safety & Metadata-Only Write-Boundary Audit'
last_updated: '2026-10-01'
version: '1.2'
category: 'Security'
priority: 'Critical'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Git-Destructive Safety Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation, falsify every "by design" rationale, never score from a green gate, and back every absence claim with a known-positive control.

An agent run can try **git-destructive operations** in a target repository: `git reset --hard`, `git checkout .`, `git clean -fdx`, `git restore .`, and their many other spellings. Uncommitted operator work is lost if one of them reaches git, and git cannot give it back. This audit is a regression guard for the controls below, and it measures how much of the destructive surface those controls actually cover.

**Citations in this audit name a symbol and its file, not a line.** Line numbers drift with every edit; a symbol either resolves or it does not. Locate each symbol in the live file, then cite the `file:line` you actually read in the report (AUDIT_METHODOLOGY Rule 1). A named symbol that no longer exists in the named file must be resolved before scoring: decide whether the control moved or was removed, and record which.

Two software controls exist, and each covers only part of the surface:

1. The **destructive-verb deny-list**: `DESTRUCTIVE_GIT_PATTERN` in `shared/src/agent/tools/shell-policy.ts`. `evaluateBashWorkspacePolicy` tests it first, before any other check, and `checkBashWorkspacePolicy` turns a match into a denial, so the command never runs. It applies **only to aidd's own `bash` tool** (`runBash` in `shared/src/agent/tools/shell.ts`): the in-process agent loop and Director chat. See [Which runs each control covers](#which-runs-each-control-covers).
2. The **write-allowlist guard with destructive-discard detection**: `captureWriteGuardSnapshot` and `diffWriteViolations` in `shared/src/pipeline/writeAllowlist.ts`, with `revertWriteViolations` in `shared/src/pipeline/write-allowlist/revert.ts`. It snapshots `git status` before a step and compares after. Beyond newly dirty and newly committed paths, it flags a **baseline-dirty path that is no longer dirty** as a `destructivelyDiscarded` violation. It runs only where a caller arms it: metadata-only pipeline steps, and CLI runs launched with `--write-allowlist`.

Detection is not recovery. The guard can tell that uncommitted work was discarded. It cannot bring that work back: see [Section 3](#3-destructive-discard-detection--revert).

## Executive Summary

**Critical Priorities (regression guards: these MUST stay green)**

- **Destructive verbs are denied at the bash tool.** `DESTRUCTIVE_GIT_PATTERN` must still match `git reset --hard`, `git checkout .`, `git restore .`, and `git clean -f...`, and `evaluateBashWorkspacePolicy` must still test it before every other check. A verb allowed through the agent tool is Critical.
- **The deny-list is measured, not assumed.** It is a regular expression over the command text. Test the spellings in [Section 1](#1-destructive-verb-deny-list) and report each one that is allowed.
- **Destructive discards are detected in guarded runs, and the loss is reported truthfully.** `diffWriteViolations` must still flag a baseline-dirty path that became clean, the caller must fail the step or iteration, and the message must not claim the operator's work was restored when it was not.
- **Non-git fail-open is closed at two layers.** A metadata-only launch on a non-git project is refused at launch (`launchRecipe` in `backend/src/services/pipeline/launchService.ts`), and a null baseline fails the step (`executeStep` in `backend/src/services/pipeline/stepRunner.ts`). A regression re-opens the unguarded write path.

**Essential Standards**

- Every run type is mapped to the controls that actually apply to it. No control is credited to a run it does not reach.
- Force-push and history rewrites have **no code deny-list**; verify the policy gate and treat an autonomous force-push as a live finding.
- The before and after snapshots leave no window in which a violating write goes unseen.
- Metadata writes are confined to `.aidd` (`METADATA_ALLOWLIST`) and cannot be redirected out of it (`.aidd/../src`).
- **Surfaces outside the agent tool** - the CLI run started against a live checkout, the control panel's own git actions, operator tooling - are policed separately; see [Section 7](#7-surfaces-outside-the-agent-tool).

## Applicability & Scope

Applies to **agent-orchestration tools**: a target with an agent bash or file tool, a pipeline that runs agents in a target repository, and multi-run state. **N/A for a target that does not run agents against a repository**: record N/A with the evidence, and do not flag the absence of a deny-list or a metadata-only guard there. A plain web application, a static site, a mobile app, or a library has no target-repository destructive surface of this kind. State the classification at the top of the report.

A Spernakit-derived application is N/A for Sections 1-6 unless it runs agents itself. Section 7's question still applies to any project whose own scripts run git against a working tree: read them.

Within aidd this audit governs:

- `shared/src/agent/tools/shell-policy.ts`: `DESTRUCTIVE_GIT_PATTERN`, `checkBashWorkspacePolicy`, `evaluateBashWorkspacePolicy`; and `denialMessage` in `shell-policy-denial.ts`
- `shared/src/agent/tools/shell.ts`: `runBash`, the only caller of `checkBashWorkspacePolicy`
- `shared/src/backends/commands.ts` (`buildBackendCommand`) and `shared/src/backends/factory.ts` (`createBackend`): which backends run in-process and which are external CLIs
- `shared/src/pipeline/writeAllowlist.ts`: `captureWriteGuardSnapshot`, `diffWriteViolations`, `isPathAllowlisted`, `isGitRepository`
- `shared/src/pipeline/write-allowlist/revert.ts`: `revertWriteViolations`, `unwindCommittedViolations`, `revertOne`, `restoreCleanBaselinePath`, `unrevertedPaths`
- `shared/src/pipeline/write-allowlist/git.ts`: `gitStatusEntries` (porcelain v1 parse), `committedPathsSince`, `gitHead`, `pathExistsInTree`
- `backend/src/services/pipeline/stepRunner.ts`: `executeStep`, the metadata-only caller: null-baseline refusal, diff and revert wiring, `METADATA_ALLOWLIST`
- `backend/src/services/pipeline/launchService.ts`: `launchRecipe`, the launch-time non-git refusal
- `cli/src/orchestrator/run/write-allowlist-iteration.ts`: `enforceWriteAllowlistForIteration`, the CLI `--write-allowlist` caller
- `backend/src/services/pipeline/metadataOnlyGuard.ts`: `captureWorktreeSnapshot` and `findMetadataViolations`, a path-membership view over the shared snapshot. It has no destructive-discard detection and no revert. Record its callers; the step runner does not use it

### Which runs each control covers

aidd launches two kinds of backend, and the deny-list reaches only one of them. Confirm this table against `createBackend` and `buildBackendCommand` before scoring anything else.

| Run type                                                                                                  | Shell the agent uses                                                                                                                                                                                                                                   | Deny-list applies?                                            |
| --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| In-process agent loop: `NativeBackend`, used by the `native`, `lmstudio`, `ollama`, and `openai` backends | aidd's `bash` tool (`runBash`)                                                                                                                                                                                                                         | Yes                                                           |
| Director chat                                                                                             | The same tool set, dispatched from `backend/src/services/director/chatAgentTools/`                                                                                                                                                                     | Yes. Confirm the dispatcher calls the shared tool, not a copy |
| External CLI backends: `claude-code`, `cline`, `codex`, `grok`, `kilocode`, `opencode`                    | The CLI's own shell tool. aidd starts `claude-code`, `cline`, `codex`, and `grok` with that CLI's own permission-bypass flag. `kilocode` and `opencode` are started with no aidd-supplied permission flag: establish their effective mode from the CLI | **No.** aidd never sees the commands these agents run         |

For an external CLI backend the only controls on a destructive git command are: the prompt policy (`prompts/_common/forbidden-commands.md`), the write-allowlist guard where a caller arms it, and worktree isolation where it is enabled. A report that credits the deny-list to an external-backend run has scored a control that does not apply (AUDIT_METHODOLOGY Rule 1).

## Table of Contents

1. [Destructive-Verb Deny-List (regression guard)](#1-destructive-verb-deny-list)
2. [The Non-Git Fail-Open (closed)](#2-the-non-git-fail-open)
3. [Destructive-Discard Detection & Revert (regression guard)](#3-destructive-discard-detection--revert)
4. [Snapshot Timing & TOCTOU](#4-snapshot-timing--toctou)
5. [Metadata Write Confinement](#5-metadata-write-confinement)
6. [BREAK-THE-ASSUMPTION Scenarios](#6-break-the-assumption-scenarios)
7. [Surfaces Outside the Agent Tool](#7-surfaces-outside-the-agent-tool)

## Pre-Audit Setup

### Safety rules for this audit

- Never run a destructive git command against a real checkout to see what happens. Every scenario in this audit is either traced by hand through the code or driven against a **disposable scratch repository** created for the purpose, with invented files.
- To test the deny-list, call `checkBashWorkspacePolicy` with the command string. It returns the decision and executes nothing.
- Do not start a real run against a live checkout to observe its effect on the working tree. Read the lifecycle code.

### Verification Commands

```bash
# Confirm the destructive-verb deny-list exists and is applied in the bash policy
grep -n "DESTRUCTIVE_GIT_PATTERN\|checkBashWorkspacePolicy\|evaluateBashWorkspacePolicy" shared/src/agent/tools/shell-policy.ts

# Every caller of the policy. Expect the bash tool only; anything that spawns a shell without it is a gap
grep -rn "checkBashWorkspacePolicy" shared/src/ backend/src/ cli/src/ --include="*.ts"

# Which backends are external CLIs, and the permission flags aidd passes them
grep -n "dangerously\|auto-approve\|bypassPermissions\|permission-mode" shared/src/backends/commands.ts

# Confirm destructive-discard detection and revert are intact
grep -n "destructivelyDiscarded\|diffWriteViolations" shared/src/pipeline/writeAllowlist.ts
grep -n "destructivelyDiscarded\|is-ancestor\|revertWriteViolations" shared/src/pipeline/write-allowlist/revert.ts

# Confirm the non-git fail-open is closed at BOTH layers (launch refusal + step refusal)
grep -n "isGitRepository\|not a git repository" backend/src/services/pipeline/launchService.ts
grep -n "guardBaseline === null\|refusing to run unguarded" backend/src/services/pipeline/stepRunner.ts

# Git commands aidd itself issues. Code passes git arguments as an ARRAY of separate words,
# so a search for a whole command string finds nothing here. Search for the quoted subcommand.
grep -rnE "'(reset|checkout|restore|clean|stash|rebase|push|branch|update-ref|worktree)'" backend/src shared/src cli/src scripts --include="*.ts"
```

The last search does not come back empty: aidd's own code does issue destructive git commands, from the three places this audit names (the guard's revert in `revert.ts`, the control panel's discard action, and run-worktree cleanup). It is the basis of the absence claim "no other code issues one", so account for every hit, and treat a hit outside those places as a finding. Run its known-positive control first: it must find the `'reset'` and `'checkout'` arguments in `shared/src/pipeline/write-allowlist/revert.ts`. If it does not, the search is broken and a short result means nothing (AUDIT_METHODOLOGY Rule 5).

---

## 1. Destructive-Verb Deny-List

`checkBashWorkspacePolicy` masks literal null-device output redirects (`maskNullOutputRedirects`), calls `evaluateBashWorkspacePolicy`, and wraps any violation with `denialMessage`. `evaluateBashWorkspacePolicy` blanks quoted spans, then tests `DESTRUCTIVE_GIT_PATTERN` against the result **as its first check**. The checks that follow, in order, are: dangerous constructs (`eval`, `bash -c`, `exec`, `source`), encoding-plus-eval chains, home references and the `printenv` forms, absolute paths, positional targets (`cd`, redirects, file destinations, `tee`), command substitution, and the general argument containment sweep. That order is stated as load-bearing in the function's own comment; confirm it has not changed.

The pattern's documented forms are `git reset --hard`, `git reset HEAD~N`, `git checkout .` and `git checkout -- .`, `git restore .` and `git restore -- .`, and `git clean -...f...`. These verbs take no path, or a bare `.`, so the path checks cannot bound them and the verb-level deny-list is the enforcing control.

| Check | Criteria                                                                                                                                                                                                                                                                                                          | Remediation                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `git reset --hard HEAD~5` through the agent `bash` tool is **denied**: `DESTRUCTIVE_GIT_PATTERN` matches and `checkBashWorkspacePolicy` returns the destructive-git ERROR                                                                                                                                         | If it is not denied, the deny-list regressed (Critical). Restore the pattern and the first-position test                                                                                                    |
| `[ ]` | The destructive-git test is the **first** check in `evaluateBashWorkspacePolicy`, so no earlier return can let a destructive command through with a different verdict                                                                                                                                             | Read the function top to bottom. A check inserted above it that returns `null` early is Critical                                                                                                            |
| `[ ]` | `git clean -fdx`, `-fd`, and `-xf` are denied (the `clean` arm requires `f` inside the first flag cluster)                                                                                                                                                                                                        | Confirm each by calling `checkBashWorkspacePolicy`                                                                                                                                                          |
| `[ ]` | `git checkout .`, `git checkout -- .`, `git restore .`, and `git restore -- .` are denied                                                                                                                                                                                                                         | Confirm the optional `--` arm still covers both forms                                                                                                                                                       |
| `[ ]` | The pattern fires mid-command (after `;`, `\|`, `&`, a backtick, `(`, or whitespace), not only at the start of the string                                                                                                                                                                                         | A chained `foo && git reset --hard` must be caught                                                                                                                                                          |
| `[ ]` | **Spelling variants are each tested and each allowed one is reported.** At minimum: `git -C <dir> reset --hard`; `git -c <key>=<value> reset --hard`; `git.exe reset --hard`; uppercase `GIT`; `git reset -q --hard`; `git reset --merge`; `git reset --keep`; `git reset HEAD~` and `git reset HEAD^` (no digit) | The pattern requires the subcommand directly after `git` and the flag directly after the subcommand. Any variant that returns `null` is a deny-list gap: file it, with the exact string, at High or above   |
| `[ ]` | **Clean variants**: `git clean -d -f`, `git clean -x -f`, `git clean -Xf`, `git clean --force`                                                                                                                                                                                                                    | The `clean` arm inspects only the first flag cluster and only lowercase letters. Report each allowed form                                                                                                   |
| `[ ]` | **Whole-tree discards that are not a bare `.`**: `git checkout -f`, `git checkout HEAD -- .`, `git checkout -- <dir>`, `git restore <dir>`, `git restore --staged --worktree .`, `git restore :/`, `git stash` followed by `git stash drop` or `git stash clear`                                                  | Path-scoped forms stay inside the workspace, so the path checks allow them, yet they still discard uncommitted work in that path. Record which are allowed and whether any other control covers them        |
| `[ ]` | Quote-stripping does not blind the check: the policy blanks quoted spans before testing; a destructive verb hidden in `bash -c '...'` or `eval '...'` must be caught by the dangerous-construct deny-list (`DANGEROUS_CONSTRUCT_PATTERN`)                                                                         | Confirm the construct check still runs on the unstripped command                                                                                                                                            |
| `[ ]` | A destructive verb cannot be reached through a wrapper the policy allows: a git alias defined in the same command (`git -c alias.x='reset --hard' x`), a script file in the workspace that the agent writes and then runs, or a package script                                                                    | The policy filters the command text, not what the started program does. Record these as residual: the deny-list cannot close them, so the write-allowlist guard and worktree isolation are the real control |

> **Auditor note**: the deny-list is a text filter on one tool. It is the primary containment only for the in-process agent loop and Director chat, and only for the spellings it matches. Section 3's discard detection is the backstop where a caller arms it. Neither covers an external CLI backend's own shell.

---

## 2. The Non-Git Fail-Open

The non-git fail-open is **closed at two layers**. This section is a regression check that both refusals still fire.

- **Layer 1: launch refusal.** `launchRecipe` (`launchService.ts`) computes `metadataOnly` from the launch input or the recipe and, when it is true and `isGitRepository(projectDir)` is false, throws an error stating that metadata-only pipeline sessions require a git repository. No step runs.
- **Layer 2: step refusal (defense in depth).** `executeStep` (`stepRunner.ts`) captures the guard baseline for a metadata-only step that is not a `recipe-ref` and, when the baseline is `null`, completes the step as `failed` with a message that it is refusing to run unguarded.

`captureWriteGuardSnapshot` returns `null` when `gitStatusEntries` returns `null`, which happens for a non-git directory, for any non-zero `git status` exit, and when git cannot be started. Callers must treat `null` as **refuse**.

| Check | Criteria                                                                                                                      | Remediation                                                                                                                                                                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A metadata-only launch on a non-git project is **refused at launch** (`launchRecipe`)                                         | If the throw is gone, the launch-level fail-open regressed (Critical)                                                                                                                                                                                                                                                                                 |
| `[ ]` | A null baseline **fails the metadata-only step** (`executeStep`), never proceeding unguarded                                  | If the step proceeds on a null baseline, the step-level fail-open regressed (Critical)                                                                                                                                                                                                                                                                |
| `[ ]` | `recipe-ref` steps skip the baseline because their leaf steps guard themselves                                                | Trace one `recipe-ref` to its leaves and confirm each leaf captures its own baseline with `metadataOnly` still true                                                                                                                                                                                                                                   |
| `[ ]` | A transient `git status` failure on a git project (corrupt index, permissions, a held lock) fails closed, the same as non-git | `gitStatusEntries` returns `null` on any non-zero exit; confirm the caller refuses in both cases                                                                                                                                                                                                                                                      |
| `[ ]` | **The after-step diff also fails closed.** `diffWriteViolations` returns `null` when `git status` fails after the step        | Read how each caller treats `null`. A caller that treats `null` as "no violations" lets a step that broke the repository, or ran while git was unavailable, pass unchecked: that is a finding                                                                                                                                                         |
| `[ ]` | The refusal is surfaced to the operator (step `failed` with the explicit message), not silent                                 | Confirm the `errorMessage` reaches the run or step record                                                                                                                                                                                                                                                                                             |
| `[ ]` | The CLI `--write-allowlist` path refuses, or clearly reports, when its baseline is `null`                                     | Read where the orchestrator captures the baseline and what it does when the capture returns `null`. A console warning while the run proceeds unguarded is weaker than a refusal: record which one happens, and whether the run summary or exit status carries it. A run that was asked for a write boundary and silently ran without one is a finding |

> Both refusals must fail **closed**. Treat a regression in either layer as a finding.

---

## 3. Destructive-Discard Detection & Revert

The guard catches what the deny-list cannot see: a destructive operation that makes a **baseline-dirty path become clean**. `diffWriteViolations` builds violations in three passes: paths whose status changed since the baseline, paths committed since the baseline HEAD (`committedPathsSince`), and baseline entries that are no longer in the current status. The third pass records each such non-allowlisted path with `destructivelyDiscarded: true`.

`revertWriteViolations` then acts on the list. For a `destructivelyDiscarded` path, `revertOne` runs `git checkout <baseline.head> -- <path>`.

**What that checkout does and does not do.** It writes the path's content as of the baseline **commit**. The operator's uncommitted edits were never in a commit, so they are not restored. After `git reset --hard` the path already equals the baseline commit, so the checkout changes nothing and reports success. The honest summary of this control is: the discard is **detected**, the step **fails**, and the loss is **not recoverable** by aidd. The code's own comment says the work is recovered only "as far as it can be".

| Check | Criteria                                                                                                                                                                                                                                              | Remediation                                                                                                                                                                                                                 |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A baseline-dirty path outside the allowlist that became clean is flagged `destructivelyDiscarded` (third pass of `diffWriteViolations`)                                                                                                               | If the pass is gone, a `git reset --hard` in a guarded run passes undetected (Critical)                                                                                                                                     |
| `[ ]` | The metadata-only step **fails** on a non-empty violation list and the revert runs (`executeStep`)                                                                                                                                                    | If the caller logs but proceeds, the backstop is decorative (Critical)                                                                                                                                                      |
| `[ ]` | **The diff runs whether or not the step's dispatch succeeded.** Read the condition that guards the `diffWriteViolations` call in `executeStep`                                                                                                        | If the diff is skipped when the dispatch failed, a step that destroyed operator work and then errored is never checked. That is a finding: a failing step is the likelier one to have left damage                           |
| `[ ]` | **The failure message does not claim recovery that did not happen.** For a `destructivelyDiscarded` violation, read what `executeStep` and `enforceWriteAllowlistForIteration` tell the operator when `revertWriteViolations` reports no failed paths | A message that says the writes were reverted, for a path whose uncommitted edits are gone, tells the operator their tree is fine when their work is lost. Report it. The message must say uncommitted work was discarded    |
| `[ ]` | A discard with **no baseline commit** (`baseline.head` undefined) is reported as failed, not swallowed (`revertOne` returns `false`)                                                                                                                  | Confirm the path reaches the returned list and the step error                                                                                                                                                               |
| `[ ]` | A discarded path that was **untracked or newly added at baseline** (so absent from the baseline commit) is reported as failed: the checkout cannot find it                                                                                            | Confirm with a scratch repository: an untracked file removed by `git clean` must appear in the failed list                                                                                                                  |
| `[ ]` | `unrevertedPaths` re-reads status after the revert and reports paths that are still dirty. It deliberately skips `destructivelyDiscarded` paths and paths that were dirty at baseline                                                                 | Record that the post-revert verification does not cover discards. Do not flag the skip itself; flag any message that relies on it                                                                                           |
| `[ ]` | Committed violations are unwound only when the baseline HEAD is still an ancestor of HEAD (`unwindCommittedViolations`, `merge-base --is-ancestor`), using `reset --mixed`, which keeps file content                                                  | This is the partial mitigation for history rewrites (Section 6). Do not flag the bail-out itself                                                                                                                            |
| `[ ]` | A path that was **clean at baseline** is restored index and worktree together (`restoreCleanBaselinePath`): from the baseline commit when the path exists there, otherwise unstaged and deleted                                                       | Confirm a file the run staged does not remain staged after a revert reported as successful                                                                                                                                  |
| `[ ]` | Porcelain parse is sound: renames take the post-arrow path, surrounding quotes are removed, the two-character status prefix is stripped, short lines are skipped (`gitStatusEntries`)                                                                 | Verify `R  a -> b` records `b`; `?? path`, ` M path`, and `A  path` all parse                                                                                                                                               |
| `[ ]` | **Quoted paths are decoded, not only unquoted.** Git quotes and escapes a path containing non-ASCII bytes, a quote, or a control character unless `core.quotePath` is off                                                                             | Stripping the quotes leaves the escape sequences in the recorded path, so a later revert addresses a file that does not exist under that name. Test with a non-ASCII filename in a scratch repository and report the result |
| `[ ]` | A path modified at baseline and modified **again** by the run keeps the same status letters and is skipped as pre-existing dirt (`baseline.entries.get(path) === status`)                                                                             | The guard compares status, not content. Record this as a known limit: further damage to an already-dirty file outside the allowlist is invisible to it                                                                      |

> **Auditor note**: detection, failure, revert, and the message are four separate failure points. A green detection with a message that says "reverted" still leaves the operator believing lost work is safe. Drive the scenarios in Section 6 against a scratch repository and read the exact message produced.

---

## 4. Snapshot Timing & TOCTOU

The backstop's correctness depends on the snapshot being taken **before** the step begins and compared **after** it has fully stopped writing.

| Check | Criteria                                                                                                                                                                            | Remediation                                                                                                                                                                                                                                                                                               |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `captureWriteGuardSnapshot` runs before the pre-hook and before the step dispatches, and the diff runs only after the dispatch resolves (`executeStep`)                             | Trace the ordering; a snapshot taken mid-step misses earlier writes                                                                                                                                                                                                                                       |
| `[ ]` | Pre-hook and post-hook writes are accounted for: the pre-hook runs after the baseline, the post-hook after the diff                                                                 | A post-hook can write outside `.aidd` after the check has passed. Record whether that is intended                                                                                                                                                                                                         |
| `[ ]` | One baseline spans every retry attempt and any auto-fix run for the step                                                                                                            | Confirm a violation by an early attempt is still caught by the single diff at the end                                                                                                                                                                                                                     |
| `[ ]` | A detached run that keeps writing after the diff cannot slip a violating write past it                                                                                              | Confirm the run is terminal (not merely "no longer heartbeating") before the after-diff                                                                                                                                                                                                                   |
| `[ ]` | The before and after captures are of the **same** directory (`context.projectDir` for both)                                                                                         | Verify there is no cwd drift, including for a run executing in a per-run worktree                                                                                                                                                                                                                         |
| `[ ]` | Concurrent runs on the same project do not interleave snapshots (run A's writes attributed to run B's diff, or run B's revert discarding run A's legitimate work)                   | Cross-reference ORCHESTRATOR_CONCURRENCY.md; same-project concurrency is the risk                                                                                                                                                                                                                         |
| `[ ]` | **An edit the operator makes while a guarded run is in progress is not silently destroyed.** The diff attributes every status change since the baseline to the run, whoever made it | Read `revertOne` and `restoreCleanBaselinePath`: a path that was clean at baseline is checked out from the baseline commit, and a new file is deleted. Record whether anything tells the operator not to edit the checkout during a guarded run, and whether the failure message names the reverted paths |

---

## 5. Metadata Write Confinement

The allowlist is `METADATA_ALLOWLIST = ['.aidd']`, declared in `stepRunner.ts` and again in `metadataOnlyGuard.ts`; `autoFixRunner.ts` passes the same single entry to the run it starts. Membership is tested by `isPathAllowlisted` (`writeAllowlist.ts`), which normalizes separators and matches an exact entry or an `entry/` prefix, applied to the path git reports.

| Check | Criteria                                                                                                                       | Remediation                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A write to `.aidd/../src/x` cannot pass the allowlist: git reports the normalized path `src/x`                                 | Verify git's porcelain output is normalized so `isPathAllowlisted` sees `src/x` and rejects it                    |
| `[ ]` | A path named `.aiddx/...` or `.aidd-evil/...` does NOT match: `isPathAllowlisted` requires exact `.aidd` or an `.aidd/` prefix | Confirm the exact-or-prefix-with-slash comparison                                                                 |
| `[ ]` | The three declarations of the metadata allowlist agree                                                                         | A widened copy in one place is a finding                                                                          |
| `[ ]` | Matching is case-sensitive. On a case-insensitive filesystem, `.AIDD/x` is the same directory as `.aidd/x`                     | Confirm which way the mismatch fails. Rejecting `.AIDD/x` as a violation is the safe direction                    |
| `[ ]` | Symlinks inside `.aidd` pointing outside it do not let a write escape undetected                                               | Git tracks the link, not its target; confirm a write through the link shows as a dirty path outside `.aidd`       |
| `[ ]` | A path git ignores is invisible to `git status`, so a write to an ignored file outside `.aidd` is not detected                 | Record this as a known limit of a status-based guard, and list which ignored locations hold data worth protecting |

---

## 6. BREAK-THE-ASSUMPTION Scenarios

> **Mandatory.** Construct the case that would evade the controls and trace it through `shell-policy.ts`, `writeAllowlist.ts`, and `revert.ts` by hand, or drive it against a disposable scratch git repository with invented uncommitted changes. Never use a real checkout. Record what actually happened, not what the design intends.

1. **Destructive reset through the agent bash tool.** In a git project with uncommitted changes in `src/`, the agent issues `git reset --hard HEAD~5` through the `bash` tool.
    - `evaluateBashWorkspacePolicy` tests `DESTRUCTIVE_GIT_PATTERN` first; it matches; `checkBashWorkspacePolicy` returns the destructive-git ERROR; the command never runs.
    - **Expected: BLOCKED.** A finding here means the deny-list regressed: Critical.

2. **The same reset in a spelling the pattern does not match.** Repeat scenario 1 with each variant listed in Section 1.
    - **Expected: BLOCKED for every variant.** Each variant that is allowed is a finding with the exact string. State which other control, if any, would still catch the result.

3. **Destructive reset by an external CLI backend.** A run on `claude-code`, `codex`, `cline`, or `grok` issues `git reset --hard` through that CLI's own shell.
    - The deny-list is not in the path. Establish what is: was the run metadata-only or launched with `--write-allowlist` (guard armed), and was it in a per-run worktree?
    - **Expected: for a guarded run, DETECTED and the step FAILED, with the loss reported truthfully. For an unguarded coding run in the live tree, nothing in aidd detects it.** Record that residual plainly with the run types it covers.

4. **Destructive reset inside a metadata-only step.** The discard happens inside a guarded step.
    - Third pass of `diffWriteViolations` flags each baseline-dirty `src/` path as `destructivelyDiscarded`; `executeStep` fails the step.
    - **Expected: DETECTED and FAILED, with a message that says uncommitted work was discarded.** Confirm the file content after the revert: it is the committed version, not the operator's edits. A message claiming the writes were reverted is a finding.

5. **`git clean -fdx` wipes untracked scratch.**
    - Bash form: blocked by the `clean` arm of `DESTRUCTIVE_GIT_PATTERN`.
    - Guarded form: the untracked baseline paths vanish from the status and are flagged `destructivelyDiscarded`; the checkout from the baseline commit fails for a path that was never committed, so the path is returned as failed.
    - **Expected: BLOCKED (bash) / DETECTED and surfaced as an unrecovered loss (guarded).**

6. **A step that destroys work and then fails.** A guarded step discards operator work and its dispatch then returns not-ok.
    - **Expected: the diff still runs and the discard is reported.** If the diff is conditional on a successful dispatch, the discard is never reported: a finding.

7. **Non-git fail-open.** Point a metadata-only session at a directory that is not a git repository.
    - `launchRecipe` throws; if a path bypasses launch, `executeStep` fails the step on the null baseline.
    - **Expected: REFUSED at launch, and again at the step.**

8. **TOCTOU on a detached run.** Start the after-diff the instant the run is marked terminal while a slow detached child is still flushing a write to `src/late.ts`.
    - **Expected: the late write is CAUGHT**, or the diff demonstrably waits for true termination.

9. **History rewrite that diverges the tree.** Inside a step, `git commit --amend` or `git rebase` so the baseline HEAD is no longer an ancestor of HEAD.
    - `unwindCommittedViolations` refuses the mixed reset and `revertWriteViolations` returns the committed paths as failed.
    - **Expected: reported as UNRECOVERABLE, not force-reset.** The rewrite itself is not blocked: there is no code deny-list for amend, rebase, or filter-branch. Confirm the bail-out reports it.

For each: record the setup, the control branch with the live `file:line`, the observed disposition, the exact message shown to the operator, and whether the expected outcome held.

---

## 7. Surfaces Outside the Agent Tool

The deny-list governs one tool. These surfaces are outside it. Each caused, or can cause, loss of uncommitted work.

| Check | Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | **A CLI run against a live checkout.** The root `start` script runs the CLI (`cli/src/index.ts`) from the repository root. `assertProjectForRun` (`cli/src/preflight.ts`) requires `--project-dir`. A coding run then executes in the **live working tree** of that directory unless `--worktree` is passed (its default is `false`). Before any agent starts, `scaffoldProjectAssets` overwrites scaffolded files in the project with `force`, and `ensureMetadata` can install git hooks and stage them. Validate-mode runs skip the scaffold and the hook install. | Read `run` in `cli/src/app.ts` and confirm which steps are skipped for `plan.mode === 'validate'`. Confirm the only reset, checkout, or file removal aidd's own code issues on the project in this path is the guard's revert (`revertWriteViolations`, reached from `enforceWriteAllowlistForIteration` when `--write-allowlist` is set), and that a run without that flag issues none (absence claim: run the control). Apart from that revert, the loss mechanism is the agent run itself, in the live tree, on a backend the deny-list does not reach |
| `[ ]` | **Pointing a run at a checkout someone is working in**, including aidd's own repository, puts every uncommitted file in it at the mercy of the run. Nothing refuses a run whose target has uncommitted work, and nothing warns                                                                                                                                                                                                                                                                                                                                        | Record whether a dirty-tree warning or refusal exists at launch (CLI and web). Absence is a finding at Medium, or High where the default backend is an external CLI with a permission bypass. Until one exists the safe procedure is: isolate with a worktree, or run against a separate clone                                                                                                                                                                                                                                                            |
| `[ ]` | **Web-launched coding runs** execute in the project checkout unless `web.useWorktrees` is on (default off; see AGENT_TOOL_SANDBOX Section 7)                                                                                                                                                                                                                                                                                                                                                                                                                          | Record the resolved setting. With it off, a web-launched run has the same live-tree exposure as the CLI                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `[ ]` | **Completion recovery and metadata commits** stage and commit on the operator's branch (`git add -A -- <paths>` in `cli/src/orchestrator/run/completion-recovery.ts` and `metadata-commit.ts`)                                                                                                                                                                                                                                                                                                                                                                        | Confirm the staged set is limited to the paths the run names and cannot sweep in unrelated operator work. Staging is not destructive, but a commit of the operator's unfinished files is a loss of control over them                                                                                                                                                                                                                                                                                                                                      |
| `[ ]` | **Run-worktree cleanup** force-removes worktrees and deletes branches (`worktree remove --force`, `branch -D`, `update-ref -d` in `cli/src/orchestrator/run/worktree-manager.ts`; `reapRunWorktree` in `backend/src/services/run/worktreeReap.ts`)                                                                                                                                                                                                                                                                                                                    | Confirm every such call is addressed to a path and branch aidd created for that run, derived from the run id, and can never resolve to the operator's checkout or branch. Confirm a worktree holding unmerged work or unpersisted evidence is preserved, not removed                                                                                                                                                                                                                                                                                      |
| `[ ]` | **The control panel's own discard action.** `discardWorkingTreePaths` (`backend/src/services/git/workingTreeActions.ts`) unstages, restores, and force-cleans the paths the operator selected                                                                                                                                                                                                                                                                                                                                                                         | This is an operator action, destructive by design. Verify it acts only on the exact selected paths (the literal-pathspec option and the exact-match narrowing), refuses conflicted paths, sits behind the bearer-token guard, and that the UI asks for confirmation. No agent tool may reach this endpoint                                                                                                                                                                                                                                                |
| `[ ]` | **No autonomous force-push or history-rewrite path.** There is **no code deny-list** for `git push --force` or `-f`, `git commit --amend`, `git rebase`, `git filter-branch`, `git branch -D`, or `git stash`. The only controls are the prompt policy (`prompts/_common/forbidden-commands.md`) and, for committed violations in a guarded run, the ancestor bail-out                                                                                                                                                                                                | Verify no autonomous run or target-repository-authored prompt can reach a force-push. An autonomous force-push that rewrites a shared remote is Critical. A prompt instruction is not an enforcing implementation (AUDIT_METHODOLOGY Rule 1): record it as policy, not as a control                                                                                                                                                                                                                                                                       |
| `[ ]` | **Editor or tool behavior outside aidd.** An editor, IDE assistant, or second agent that snapshots, switches branches, or resets in the same checkout can discard in-flight work. This is environment behavior, not aidd code                                                                                                                                                                                                                                                                                                                                         | Record it as an environment hazard with its named mechanism and evidence, and the operating rule that mitigates it. Do not file a code finding against aidd for it                                                                                                                                                                                                                                                                                                                                                                                        |

> **Scope note**: the deliverable for this section is, per surface, either a confirmed control with its enforcing `file:line`, or a finding scoped to the specific script or path.

---

## Audit Checklist

### Critical Checks

- [ ] Destructive verbs (`git reset --hard`, `checkout .`, `restore .`, `clean -f...`) are DENIED by `DESTRUCTIVE_GIT_PATTERN` at the bash tool, tested first in `evaluateBashWorkspacePolicy`; no regression
- [ ] Every run type is mapped to the controls that reach it; the deny-list is not credited to external CLI backends
- [ ] Destructive discards in guarded runs are DETECTED (`diffWriteViolations`) and the step or iteration FAILS
- [ ] The operator is told uncommitted work was discarded; no message claims a restore that did not happen
- [ ] Non-git fail-open is closed at BOTH layers: launch refusal (`launchRecipe`) and step refusal (`executeStep`)
- [ ] A discard with no baseline commit, or of a path absent from the baseline commit, is reported as failed, not swallowed
- [ ] Force-push has no reachable autonomous path (policy-gated only; no code deny-list)

### High Priority Checks

- [ ] Deny-list spelling variants (Section 1) each tested; every allowed variant filed
- [ ] The after-step diff runs for failed dispatches too, and a `null` diff result is not treated as clean
- [ ] Porcelain parse handles renames, quoted and escaped paths, prefix strip, short-line skip (`gitStatusEntries`)
- [ ] Snapshot is before-step and after-terminal with no TOCTOU window (`executeStep`)
- [ ] Metadata writes confined to `.aidd` (exact or `.aidd/` prefix; `.aiddx/` is a violation)
- [ ] A run against a live checkout is isolated, refused, or warned about (Section 7)
- [ ] aidd's own force-removal and branch-deletion calls can only address run-owned worktrees and branches

### Medium Priority Checks

- [ ] Further corruption of an already-dirty file is recorded as a known limit of the status-based guard
- [ ] Concurrent same-project runs do not cross-attribute snapshots (see ORCHESTRATOR_CONCURRENCY.md)
- [ ] History rewrites (amend, rebase, filter-branch) are not preemptively blocked, but the ancestor bail-out reports them as unrecoverable instead of force-resetting a divergent tree
- [ ] The control panel's discard action is path-exact, confirmed, and unreachable by an agent

---

## Deliverables

### Required Outputs

1. Git-destructive-safety audit report in `.aidd/audit-reports/GIT_DESTRUCTIVE_SAFETY-YYYY-MM-DD.md`
2. A feature.json file under `.aidd/features/` for each finding requiring code changes
3. A completed coverage table: run type against deny-list, write-allowlist guard, and worktree isolation
4. A completed BREAK-THE-ASSUMPTION table with the observed outcome, the exact operator-facing message, and the live `file:line` evidence for each scenario
5. The known-positive control for every absence claim (for example "no code outside the listed places issues a destructive git command")

### Output Format

Each finding becomes a feature.json under `.aidd/features/audit-{audit_name_lower}-{unix_timestamp}-{descriptive-slug}/feature.json`, with `priority`/`auditSeverity` mapped per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) (Critical=1, High=2, Medium=3, Low=4), `category` = `"Audit"`, `auditSource` = `"GIT_DESTRUCTIVE_SAFETY"`, `passes` = `false`, and a `description` carrying the `file:line` evidence and the concrete destructive command or scenario observed. The `id` field MUST exactly match the feature directory name.

### Success Criteria

- [ ] The destructive-verb deny-list is confirmed firing for all four documented verb families, and every tested variant has a recorded verdict
- [ ] The destructive-discard detection is confirmed firing, and the truthfulness of the loss message is recorded
- [ ] The non-git fail-open is confirmed closed at both layers
- [ ] 0 reachable autonomous force-push or history-rewrite paths
- [ ] Every surface in Section 7 has a confirmed control or a scoped finding

## False Positives Considered and Rejected

This section is REQUIRED; if you found zero false-positive candidates, state that explicitly. Each row below is a disposition, and each needs its falsification record (AUDIT_METHODOLOGY Rule 2).

| Candidate                                                                                                                           | Disposition                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkBashWorkspacePolicy` returning an ERROR for `git reset --hard` and the other matched forms, "blocking legitimate git use"     | **Not a finding.** These verbs discard uncommitted operator work without a path argument and cannot be path-bounded. Denying them at the bash tool is the control                                                                                                                   |
| `captureWorktreeSnapshot` and `findMetadataViolations` in `metadataOnlyGuard.ts` still present                                      | **Not a finding as a second guard.** It is a path-membership view over the shared snapshot with no discard detection and no revert, and the step runner does not use it. Record its callers. Whether code with only test callers should exist is a question for the dead-code audit |
| `revertWriteViolations` returning committed paths as failed when the baseline HEAD is not an ancestor (`unwindCommittedViolations`) | **Not a finding.** A mixed reset against a non-ancestor would rewind to a divergent tree after an agent rebase or amend, so it refuses and reports the paths as failed. Reporting is the safe trade-off                                                                             |
| `captureWriteGuardSnapshot` returning `null` for a non-git project                                                                  | **Not a finding.** The safety property lives in the callers, which must refuse on `null`. Verify each caller (Section 2); the return value itself is not the gap                                                                                                                    |
| `unrevertedPaths` skipping `destructivelyDiscarded` and baseline-dirty paths                                                        | **Not a finding by itself.** There is no recorded content to compare against for those paths. It becomes a finding only where a message treats the unverified revert as a confirmed restore                                                                                         |
| External CLI backends launched with a permission-bypass flag                                                                        | **Not a finding in this audit.** It is how aidd runs those backends unattended. The finding, if any, is a report or a control that assumes the deny-list covers them. The bypass itself is assessed in AGENT_TOOL_SANDBOX                                                           |

---
title: 'Git-Destructive Safety & Metadata-Only Write-Boundary Audit'
last_updated: '2026-06-28'
version: '1.1'
category: 'Security'
priority: 'Critical'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Git-Destructive Safety Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation, falsify every "by design" rationale, never score from a green gate.

aidd's agent `bash` tool and managed-run pipeline can receive attempts to perform **git-destructive operations** in target repositories (`git reset --hard`, `git checkout .`, `git clean -fdx`, `git restore .`). Uncommitted operator work is at risk if those attempts reach git. This audit is a **regression guard** for the controls below and also covers destructive surfaces outside them.

Two software controls contain the agent-bash / pipeline surface:

1. The **destructive-verb deny-list**: `DESTRUCTIVE_GIT_PATTERN` (`shared/src/agent/tools/shell-policy.ts:74`) blocks `git reset --hard`, `git checkout .`, `git restore .`, and `git clean -f…` in any `bash`-tool command **before** it runs (`checkBashWorkspacePolicy`, `shell-policy.ts:85-87`). These verbs take no path argument and make the tree _cleaner_, so they require a verb-level guard in addition to the path allowlist.
2. The **write-allowlist guard with destructive-discard detection**: the managed (Project Intake) backstop snapshots the worktree before a step and diffs after (`captureWriteGuardSnapshot` / `diffWriteViolations`, `shared/src/pipeline/writeAllowlist.ts`). Beyond newly-dirty and newly-committed paths, it flags a **baseline-dirty path that became clean** as a `destructivelyDiscarded` violation (`writeAllowlist.ts:107-116`), then reverts it from baseline HEAD (`revertWriteViolations`, `writeAllowlist.ts:179-196`).

Verify that both the deny-list and discard detection **continue to fire**. Also inspect surfaces the deny-list does **not** cover: operator-run dev/launch scripts, force-push, and history rewrites.

## Executive Summary

**Critical Priorities (regression guards: these MUST stay green)**

- **Destructive verbs are denied at the bash tool.** `DESTRUCTIVE_GIT_PATTERN` (`shell-policy.ts:74`) must still match `git reset --hard`, `git checkout .`, `git restore .`, `git clean -f…`; `checkBashWorkspacePolicy` (`shell-policy.ts:77,85-87`) must still return an ERROR for them. A regression = a verb silently allowed through the agent tool = Critical.
- **Destructive discards are detected and reverted in the pipeline.** `diffWriteViolations` (`writeAllowlist.ts:72`) must still flag a baseline-dirty path that became clean as `destructivelyDiscarded` (`writeAllowlist.ts:107-116`), and `revertWriteViolations` (`writeAllowlist.ts:179-196`) must still restore it from baseline HEAD. A regression = a destructive reset passes a metadata-only step undetected = Critical.
- **Non-git fail-open is CLOSED at two layers.** A metadata-only launch on a non-git project is **refused at launch** (`launchService.ts:80-86`) and, defensively, a non-git baseline **fails the step** rather than running unguarded (`stepRunner.ts:56-66`). Confirm both refusals still fire; a regression re-opens the unguarded write path.

**Essential Standards**

- `git checkout .` / `restore .` cannot silently discard uncommitted operator work without a recovery path: the deny-list blocks the bash form; the discard detection + revert covers the pipeline form.
- Force-push is **policy-gated only** (no code deny-list); verify the operator gate, treat an autonomous force-push as a live finding.
- The before/after snapshots have no TOCTOU window that lets a violating write slip between snapshot and check.
- Metadata writes are confined to `.aidd` (`METADATA_ALLOWLIST = ['.aidd']`) and cannot be redirected out of it (`.aidd/../src`).
- **Operator-tooling surfaces outside agent-bash scope** (dev/launch/dogfood scripts, IDE auto-snapshot) are policed separately; see §7.

## Applicability & Scope

Applies to **agent-orchestration tools** (a target with an agent bash/file tool, a git-destructive run pipeline, and a multi-run state machine). **N/A for plain web apps: record N/A, do not flag absence.** A generic web app does not reset/clean/checkout a _target_ repository on the operator's behalf; the absence of a destructive-verb deny-list or a metadata-only guard is not a finding there. State the classification at the top of the report. (valley-app correctly recorded **N/A** for this audit: it is a plain web app and has no target-repo destructive surface; that disposition is the exemplary outcome, not an oversight.)

Within aidd this audit governs:

- `shared/src/agent/tools/shell-policy.ts`: `DESTRUCTIVE_GIT_PATTERN`, `checkBashWorkspacePolicy` (verb deny-list + path-bounding; it now bounds **verbs and paths**)
- `shared/src/pipeline/writeAllowlist.ts`: `captureWriteGuardSnapshot`, `diffWriteViolations` (incl. `destructivelyDiscarded` detection), `revertWriteViolations`, `METADATA_ALLOWLIST`
- `shared/src/pipeline/write-allowlist/git.ts`: `gitStatusEntries` (porcelain v1 parse: rename arrow, quoted-path unquote, XY-prefix strip), `committedPathsSince`
- `backend/src/services/pipeline/stepRunner.ts`: the managed-step caller: non-git refusal, diff + revert wiring
- `backend/src/services/pipeline/launchService.ts`: the launch-time non-git refusal
- `backend/src/services/pipeline/metadataOnlyGuard.ts`: legacy shim re-exporting the shared guard (back-compat for existing tests; **not** a second implementation to audit)

## Table of Contents

1. [Destructive-Verb Deny-List (regression guard)](#1-destructive-verb-deny-list)
2. [The Non-Git Fail-Open (now closed)](#2-the-non-git-fail-open)
3. [Destructive-Discard Detection & Revert (regression guard)](#3-destructive-discard-detection--revert)
4. [Snapshot Timing & TOCTOU](#4-snapshot-timing--toctou)
5. [Metadata Write Confinement](#5-metadata-write-confinement)
6. [BREAK-THE-ASSUMPTION Scenarios](#6-break-the-assumption-scenarios)
7. [Operator-Tooling Surfaces (outside agent-bash scope)](#7-operator-tooling-surfaces)

## Pre-Audit Setup

### Verification Commands

```bash
# Confirm the destructive-verb deny-list still exists and is applied in the bash policy
grep -n "DESTRUCTIVE_GIT_PATTERN\|checkBashWorkspacePolicy" shared/src/agent/tools/shell-policy.ts

# Confirm destructive-discard detection + revert are intact in the write-allowlist guard
grep -n "destructivelyDiscarded\|diffWriteViolations\|revertWriteViolations\|is-ancestor" shared/src/pipeline/writeAllowlist.ts

# Confirm the non-git fail-open is closed at BOTH layers (launch refusal + step refusal)
grep -n "isGitRepository\|not a git repository" backend/src/services/pipeline/launchService.ts
grep -n "guardBaseline === null\|refusing to run unguarded" backend/src/services/pipeline/stepRunner.ts

# Confirm no destructive git verb is issued autonomously anywhere in the pipeline / launcher,
# and check dev/launch/dogfood scripts that operate on the HOST repo (see §7)
grep -rn "reset --hard\|clean -fd\|checkout \.\|restore \.\|push --force\|push -f" backend/src shared/src cli/src scripts
```

---

## 1. Destructive-Verb Deny-List

`checkBashWorkspacePolicy` (`shell-policy.ts:77`) tests `DESTRUCTIVE_GIT_PATTERN` (`shell-policy.ts:74`) **first** and returns an ERROR string when it matches (`shell-policy.ts:85-87`), so a destructive git verb never reaches the agent's shell. The pattern matches `git reset --hard`, `git reset HEAD~N`, `git checkout .` / `git checkout -- .`, `git restore .` / `git restore -- .`, and `git clean -…f…`. These verbs take no path, so the verb-level deny-list is the enforcing control.

| Check | Criteria                                                                                                                                                                                                                              | Remediation                                                                                                                                                       |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `git reset --hard HEAD~5` via the agent `bash` tool is **denied**: `DESTRUCTIVE_GIT_PATTERN` (`shell-policy.ts:74`) matches and `checkBashWorkspacePolicy` returns an ERROR (`shell-policy.ts:85-87`)                                 | If it is NOT denied, the deny-list regressed (Critical). Restore the pattern + the early return.                                                                  |
| `[ ]` | `git clean -fdx` is denied (the `clean\s+-[a-z]*f[a-z]*` arm of the pattern matches `-fdx`, `-fd`, `-xf`, etc.)                                                                                                                       | Confirm flag-order variants still match; a `clean -f` slipping through is Critical                                                                                |
| `[ ]` | `git checkout .` / `git checkout -- .` / `git restore .` / `git restore -- .` are denied                                                                                                                                              | Confirm the `(?:--\s+)?\.` arm still covers the `-- .` form                                                                                                       |
| `[ ]` | The pattern is anchored so it fires mid-command (after `;`, `\|`, `&`, backtick, `(`, whitespace), not only at string start                                                                                                           | A chained `foo && git reset --hard` must still be caught; verify the `(?:^\|[\s;\|&(\`])` prefix                                                                  |
| `[ ]` | Quote-stripping does not blind the check: the policy strips quoted spans into `''`/`""` (`shell-policy.ts:79`) before testing; confirm a quoted `"git reset --hard"` argument to a denied subshell construct is independently blocked | Subshell/eval constructs are denied separately (`shell-policy.ts:92-99`); confirm a destructive verb hidden in `bash -c '…'` is caught by the construct deny-list |
| `[ ]` | Windows env-var forms (`%VAR%`, `$env:VAR`) for home references are handled by the same policy (`shell-policy.ts:16-17`)                                                                                                              | Optional: confirm the home-reference patterns cover `%USERPROFILE%`/`$env:USERPROFILE` so the deny-list is not bash-only                                          |

> **Auditor note**: the deny-list is the **primary** containment for the agent-bash surface. The discard detection (Section 3) is the **backstop** for the pipeline surface (where commands are not routed through `checkBashWorkspacePolicy`). Both must be green; neither alone covers both surfaces.

---

## 2. The Non-Git Fail-Open

The non-git fail-open is **CLOSED at two layers**, and this section is a regression check that both refusals still fire.

- **Layer 1: launch refusal.** A metadata-only pipeline launch on a non-git project is rejected before any step runs: `launchService.ts:80-86` throws `"Metadata-only pipeline sessions require a git repository for write-boundary enforcement; … is not a git repository."` when `isGitRepository(projectDir)` is false.
- **Layer 2: step refusal (defense-in-depth).** Even if a non-git project reaches step execution, `stepRunner.ts:52-66` captures the guard baseline and, when it is `null` for a metadata-only non-recipe step, **fails the step** with `"Metadata-only session cannot enforce the .aidd/ write boundary on a non-git project; refusing to run unguarded."` rather than proceeding.

`captureWriteGuardSnapshot` (`writeAllowlist.ts:41-47`) returns `null` for non-git projects (via `gitStatusEntries` returning `null`, `git.ts:25-49`), and callers must treat `null` as **refuse**.

| Check | Criteria                                                                                                                                | Remediation                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | A metadata-only launch on a non-git project is **refused at launch** (`launchService.ts:80-86`)                                         | If the throw is gone, the launch-level fail-open regressed (Critical)                                                                      |
| `[ ]` | A non-git baseline (`guardBaseline === null`) **fails the metadata-only step** (`stepRunner.ts:56-66`), never proceeding unguarded      | If the step proceeds on a null baseline, the step-level fail-open regressed (Critical)                                                     |
| `[ ]` | A transient `git status` failure on a _git_ project (corrupt index, permissions) is not confused with "non-git" and silently downgraded | `gitStatusEntries` returns `null` on any non-zero exit (`git.ts:34`); confirm the refusal is acceptable-safe (fails closed) for both cases |
| `[ ]` | The refusal is surfaced to the operator (step `failed` with the explicit message), not silent                                           | Confirm the `errorMessage` reaches the run/step record                                                                                     |

> Both refusals must fail **closed**. Treat a regression in either layer as a finding.

---

## 3. Destructive-Discard Detection & Revert

The pipeline backstop catches the case the deny-list does not see (writes not routed through the bash policy): a destructive op that makes a **baseline-dirty path become clean**. `diffWriteViolations` (`writeAllowlist.ts:72`) iterates the baseline entries and, for any baseline path that is no longer in the current status and is not allowlisted, records a `destructivelyDiscarded` violation (`writeAllowlist.ts:107-116`). `revertWriteViolations` (`writeAllowlist.ts:179-196`) then restores that path from the baseline HEAD via `git checkout <baseline.head> -- <path>`. `stepRunner.ts:120-148` wires the diff + revert and fails the step (the violation verb is reported as `"destructively modified"` when any violation is `destructivelyDiscarded`, `stepRunner.ts:138-139`).

| Check | Criteria                                                                                                                                                                                     | Remediation                                                                                                          |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A baseline-dirty non-`.aidd` path that became clean is flagged `destructivelyDiscarded` (`writeAllowlist.ts:107-116`)                                                                        | If the loop is gone, a `git reset --hard` in the pipeline passes undetected (Critical)                               |
| `[ ]` | The metadata-only step **fails** on a non-empty violation list and the revert runs (`stepRunner.ts:130-147`)                                                                                 | If the caller logs but proceeds, the backstop is decorative (Critical)                                               |
| `[ ]` | `revertWriteViolations` **restores** discarded content from baseline HEAD (`writeAllowlist.ts:188-194`), not merely deletes it                                                               | Confirm the `git checkout <baseline.head> -- <path>` branch runs for `destructivelyDiscarded` violations             |
| `[ ]` | A discard with **no baseline commit** (`!baseline.head`) is reported `failed`, not silently swallowed (`writeAllowlist.ts:184-186`)                                                          | The path is pushed to `failed[]` and surfaced in the step error; confirm it is not dropped                           |
| `[ ]` | Committed violations are unwound only when baseline HEAD is still an ancestor (is-ancestor bail-out, `writeAllowlist.ts:142-151`)                                                            | This is the partial mitigation for history rewrites (see Section 6 / §7); do NOT flag the bail-out itself            |
| `[ ]` | Porcelain parse is sound: renames take the post-arrow path (`git.ts:40-41`), quoted paths are unquoted (`git.ts:42`), XY prefix stripped (`git.ts:38-39`), short lines skipped (`git.ts:37`) | Verify `R  a -> b` records `b`; `"has space.ts"` records `has space.ts`; `?? path` / ` M path` / `A  path` all parse |

> **Auditor note**: detection and revert are **separate** failure points. A green detection with a broken revert still loses operator work; verify the restore actually puts the content back (drive it against a scratch repo, Section 6).

---

## 4. Snapshot Timing & TOCTOU

The backstop's correctness depends on the snapshot being taken **before** the step begins and diffed **after** it terminalizes, with the step's writes fully flushed.

| Check | Criteria                                                                                                                                                | Remediation                                                                             |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `[ ]` | `captureWriteGuardSnapshot` runs before the managed step dispatches, and the diff runs only after the dispatch resolves (`stepRunner.ts:52-55,120-129`) | Trace the ordering; a snapshot taken mid-step misses pre-snapshot writes                |
| `[ ]` | A detached run that keeps writing after the diff cannot slip a violating write past it                                                                  | Confirm the run is terminal (not merely "no longer heartbeating") before the after-diff |
| `[ ]` | The before/after captures are of the **same** worktree path (`context.projectDir` for both, `stepRunner.ts:54,127`)                                     | Verify `projectDir` is identical for both calls; no cwd drift                           |
| `[ ]` | Concurrent runs on the same target do not interleave snapshots (run A's writes attributed to run B's diff)                                              | Cross-reference ORCHESTRATOR_CONCURRENCY.md; same-project concurrency is the risk       |

---

## 5. Metadata Write Confinement

The allowlist is `METADATA_ALLOWLIST = ['.aidd']` (`stepRunner.ts:17`, mirrored by the shim's `METADATA_ALLOWLIST` in `metadataOnlyGuard.ts:17`). Membership is tested by `isPathAllowlisted` (`writeAllowlist.ts:56-62`), which normalizes separators and matches either an exact entry or an `entry/` prefix, applied to the _porcelain path_ git reports.

| Check | Criteria                                                                                                                                | Remediation                                                                                                                                |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | A write to `.aidd/../src/x` cannot pass the allowlist: git normalizes the porcelain path, so it reports `src/x`, not `.aidd/../src/x`   | Verify git's porcelain output is already normalized (it is) so `isPathAllowlisted` (`writeAllowlist.ts:56-62`) sees `src/x` and rejects it |
| `[ ]` | A file literally named `.aiddx/...` or `.aidd-evil/...` does NOT match: `isPathAllowlisted` requires exact `.aidd` or a `.aidd/` prefix | Confirm `normalized === allow \|\| normalized.startsWith(`${allow}/`)` (`writeAllowlist.ts:60`) so `.aiddx/` is correctly a violation      |
| `[ ]` | Symlinks inside `.aidd` pointing outside it do not let a write escape the boundary undetected                                           | git tracks the symlink itself, not its target; confirm a write _through_ the symlink shows up as a dirty path outside `.aidd`              |

---

## 6. BREAK-THE-ASSUMPTION Scenarios

> **Mandatory.** Construct the interleaving that _would_ evade the controls and trace it through `shell-policy.ts` and `writeAllowlist.ts` by hand (or drive it against a scratch git repo with uncommitted operator changes). Post-remediation the expected outcome **flips**: each scenario MUST be **caught**. A scenario that destroys uncommitted operator work without detection or recovery is a **regression finding**: it means the deny-list or the discard detection stopped firing.

1. **Destructive reset via the agent bash tool (was the headline gap)**: In a git project with uncommitted operator changes in `src/`, have the agent issue `git reset --hard HEAD~5` through the `bash` tool.
    - `checkBashWorkspacePolicy` (`shell-policy.ts:77`): `DESTRUCTIVE_GIT_PATTERN` (`shell-policy.ts:74`) matches → returns the destructive-git ERROR (`shell-policy.ts:85-87`) → the command **never runs**.
    - **Expected: BLOCKED.** Operator `src/` work is untouched. A finding here means the deny-list regressed (verb dropped or early-return removed): Critical.

2. **Destructive reset inside a managed pipeline step (backstop path)**: Same setup, but the discard happens inside a metadata-only step (not routed through the bash policy).
    - `diffWriteViolations` (`writeAllowlist.ts:72`): the reset makes baseline-dirty `src/` paths clean → the destructive-detection loop (`writeAllowlist.ts:107-116`) flags each as `destructivelyDiscarded`.
    - `stepRunner.ts:130-147`: the step **fails** ("destructively modified outside .aidd/") and `revertWriteViolations` (`writeAllowlist.ts:188-194`) restores the paths from baseline HEAD.
    - **Expected: DETECTED + REVERTED.** A finding means the discard detection or the revert regressed: Critical.

3. **`git clean -fdx` wipes untracked scratch**: same setup, `git clean -fdx`.
    - Bash form: blocked by the `clean\s+-[a-z]*f[a-z]*` arm of `DESTRUCTIVE_GIT_PATTERN` (`shell-policy.ts:74`).
    - Pipeline form: untracked baseline paths vanish from the status → flagged `destructivelyDiscarded` (`writeAllowlist.ts:107-116`); restore is attempted from baseline HEAD (untracked-at-baseline paths with no commit are reported `failed`, `writeAllowlist.ts:184-186`; confirm the loss is surfaced, not swallowed).
    - **Expected: BLOCKED (bash) / DETECTED + surfaced (pipeline).**

4. **Non-git fail-open**: point a metadata-only session at a directory that is **not** a git repo.
    - `launchService.ts:80-86` throws at launch; if a path bypasses launch, `stepRunner.ts:56-66` fails the step on the null baseline.
    - **Expected: REFUSED at launch (and again at the step).** A finding means one of the two refusals regressed.

5. **TOCTOU on a detached run**: start the after-diff the instant the run is marked terminal, but have the (slow) detached child still flushing a write to `src/evil.ts`. Confirm the diff waits for true termination, not just a missing heartbeat, so the late write is still captured.
    - **Expected: late write CAUGHT** (or the diff demonstrably waits for terminal state).

6. **History rewrite that diverges the tree**: inside a step, `git commit --amend` / `git rebase` such that baseline HEAD is no longer an ancestor of HEAD.
    - `revertWriteViolations` is-ancestor bail-out (`writeAllowlist.ts:142-151`) refuses the mixed reset and returns all committed paths as **failed** rather than force-resetting a divergent tree.
    - **Expected: reported as UNRECOVERABLE (failed), not force-reset.** This is the _partial_ mitigation: the rewrite is not preemptively blocked (no code deny-list for amend/rebase/filter-branch); confirm the bail-out reports it rather than corrupting history. See §7 and Section 3.

For each: record the setup, the relevant control branch with `file:line`, the observed disposition, and whether the **expected** (now: caught / refused / reverted) outcome held.

---

## 7. Operator-Tooling Surfaces

The deny-list (`shell-policy.ts`) only governs the **agent `bash` tool**. It does **not** cover dev/launch/dogfood scripts that an operator runs directly, nor IDE behavior. These surfaces caused real data-loss incidents and are recorded here so they are not re-discovered each cycle.

| Check | Criteria                                                                                                                                                                                                                                                                                                                                                                           | Remediation                                                                                                                                                                                                                                                                                                                                                                   |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | **Dev/launch scripts vs. the host repo.** `bun run start` (root `package.json:115` → `cli/src/index.ts`) scaffolds/launches against the target; dogfooding aidd on its own repo can git-reset the worktree, discarding commits + uncommitted edits. The `DESTRUCTIVE_GIT_PATTERN` deny-list does **not** apply to these scripts.                                                   | Grep launch/dogfood/preview-launcher + scaffolding paths for destructive git against the HOST repo (`grep -rn "reset --hard\|checkout \.\|git clean" cli/src scripts`). If a dev script can reset the live worktree, gate it (refuse when the target IS the aidd repo, or stash first). Until then: verify with headless gates only, never `bun run start` against this repo. |
| `[ ]` | **Recovery from a launch-time discard.** When dogfooding resets the worktree, recovery is manual (`git merge --ff-only` to recover commits)                                                                                                                                                                                                                                        | Confirm there is an operator-visible warning before a dev script touches the host worktree; absence is a Medium usability/safety gap                                                                                                                                                                                                                                          |
| `[ ]` | **IDE auto-snapshot (Windsurf/Cascade).** The IDE's auto-snapshot can check `master` out over the active branch mid-edit, clobbering in-flight git work. This is **environment behavior, not aidd code.**                                                                                                                                                                          | **Record N/A-for-code (ENVIRONMENT-mitigated):** close Windsurf before multi-file git work in this repo. Do not file a code finding; note the mitigation so it is not re-investigated.                                                                                                                                                                                        |
| `[ ]` | **No autonomous force-push / history-rewrite path.** There is **no code deny-list** for `git push --force` / `-f`, `git commit --amend`, `git rebase`, `git filter-branch`; only prompt policy ("Forbidden unless explicitly authorized", e.g. `cli/src/prompts/snapshots/*.md:230`) plus the is-ancestor bail-out (`writeAllowlist.ts:142-151`) as a partial pipeline mitigation. | Verify no autonomous run or target-repo-authored prompt can reach a force-push. An autonomous force-push that rewrites a shared remote is Critical. History rewrites: confirm they are reported (is-ancestor bail-out) rather than force-resetting a divergent tree; do not force a preemptive block as a finding unless an autonomous path is shown reachable.               |

> **Scope note**: §7 incidents are **outside** the agent-bash containment by design. The deliverable for this section is either a confirmed mitigation (operator gate / environment workaround recorded) or a finding scoped to the specific script/path that can touch the host repo.

---

## Audit Checklist

### Critical Checks 🚨

- [ ] Destructive verbs (`git reset --hard`, `checkout .`, `restore .`, `clean -f…`) are DENIED by `DESTRUCTIVE_GIT_PATTERN` at the bash tool (`shell-policy.ts:74,85-87`); no regression
- [ ] Destructive discards in the pipeline are DETECTED (`writeAllowlist.ts:107-116`) and REVERTED (`writeAllowlist.ts:179-196`); the step fails on them (`stepRunner.ts:130-147`)
- [ ] Non-git fail-open is closed at BOTH layers: launch refusal (`launchService.ts:80-86`) and step refusal (`stepRunner.ts:56-66`)
- [ ] A destructive discard with no baseline commit is reported `failed`, not silently swallowed (`writeAllowlist.ts:184-186`)
- [ ] Force-push has no reachable autonomous path (policy-gated only; no code deny-list)

### High Priority Checks ⚠️

- [ ] Porcelain parse handles renames, quoted paths, XY-prefix strip, short-line skip (`git.ts:37-44`)
- [ ] Snapshot is before-step / after-terminal with no TOCTOU window (`stepRunner.ts:52-55,120-129`)
- [ ] Metadata writes confined to `.aidd` (exact-or-`.aidd/`-prefix; `.aiddx/` correctly a violation, `writeAllowlist.ts:56-62`)
- [ ] Dev/launch/dogfood scripts vs. the host repo are gated or warned (§7); the deny-list does not cover them

### Medium Priority Checks 📋

- [ ] Pre-existing dirt does not mask further corruption of an already-dirty file (`writeAllowlist.ts:81`)
- [ ] Concurrent same-project runs do not cross-attribute snapshots (see ORCHESTRATOR_CONCURRENCY.md)
- [ ] History rewrites (amend/rebase/filter-branch) are not preemptively blocked, but the is-ancestor bail-out reports them as unrecoverable (`failed`) rather than force-resetting a divergent tree (`writeAllowlist.ts:142-151`)

---

## Deliverables

### Required Outputs

1. Git-destructive-safety audit report in `.aidd/audit-reports/GIT_DESTRUCTIVE_SAFETY-YYYY-MM-DD.md`
2. A feature.json file under `.aidd/features/` for each finding (i.e. each **regression** or each uncovered operator-tooling surface) requiring code changes
3. A completed BREAK-THE-ASSUMPTION table confirming each scenario is caught/refused/reverted with exact `file:line` evidence (or documenting the regression if it is not)

### Output Format

Each finding becomes a feature.json under `.aidd/features/audit-{audit_name_lower}-{unix_timestamp}-{descriptive-slug}/feature.json`, with `priority`/`auditSeverity` mapped per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) (Critical=1, High=2, Medium=3, Low=4), `category` = `"Audit"`, `auditSource` = `"GIT_DESTRUCTIVE_SAFETY"`, `passes` = `false`, and a `description` carrying the `file:line` evidence and the concrete destructive command or scenario observed. The `id` field MUST exactly match the feature directory name.

### Success Criteria

- [ ] The destructive-verb deny-list is confirmed firing for all four verb families (or the regression is filed)
- [ ] The destructive-discard detection + revert is confirmed firing (or the regression is filed)
- [ ] The non-git fail-open is confirmed closed at both layers
- [ ] 0 reachable autonomous force-push / history-rewrite paths
- [ ] Operator-tooling surfaces (§7) are each mitigated (recorded) or filed as a scoped finding

## False Positives Considered and Rejected

This section is REQUIRED; if you found zero false-positive candidates, state that explicitly. Common candidates: pre-existing dirt skipped by the `baseline.entries.get(path) === status` continue (intentional baseline exclusion, `writeAllowlist.ts:81`); the legacy shim re-exports (back-compat, not dead code); the is-ancestor bail-out (intentional, not a missing-revert finding).

| Candidate                                                                                                                                                   | Disposition                                                                                                                                                                                                                                                                                                                           |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `checkBashWorkspacePolicy` returning an ERROR for `git reset --hard` etc. (`shell-policy.ts:85-87`) "blocking legitimate git use"                           | **Not a finding.** The deny-list is behaving exactly as designed: these verbs discard uncommitted operator work without a path argument and cannot be path-bounded. Denying them at the bash tool is the control, not a bug.                                                                                                          |
| `findMetadataViolations` / `captureWorktreeSnapshot` and the `metadataOnlyGuard.ts` shim still present (`metadataOnlyGuard.ts:1-7,26-48`)                   | **Not a finding.** The shim is a ~55-line back-compat layer re-exporting the shared guard (`aidd-shared/pipeline/writeAllowlist`) so existing tests (e.g. `test/backend/web-pipeline-metadata-guard.test.ts`) keep passing. It is NOT a second implementation or dead code to flag; the canonical logic lives in `writeAllowlist.ts`. |
| `revertWriteViolations` returning committed paths as `failed` instead of reverting them when baseline HEAD is not an ancestor (`writeAllowlist.ts:142-151`) | **Not a finding.** This is the intentional is-ancestor bail-out: a mixed reset against a non-ancestor would rewind to a divergent tree (corrupting history after an agent rebase/amend), so it refuses and reports the paths as failed. Reporting-rather-than-corrupting is the safe trade-off, not a missing revert.                 |
| `captureWriteGuardSnapshot` returning `null` for a non-git project (`writeAllowlist.ts:46`)                                                                 | **Not a finding.** The `null` return is by design; the safety property lives in the callers, which now **refuse** on `null` (launch: `launchService.ts:80-86`; step: `stepRunner.ts:56-66`) rather than proceeding unguarded. The return value itself is not the gap.                                                                 |

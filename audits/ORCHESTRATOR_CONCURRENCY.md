---
title: 'Director Orchestrator Concurrency & State-Machine Audit'
last_updated: '2026-06-28'
version: '1.1'
category: 'Reliability'
priority: 'High'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Orchestrator Concurrency Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation, falsify every "by design" rationale, never score from a green gate.

The **director** drives a cycle state machine that spawns and reconciles concurrent runs. Each cycle either resolves via a fast direct-AI path or falls back to a **detached** CLI run whose lifetime the web process does not own. Runs persist to a single SQLite database guarded by a single-writer advisory lock. This audit hunts the concurrency failure modes that emerge from this design: **double-spawn** of the same work, **lost transitions**, **stranded/orphaned runs** after a crash, **unbounded concurrency**, and **mid-cycle crash corruption**.

The recurring structural risk: a guard that is **check-then-act** against the database (read a count or a status, then insert/spawn) is a TOCTOU window unless the check and the act are one serialized transaction. The closure for every such gap is the same and specific: the atomic write must be a command in `db/commands.ts` / `db/commands/*` that runs inside the DB **worker's** `db.transaction()` (wrapped in `withSqliteRetry`); see `db/commands.ts:33-57`, where `insertRunIfUnderCeiling` and `persistCycleResult` are both transaction-wrapped. An inline `db.transaction()` at a call site is NOT acceptable (the backend SQLite lives in a Bun worker; a call-site transaction runs on the wrong connection; see the web-DB-worker architecture). This audit verifies each invariant against the actual scheduler/executor/reconcile/persistence code, not against the comment that asserts it.

## Executive Summary

**Critical Priorities**

- **No double-spawn**: a feature/suggestion cannot be launched twice (e.g. `launch_suggestion` + `run_cycle`, or a suggestion launched while already `launched`) for the same project concurrently. Verify the compare-and-set claim in `suggestionService.ts:113-117` holds under race.
- **Max-concurrency bound holds under race**: the count read and row insert must be **one** worker transaction in `insertRunIfUnderCeiling` (`run/launch.ts:193-223`, `db/commands/runCeiling.ts:19-59`), with the per-project ceiling (`maxConcurrentRunsPerProject`) enforced in the same transaction.
- **Restart reconciliation is deterministic**: orphaned/detached runs and stale `running` cycles re-attach or fail cleanly on boot (`cycleReconcile.ts`), never resurrect as zombies.
- **Single-writer invariant**: the writer lock (`db/writerLock.ts`) prevents a second backend from interleaving writes against the same data dir.
- **Transactional persistence**: a mid-cycle crash leaves no half-written cycle (`cyclePersistence.persistCycleResult` runs suggestion inserts + terminal update in one transaction).

**Essential Standards**

- Stop/kill vs natural-completion does not leave a zombie heartbeat or a frozen activity state.
- Scheduled, manual, and chat-triggered cycles never stack: every entry point starts through one atomic idle gate.
- Detached runs survive a restart via the heartbeat watcher, with exactly-once reconciliation.

## Applicability & Scope

Applies to **agent-orchestration tools** (a target with an agent bash/file tool, a git-destructive run pipeline, and a **multi-run state machine**). **N/A for plain web apps: record N/A, do not flag absence.** A generic web app has request/response concurrency but no cycle state machine spawning detached agent runs and reconciling them across restarts; the absence of a director, a writer lock, or run reconciliation is not a finding there. State the classification at the top of the report.

Within aidd this audit governs:

- `backend/src/services/director/cycleService.ts`: `beginCycle`, `runCycle`, `startCycle`, `startScheduledCycle`
- `backend/src/db/commands/directorCycles.ts`: `startDirectorCycleIfIdle` (the atomic idle gate every cycle entry point goes through)
- `backend/src/services/director/cycleExecutor.ts`: `executeCycle`, `runDirectCycle`, `awaitAndPersistCycle`, `advanceCycle`, `waitForCycleRun`
- `backend/src/services/director/cycleReconcile.ts`: `reconcileStaleCycles`
- `backend/src/services/director/cyclePersistence.ts`: `persistCycleResult`, `failCycle`, `findCycleRun`
- `backend/src/services/director/suggestionService.ts`: `launchSuggestion` (the compare-and-set claim)
- `backend/src/services/run/launch.ts`: `launchRun` (the atomic count+insert gate)
- `backend/src/db/commands/runCeiling.ts`: `insertRunIfUnderCeiling` (global + per-project ceiling, one transaction)
- `backend/src/services/run/queries.ts`: `countNonTerminalRuns`
- `backend/src/services/run/ledgerReconcile.ts`: `readLedgerRunIds`, `dropLedgerPhantomRuns` (runs.jsonl ledger cross-check)
- `backend/src/services/run/control.ts`: `stopRun`, `killRun`
- `backend/src/db/commands.ts`: the DB-worker transaction facade (`createInProcessCommands`)
- `backend/src/db/writerLock.ts`: `acquireWriterLock`

## Table of Contents

1. [Single-Writer & Transaction Atomicity](#1-single-writer--transaction-atomicity)
2. [Double-Spawn Prevention](#2-double-spawn-prevention)
3. [Max-Concurrency Bound](#3-max-concurrency-bound)
4. [Stop/Kill vs Natural Completion](#4-stopkill-vs-natural-completion)
5. [Restart Reconciliation](#5-restart-reconciliation)
6. [Mid-Cycle Crash Durability](#6-mid-cycle-crash-durability)
7. [BREAK-THE-ASSUMPTION Scenarios](#7-break-the-assumption-scenarios)

## Pre-Audit Setup

### Verification Commands

```bash
# The single-writer advisory lock — its scope is per-process startup, not per-transaction
grep -n "acquireWriterLock\|heldLocks\|writeLockExclusive\|isProcessAlive\|wx" backend/src/db/writerLock.ts

# The max-concurrency gate (now ONE transaction: count + insert + per-project ceiling)
grep -n "insertRunIfUnderCeiling\|maxConcurrentRuns\|maxConcurrentRunsPerProject" backend/src/services/run/launch.ts backend/src/db/commands/runCeiling.ts

# Confirm the atomic write is a worker-transaction command, not an inline call-site db.transaction()
grep -n "insertRunIfUnderCeiling\|persistCycleResult\|db.transaction" backend/src/db/commands.ts

# Suggestion launch — verify the compare-and-set claim (pending -> launching) before spawn
grep -n "launchSuggestion\|status, 'pending'\|status: 'launching'\|launchedRunId" backend/src/services/director/suggestionService.ts

# runs.jsonl ledger cross-check — the append-only ledger is the authoritative terminal-run set
grep -n "readLedgerRunIds\|dropLedgerPhantomRuns\|runs.jsonl" backend/src/services/run/ledgerReconcile.ts backend/src/services/run/historyQueries.ts

# The cycle idle gate every entry point goes through
grep -n "startDirectorCycleIfIdle\|status, 'running'" backend/src/db/commands/directorCycles.ts backend/src/services/director/cycleService.ts

# Restart reconciliation of stale 'running' cycles
grep -n "reconcileStaleCycles\|awaitAndPersistCycle\|failCycle\|orphaned" backend/src/services/director/cycleReconcile.ts

# Transactional persistence of cycle results
grep -n "persistCycleResult\|withSqliteRetry\|one transaction\|atomically" backend/src/services/director/cyclePersistence.ts
```

---

## 1. Single-Writer & Transaction Atomicity

`acquireWriterLock` (`db/writerLock.ts:138`) is an **advisory** sidecar-file lock recording the owning pid; it is acquired on startup and released on shutdown, with stale-lock self-heal (`db/writerLock.ts:189-194`). The `heldLocks` in-process registry (`db/writerLock.ts:24`) rejects a same-process double-acquire that the on-disk check alone could not distinguish from a stale leftover (`db/writerLock.ts:142-147`).

| Check | Criteria                                                                                                                                                                                                                                                                                                                | Remediation                                                                                                                       |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Exactly one backend can hold the writer lock: `writeLockExclusive` uses `flag: 'wx'` (atomic create-or-fail, `db/writerLock.ts:121-126`)                                                                                                                                                                                | Verify the `EEXIST` branch (`db/writerLock.ts:129`) is the race-resolution primitive                                              |
| `[ ]` | A second backend pointed at the same data dir is rejected with a fatal error, not silently allowed to interleave writes (`db/writerLock.ts:174-188`)                                                                                                                                                                    | Confirm a live-holder pid (different pid, `isProcessAlive`, corroborated host + startedAt) throws                                 |
| `[ ]` | A crashed backend's stale lock self-heals: dead holder or reused pid is reclaimed (`db/writerLock.ts:189-194`)                                                                                                                                                                                                          | Verify the reclaim path does not race two reclaimers into both acquiring                                                          |
| `[ ]` | The lock guards the **process**, not individual transactions; verify that within the one writer, the cycle/run writes that MUST be atomic use an actual transaction, not just the lock                                                                                                                                  | The writer lock does NOT serialize check-then-act inside the process; Sections 2-3 depend on this distinction                     |
| `[ ]` | Each atomic write is a **command** in `db/commands.ts` / `db/commands/*` run inside the **worker's** `db.transaction()` (`db/commands.ts:33-57`), NEVER an inline `db.transaction()` at a call site: the backend SQLite runs in a Bun worker, so a call-site transaction runs on the wrong connection and is not atomic | Grep call sites for `db.transaction(`; any outside `db/commands*` is a finding. The TOCTOU fix belongs in a worker command - High |
| `[ ]` | `persistCycleResult` commits suggestion inserts and the terminal cycle update in **one** transaction: the command `commands/cycles.ts:8-46` retires prior suggestions, inserts the batch, and updates the cycle row, wrapped at `db/commands.ts:39`                                                                     | If the inserts and the update can commit separately, a crash between them corrupts cycle state - High                             |
| `[ ]` | `withSqliteRetry` wraps the write so a transient `SQLITE_BUSY` retries rather than dropping the write (`cyclePersistence.ts:178`)                                                                                                                                                                                       | Confirm retry wrapping on every cycle/run write                                                                                   |

---

## 2. Double-Spawn Prevention

The same logical work can be triggered through multiple entry points: `launch_suggestion`, `launch_run`, `run_cycle` (dispatcher at `director/chatAgentTools/dispatch.ts:109,124,147`), and the built-in Director scheduled task. The suggestion path is guarded by an atomic compare-and-set claim, and every cycle entry point now goes through one atomic idle gate; the cross-entry window below still warrants verification.

| Check | Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Remediation                                                                                                                                                                                                                                                                                                                                                                                                                             |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | `launchSuggestion` (`suggestionService.ts:95`) **atomically claims** the suggestion before spawning: `UPDATE suggestions SET status='launching' WHERE id=? AND status='pending' RETURNING id` (`suggestionService.ts:113-117`). The loser of a race updates zero rows and throws (`suggestionService.ts:118-122`); a spawn failure after the claim releases the row back to `pending` (`suggestionService.ts:132-135`). Lifecycle is `pending → launching → launched` (the `launched` write at `suggestionService.ts:139-142`; an orphaned `launching` is later swept by `persistCycleResult`, `commands/cycles.ts:18-21`) | **Verify the CAS holds**: two concurrent `launch_suggestion` calls both read the row as `pending` (`suggestionService.ts:96-98`), but only the caller whose conditional update flips `pending → launching` reaches `launchRun` (`suggestionService.ts:126`); exactly one run is spawned. Falsify by tracing both interleavings; this race is closed unless the `WHERE status='pending'` predicate is missing or the claim is non-atomic |
| `[ ]` | A suggestion launched via `launch_suggestion` and the same work launched via `launch_run` cannot both run for the same project concurrently                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | There is no cross-entry dedupe keyed on feature/project; confirm whether duplicate concurrent runs on one feature are possible (likely finding)                                                                                                                                                                                                                                                                                         |
| `[ ]` | A scheduled Director occurrence does not stack with a manually-triggered `run_cycle` or `startCycle`: every entry point inserts its cycle row through `startDirectorCycleIfIdle` (`db/commands/directorCycles.ts:17-31`), which reads the `running` row and inserts in one transaction (`cycleService.ts:184-205`)                                                                                                                                                                                                                                                                                                         | Verify the read and the insert share a transaction and that no caller inserts a cycle row outside the command. The loser is a 409 on the manual paths (`cycleService.ts:116,131`) and a `skipped` occurrence on the scheduled path (`cycleService.ts:150-152`)                                                                                                                                                                          |
| `[ ]` | `run_cycle` itself cannot start two cycles from two simultaneous chat tool calls in the same session                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Trace `startCycle` (`cycleService.ts:129`) through the same idle gate; the second call is refused with `CYCLE_ALREADY_RUNNING` rather than spawning                                                                                                                                                                                                                                                                                     |

---

## 3. Max-Concurrency Bound

`launchRun` (`run/launch.ts:65`) enforces the bound through `insertRunIfUnderCeiling` (`run/launch.ts:193-223`), a **single** worker transaction that counts non-terminal runs and inserts the new row only if the count is under the ceiling (`db/commands/runCeiling.ts:19-59`). There is no standalone `countNonTerminalRuns` gate (a separate read before the insert); `countNonTerminalRuns` (`run/queries.ts:72`) serves only read-path callers. The command rejects with `{ kind: 'rejected', scope }` and `launchRun` throws (`run/launch.ts:224-230`).

| Check | Criteria                                                                                                                                                                                                                                                                                                                                                                                                                            | Remediation                                                                                                                                                                                                                                                                                                                                                                                |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | A spawn is refused when the bound is reached: `insertRunIfUnderCeiling` returns `rejected` and `launchRun` throws (`run/launch.ts:224-230`, `runCeiling.ts:29-36`)                                                                                                                                                                                                                                                                  | Verify the throw fires and no row is created; the spawned child is killed in the catch (`run/launch.ts:240-262`)                                                                                                                                                                                                                                                                           |
| `[ ]` | **TOCTOU CLOSED**: the count read and the row insert are now **one** transaction: `insertRunIfUnderCeiling` runs `SELECT count(...)` then conditionally `INSERT` inside the worker's `db.transaction(... { behavior: 'immediate' })` (`db/commands.ts:35-36`, `runCeiling.ts:23-58`). Two parallel `launchRun` calls serialize on the immediate transaction, so neither can observe a stale `N-1` and overshoot `maxConcurrentRuns` | **Verify the atomic count+insert**: trace that the count and insert cannot interleave (immediate-mode write transaction on the single worker connection). Falsify by checking no caller still counts then inserts separately, and that `launch.ts` does not bypass the command                                                                                                             |
| `[ ]` | **Per-project ceiling**: the same transaction also rejects when non-terminal runs for `projectPath` reach `maxConcurrentRunsPerProject` (`runCeiling.ts:39-57`, default `2`, `config/defaults.ts:45`); passed through at `run/launch.ts:197`. Worktree-isolated runs let several runs share one project safely, but the per-project cap stops one project starving the global pool                                                  | Verify the per-project count+insert is atomic too (same transaction). Confirm worktree-isolated concurrent runs on one project do NOT defeat the GIT_DESTRUCTIVE_SAFETY snapshot diff: each coding run mutates its own worktree (`run/launch.ts:87,103`), so the metadata snapshot is per-worktree; a run that escapes its worktree onto the shared tree is the finding (cross-ref BTA #2) |
| `[ ]` | The child process is spawned **before** the DB row is inserted (`Bun.spawn` at `run/launch.ts:175,178` vs the insert at `:193-223`); a persistence failure after spawn leaves a detached child with no row. Cleanup (`run/launch.ts:240-262`) is best-effort, and on Windows the killed child is the short-lived pwsh bridge, which cannot reach the real run                                                                       | Verify the documented Windows gap (`run/launch.ts:250-256`); an untracked detached run is a reconciliation hazard, but it writes its own `runs.jsonl` entry, so §5's ledger cross-check is what surfaces it                                                                                                                                                                                |
| `[ ]` | Director cycles bypass `resolveProjectPath` (`run/launch.ts:74-77`) but still count toward the bound                                                                                                                                                                                                                                                                                                                                | Confirm director runs are counted so a cycle storm cannot exceed the cap                                                                                                                                                                                                                                                                                                                   |
| `[ ]` | The detached child is spawned via `Bun.spawn` (`run/launch.ts:175,178`), NOT node `child_process.spawn`; the invariant: on Windows `node:child_process.spawn` inherits the web HTTP **listen socket** and orphans the control-panel port until the detached run exits (`run/launch.ts:119-128` documents the same pin)                                                                                                              | Verify `Bun.spawn` is present _and why_: the inherited-listener hazard, not just that a spawn happens. Defer the full socket-inheritance treatment to AGENT_TOOL_SANDBOX                                                                                                                                                                                                                   |

---

## 4. Stop/Kill vs Natural Completion

`stopRun` / `killRun` (`run/control.ts:158,98`) act on a possibly-already-terminal run; the heartbeat watcher independently terminalizes on natural completion. The serializer `toWebRunRecord` (`run/queries.ts:26`) nulls liveness fields for terminal runs (`run/queries.ts:34,44`).

| Check | Criteria                                                                                                                                                                                                                                                                                                                                                                                                  | Remediation                                                                                                                 |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A kill that races natural completion does not leave a **zombie heartbeat**: `toWebRunRecord` nulls `heartbeatAt`/`activityState` for terminal runs (`run/queries.ts:34,44`)                                                                                                                                                                                                                               | Verify the serializer is the single chokepoint for every terminal path (the comment at `run/queries.ts:30-33` claims it is) |
| `[ ]` | `stopRun`/`killRun` on an already-terminal run is idempotent (no double-terminalization, no error)                                                                                                                                                                                                                                                                                                        | Trace both for an early terminal-status return                                                                              |
| `[ ]` | `killRun`/`stopRun` on a run with no DB row falls through to the CLI-active-run path (`run/control.ts:100-101,160-161`) rather than throwing                                                                                                                                                                                                                                                              | Confirm the detached-run kill path                                                                                          |
| `[ ]` | A natural completion arriving after a stop request does not overwrite the stop reason / resurrect the run to `running`                                                                                                                                                                                                                                                                                    | Verify status transitions are monotonic toward terminal                                                                     |
| `[ ]` | `waitForCycleRun` (`cycleExecutor.ts:261`) exits its poll loop on any non-`running` status (`cycleExecutor.ts:268`) and on `disposed()` (`cycleExecutor.ts:264`)                                                                                                                                                                                                                                          | Confirm the loop cannot spin forever on a stuck/missing row (it throws on missing, `cycleExecutor.ts:266`)                  |
| `[ ]` | Cycle/run gates that wait on a detached run block in the **foreground**: `waitForCycleRun` `await`s its poll loop inline (`cycleExecutor.ts:261-271`); `awaitAndPersistCycle` `await`s it (`cycleExecutor.ts:189`). An agent ending its turn while a gate is parked on a background task/Monitor terminates a headless run with exit 73 `missing_aidd_result` (`shared/src/orchestrator/exit-codes.ts:7`) | Verify no cycle/run completion gate is moved to a background task; the foreground `await` is load-bearing for headless runs |

---

## 5. Restart Reconciliation

`reconcileStaleCycles` (`cycleReconcile.ts:37`) selects every `running` director cycle on boot and either resumes (run still `running` → re-attach via `awaitAndPersistCycle`, `cycleReconcile.ts:69-76`), advances (run terminal → `advanceCycle`, `cycleReconcile.ts:77-87`), or fails it as orphaned (no run / missing fleet-summary artifact, `cycleReconcile.ts:46-68`).

| Check | Criteria                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Remediation                                                                                                                                                                                                                                    |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | A cycle whose run is still `running` re-attaches deterministically (`cycleReconcile.ts:69-76`); the detached run is found via `findCycleRun` (`cyclePersistence.ts:147`)                                                                                                                                                                                                                                                                                                                               | Verify re-attach does not double-await (idempotent if reconcile runs twice)                                                                                                                                                                    |
| `[ ]` | A cycle whose run already terminalized while the backend was down is **advanced** to its terminal state (`cycleReconcile.ts:78-86`), not left `running` forever                                                                                                                                                                                                                                                                                                                                        | Confirm `advanceCycle` persists the result                                                                                                                                                                                                     |
| `[ ]` | A cycle with no associated run or missing fleet-summary artifact is **failed**, not resumed (`cycleReconcile.ts:47-68`)                                                                                                                                                                                                                                                                                                                                                                                | Verify both orphan branches call `failCycle`                                                                                                                                                                                                   |
| `[ ]` | Reconciliation is idempotent: running it twice (e.g. a fast restart loop) does not double-spawn or double-persist                                                                                                                                                                                                                                                                                                                                                                                      | The resumed branch uses `void ...awaitAndPersistCycle(...).catch(...)` (`cycleReconcile.ts:71`); confirm a second reconcile pass on the same cycle does not stack a second awaiter                                                             |
| `[ ]` | Orphaned **detached runs** (not cycles) re-attach or fail via the run heartbeat-watcher / sweep reconciliation, deterministically                                                                                                                                                                                                                                                                                                                                                                      | Cross-check `reconcileStaleRuns` / `sweepOrphanedRuns` (`run/queries.ts:82-87` re-exports); a detached run with a live pid re-attaches, a dead one is swept                                                                                    |
| `[ ]` | **runs.jsonl-ledger vs DB divergence**: the listing path reconciles DB rows against the append-only `runs.jsonl` ledger via `dropLedgerPhantomRuns` (`ledgerReconcile.ts:63`, called at `historyQueries.ts:150,191`). `readLedgerRunIds` (`ledgerReconcile.ts:21-40`) treats the ledger as the **authoritative terminal-run set**: a terminal DB row absent from a populated ledger (and from active-runs/) is a phantom (force-failed without finalizing) and is dropped (`ledgerReconcile.ts:81-83`) | Verify the ledger is consulted, not just DB rows: a populated ledger establishes the terminal set; an absent/empty ledger reconciles nothing (`ledgerReconcile.ts:80-81`). A `running` row or an active-runs/ record is always kept regardless |
| `[ ]` | **Platform-dependent detached-run survival**: a detached run survives a web restart on **POSIX** (child reparents to init) but NOT reliably on **Windows**: the Bun job-object kill-on-close tears the child down on web exit, so a restart-mid-run **force-fails** the run. A hidden PowerShell `Start-Process` bridge mitigates this (`run/launch.ts:119-128`, the documented platform split)                                                                                                        | Verify the restart-mid-run **force-fail** path on Windows (the run is swept/force-failed, not silently re-attached), not just the POSIX happy re-attach. BTA #4 must trace BOTH outcomes                                                       |
| `[ ]` | The writer-lock reclaim (Section 1) and the cycle reconcile run in a defined order on boot so reconcile never races a second backend's writes                                                                                                                                                                                                                                                                                                                                                          | Confirm reconcile runs only after the lock is held                                                                                                                                                                                             |

---

## 6. Mid-Cycle Crash Durability

| Check | Criteria                                                                                                                                                                                                                                                                                        | Remediation                                                                                                                    |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | A crash between the direct-AI output write (`cycleExecutor.ts:108`) and `persistCycleResult` (`cycleExecutor.ts:110`) leaves a recoverable state: on restart the cycle is still `running` and reconcile advances it from the on-disk artifacts                                                  | Verify the artifact-driven stage inference (`cyclePersistence.cycleStage`, `cyclePersistence.ts:91-106`) reconstructs progress |
| `[ ]` | `persistCycleResult` is all-or-nothing: the worker command (`commands/cycles.ts:8-46`, wrapped at `db/commands.ts:39`) retires prior suggestions, inserts the batch, and updates the cycle row in one transaction; the service call is wrapped in `withSqliteRetry` (`cyclePersistence.ts:178`) | If non-atomic, a crash leaves suggestions without a completed cycle (or vice versa) - High                                     |
| `[ ]` | A crash mid-cycle does not leave the run row `running` with no live process and no reconcile path                                                                                                                                                                                               | Confirm the run sweep terminalizes a heartbeat-less `running` row                                                              |
| `[ ]` | `failCycle` (`cyclePersistence.ts:213`) is reachable for every failure branch so a cycle never stays `running` after a fatal error                                                                                                                                                              | Trace the `runCycle` catch path that calls `failCycle`                                                                         |

---

## 7. BREAK-THE-ASSUMPTION Scenarios

> **Mandatory.** Construct the interleaving that double-spawns or strands a run, and trace it against `writerLock.ts` + the scheduler/executor/reconcile/persistence code by hand (or drive it with two simultaneous tool calls / a kill-mid-cycle restart). **Any interleaving that double-spawns, exceeds the concurrency bound, or strands a run is a finding.**

1. **Double-launched suggestion (headline: now CAS-guarded; falsify the guard)**: fire two `launch_suggestion` calls for the same `pending` suggestion id simultaneously. Both read the row as `pending` (`suggestionService.ts:96-98`), but the spawn is now gated by an atomic compare-and-set: `UPDATE suggestions SET status='launching' WHERE id=? AND status='pending' RETURNING id` (`suggestionService.ts:113-117`). Exactly one caller's update returns a row and reaches `launchRun` (`suggestionService.ts:126`); the loser updates zero rows and throws (`suggestionService.ts:118-122`). Trace both interleavings and confirm only ONE run spawns. Then probe the edges: a spawn failure after the claim releases the row to `pending` (`suggestionService.ts:132-135`); an orphaned `launching` (spawner died between claim and the `launched` write) is swept by the next completed cycle (`commands/cycles.ts:18-21`). The race is closed unless the `WHERE status='pending'` predicate is dropped or the claim is split from the spawn.

2. **`launch_suggestion` + `run_cycle` for the same project**: launch a project-scoped suggestion and start a director cycle that may itself launch a coding run on the same feature. Two coding runs on one project are now _permitted_ up to `maxConcurrentRunsPerProject` (`runCeiling.ts:39-57`) precisely because each coding run gets an isolated worktree (`run/launch.ts:87,103`). Confirm this isolation holds the GIT_DESTRUCTIVE_SAFETY invariant: each run's metadata snapshot diff is scoped to its own worktree, so concurrent worktree-isolated runs do NOT defeat it (cross-reference GIT_DESTRUCTIVE_SAFETY.md). The finding is a run that escapes its worktree onto the shared project tree, or a non-worktree run (audit/director, where `useWorktree` is false at `run/launch.ts:87`) racing a coding run on the same files; there is still no cross-entry dedupe keyed on feature.

3. **Concurrency-bound TOCTOU (now atomic; verify it stays closed)**: fire `maxConcurrentRuns` worth of launches plus one more, all at once. The count and insert are now ONE worker transaction (`insertRunIfUnderCeiling`, `runCeiling.ts:23-58`, immediate-mode at `db/commands.ts:35-36`), so the launches serialize and exactly `maxConcurrentRuns` rows land; the `+1` is rejected (`run/launch.ts:224-230`). Confirm no overshoot, and that the per-project ceiling rejects independently (`runCeiling.ts:50-57`). The finding is re-introduced only if a caller counts then inserts as two statements, or inserts outside the command.

4. **Kill mid-cycle, then restart (platform-dependent survival)**: start a cycle in CLI-fallback mode (detached run), kill the aidd backend while the run is `running`, restart. On boot, `acquireWriterLock` reclaims the stale lock (`writerLock.ts:189-194`) and `reconcileStaleCycles` finds the `running` cycle (`cycleReconcile.ts:41`). **Platform split**: on POSIX the detached child reparents to init and survives, so reconcile re-attaches it if alive, advances if terminal, or fails it if orphaned. On **Windows** the Bun job-object kill-on-close tears the child down when the web process exits, so a restart-mid-run **force-fails** the run (the hidden PowerShell `Start-Process` bridge at `run/launch.ts:119-128` mitigates but does not guarantee survival across a hard restart). Verify: (a) exactly ONE outcome per stale cycle on each platform, and on Windows, that the force-fail/sweep path runs, not a silent re-attach; (b) no second awaiter is stacked if reconcile runs twice (`cycleReconcile.ts:71`); (c) no zombie heartbeat surfaces (`run/queries.ts:34,44`).

5. **Scheduled vs manual cycle stack (gated; falsify the gate)**: with the built-in Director task active, time a manual `run_cycle` to land alongside a due scheduled occurrence. There is no check-then-start window: both paths call `startDirectorCycleIfIdle` (`db/commands/directorCycles.ts:17-31`), which selects the `running` cycle and inserts the new row in one worker transaction, so the loser never inserts. Confirm exactly one `running` row across the race, that the manual loser surfaces a 409 rather than a silent no-op, and that the scheduled loser is recorded `skipped` with its cadence already advanced by the claim. The finding returns only if a caller inserts a `director_cycles` row outside the command, or the gate's select and insert are split.

For each: record the entry points raced, the unprotected check-then-act with `file:line`, the observed (or traced) outcome, and the invariant violated.

---

## Audit Checklist

### Critical Checks 🚨

- [ ] A `pending` suggestion cannot be double-launched: the `pending → launching` compare-and-set claim (`suggestionService.ts:113-117`) verified to admit exactly one launcher
- [ ] The same feature/project cannot have two concurrent **non-worktree-isolated** mutating runs across entry points (worktree-isolated coding runs are permitted up to `maxConcurrentRunsPerProject`)
- [ ] The max-concurrency bound holds under concurrent launches: count+insert verified atomic in `insertRunIfUnderCeiling` (one worker transaction), global and per-project ceilings both enforced
- [ ] Kill-mid-cycle + restart yields exactly one reconciliation outcome per stale cycle, no zombies (POSIX re-attach vs Windows force-fail both traced)

### High Priority Checks ⚠️

- [ ] Single-writer lock rejects a second backend on the same data dir
- [ ] Every atomic write is a `db/commands*` worker-transaction command (no inline call-site `db.transaction()`)
- [ ] `persistCycleResult` commits suggestion inserts + terminal update atomically
- [ ] runs.jsonl-ledger vs DB divergence is reconciled (`dropLedgerPhantomRuns`); the ledger is the authoritative terminal set
- [ ] Restart reconciliation is idempotent (no double-await / double-spawn on repeated boots)
- [ ] Detached-run restart survival is platform-correct (POSIX re-attach; Windows restart-mid-run force-fails)
- [ ] A scheduled Director occurrence does not stack with a manual `run_cycle`: verified atomic in `startDirectorCycleIfIdle` (one worker transaction), with no cycle row inserted outside it
- [ ] Stop/kill vs natural completion leaves no zombie heartbeat or resurrected run

### Medium Priority Checks 📋

- [ ] Detached run with no DB row after a persistence failure is reconciled, not stranded (note Windows gap)
- [ ] `waitForCycleRun` cannot spin forever on a stuck/missing row
- [ ] Cycle/run completion gates block in the foreground (a turn-ending background wait force-fails a headless run, exit 73)
- [ ] Web backend children spawn via `Bun.spawn`, not node `child_process.spawn` (avoids orphaning the HTTP listen socket on Windows; see AGENT_TOOL_SANDBOX)
- [ ] Artifact-driven stage inference reconstructs progress after a mid-cycle crash
- [ ] Director cycles count toward the concurrency bound

---

## Deliverables

### Required Outputs

1. Orchestrator-concurrency audit report in `.aidd/audit-reports/ORCHESTRATOR_CONCURRENCY-YYYY-MM-DD.md`
2. A feature.json file under `.aidd/features/` for each finding requiring code changes
3. A completed BREAK-THE-ASSUMPTION table: each raced entry point, the check-then-act window with `file:line`, the outcome, and the invariant violated

### Output Format

Each finding becomes a feature.json under `.aidd/features/audit-{audit_name_lower}-{unix_timestamp}-{descriptive-slug}/feature.json`, with `priority`/`auditSeverity` mapped per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) (Critical=1, High=2, Medium=3, Low=4), `category` = `"Audit"`, `auditSource` = `"ORCHESTRATOR_CONCURRENCY"`, `passes` = `false`, and a `description` carrying the `file:line` evidence and the concrete interleaving observed. The `id` field MUST exactly match the feature directory name.

### Success Criteria

- [ ] The double-launched-suggestion CAS claim is verified to hold (or a regression is filed) with `file:line` evidence
- [ ] The max-concurrency count+insert is verified atomic (global + per-project), or any reopened TOCTOU is filed as a finding
- [ ] Restart reconciliation is proven deterministic and idempotent on BOTH platforms (POSIX re-attach, Windows force-fail)
- [ ] runs.jsonl-ledger vs DB divergence is reconciled, not surfaced as phantom terminal runs
- [ ] 0 interleavings that double-spawn, exceed the bound, or strand a run undetected

## False Positives Considered and Rejected

This section is REQUIRED: if you found zero false-positive candidates, state that explicitly. Common candidates to document: the writer lock NOT serializing per-transaction (by design: it guards the process; the TOCTOU fix belongs in the transaction, not the lock); the resumed-cycle `void ...catch(...)` fire-and-forget (intentional non-blocking re-attach, not a swallowed error, IF reconcile is idempotent); director cycles bypassing `resolveProjectPath` (intentional: they run in a neutral cwd).

| Candidate                                                                                                              | Disposition                                                                                                                                                                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Writer lock does not serialize per-transaction; it is acquired once at startup, not per write (`writerLock.ts:138`)    | **Not a finding.** By design: the advisory lock guards the **process** (exactly one writer per data dir). Check-then-act atomicity belongs in a worker transaction (`insertRunIfUnderCeiling`, `persistCycleResult`), not the lock. The lock and the transaction are complementary layers, not substitutes.                          |
| Resumed-cycle re-attach is fire-and-forget: `void ...awaitAndPersistCycle(...).catch(...)` (`cycleReconcile.ts:71-75`) | **Not a finding.** Intentional non-blocking re-attach so boot reconciliation does not serialize on every in-flight cycle. The `.catch` logs rather than swallows, and reconcile is idempotent (a second pass finds the cycle already advanced/terminal), so no second awaiter stacks. Only a finding if reconcile is NOT idempotent. |
| Director cycles bypass `resolveProjectPath` (`run/launch.ts:74-77`)                                                    | **Not a finding.** Intentional: director runs operate fleet-wide in a neutral, controlled cwd (`data/director`) deliberately outside `allowedRoots`, so `resolveProjectPath` would wrongly reject it. They still count toward the concurrency bound, so a cycle storm cannot exceed the cap.                                         |

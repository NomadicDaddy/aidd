---
title: 'Quality Gate Pipeline Efficiency Audit'
last_updated: '2026-10-01'
version: '1.2'
category: 'Infrastructure'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
---

# Quality Gate Pipeline Efficiency Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

Audit the project's staged quality gate (`smoke:qc` or equivalent: lint, typecheck, format, tests, builds, custom checks) for **caching coverage**, **duplicated work**, **step ordering**, and **agent/CI timeout ergonomics**. The gate is run dozens of times per day by agents and humans; every wasted second multiplies. This audit tunes the gate itself — it does not evaluate test quality (see [TESTING.md](./TESTING.md)) or runtime application performance (see [PERFORMANCE.md](./PERFORMANCE.md)).

The gate has more than one **surface**: the canonical runner (`smoke:qc`), the CI workflow that invokes it, and — critically — the **git hooks** (`.githooks/`, husky, `lint-staged`) that run a _subset_ of it on every commit or push. Each surface is a separate opportunity for cache-bypass, reverse ordering, and drift, and a hand-maintained hook is the most common place all three hide at once. Inventory and judge every surface, not just the canonical runner.

## Executive Summary

**Critical Priorities**

- **No step slower than the default agent timeout without a documented mitigation**: a test suite that deterministically exceeds the default tool timeout (e.g. 120s for Claude Code's Bash tool) guarantees every first-run agent failure
- **Every expensive step (>10s) is either cached or uncacheable-by-design with a verified rationale**
- **Step order matches observed failure data**: cheap frequently-failing steps run first; expensive never-failing steps run last. How much a wrong order costs depends on the surface's failure policy (stop at the first failure, or run everything and report the aggregate), so establish that policy before pricing any reorder

**Essential Standards (Required)**

- **Measured, not guessed**: every cost and failure-rate claim cites a timing run or log-mining command output
- **Failure data drives ordering**: mine iteration/CI logs for per-step failure counts before proposing any reorder
- **Cache correctness over cache coverage**: a stale-serving cache is worse than no cache; verify dependency lists cover every input that can change the step's outcome
- **A cache hit is a replay, not a run**: a `[CACHED]` line means an earlier pass was recorded against the same declared inputs. It proves nothing about an input the step reads and the cache does not key on. Never cite a cached step as evidence the check ran during this audit
- **Cite the live location**: this file names symbols and files, not line numbers, because line numbers rot. Find the symbol in the target and cite its current `file:line` in the report

**Detection Categories**

- **Caching gaps**: steps that rerun identical work every invocation (missing dependency registration, missing tool-level caches)
- **Stale-green risk**: a cached step whose key omits an input the step reads, or a step that reads a build artifact and keys only on the sources that produced it
- **Duplicated work**: overlapping tool invocations checking the same sources twice
- **Ordering waste**: doomed work executed before a frequently-failing step gets its chance to fail (fail-fast surfaces), or a first failure reported late in a long run (aggregate surfaces)
- **Timeout hazards**: gate or suite wall time vs the timeouts agents and CI actually use
- **Unwired gates**: a test or check that exists as a package script and that no gate step runs
- **Gate-surface drift**: a git hook or CI job that re-implements a subset of the canonical gate and has independently bypassed its cache, reversed its order, or fallen out of sync with the step set it claims to mirror

## Relationship to Other Audits

| Concern                             | QC_PIPELINE covers                                             | Specialized audit                                                           |
| ----------------------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------- |
| Gate step cost, caching, ordering   | Yes — this audit's core scope                                  | —                                                                           |
| Test strategy, coverage, assertions | Only suite _runtime_ and shard-ability                         | [TESTING.md](./TESTING.md)                                                  |
| Application runtime performance     | Not covered                                                    | [PERFORMANCE.md](./PERFORMANCE.md)                                          |
| Lint/format rule content            | Only whether the tools cache and when they run                 | [CODE_QUALITY.md](./CODE_QUALITY.md)                                        |
| CI/CD workflow structure            | Only where the gate is invoked from                            | [DEVOPS.md](./DEVOPS.md)                                                    |
| Git hooks (pre-commit/pre-push)     | Their cache-sharing, ordering, and drift vs the canonical gate | [DEVOPS.md](./DEVOPS.md) covers whether a hook exists and enforces the gate |

## Table of Contents

1. [Phase 1: Inventory and Measure](#phase-1-inventory-and-measure)
2. [Phase 2: Caching Coverage](#phase-2-caching-coverage)
3. [Phase 3: Duplicated and Dead-Weight Work](#phase-3-duplicated-and-dead-weight-work)
4. [Phase 4: Failure-Data-Driven Ordering](#phase-4-failure-data-driven-ordering)
5. [Phase 5: Test-Suite Runtime and Agent Ergonomics](#phase-5-test-suite-runtime-and-agent-ergonomics)
6. [Calibration Reference](#calibration-reference-aidd-2026-07)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)
9. [Expected Deliverables](#expected-deliverables)

## Phase 1: Inventory and Measure

Establish ground truth before judging anything.

- [ ] **Enumerate every gate step** from the pipeline's source of truth, and cite its live file:line. Where that is depends on the target:

    | Target                     | Step registry                                                                                                                                                        | Runner                              |
    | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- |
    | aidd                       | `SMOKE_QC_STEPS` in `scripts/lib/smoke-qc/steps.ts`, which spreads in `GATE_CONTRACT_STEPS` from `scripts/lib/smoke-qc/gate-contract-steps.ts`                       | `scripts/smoke-qc.ts` (imports it)  |
    | Spernakit and derived apps | `scripts/smoke.json`, mode `qc`. The other modes (`dev`, `preview`, `docker-local`, `docker-prod`, `reset`, `screenshots`) are server-lifecycle chains, not the gate | `scripts/smoke.ts --mode qc`        |
    | Any other project          | Whatever `smoke:qc` (or the documented equivalent) resolves to: a script, a composite package script, or a CI workflow                                               | Read it; do not assume either shape |

    Do not trust README or agent-doc step listings - diff them against the registry and flag drift. A generated runbook (`scripts/smoke-qc.md` in aidd, `scripts/smoke.md` in Spernakit) is only as current as the `check:smoke-docs` step that compares it with the registry, so confirm that step is in the gate before reading the runbook instead of the registry. In a Spernakit-derived app, steps marked `templateOnly` in `scripts/smoke.json` are skipped out loud; count them as skipped, not as passed.

- [ ] **Record each surface's failure policy** by reading the runner, not its comments: does it stop at the first failing step, or run every step and report the aggregate? Both shapes are in use (Spernakit's `shouldAggregateFailures` in `scripts/lib/smoke/failure-policy.ts` aggregates the full `qc` mode and stops at the first failure in the fast subset and the lifecycle modes; aidd's `runSmokeQc` loop in `scripts/smoke-qc.ts` records a failure and continues, in the full gate and in the `--fast` subset alike). Phase 4 prices ordering differently for each, so this is an input, not a detail. A comment or hook header that describes one policy while the loop implements the other is a finding.
- [ ] **Check that every test script is run by a step.** A `test:*` package script that no gate step invokes passes when run by hand and catches nothing. List the `test:*` scripts in `package.json` and confirm each is named by a step. Where the target ships `check:gates-wired`, confirm that step is itself in the gate, then read its excuse list: every excused script needs a reason, and an excuse for a script that no longer exists or is now wired must fail. The excuse list is the `EXCUSED` map in `scripts/check-gates-wired.ts` in aidd, and the top-level `excusedTests` array in `scripts/smoke.json` in Spernakit (each entry a `script` and a `reason`; the key is optional, and a file without it excuses nothing). The two checks count "run" differently: aidd requires a `smoke:qc` step that names the script, while Spernakit accepts a step in any smoke mode, and also a script whose whole command a wired script chains with `&&`. Apply the target's own rule before calling a script unwired. Availability as of 2026-10-01: committed on aidd's main branch; committed in Spernakit but not yet released, arriving with the release after v3.47.4. A derived app synced to v3.47.4 or earlier does not have it, so its absence there is not a finding against the app - do the comparison by hand and report any unwired script as the finding.
- [ ] **Enumerate every gate _surface_**, not just the canonical runner. Resolve the active git-hook path (`git config core.hooksPath`, else `.git/hooks/`) and read the `pre-commit`/`pre-push` scripts; also check `package.json` for `husky`/`lint-staged`/`simple-git-hooks` config. For each hook, list the exact commands it runs and cite file:line. A hook that runs `bun run <step>` (or the raw tool) directly, rather than delegating to the canonical runner or its cache, is the finding to look for — carry that command list into Phases 2 and 4.
- [ ] **Diff each subset surface against the canonical step set**: which canonical steps does the hook run, in what order, and does that order match the tuned pipeline? A hook is not required to run every step, but the steps it does run must share the pipeline's cache and be taken from the canonical step list rather than restated. Any divergence is a Gate-surface drift finding.
- [ ] **Record per-step cost**. Prefer recorded durations: `scripts/smoke-cache.json` holds one per step (the field is `durationMs` in aidd and `duration` in Spernakit), and CI step timings are the other source. `bun run qc:status` prints the cache state without running anything. A recorded duration is the cost of the last real run of that step, which may predate the current tree; note its timestamp (`recordedAt` in aidd, `lastRun` in Spernakit). For steps with no recorded duration, time them directly:

    ```bash
    for s in lint check-deps check:custom; do
      start=$(date +%s%N); bun run $s >/dev/null 2>&1; rc=$?
      echo "$s: $(( ($(date +%s%N)-start)/1000000 ))ms rc=$rc"
    done
    ```

    Running a step's own script goes around the pipeline cache (the cache lives in the runner), which is what a measurement needs. It does not go around a tool-level cache the script itself enables (`prettier --cache`, an incremental `tsc`, an ESLint `--cache` variant), so say which caches were warm. Do not use the runner's `--force` flag to take timings: it reruns the whole gate, and it is reserved for a suspected stale hit (Phase 2).

- [ ] **Measure cache-machinery overhead** (hash/validation pass with everything cached, e.g. `bun run qc:status`). Only optimize the cache layer itself if this exceeds ~2-3s.
- [ ] **Compute cold vs warm gate wall time**: sum of all step costs (cold) vs sum of uncached-step costs plus cache overhead (warm).

**Output**: a step table — name, cost, cached?, position — that every later phase cites.

## Phase 2: Caching Coverage

### What a cache hit proves

Read the cache implementation before judging any step, because every later verdict rests on what its key contains. In both Canon repositories the entry point is `canSkipStep` in `scripts/smoke-cache.ts`, the per-step input lists are `STEP_DEPENDENCIES` in `scripts/lib/smoke-cache/dependencies.ts` (split across the neighbouring `steps-*.ts` files), and the deliberately uncached set is `UNCACHEABLE_STEPS` in the same file. Another project may key differently; read its code and record what you find against the same four questions:

1. **What is hashed?** The Canon caches hash the content of every file matched by the step's declared globs. A cache keyed on mtime or size instead can miss a same-size rewrite; record which it is.
2. **What is replayed?** Only a recorded pass may skip a step. A recorded failure must always rerun. Confirm it in the skip function.
3. **Is the output checked?** A step that emits an artifact must lose its hit when the artifact is missing or empty (aidd: `STEP_OUTPUTS` in `scripts/lib/smoke-cache/outputs.ts`; Spernakit: the `outputs` field on the step's dependency record). Unchanged inputs do not justify skipping a build whose output is gone.
4. **What is left out?** The key contains declared repository files and nothing else. Installed packages are covered only through `bun.lock` when the step lists it. The runtime and tool binaries, environment variables, the clock, sibling checkouts, gitignored state and databases are not in it. A step that reads any of these is either in the uncacheable set or a stale-green finding.

A hit therefore means: this step passed once, and the files it declares are byte-identical to that run. It does not mean the check ran now, and it does not cover an input the list omits. Two rules for the auditor follow:

- **Do not treat a cached pass as a current result.** When a finding depends on a step's verdict, either the step ran in this session or you report the verdict as replayed, with the timestamp of the run that recorded it.
- **Do not bypass the cache by habit.** A forced full run costs minutes and proves nothing a targeted check does not. To test a suspected stale hit, name the undeclared input, change it (or show a commit that changed it), and show that cache status still reports the step valid; that demonstration is the finding. Running the step's own script directly then gives the true verdict without touching the cache.

### Classify every step

Classify every step into exactly one of three buckets and challenge each classification:

- [ ] **Cached**: has a dependency list and a recorded pass entry. Verify the dependency list is _complete_ - every file that can change the step's outcome must be hashed (source globs, the tool's own config files, the check script itself and the library modules it imports, lockfile). Derive the list from what the check reads, by opening the check, not from what the list already says. An incomplete list is a **correctness bug** (stale green), which outranks any speed finding. Three shapes recur: a step that reads a build artifact but keys on the sources that produced it (it must hash the artifact itself, or a stale or hand-edited output sits behind a valid entry); a glob that silently matches nothing (a dot-directory pattern scanned without dot-matching hashes an empty set); and a list naming today's files where the check walks a directory (a file added later is never hashed).
- [ ] **Cacheable but unregistered**: deterministic output from tracked files, yet reruns every invocation. This is the classic oversight bucket - a step added to the pipeline without a dependency entry. Any step here costing >10s is a High finding; >2s is Medium. Where the runner refuses to start with an unclassified step (`assertSmokeCacheCoverage`, in `scripts/lib/smoke-qc/coverage.ts` in aidd and `scripts/lib/smoke/run-step.ts` in Spernakit), this bucket cannot fill silently; confirm the guard is called on the gate's path, then spend the effort on the other two buckets. A project without such a guard has no protection here, and that absence is itself a Medium finding.
- [ ] **Uncacheable by design**: inspects runtime state (live databases, filesystem litter, process tables), gitignored artifacts, the clock, or files in another repository. Falsify the rationale: read the check's implementation and confirm it truly reads state outside the hashed tree. If it only reads tracked files, move it to the bucket above. The reverse error is the dangerous one: a step that reads outside the tree and is cached replays a pass over state it never looked at.

Then check that **every gate surface shares the cache**, not just the canonical runner:

- [ ] **Hook cache-bypass**: a `pre-commit`/`pre-push` hook that re-runs gate steps by calling the tool or script directly (`bun run format:check`, `prettier --check .`) never consults the pipeline cache, so it reruns the full subset on every commit even when `smoke:qc` validated an identical tree seconds earlier. Confirm the hook routes each step through the same cache API (`canSkipStep`/equivalent) or invokes a cache-aware subset runner. This is correctness-neutral to add whenever the hook already checks the same inputs the cache hashes — e.g. a hook that runs `prettier --check .` / `tsc --noEmit` over the working tree, exactly what the cache re-hashes — so the only cost of the bypass is wasted time. A working-tree cache re-hashes on every call, so wiring the hook to it introduces no stale-green window; call this out explicitly so the auditor does not reject the fix on a phantom correctness worry.

Then check **tool-level caches** independently of the pipeline cache — they make even cache-miss runs cheap:

- [ ] ESLint: `--cache` with an explicit `--cache-location` on the inner-loop lint only, never on the authoritative one. ESLint's cache keys on each file's own content and the config, not on the type graph, so with type-aware rules a type change in one file can create a violation in another file the cache considers unchanged; it also survives a dependency install. The sound shape is two scripts: a cached variant for the fast subset and the pre-commit hook (`lint:fast` in both Canon repositories) and an uncached `lint` for the full gate, each with its own pipeline-cache key so a fast pass can never let the full gate skip the uncached run. A full gate whose lint step passes `--cache` while type-aware rules are enabled is a correctness finding, not a speed win. A project with no type-aware rules may cache both.
- [ ] Prettier: `--cache` on `--check`/`--write` invocations. Record the cache strategy in use; a metadata-keyed cache needs evidence that a changed file is rechecked (Spernakit carries `test:prettier-cache` for this)
- [ ] TypeScript: `--incremental` / project references (`tsc -b`) where multiple tsconfigs cover a shared graph
- [ ] Bundlers/test runners: coverage-based dependency tracking (hash the covered-file list, not just `test/**`) so unrelated source edits don't invalidate the test cache — and conversely, that covered source files _do_ invalidate it

## Phase 3: Duplicated and Dead-Weight Work

- [ ] **Overlapping invocations**: map which sources each tool invocation covers. The canonical smell is a root `tsc --noEmit` whose `include` spans the same packages that per-package `tsc -p` calls recheck — measure each invocation separately and quantify the overlap before recommending removal (per-package configs may intentionally differ; diff the compiler options).
- [ ] **Serial tools that could run concurrently**: independent lint/typecheck invocations over disjoint trees.
- [ ] **Instrumentation overhead**: if tests run with `--coverage` for cache-keying, measure the delta vs a plain run (expect ~8-12%). Keep it if it powers caching; flag it if the coverage output is unused.
- [ ] **Steps that gate nothing**: steps with zero observed failures over the full log sample _and_ significant cost deserve scrutiny — usually the fix is reordering to last (Phase 4), not removal; removal requires proving the failure mode is impossible, not merely unobserved.

## Phase 4: Failure-Data-Driven Ordering

The ordering principle: **minimize expected time-to-first-failure**. Run steps in ascending `cost / P(fail)`. Intuition: cheap frequent-failers first, expensive never-failers last.

What a bad order costs depends on the failure policy recorded in Phase 1:

- **Fail-fast surface** (a subset or hook that stops at its first failure, a lifecycle chain): every step ahead of the failing one is doomed work, and the run ends there. The waste formula below applies in full.
- **Aggregate surface** (a full gate that runs every step and reports all failures): a failing run costs the same in any order, so the doomed-work formula does not apply and must not be used to claim minutes saved. Order still decides three things: how long the operator waits for the first `[FAIL]` line; which steps have completed, and so cached, when an agent tool timeout cuts the run short; and whether a step that consumes a build output runs after the step that produces it. Price those instead.

- [ ] **Mine the failure history**. Use the largest available sample: aidd iteration logs (`.aidd/iterations/*.log`), CI logs, or run ledgers. Count _distinct runs_ in which each step failed (a step retried 3 times in one run is one data point for ordering). Read the runner's failure line first, because the pattern differs by runner: aidd prints `[FAIL] <label> exited with code <n>`, Spernakit prints `[FAIL] <description> (exit code <n>)`. The commands below match the aidd form; adapt the pattern to the line the target's runner actually prints, and prove it with a step you know has failed before trusting a zero.

    ```bash
    # occurrences
    grep -hoE "\[FAIL\] .+ exited with code [0-9]+" *.log \
      | sed -E 's/\[FAIL\] (.*) exited with code.*/\1/' | sort | uniq -c | sort -rn
    # distinct runs per step
    for step in lint typecheck "bun test" format:check; do
      echo "$(grep -lF "[FAIL] $step exited" *.log | wc -l) $step"
    done
    ```

- [ ] **Quantify ordering waste** for each frequently-failing step on a fail-fast surface: `(distinct failing runs) × (cost of all steps currently ordered before it that would have run)`. Express it in wasted minutes over the sample period - this is the number that justifies the reorder. On an aggregate surface, report instead the wait before the first failure line and the cost of the steps a timeout would leave unrun.
- [ ] **Propose the new order**:
    1. Sub-second checks, frequent-failers first within the block
    2. Cheap-but-not-instant frequent-failers (format check is the classic offender — it fails whenever an agent edits without formatting, yet pipelines habitually run it last)
    3. Typecheck and lint (order by measured cost after tool caches land)
    4. Cheap never-failers (a few seconds each)
    5. The test suite (usually the highest failure rate _and_ the highest cost — it belongs after every static gate)
    6. Builds and packaging (near-zero observed failure rates; last)
- [ ] **Check every subset surface inherits this order.** A `pre-commit` hook that runs its own hand-maintained sequence almost always drifts to _reverse_-cost order (the most expensive check first, the cheap frequent-failer last) because it was written by appending steps, not by ranking them. On the same failure sample, a cheap frequent-failer stranded last in a hook wastes `(distinct failing runs) × (cost of the steps ahead of it)` on every doomed commit. Prefer a subset runner that takes its steps from the canonical step list by name (single source of truth for what a step is, and a startup error when a named step no longer exists) over a duplicated hand-written command list that can silently re-drift. A subset may carry its own measured order, which need not match the position of those steps in the full gate; what it must carry is the measurement behind that order (aidd: `FAST_QC_STEP_NAMES` in `scripts/lib/smoke-qc/fast-subset.ts`; Spernakit: `FAST_QC_COMMANDS` in `scripts/lib/smoke/fast-subset.ts`). An order with no recorded measurement is a finding.
- [ ] **Re-verify after reordering**: the failure distribution is a property of the team/agents' editing habits, not of the pipeline — expect it to be stable, but re-mine after a quarter.

## Phase 5: Test-Suite Runtime and Agent Ergonomics

- [ ] **Measure real wall time** with per-suite instrumentation:

    ```bash
    bun test --reporter=junit --reporter-outfile=/tmp/junit.xml
    ```

- [ ] **Check for serial execution**: if the sum of per-suite times ≈ wall time, the run is fully serial and process-level sharding is the only large win available.
- [ ] **Rank suites and compute concentration**: what fraction of wall time do the top 10 suites hold? High concentration (>50%) means targeted fixes beat broad ones. Look for the usual heavy patterns: real `git init` + commits per test (share a template repo and file-copy it), real subprocess spawns, real timers/sleeps, per-test server startup.
- [ ] **Compare against the timeouts agents actually use**: Claude Code's Bash tool defaults to 120s and caps a foreground command at ten minutes. A suite whose cold run exceeds the limit in force fails _deterministically_, not flakily, and a gate whose cold run exceeds ten minutes cannot finish in one foreground call at all. Check what the gate does about it: whether completed steps are cached so a re-invocation resumes, and whether the runner warns when the uncached steps project past the limit (aidd: `PROJECTED_WALL_TIME_WARNING_MS` in `scripts/smoke-qc.ts`). A timeout or a still-running process is never a pass. Mitigations in order of cheapness:
    1. Document expected duration in the agent-facing doc (AGENTS.md/CLAUDE.md): "full suite takes N minutes; set timeout ≥ 2× N, or run targeted files"
    2. Set `BASH_DEFAULT_TIMEOUT_MS` in the repo's `.claude/settings.json` env block
    3. Point agents at the cached gate (`bun run smoke:qc`) instead of raw `bun test` when validating unrelated changes
    4. Fix the top-ranked slow suites
    5. Shard across processes — but first read the concurrency guards (test-run locks, shared fixture trees, fixed ports); sharding without per-shard isolation trades a slow suite for a flaky one
- [ ] **Verify the concurrency guard story**: if a lock forbids concurrent runs, confirm stale locks self-clear, and read what the gate does when another run holds the lock. It must not collide with the running suite, and it must not report the tests as passed: a gate that skips the test step and exits 0 has validated nothing, and one that records that skip as a cached pass is a stale-green finding. Failing the step with a message that names the other run (aidd: `getConcurrentTestBlocker` in `scripts/smoke-qc.ts`) or waiting for the lock are both sound; a silent skip is not.
- [ ] **Weigh the pre-commit hook's wall time as a per-commit tax**: unlike the full gate (run on demand), the hook runs synchronously on _every_ commit, so its warm cost is felt by every contributor and every agent commit. Once the hook shares the pipeline cache (Phase 2), the common path — committing after a recent `smoke:qc` — should collapse to cache-hash overhead plus any genuinely-uncacheable hook step (e.g. a staged-diff secret scan). If it does not, the hook is either bypassing the cache or running an uncacheable step it should not (a hook that scans the _working tree_ can be cached; one that scans the _staged index_ cannot — keep the latter minimal).

## Calibration Reference (aidd, 2026-07)

Real numbers from the July 2026 audit this definition was distilled from. They are a dated snapshot: the gate has since grown and been reordered, the suite is several times longer, and the hook and lint findings below were fixed. Use them as order-of-magnitude anchors for what a finding of each kind looks like, never as the target's current figures - those come from the live registry, cache file and logs.

| Signal                          | Observed                                                                                                                                                          |
| ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never-cached lint step          | 23.7s per run; missing `STEP_DEPENDENCIES` entry was an oversight                                                                                                 |
| Typecheck overlap               | Root tsc 5.3s already covered 3 packages re-checked per-package (+7.9s)                                                                                           |
| Cache hashing overhead          | ~0.9s for 22 steps / ~1,300 files — not worth optimizing                                                                                                          |
| Failure distribution (642 runs) | test 47, typecheck 26, max-lines 24, format 21, lint 20, all 16 others **0**                                                                                      |
| Ordering waste                  | format:check at position 21/22 → ~200s doomed work × 21 failures ≈ 70 min                                                                                         |
| Suite concentration             | Top 10 of 552 suites = 66% of a 131s fully-serial run; one suite alone = 23%                                                                                      |
| Timeout hazard                  | 131s suite vs 120s default agent timeout → deterministic first-run failures                                                                                       |
| Hook cache-bypass               | `pre-commit` called `bun run format:check`/`lint`/`typecheck` directly → ~27s every commit; wired to the smoke-cache → **0.8s** warm                              |
| Hook reverse-ordering           | Hook ran format:check (15.6s) first, check:max-lines (0.17s, 24 fails) last — exact reverse of the tuned gate; a doomed max-lines commit paid ~27s before failing |
| Prettier tool cache             | `format:check` gained `--cache` → cache-miss run 15.6s → **2.75s** (also speeds the canonical gate)                                                               |

## Audit Checklist

### Inventory

- [ ] Step list extracted from implementation (file:line cited); doc listings diffed for drift
- [ ] Failure policy (fail-fast or aggregate) read from the runner for each surface
- [ ] Every `test:*` package script traced to a gate step, or to an excuse with a reason
- [ ] All gate surfaces enumerated: canonical runner, CI job(s), and git hooks (`core.hooksPath`/husky/lint-staged resolved)
- [ ] Each hook's exact command list read and diffed against the canonical step set (subset, order, cache-routing noted)
- [ ] Per-step cost table complete (recorded or measured, source noted)
- [ ] Cold and warm gate wall times computed
- [ ] Cache-machinery overhead measured

### Caching

- [ ] Cache key read from the implementation: what is hashed, what is replayed, whether outputs are checked, what is left out
- [ ] No cached step cited as a current result; replayed verdicts labelled with their recorded timestamp
- [ ] Every step classified: cached / cacheable-but-unregistered / uncacheable-by-design
- [ ] Every "uncacheable by design" rationale falsified against the implementation
- [ ] Cached steps' dependency lists checked for completeness against what each check reads (tool configs, check script and its libraries, lockfile, consumed build artifacts)
- [ ] Every gate surface shares the cache: hooks route through the cache API / a cache-aware subset runner, not raw `bun run <step>`
- [ ] Tool-level caches evaluated: eslint (cached inner loop, uncached authoritative lint where rules are type-aware), prettier, tsc incremental, coverage-keyed test cache

### Duplication

- [ ] Source coverage mapped per tool invocation; overlaps measured individually
- [ ] Instrumentation overhead (coverage) measured and justified
- [ ] Serial-but-independent invocations identified

### Ordering

- [ ] Failure counts mined from the largest available log sample (sample size stated)
- [ ] Ordering waste quantified in minutes for each misplaced step on a fail-fast surface; time to first failure line and timeout exposure reported for an aggregate surface
- [ ] Proposed order follows ascending cost / P(fail); never-failing builds last
- [ ] Every subset surface (hooks) takes its steps from the canonical list and carries a measured order - reverse-cost hook drift checked and quantified on the same sample

### Test Runtime

- [ ] Wall time measured with per-suite timings (junit or equivalent)
- [ ] Serial vs parallel established (suite-time sum vs wall time)
- [ ] Top-10 concentration computed; heavy patterns identified per slow suite
- [ ] Gate/suite time compared against default agent and CI timeouts; mitigations proposed
- [ ] Concurrency guards read and understood before any sharding recommendation; a held lock never yields a passing test step

## Report Template

```markdown
# QC_PIPELINE Audit Report - {YYYY-MM-DD}

## Executive Summary

- **Application**: {app-name} v{version}
- **Date**: {date}
- **Overall Score**: {score}/100
- **Gate wall time**: cold {n}s / warm {n}s
- **Failure sample**: {n} runs mined from {source}

| Category      | Critical | High | Medium | Low |
| ------------- | -------- | ---- | ------ | --- |
| Caching       | {n}      | {n}  | {n}    | {n} |
| Duplication   | {n}      | {n}  | {n}    | {n} |
| Ordering      | {n}      | {n}  | {n}    | {n} |
| Timeout/agent | {n}      | {n}  | {n}    | {n} |
| Gate-surface  | {n}      | {n}  | {n}    | {n} |

## Gate Surfaces

| Surface          | Source (file:line) | Steps run (in order) | Failure policy | Shares cache? | Steps taken from canonical list? |
| ---------------- | ------------------ | -------------------- | -------------- | ------------- | -------------------------------- |
| canonical runner |                    |                      |                | —             | —                                |
| CI job           |                    |                      |                |               |                                  |
| pre-commit hook  |                    |                      |                |               |                                  |

## Step Table

| Step | Cost (run or recorded, with date) | Cached | Failures ({n} runs) | Position (current → proposed) |
| ---- | --------------------------------- | ------ | ------------------- | ----------------------------- |

## Findings

### Caching gaps

{Steps rerunning identical work; incomplete dependency lists (correctness); missing tool caches}

### Unwired gates

{`test:*` or check scripts no step runs; excuses without a reason}

### Duplicated work

{Overlapping invocations with individual measurements}

### Ordering

{Proposed order with quantified waste per misplaced step}

### Gate-surface drift

{Hooks/CI jobs that bypass the cache, reverse the order, or diverge from the canonical step set — with the per-commit waste quantified}

### Test runtime and agent ergonomics

{Wall time, serial/parallel, top-10 concentration, timeout comparison, mitigation tier}

## Remediation Plan

{Prioritized; each item states expected seconds saved per run and per week}
```

> **Scoring requires measurements, not impressions**: a score of 90+ is invalid unless the report contains a complete step table with real costs, a failure sample size, and a measured suite wall time. "The gate feels fast" is not a finding; per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md), never score from a green gate.

## Expected Deliverables

1. **Audit report**: `.aidd/audit-reports/QC_PIPELINE-{YYYY-MM-DD}.md` following the Report Template
2. **Feature issues**: `.aidd/features/audit-qc-pipeline-{timestamp}-{slug}/feature.json` for Critical/High findings, per aidd conventions (`auditSource`: `QC_PIPELINE`)
3. **Action plan**: remediation items each stating expected time saved per run

## Notes

- This audit is self-applicable: aidd's own `smoke:qc` is a valid target, as is the Spernakit template's and any derived project's gate - including its `.githooks/pre-commit` subset, which must share the smoke cache and take its steps from the canonical registry (`smoke:qc:fast` in both Canon repositories)
- The audit observes the gate; it does not edit it. Do not delete or rewrite `scripts/smoke-cache.json`, do not regenerate a budget file, and do not run a sync or fix script to obtain a measurement
- Reordering and cache-registration changes must themselves pass the full gate before landing
- When a fix belongs in a template the project derives from, escalate to the template rather than patching the derived app
- Correctness beats speed: an incomplete cache dependency list (stale green) is always a higher-severity finding than any slowness

---

**Version**: 1.2
**Last Updated**: 2026-10-01
**Next Review**: 2027-01-01

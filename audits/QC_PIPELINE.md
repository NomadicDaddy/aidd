---
title: 'Quality Gate Pipeline Efficiency Audit'
last_updated: '2026-07-15'
version: '1.1'
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
- **Step order matches observed failure data**: cheap frequently-failing steps run first; expensive never-failing steps run last

**Essential Standards (Required)**

- **Measured, not guessed**: every cost and failure-rate claim cites a timing run or log-mining command output
- **Failure data drives ordering**: mine iteration/CI logs for per-step failure counts before proposing any reorder
- **Cache correctness over cache coverage**: a stale-serving cache is worse than no cache; verify dependency lists cover every input that can change the step's outcome

**Detection Categories**

- **Caching gaps**: steps that rerun identical work every invocation (missing dependency registration, missing tool-level caches)
- **Duplicated work**: overlapping tool invocations checking the same sources twice
- **Ordering waste**: doomed work executed before a frequently-failing step gets its chance to fail
- **Timeout hazards**: gate or suite wall time vs the timeouts agents and CI actually use
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

- [ ] **Enumerate every gate step** from the pipeline's source of truth (e.g. `SMOKE_QC_STEPS` in `scripts/smoke-qc.ts`, a CI workflow, or a composite npm script). Cite file:line. Do not trust README/agent-doc step listings — diff them against the implementation and flag drift.
- [ ] **Enumerate every gate _surface_**, not just the canonical runner. Resolve the active git-hook path (`git config core.hooksPath`, else `.git/hooks/`) and read the `pre-commit`/`pre-push` scripts; also check `package.json` for `husky`/`lint-staged`/`simple-git-hooks` config. For each hook, list the exact commands it runs and cite file:line. A hook that runs `bun run <step>` (or the raw tool) directly, rather than delegating to the canonical runner or its cache, is the finding to look for — carry that command list into Phases 2 and 4.
- [ ] **Diff each subset surface against the canonical step set**: which canonical steps does the hook run, in what order, and does that order match the tuned pipeline? A hook is not required to run every step, but the steps it does run must share the pipeline's cache and inherit its ordering. Any divergence is a Gate-surface drift finding.
- [ ] **Record per-step cost**. Prefer recorded durations (e.g. `scripts/smoke-cache.json` `durationMs`, CI step timings). For steps with no recorded duration, time them directly:

    ```bash
    for s in lint check-deps check:custom; do
      start=$(date +%s%N); bun run $s >/dev/null 2>&1; rc=$?
      echo "$s: $(( ($(date +%s%N)-start)/1000000 ))ms rc=$rc"
    done
    ```

- [ ] **Measure cache-machinery overhead** (hash/validation pass with everything cached, e.g. `bun run qc:status`). Only optimize the cache layer itself if this exceeds ~2-3s.
- [ ] **Compute cold vs warm gate wall time**: sum of all step costs (cold) vs sum of uncached-step costs plus cache overhead (warm).

**Output**: a step table — name, cost, cached?, position — that every later phase cites.

## Phase 2: Caching Coverage

Classify every step into exactly one of three buckets and challenge each classification:

- [ ] **Cached**: has a dependency list and a recorded pass entry. Verify the dependency list is _complete_ — every file that can change the step's outcome must be hashed (source globs, the tool's own config files, the check script itself, lockfile). An incomplete list is a **correctness bug** (stale green), which outranks any speed finding.
- [ ] **Cacheable but unregistered**: deterministic output from tracked files, yet reruns every invocation. This is the classic oversight bucket — a step added to the pipeline without a dependency entry. Any step here costing >10s is a High finding; >2s is Medium.
- [ ] **Uncacheable by design**: inspects runtime state (live databases, filesystem litter, process tables). Falsify the rationale: read the check's implementation and confirm it truly reads state outside tracked files. If it only reads tracked files, move it to the bucket above.

Then check that **every gate surface shares the cache**, not just the canonical runner:

- [ ] **Hook cache-bypass**: a `pre-commit`/`pre-push` hook that re-runs gate steps by calling the tool or script directly (`bun run format:check`, `prettier --check .`) never consults the pipeline cache, so it reruns the full subset on every commit even when `smoke:qc` validated an identical tree seconds earlier. Confirm the hook routes each step through the same cache API (`canSkipStep`/equivalent) or invokes a cache-aware subset runner. This is correctness-neutral to add whenever the hook already checks the same inputs the cache hashes — e.g. a hook that runs `prettier --check .` / `tsc --noEmit` over the working tree, exactly what the cache re-hashes — so the only cost of the bypass is wasted time. A working-tree cache re-hashes on every call, so wiring the hook to it introduces no stale-green window; call this out explicitly so the auditor does not reject the fix on a phantom correctness worry.

Then check **tool-level caches** independently of the pipeline cache — they make even cache-miss runs cheap:

- [ ] ESLint: `--cache --cache-location node_modules/.cache/eslint/` on every lint script
- [ ] Prettier: `--cache` on `--check`/`--write` invocations
- [ ] TypeScript: `--incremental` / project references (`tsc -b`) where multiple tsconfigs cover a shared graph
- [ ] Bundlers/test runners: coverage-based dependency tracking (hash the covered-file list, not just `test/**`) so unrelated source edits don't invalidate the test cache — and conversely, that covered source files _do_ invalidate it

## Phase 3: Duplicated and Dead-Weight Work

- [ ] **Overlapping invocations**: map which sources each tool invocation covers. The canonical smell is a root `tsc --noEmit` whose `include` spans the same packages that per-package `tsc -p` calls recheck — measure each invocation separately and quantify the overlap before recommending removal (per-package configs may intentionally differ; diff the compiler options).
- [ ] **Serial tools that could run concurrently**: independent lint/typecheck invocations over disjoint trees.
- [ ] **Instrumentation overhead**: if tests run with `--coverage` for cache-keying, measure the delta vs a plain run (expect ~8-12%). Keep it if it powers caching; flag it if the coverage output is unused.
- [ ] **Steps that gate nothing**: steps with zero observed failures over the full log sample _and_ significant cost deserve scrutiny — usually the fix is reordering to last (Phase 4), not removal; removal requires proving the failure mode is impossible, not merely unobserved.

## Phase 4: Failure-Data-Driven Ordering

The ordering principle: **minimize expected time-to-first-failure**. Run steps in ascending `cost / P(fail)`. Intuition: cheap frequent-failers first, expensive never-failers last.

- [ ] **Mine the failure history**. Use the largest available sample: aidd iteration logs (`.aidd/iterations/*.log`), CI logs, or run ledgers. Count _distinct runs_ in which each step failed (a step retried 3 times in one run is one data point for ordering):

    ```bash
    # occurrences
    grep -hoE "\[FAIL\] .+ exited with code [0-9]+" *.log \
      | sed -E 's/\[FAIL\] (.*) exited with code.*/\1/' | sort | uniq -c | sort -rn
    # distinct runs per step
    for step in lint typecheck "bun test" format:check; do
      echo "$(grep -lF "[FAIL] $step exited" *.log | wc -l) $step"
    done
    ```

- [ ] **Quantify ordering waste** for each frequently-failing step: `(distinct failing runs) × (cost of all steps currently ordered before it that would have run)`. Express it in wasted minutes over the sample period — this is the number that justifies the reorder.
- [ ] **Propose the new order**:
    1. Sub-second checks, frequent-failers first within the block
    2. Cheap-but-not-instant frequent-failers (format check is the classic offender — it fails whenever an agent edits without formatting, yet pipelines habitually run it last)
    3. Typecheck and lint (order by measured cost after tool caches land)
    4. Cheap never-failers (a few seconds each)
    5. The test suite (usually the highest failure rate _and_ the highest cost — it belongs after every static gate)
    6. Builds and packaging (near-zero observed failure rates; last)
- [ ] **Check every subset surface inherits this order.** A `pre-commit` hook that runs its own hand-maintained sequence almost always drifts to _reverse_-cost order (the most expensive check first, the cheap frequent-failer last) because it was written by appending steps, not by ranking them. On the same failure sample, a cheap frequent-failer stranded last in a hook wastes `(distinct failing runs) × (cost of the steps ahead of it)` on every doomed commit. Prefer a subset runner that derives its order from the canonical step list (single source of truth) over a duplicated hand-ordered list that can silently re-drift.
- [ ] **Re-verify after reordering**: the failure distribution is a property of the team/agents' editing habits, not of the pipeline — expect it to be stable, but re-mine after a quarter.

## Phase 5: Test-Suite Runtime and Agent Ergonomics

- [ ] **Measure real wall time** with per-suite instrumentation:

    ```bash
    bun test --reporter=junit --reporter-outfile=/tmp/junit.xml
    ```

- [ ] **Check for serial execution**: if the sum of per-suite times ≈ wall time, the run is fully serial and process-level sharding is the only large win available.
- [ ] **Rank suites and compute concentration**: what fraction of wall time do the top 10 suites hold? High concentration (>50%) means targeted fixes beat broad ones. Look for the usual heavy patterns: real `git init` + commits per test (share a template repo and file-copy it), real subprocess spawns, real timers/sleeps, per-test server startup.
- [ ] **Compare against the timeouts agents actually use**: Claude Code's Bash tool defaults to 120s. A suite whose cold run exceeds that fails _deterministically_, not flakily. Mitigations in order of cheapness:
    1. Document expected duration in the agent-facing doc (AGENTS.md/CLAUDE.md): "full suite takes N minutes; set timeout ≥ 2× N, or run targeted files"
    2. Set `BASH_DEFAULT_TIMEOUT_MS` in the repo's `.claude/settings.json` env block
    3. Point agents at the cached gate (`bun run smoke:qc`) instead of raw `bun test` when validating unrelated changes
    4. Fix the top-ranked slow suites
    5. Shard across processes — but first read the concurrency guards (test-run locks, shared fixture trees, fixed ports); sharding without per-shard isolation trades a slow suite for a flaky one
- [ ] **Verify the concurrency guard story**: if a lock forbids concurrent runs, confirm stale locks self-clear and that the gate skips (not fails) when another run holds the lock.
- [ ] **Weigh the pre-commit hook's wall time as a per-commit tax**: unlike the full gate (run on demand), the hook runs synchronously on _every_ commit, so its warm cost is felt by every contributor and every agent commit. Once the hook shares the pipeline cache (Phase 2), the common path — committing after a recent `smoke:qc` — should collapse to cache-hash overhead plus any genuinely-uncacheable hook step (e.g. a staged-diff secret scan). If it does not, the hook is either bypassing the cache or running an uncacheable step it should not (a hook that scans the _working tree_ can be cached; one that scans the _staged index_ cannot — keep the latter minimal).

## Calibration Reference (aidd, 2026-07)

Real numbers from the audit this definition was distilled from — use as order-of-magnitude anchors, not targets:

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
- [ ] All gate surfaces enumerated: canonical runner, CI job(s), and git hooks (`core.hooksPath`/husky/lint-staged resolved)
- [ ] Each hook's exact command list read and diffed against the canonical step set (subset, order, cache-routing noted)
- [ ] Per-step cost table complete (recorded or measured, source noted)
- [ ] Cold and warm gate wall times computed
- [ ] Cache-machinery overhead measured

### Caching

- [ ] Every step classified: cached / cacheable-but-unregistered / uncacheable-by-design
- [ ] Every "uncacheable by design" rationale falsified against the implementation
- [ ] Cached steps' dependency lists checked for completeness (tool configs, check script, lockfile)
- [ ] Every gate surface shares the cache: hooks route through the cache API / a cache-aware subset runner, not raw `bun run <step>`
- [ ] Tool-level caches evaluated: eslint, prettier, tsc incremental, coverage-keyed test cache

### Duplication

- [ ] Source coverage mapped per tool invocation; overlaps measured individually
- [ ] Instrumentation overhead (coverage) measured and justified
- [ ] Serial-but-independent invocations identified

### Ordering

- [ ] Failure counts mined from the largest available log sample (sample size stated)
- [ ] Ordering waste quantified in minutes for each misplaced step
- [ ] Proposed order follows ascending cost / P(fail); never-failing builds last
- [ ] Every subset surface (hooks) inherits the canonical order — reverse-cost hook drift checked and quantified on the same sample

### Test Runtime

- [ ] Wall time measured with per-suite timings (junit or equivalent)
- [ ] Serial vs parallel established (suite-time sum vs wall time)
- [ ] Top-10 concentration computed; heavy patterns identified per slow suite
- [ ] Gate/suite time compared against default agent and CI timeouts; mitigations proposed
- [ ] Concurrency guards read and understood before any sharding recommendation

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

| Surface          | Source (file:line) | Steps run (in order) | Shares cache? | Order matches canonical? |
| ---------------- | ------------------ | -------------------- | ------------- | ------------------------ |
| canonical runner |                    |                      | —             | —                        |
| CI job           |                    |                      |               |                          |
| pre-commit hook  |                    |                      |               |                          |

## Step Table

| Step | Cost | Cached | Failures ({n} runs) | Position (current → proposed) |
| ---- | ---- | ------ | ------------------- | ----------------------------- |

## Findings

### Caching gaps

{Steps rerunning identical work; incomplete dependency lists (correctness); missing tool caches}

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

- This audit is self-applicable: aidd's own `smoke:qc` is a valid target, as is any derived project's gate — including its `.githooks/pre-commit` subset, which must share the smoke-cache and inherit `SMOKE_QC_STEPS` ordering
- Reordering and cache-registration changes must themselves pass the full gate before landing
- When a fix belongs in a template the project derives from, escalate to the template rather than patching the derived app
- Correctness beats speed: an incomplete cache dependency list (stale green) is always a higher-severity finding than any slowness

---

**Version**: 1.1
**Last Updated**: 2026-07-15
**Next Review**: 2026-10-15

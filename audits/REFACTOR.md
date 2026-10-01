---
title: 'Refactoring Roadmap and Safety Audit'
last_updated: '2026-10-01'
version: '1.1'
category: 'Core Quality'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Per milestone / on-demand'
lifecycle: 'development'
---

# Refactoring Roadmap and Safety Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

This is a **synthesis-and-safety** audit, not a detection audit. It does **not** re-find complexity, dead code, debt, or structural defects; those are owned by the sibling cluster ([COMPLICATION](./COMPLICATION.md), [TECHDEBT](./TECHDEBT.md), [DEAD_CODE](./DEAD_CODE.md), [REORG](./REORG.md), [CODE_QUALITY](./CODE_QUALITY.md), [HYGIENE](./HYGIENE.md)). It **consumes their findings** and turns them into a prioritized, sequenced, safety-checked refactoring plan, and it polices the discipline of refactoring itself.

**Critical Priorities**

- **Behavior preservation is the prime directive**: a refactor changes structure, never observable behavior. Any change to outputs, contracts, side effects, error handling, or persisted state in something labeled a "refactor" is a finding; it is a feature or fix in disguise, not a refactor.
- **Safety net before structure**: no non-trivial refactor is recommended to start without a regression net (tests, crawltest or integration coverage exercising the affected path, or `smoke:qc` gates that would catch a break; which of these a target has depends on the target, see [Safety-Net Reference](#safety-net-reference)). If the net is missing, the **first step** of the plan is to add it.
- **Ownership before recommendation**: in a derived Spernakit app, read `.templateoverrides` first. A path with an entry is a recorded decision, and a template-managed file is the template's to restructure, not the app's (see [Ownership Gate](#3-ownership-gate-derived-spernakit-apps-blocking)).
- **Synthesize, don't re-detect**: every roadmap item must cite the source-audit finding (and its ID) it derives from. REFACTOR adds prioritization, sequencing, and a safety wrapper; it does not duplicate the underlying detection.

**Essential Standards (Required)**

- **Leverage-first prioritization**: rank candidates by `(impact × change-frequency) ÷ (effort × risk)`. High-churn hotspots that are also complex rank first; rarely-touched ugly code ranks last.
- **Incremental and reversible**: every refactor is decomposed into small, independently shippable, individually revertible steps. Big-bang rewrites are flagged as high-risk with explicit mitigation.
- **Abstraction correctness, both directions**: extract the _right_ seam when real duplication crosses the rule-of-three, **and** flag over-abstraction (speculative generality, single-implementation interfaces, one-caller "frameworks") for reversal. Premature abstraction is debt too.
- **Stack-aware seams**: proposed extractions must respect the target's existing boundaries rather than cutting across them. In Spernakit and derived apps these are the Elysia plugin pipeline, service facades, and `shared/` types. In aidd they are the same service and `shared/` boundaries plus the database worker: every multi-statement transaction is a command in `backend/src/db/commands.ts`, so a refactor must not move one out of that layer or introduce a `db.transaction()` call in a route or service (single-statement writes through the Drizzle client in services are normal there). Spernakit has no worker command layer; do not propose one there. For another target, read its own module boundaries before proposing a seam.
- **Recommendations obey the target's rules**: where the target's agent-instruction file forbids feature flags, compatibility layers, transitional code or abstractions for future use, a refactor plan must not rely on them.

**Focus Areas**

- **Refactoring roadmap**: a single prioritized, sequenced plan synthesized from open sibling-audit findings and git churn
- **Behavior-preservation review**: diffs/branches/PRs intended as refactors that actually alter behavior
- **Safety-net gaps**: high-value refactor targets lacking regression coverage
- **Abstraction defects**: missing seams (duplication past rule-of-three) and over-abstraction (speculative generality to unwind)
- **Sequencing and risk**: dependency order, blast radius, reversibility, and big-bang detection

## Table of Contents

1. [Audit Objectives](#audit-objectives)
2. [Scope](#scope)
3. [Exclusions](#exclusions)
4. [Pre-Audit Setup](#pre-audit-setup)
5. [Methodology](#methodology)
6. [Boundaries vs Adjacent Audits](#boundaries-vs-adjacent-audits)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)
9. [Deliverables](#deliverables)
10. [Companion Audits](#companion-audits)

## Audit Objectives

- **Synthesize** the open findings of the detection cluster into one prioritized refactoring roadmap with leverage, effort, and risk for each item
- **Verify behavior preservation** for every proposed or in-flight refactor: structure changes, behavior does not
- **Assess the safety net** for each high-value target, and require regression coverage _before_ any refactor that lacks it
- **Diagnose abstraction defects** in both directions: missing seams (genuine duplication past the rule-of-three) and over-abstraction (premature generality to reverse)
- **Sequence and decompose** refactors into small, reversible, independently shippable steps ordered by dependency and blast radius
- **Produce a durable roadmap** the backlog (`feature.json`) and future milestones can consume

## Scope

### Inputs (primary)

- Existing sibling audit reports under `.aidd/audit-reports/`: `COMPLICATION-*.md`, `TECHDEBT-*.md`, `DEAD_CODE-*.md`, `REORG-*.md`, `CODE_QUALITY-*.md`, `HYGIENE-*.md`
- Open findings in `.aidd/features/` (`feature.json` files) produced by those audits
- Git churn / change frequency (to weight candidates toward hotspots)
- The current safety-net baseline: `bun run smoke:qc` status and the project's test, crawltest or integration coverage
- Derived Spernakit apps: `.templateoverrides` at the app root and the template checkout the project registers

### Code (for assessment, not re-detection)

- Files under the target's source roots (`frontend/src/`, `backend/src/`, and `shared/src/` in Spernakit and derived apps; aidd adds `cli/src/`; other targets have their own layout): examined **only** to evaluate refactor seams, behavior preservation, and safety-net coverage, never to re-detect defects the sibling audits own
- Branches, diffs, and PRs labeled or intended as refactors

## Exclusions

- **Re-detecting** complexity, dead code, technical debt, duplication, or structural defects; these belong to the sibling audits; REFACTOR consumes their output and must cite their finding IDs rather than re-reporting
- **Behavior-changing work**: feature additions, bug fixes, and behavior-altering performance changes are **not** refactors by definition; if observable behavior changes, the change is out of this audit's scope and is owned by the relevant feature/fix flow or [PERFORMANCE.md](./PERFORMANCE.md)
- **Test, config, migration, and generated files** for seam analysis (`*.test.*`, `*.spec.*`, `__tests__/**`, `config/*.json`, migrations, `frontend/src/components/ui/*`, etc.); same exclusions as the sibling audits
- **Greenfield design**: this audit improves the structure of existing code; net-new architecture is owned by [ARCHITECTURE.md](./ARCHITECTURE.md)

## Pre-Audit Setup

### Required Inputs

```bash
# 1. The detection cluster's most recent reports (the candidate source)
ls .aidd/audit-reports/{COMPLICATION,TECHDEBT,DEAD_CODE,REORG,CODE_QUALITY,HYGIENE}-*.md

# 2. Open findings already filed by those audits
ls .aidd/features/   # feature.json findings to synthesize and sequence

# 3. Change-frequency signal (hotspot weighting) - last 90 days, most-churned source files
#    (add 'cli/src' for aidd; use the target's own source roots elsewhere)
git log --since="90 days ago" --name-only --pretty=format: -- 'frontend/src' 'backend/src' 'shared/src' \
  | grep -E '\.(ts|tsx)$' | sort | uniq -c | sort -rn | head -40

# 4. Safety-net baseline - must be green before recommending any refactor START
bun run smoke:qc

# 5. Derived Spernakit apps only - recorded differences from the template
cat .templateoverrides
```

### Safety-Net Reference

What counts as a regression net depends on the target. Identify the target first.

- **Spernakit and derived apps** deliberately ship **no unit-test framework**. The regression net is crawltest and integration-script coverage plus the gate pipeline. Do not recommend adding a unit-test framework as the characterization step; add crawltest or integration-script coverage.
- **aidd** runs `bun:test` unit tests (in `smoke:qc` and in CI) as well as the gate pipeline. A test that pins the behavior of the refactor target is the first-choice characterization step there.
- **Other targets**: read the project's own scripts and test setup. Do not assume either model.

"Has a safety net" means one or more of:

| Mechanism                                     | What it protects during a refactor                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run smoke:qc`                            | The canonical gate pipeline. Read the step list from its source (Spernakit and derived apps: `scripts/smoke.json`; aidd: `scripts/lib/smoke-qc/steps.ts`); do **not** hardcode a step count here. Steps such as `typecheck`, `lint`, `build`, `check:api-types`, `check:schema-parity`, `check:feature-integration`, and `check:max-lines` catch a large class of structure-breaking regressions. |
| Unit tests (aidd; any target that has them)   | Pin the behavior of the unit being restructured. Cite the test file and case that exercises the path                                                                                                                                                                                                                                                                                              |
| Crawltest / integration coverage              | Exercises the affected user path end-to-end; the primary behavioral safety net for UI/route refactors in Spernakit and derived apps                                                                                                                                                                                                                                                               |
| `check:api-types`                             | Catches a refactor that silently changes the API contract. It is a different check in Spernakit and in aidd; read `scripts/check-api-types.ts` in the target for what it covers                                                                                                                                                                                                                   |
| `check:schema-parity` (dual-dialect projects) | Catches a refactor that diverges the SQLite/PostgreSQL schema mirror                                                                                                                                                                                                                                                                                                                              |

> A refactor target with **none** of the above exercising it is **uncovered**; its plan must begin with "add characterization coverage," not with the structural change.

## Methodology

### 1. Build the candidate inventory (synthesis)

- Collect every open, actionable finding from the sibling reports and `feature.json` files (complexity hotspots, duplication, structural-size violations, deprecation-with-evidence, dead-code clusters).
- **Deduplicate**: the same module often appears in several audits (a god-object shows up in COMPLICATION _and_ REORG _and_ CODE_QUALITY). Collapse to one candidate per refactor target, listing every source finding ID it rolls up.
- Record for each candidate: target (file/module/seam), source finding ID(s), and the defect class.

### 2. Weight by leverage

Score each candidate so the plan attacks the highest-value work first:

```
leverage = (impact × change_frequency) ÷ (effort × risk)
```

- **impact**: severity inherited from the source audit (Critical/High/Medium/Low)
- **change_frequency**: how often the target churns (from step 3 of Pre-Audit Setup); a complex file touched weekly is far more valuable to refactor than an equally complex file untouched in a year
- **effort**: rough size of the transformation
- **risk**: blast radius (how many call sites / how central the module)

Rank candidates by leverage. **Hotspots** (high churn × high complexity) lead the roadmap; cold, low-risk ugliness trails it.

### 3. Ownership gate: derived Spernakit apps (BLOCKING)

Skip this step for the Spernakit template itself, for aidd, and for targets that are not derived from the template. For a derived app, classify every candidate's files before it enters the roadmap:

- **Path has a `.templateoverrides` entry** (`KEEP`, `SKIP` or `DELETED`, normally with a written reason, which the parser does not require; parsed by `loadTemplateOverrides` in the template's `scripts/lib/template/overrides.ts`). The difference from the template is a recorded decision by the app's owner. Do not recommend overwriting the file from the template, moving it, or "realigning" it; that destroys app-owned work. A refactor inside the file is allowed only if it keeps what the entry's reason says the app is holding. If the reason looks stale, that is a finding for [SPERNAKIT.md](./SPERNAKIT.md), not a refactor item.
- **Template-managed path with no entry.** The file is the template's. `check:drift` requires pure files to match the template byte for byte and fails on drift in security infrastructure, so a refactor applied in the app either fails the gate or is overwritten at the next template sync. Remove the candidate from the app's roadmap and record it once as a template-owned item, naming the template as the owner. The classification is in the template's `scripts/template-manifest.json` (`branded` and `infrastructure` lists; everything else the template ships is `pure`) and `SECURITY_INFRASTRUCTURE_FILES` in `scripts/lib/template/security.ts`.
- **Infrastructure file the app extends** (for example `backend/src/app.ts`, `frontend/src/routes.tsx`, navigation). The app's own additions are the app's to refactor; the template's structure around them is not.
- **App-owned path** (domain routes, services, pages and schema the app added). The app's to refactor. Only these candidates, and the app-owned parts of the two cases above, go on the derived app's roadmap.

To classify a path, compare it with the template checkout the project registers and with `.templateoverrides`. Do not infer ownership from the file's content.

A source finding from a sibling audit that recommends restructuring a template-managed file in a derived app is itself misrouted. Cite it, mark it template-owned, and do not sequence it for the app.

### 4. Behavior-preservation gate (BLOCKING)

For **every** candidate _and_ every in-flight diff/branch labeled a refactor, confirm the transformation is **structure-only**. A refactor that trips any of these "behavior-change smells" is reclassified as a feature/fix; it must not be presented or merged as a refactor:

- Changed return values, output shape, or rendered DOM
- Added, removed, or reordered side effects (network calls, DB writes, logs that other code depends on)
- Altered error handling: different errors thrown, swallowed, or surfaced
- Changed public API / function signature / Elysia route contract / exported type
- Changed persisted state (DB writes, migration behavior, serialized format)
- Changed timing/ordering that another component observes (event sequence, async resolution order)

> When a "refactor" legitimately _should_ change behavior, that is fine, but it is then a feature or fix and belongs in that flow with its own review, not in the refactor roadmap.

### 5. Safety-net assessment

For each high-leverage candidate, determine whether a regression net (see Safety-Net Reference) exercises the affected path:

- **Covered**: `smoke:qc` gates, tests and/or crawltest meaningfully exercise the target → the refactor may proceed.
- **Uncovered**: no gate, test or crawltest would catch a behavioral break → the **first sequenced step** of this refactor is "add characterization coverage," and the structural change is blocked until it exists.

Do not assume `smoke:qc` green equals "covered"; a passing build/typecheck does not prove behavior is pinned. Cite the specific gate, test or crawltest that protects the path, or declare it uncovered.

### 6. Abstraction-correctness review (both directions)

**Missing seams** (under-abstraction):

- Real duplication that has crossed the **rule of three** (3+ genuine repetitions of the same logic, not coincidental shape) and warrants extraction
- Identify the _correct_ seam: a `shared/` pure function, a service facade, a custom hook, or in aidd a database command, matching the target's existing boundaries
- Every extraction needs its consumers in the same change. An extracted helper with no immediate caller is the "for future use" abstraction that the over-abstraction check below reverses
- Do **not** recommend extraction on the first or second occurrence (premature DRY creates the over-abstraction problem below)

**Over-abstraction** (speculative generality to reverse):

- Single-implementation interfaces / abstract base classes with one subclass
- One-caller "frameworks", config-driven indirection backed by a single config, or parameters that are never varied
- Premature generalization built for a future that did not arrive
- Recommend **inlining/simplifying** these; reversing an over-abstraction is itself a valuable, behavior-preserving refactor

### 7. Sequence and decompose

- Order the roadmap by **dependency** (refactors that unblock others first) and **blast radius** (contain risk; avoid touching many hotspots at once).
- Decompose each refactor into **small, independently shippable, individually revertible steps**. Each step should leave the system green, and each step must be complete in itself: no step may leave a dead branch, a duplicate code path or a compatibility alias behind for a later step to remove unless the target's rules allow that.
- Flag any refactor that **cannot** be made incremental (a genuine big-bang) as **High risk**, and require an explicit mitigation before it is scheduled. Choose the mitigation from what the target's rules permit:
    - **Target forbids new feature-flag surfaces, transitional and compatibility code** (the rules covering Spernakit, derived apps and aidd do, unless the owner explicitly requests or approves one): characterization coverage first, then one reviewed change that moves every consumer together, with revert of that change as the rollback. Do not recommend a feature flag, a parallel run or an expand-then-contract migration. If no safe single change exists, say so and state that the plan needs the project owner's written approval for an exception.
    - **Target has no such rule**: a feature flag, a parallel run or an expand-then-contract migration are acceptable mitigations.
- A file-size candidate taken from REORG follows the target's `check:max-lines` gate. Where that gate carries a baseline of files that were over the cap when it landed, a baselined file is existing recorded debt, not a new finding; it may still be a roadmap item, cited to its source finding.
- Map each actionable item to the backlog (`feature.json`) for tracking, referencing the source finding IDs.

## Boundaries vs Adjacent Audits

REFACTOR is a meta-layer. It owns the **plan, safety, and abstraction-correctness** of change; the sibling audits own the **detection** of the underlying defects. REFACTOR must not file duplicate findings for a defect another audit already detected; it references that finding and wraps it in a sequenced, safety-checked plan.

| Concern                                                                                 | Owner                                                       |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Measured intra-unit complexity (cyclomatic / nesting / params / premature optimization) | [COMPLICATION.md](./COMPLICATION.md)                        |
| Duplication, naming, ordering, export conventions                                       | [CODE_QUALITY.md](./CODE_QUALITY.md)                        |
| Deprecation-with-evidence, placeholder/mock code                                        | [TECHDEBT.md](./TECHDEBT.md)                                |
| Unused files / exports / dependencies                                                   | [DEAD_CODE.md](./DEAD_CODE.md) / [HYGIENE.md](./HYGIENE.md) |
| File / module / service size, structural boundaries                                     | [REORG.md](./REORG.md)                                      |
| Net-new architecture / greenfield design                                                | [ARCHITECTURE.md](./ARCHITECTURE.md)                        |
| Behavior-changing performance work                                                      | [PERFORMANCE.md](./PERFORMANCE.md)                          |
| **Prioritizing & sequencing the above into a refactor plan**                            | **REFACTOR (this audit)**                                   |
| **Behavior-preservation discipline & safety net of a refactor**                         | **REFACTOR (this audit)**                                   |
| **Abstraction correctness (missing seams + over-abstraction reversal)**                 | **REFACTOR (this audit)**                                   |

> **Net-new findings unique to this audit**: behavior-preservation violations (a "refactor" that changes behavior) and safety-net gaps (a high-value target with no regression coverage) are genuinely this audit's own; file them as findings. Everything else is a synthesis of existing findings and must cite its source.

## Audit Checklist

### Critical Checks

- [ ] `bun run smoke:qc` is **green** before any refactor is recommended to start (safety-net precondition)
- [ ] Every proposed or in-flight "refactor" verified **behavior-preserving**: no changed contracts, outputs, side effects, error handling, or persisted state
- [ ] No roadmap item duplicates a sibling-audit finding **without citing its source finding ID** (synthesis, not re-detection)
- [ ] Every high-value target lacking regression coverage has **"add characterization coverage" as its first sequenced step**
- [ ] Derived Spernakit apps: `.templateoverrides` was read in full, and no roadmap item overwrites, moves or realigns a path that has an entry
- [ ] Derived Spernakit apps: no roadmap item restructures a template-managed file in the app; each such candidate is recorded once as template-owned

### High Priority Checks

- [ ] **High**: Candidates ranked by leverage `(impact × churn) ÷ (effort × risk)`; high-churn hotspots prioritized over cold code
- [ ] **High**: Each refactor decomposed into small, independently shippable, individually reversible steps
- [ ] **High**: Missing seams: duplication past the rule-of-three identified with the **correct** extraction target (shared util / facade / hook / command)
- [ ] **High**: Over-abstraction: single-implementation interfaces, one-caller frameworks, and speculative indirection flagged for reversal
- [ ] **High**: Proposed seams respect the target's boundaries (Elysia plugin pipeline, service facades and `shared/` types; in aidd also the database command layer in `backend/src/db/commands.ts`)
- [ ] **High**: No roadmap item relies on a feature flag, compatibility layer, transitional code or future-use abstraction in a target whose rules forbid them

### Medium Priority Checks

- [ ] **Medium**: Sequencing accounts for inter-refactor dependencies and blast radius
- [ ] **Medium**: Big-bang-only refactors (cannot be made incremental) flagged High risk with an explicit mitigation the target's rules permit (flag / parallel-run / expand-contract only where the target allows them)
- [ ] **Medium**: Each actionable roadmap item mapped to a backlog `feature.json` entry referencing source finding IDs
- [ ] **Medium**: Rule-of-three respected: no extraction recommended on first/second duplication unless it is a cross-cutting concern
- [ ] **Medium**: Safety-net claims cite the specific gate, test or crawltest that protects the path (not just "smoke:qc is green")
- [ ] **Medium**: The safety-net recommendation fits the target (no unit-test framework proposed for Spernakit or a derived app)

### Low Priority Checks

- [ ] The refactoring roadmap is captured as a durable artifact for the milestone, not a one-off note
- [ ] Quick-win refactors (low effort, low risk) separated from strategic, multi-step ones
- [ ] Reversed over-abstractions noted so the same speculative pattern is not reintroduced

## Report Template

Create report: `.aidd/audit-reports/REFACTOR-YYYY-MM-DD.md`. This audit produces a roadmap and findings, not a numeric score. Every `file:line` in the report is the live location read during this audit; do not copy one from a source report without re-reading the file.

```markdown
# Refactoring Roadmap & Safety Audit Report - YYYY-MM-DD

## Executive Summary

**Candidates synthesized**: [Number] (from [N] sibling reports / [M] open feature.json findings)
**Roadmap items**: [Number] (after dedup)
**Behavior-preservation violations found**: [Number]
**Safety-net gaps (uncovered high-value targets)**: [Number]
**Over-abstractions flagged for reversal**: [Number]

> Synthesis evidence (required): list the source reports/finding IDs and the churn command output used to weight leverage. A roadmap with no cited sources or churn data is not a valid pass.

## Refactoring Roadmap

| Rank | Target              | Source finding ID(s)        | Leverage | Effort | Risk | Safety net                    | Sequenced steps               |
| ---- | ------------------- | --------------------------- | -------- | ------ | ---- | ----------------------------- | ----------------------------- |
| 1    | `path/to/module.ts` | COMPLICATION-…#3, REORG-…#1 | High     | M      | Med  | Covered (test or crawltest X) | 1) extract Y → 2) inline Z    |
| 2    | `path/to/other.ts`  | TECHDEBT-…#2                | Med      | S      | Low  | **Uncovered**                 | 1) add coverage → 2) refactor |

## Behavior-Preservation Findings (net-new)

- `branch/PR or path` - claimed refactor, but changes [output/contract/side effect/state]. Evidence: [diff line / file:line]. Reclassify as [feature/fix].

## Safety-Net Gaps (net-new)

- `path/to/target.ts` - high-leverage refactor target with no gate/crawltest exercising it. First step must be characterization coverage.

## Template-Owned Candidates (derived Spernakit apps)

- `path/to/template-managed.ts` - source finding [ID]. Not sequenced for this app: [template-managed, no `.templateoverrides` entry | entry `ACTION` with reason "..."]. Owner: the template.

## Abstraction Findings

### Missing Seams (extract)

- Duplication of [logic] across [file:line, file:line, file:line] (rule-of-three met) → extract to [shared util / facade / hook / command].

### Over-Abstraction (reverse)

- `path/to/abstraction.ts` - [single-impl interface / one-caller framework / speculative indirection] → inline/simplify.

## Sequencing Notes

- Dependency order, blast-radius containment, big-bang risks and their mitigations.

## Recommendations

### Immediate (0-7 days)

1. Start the top-ranked, already-covered, low-risk refactor(s)
2. Reclassify and re-route any behavior-preservation violations out of the refactor flow

### Short-term (1-4 weeks)

1. Add characterization coverage for uncovered high-value targets, then refactor
2. Reverse the highest-risk over-abstractions

### Long-term (1-3 months)

1. Work down the sequenced roadmap by leverage; re-synthesize after the next detection-audit pass
2. Keep the roadmap in sync with the backlog (`feature.json`)

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Next milestone or on-demand]
```

## Deliverables

1. **Audit report** at `.aidd/audit-reports/REFACTOR-YYYY-MM-DD.md`
2. **Refactoring roadmap**: the prioritized, sequenced, safety-checked plan (the primary deliverable), each item citing its source finding ID(s)
3. **Feature.json files** in `.aidd/features/` for each actionable refactor (referencing source-audit finding IDs; do **not** duplicate the underlying defect finding) and for each net-new behavior-preservation violation or safety-net gap
4. **Synthesis evidence**: the source reports/finding IDs consumed and the churn data used for leverage weighting

## Companion Audits

> **Detection cluster (candidate sources)**: This audit synthesizes the open findings of [COMPLICATION.md](./COMPLICATION.md), [TECHDEBT.md](./TECHDEBT.md), [DEAD_CODE.md](./DEAD_CODE.md), [REORG.md](./REORG.md), [CODE_QUALITY.md](./CODE_QUALITY.md), and [HYGIENE.md](./HYGIENE.md). Run those first; REFACTOR is most valuable when the detection layer is fresh.

> **Net-new architecture**: For greenfield structure and architectural decisions (as opposed to behavior-preserving restructuring of existing code), see [ARCHITECTURE.md](./ARCHITECTURE.md).

> **Behavior-changing performance work**: A change that alters algorithms or outputs to go faster is not a refactor; see [PERFORMANCE.md](./PERFORMANCE.md).

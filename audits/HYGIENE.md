---
title: 'Comprehensive Code Hygiene Audit'
last_updated: '2026-06-28'
version: '2.4'
category: 'Core Quality'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
---

# Comprehensive Code Hygiene Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

Execute a comprehensive code hygiene audit by running multiple static analysis tools and consolidating their findings into a single actionable report.

## Executive Summary

**Critical Priorities**

- **Zero circular dependencies**: Circular imports break tree-shaking and create fragile coupling
- **Zero missing dependencies**: Unlisted deps cause runtime failures in clean installs
- **Low duplication**: Target <5% code duplication (JSCPD)
- **Zero unused dependencies**: Bloats bundle size and install time

**Essential Standards (Required)**

- **Automated tool coverage**: Knip (dead code + deps), JSCPD (duplication), Madge (circular + orphans)
- **Cross-reference validation**: Overlapping tool findings are deduplicated before reporting
- **False positive awareness**: Known false-positive patterns are filtered before classification
- **Actionable output**: Every finding includes file paths, severity, and remediation guidance

**Detection Categories**

- **Dead code**: Unused files, exports, types (Knip + Madge orphans)
- **Dependency issues**: Unused, missing, or misplaced dependencies (Knip)
- **Code duplication**: Copy-pasted blocks above threshold (JSCPD)
- **Architectural issues**: Circular dependencies, orphaned modules (Madge)

## Relationship to Other Audits

HYGIENE is the **umbrella static-analysis audit** that orchestrates automated tools. For deeper manual analysis, defer to specialized audits:

| Concern               | HYGIENE covers                                                                                               | Specialized audit                                                                                                            |
| --------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| Dead code detection   | Automated tools (Knip, Madge orphans)                                                                        | [DEAD_CODE.md](./DEAD_CODE.md): manual file-by-file analysis                                                                 |
| Feature reachability  | Not covered (tool-based only)                                                                                | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md): entrypoint traversal, "Cathedral" detection                              |
| Feature wiring        | Not covered                                                                                                  | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md): route registration in create-api-app.ts, page registration in routes.tsx |
| Code quality/linting  | Not covered                                                                                                  | [CODE_QUALITY.md](./CODE_QUALITY.md): ordering, lint, comments, file organization                                            |
| Config & module-style | Static, grep-based checks (see [Configuration & Module-Style Hygiene](#configuration--module-style-hygiene)) | [CODE_QUALITY.md](./CODE_QUALITY.md) / [SECURITY.md](./SECURITY.md): deeper secret scanning and code-style enforcement       |

> **Note**: The `hygiene` skill (`skills/hygiene/SKILL.md`) is a thin invocation wrapper. This audit definition is the canonical source.

## Table of Contents

1. [Pre-Audit Setup](#pre-audit-setup)
2. [Execute Analysis Tools](#phase-1-execute-analysis-tools)
3. [Configuration & Module-Style Hygiene](#configuration--module-style-hygiene)
4. [Known False Positive Patterns](#known-false-positive-patterns)
5. [Consolidate and Analyze Results](#phase-2-consolidate-and-analyze-results)
6. [Audit Checklist](#audit-checklist)
7. [Report Template](#report-template)
8. [Expected Deliverables](#expected-deliverables)

## Pre-Audit Setup

### Required Tools

All tools run via `bunx` (no global installation required):

```bash
# Verify tools are available
bunx knip --version
bunx jscpd --version
bunx madge --version
```

> **Tool version capture is mandatory**: Resolve and record the actual Knip, JSCPD, and Madge versions at run time. Some targets pin Knip in `package.json`; others resolve it through `bunx`. JSCPD and Madge are intentionally run through `bunx`, so they resolve to whatever version is fetched at run time; duplication % and circular-dep output are therefore non-deterministic across runs and apps. Record every resolved version on the Report Template's "Tool versions" line for every run (this is required, not optional).

### Verification Commands

```bash
# Run quality baseline — if this fails, fix QC issues before auditing hygiene
bun run smoke:qc

# Quick smoke test — if these run without errors, tools are ready
# (no POSIX pipes — these commands run as-is in PowerShell or bash)
bunx knip --no-exit-code
bunx madge --extensions ts,tsx --ts-config tsconfig.json --circular frontend/src backend/src
```

> **`smoke:qc` already covers some hygiene surface**: The `smoke:qc` pipeline (canonical step list in `scripts/lib/smoke-qc/steps.ts`; do not quote a fixed step count, it drifts) already runs `lint` (with `eslint-plugin-unused-imports`) and `check:env-spread`. So **dead/unused imports** and the **`.env`/`process.env` invariant** are pre-enforced by the quality gate. Knip's incremental value over `lint` is unused **files, exports, types, and dependencies**; do not re-report unused imports as a HYGIENE finding when `smoke:qc` is green.

## Phase 1: Execute Analysis Tools

Run the following tools against the codebase and capture their complete output:

### 1. Dead Code and Dependency Detection (Knip)

- [ ] **Run Knip**: `bunx knip`, the primary tool for dead code and dependency analysis
    - Capture: unused files, unused exports, unused dependencies, missing dependencies, unused types
    - If Knip reports configuration hints, address them first to reduce false positives
    - Cross-reference unused files with Madge orphan output (Phase 1.3) for confirmation

> For comprehensive manual dead-code analysis beyond what automated tools detect, run the [DEAD_CODE.md](./DEAD_CODE.md) audit separately. For detecting fully-built but unwired features ("Cathedrals"), run [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md).

> **Depcheck is out of stack**: Depcheck is **not** part of the Spernakit stack (absent from `package.json`, scripts, and STACK.md), and Knip supersedes its dependency analysis. Do not run Depcheck as part of HYGIENE; rely on Knip for dependency detection.

### 2. Code Duplication Detection

- [ ] **Run JSCPD**: `bunx jscpd`, which detects copy-pasted code blocks
    - Capture: duplicate code blocks, duplication percentage, affected files
    - Configure threshold: minimum 5 lines, minimum 50 tokens
    - Target: <5% overall duplication

#### Common Duplication Patterns in Spernakit Apps

CRUD entity pages are the #1 source of duplication across Spernakit applications (observed 3-13% duplication rates). Typical patterns:

- Nearly identical `CreateDialog`, `EditDialog`, `ListPage` components across entity domains
- Repeated route handler patterns for standard CRUD operations
- Workspace/file handler boilerplate

**Evaluation guidance**: If duplication is primarily in CRUD pages and each page is expected to diverge over time, duplication under 5% is acceptable. Above 5%, consider extracting shared `EntityFormDialog` / `EntityListPage` patterns.

### 3. Module Dependency Analysis

- [ ] **Run Madge (Circular Dependencies)**: `bunx madge --extensions ts,tsx --ts-config tsconfig.json --circular frontend/src backend/src`
    - Capture: all circular dependency chains
    - Severity: **Critical**; all circular deps must be resolved

- [ ] **Run Madge (Orphan Modules)**: `bunx madge --extensions ts,tsx --ts-config tsconfig.json --orphans frontend/src backend/src`
    - Capture: files that are never imported
    - Cross-reference with Knip unused files for confirmation

- [ ] **Run Madge (Leaf Modules)**: `bunx madge --extensions ts,tsx --ts-config tsconfig.json --leaves frontend/src backend/src`
    - Capture: files that don't import anything (potential utility candidates)
    - Severity: **Informational**; leaf modules are not necessarily problems

> **Madge instrument validity**: Every Madge analysis must emit a processed-file count, and the
> report must record it. `Processed 0 files` invalidates the instrument even when Madge exits zero;
> correct the scope or TypeScript configuration and rerun it before drawing conclusions.

## Configuration & Module-Style Hygiene

These stack-level invariants (`docs/template/STACK.md` in the target repository) are **already enforced by `smoke:qc` and owned by other audits**; HYGIENE does not re-run grep checks for them. Confirm the gate is green and delegate any deeper analysis; do not invent undocumented checks under HYGIENE.

| Invariant                                                        | Enforced by                        | Owning audit                         |
| ---------------------------------------------------------------- | ---------------------------------- | ------------------------------------ |
| JSON-only config / no `.env` / single approved `process.env` use | `check:env-spread` (in `smoke:qc`) | [SECURITY.md](./SECURITY.md)         |
| No hardcoded secrets in committed config or source               | secret scanning                    | [SECURITY.md](./SECURITY.md)         |
| Named exports only (no stray `export default`)                   | `lint` (in `smoke:qc`)             | [CODE_QUALITY.md](./CODE_QUALITY.md) |
| ESM only (no `require()` / `module.exports`)                     | `lint` (in `smoke:qc`)             | [CODE_QUALITY.md](./CODE_QUALITY.md) |

> **Delegation note**: If a finding requires deeper analysis (e.g. secret rotation, broad code-style enforcement), file it under [SECURITY.md](./SECURITY.md) or [CODE_QUALITY.md](./CODE_QUALITY.md) rather than expanding HYGIENE's scope.

## Known False Positive Patterns

These patterns are consistently flagged by tools across Spernakit applications but are not actual issues. Verify before dismissing, but expect these to be false positives:

| Pattern                                       | Tool       | Why it's a false positive                                                                                           |
| --------------------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------- |
| `@fontsource-variable/*` reported unused      | Knip       | Imported in CSS (`@import`), not in JS; Knip only scans JS imports (also in `knip.json` `ignoreDependencies`)       |
| `tw-animate-css` reported unused              | Knip       | Referenced via CSS `@import`; Knip only scans JS imports (also in `knip.json` `ignoreDependencies`)                 |
| `tailwindcss` reported unused                 | Knip       | Imported in CSS (`@import "tailwindcss"`) or via `@tailwindcss/vite` plugin, not in JS (also in `knip.json`)        |
| `@tailwindcss/vite` reported unused           | Knip       | Referenced in `vite.config.ts` plugins array, not a direct import                                                   |
| Barrel file re-exports flagged by Knip        | Knip       | `index.ts` re-exports may appear unused if consumers import from the barrel; check Knip config for `entry` patterns |
| Template-provided scripts (spernakit-browser) | Knip/Madge | Automation scripts from the Spernakit template; evaluate at template level, not per-app                             |
| SQLite/PostgreSQL dual schema duplication     | JSCPD      | `schema/*.ts` and `schema-pg/*.ts` produce expected structural duplication; exclude from clone detection            |
| Frontend/backend type mirroring               | JSCPD      | `frontend/src/api/types/` mirrors backend types by design (workspace isolation); architectural, not a clone         |

**Template-origin files**: Use the target repository's `scripts/template-manifest.json` and
`.templateoverrides` to classify template infrastructure. If a listed file is genuinely unused,
escalate it to the template instead of deleting it only from the derived app.

## Phase 2: Consolidate and Analyze Results

Review all tool outputs and create a unified remediation plan:

### 1. Consolidate Findings

- [ ] **Filter known false positives**: Remove items matching patterns in the Known False Positive Patterns table above
- [ ] **Cross-reference results**: Identify overlapping issues reported by multiple tools (e.g., Knip and Madge both flagging orphaned files)
- [ ] **Categorize issues**:
    - Dead code (unused exports, unreachable code, orphaned files)
    - Dependency issues (unused, missing, misplaced)
    - Code duplication (copy-paste violations above threshold)
    - Architectural issues (circular dependencies)
- [ ] **Quantify impact**: Count total issues per category and estimate cleanup effort

### 2. Prioritize Remediation

Assign priority levels based on:

- **Critical**: Circular dependencies, missing dependencies (breaks functionality)
- **High**: Unused dependencies (bloats bundle), significant code duplication (>10%)
- **Medium**: Unused exports, orphaned files, duplication 5-10%
- **Low**: Leaf modules (informational), minor duplication (<5%)

### 3. Create Remediation Plan

- [ ] **Generate consolidated report** following the Report Template below
- [ ] **Create feature.json files** in `.aidd/features/` for each high-priority finding per aidd conventions:
    - `id`: `audit-hygiene-{unix_timestamp}-{descriptive-slug}`
    - `auditSource`: `HYGIENE`
    - `auditSeverity`: mapped from priority level
    - Include affected files and proposed remediation in `spec`

## Audit Checklist

### Dead Code & Dependencies

- [ ] Knip executed and configuration hints addressed
- [ ] Unused files identified and cross-referenced with Madge orphans
- [ ] Unused exports cataloged with consumer analysis
- [ ] Unused dependencies confirmed (false positives filtered)
- [ ] Missing dependencies identified and verified

### Code Duplication

- [ ] JSCPD executed with threshold: 5 lines, 50 tokens
- [ ] Overall duplication percentage recorded
- [ ] Duplicate blocks categorized (CRUD patterns vs genuine copy-paste)
- [ ] Duplication above 5% has specific remediation recommendations

### Module Architecture

- [ ] Circular dependencies identified; all are Critical severity
- [ ] Orphaned modules identified and cross-referenced with Knip
- [ ] Leaf modules cataloged (informational)
- [ ] Madge processed-file count recorded and greater than zero for each analysis

### Configuration & Module-Style (delegated to `smoke:qc` + owning audits)

- [ ] `smoke:qc` is green: `check:env-spread` (`.env`/`process.env` invariant) and `lint` (named-exports-only, ESM-only) passed; deeper issues filed under [SECURITY.md](./SECURITY.md) / [CODE_QUALITY.md](./CODE_QUALITY.md), not expanded under HYGIENE

### Consolidation

- [ ] Known false positive patterns filtered
- [ ] Cross-tool findings deduplicated
- [ ] Findings categorized and prioritized
- [ ] Remediation plan created with effort estimates
- [ ] Feature.json files created for high-priority findings
- [ ] Audit artifacts are not future-dated and committed report metadata is sane (aidd-specific: run/reference `check-audit-artifact-hygiene`; optional for non-aidd apps)

## Report Template

```markdown
# HYGIENE Audit Report - {YYYY-MM-DD}

## Executive Summary

- **Application**: {app-name} v{version}
- **Date**: {date}
- **Overall Score**: {score}/100
- **Tool versions**: Knip {v}, JSCPD {v}, Madge {v}

| Category     | Critical | High | Medium | Low |
| ------------ | -------- | ---- | ------ | --- |
| Dead Code    | {n}      | {n}  | {n}    | {n} |
| Dependencies | {n}      | {n}  | {n}    | {n} |
| Duplication  | {n}      | {n}  | {n}    | {n} |
| Architecture | {n}      | {n}  | {n}    | {n} |

## Key Metrics

- **Duplication rate**: {n}% (target: <5%)
- **Madge processed files**: {n} (must be greater than 0)
- **Circular dependencies**: {n} (target: 0)
- **Unused dependencies**: {n} (target: 0)
- **Missing dependencies**: {n} (target: 0)
- **Unused files**: {n}
- **Unused exports**: {n}

## Findings by Category

### Dead Code (Knip + Madge Orphans)

{Findings with file paths, severity, remediation}

### Dependency Issues (Knip)

{Unused deps, missing deps, misplaced deps}

### Code Duplication (JSCPD)

{Duplicate blocks with file pairs, line ranges, clone percentage}

### Architectural Issues (Madge)

{Circular dependency chains, orphaned modules}

## False Positives Filtered

{Items matched to Known False Positive Patterns - listed for transparency}

## Remediation Plan

### Immediate (0-1 week)

{Critical and high priority items}

### Short-term (1-4 weeks)

{Medium priority items}

### Long-term (1-3 months)

{Low priority items, duplication extraction}

## Success Metrics

- [ ] 0 circular dependencies
- [ ] 0 missing dependencies
- [ ] 0 unused dependencies
- [ ] <5% code duplication (soft target - see exception below)
- [ ] 0 orphaned files (confirmed, after false positive filtering)
```

> **Duplication is a soft target, not a pass/fail gate**: For small, self-hosted, single-team apps, do not treat <5% as a universal gate. Duplication concentrated in deliberately-divergent CRUD/entity surfaces (each expected to evolve independently) is acceptable above 5%. Apply the extraction recommendation only when duplication reflects genuine copy-paste that will drift in lockstep.

> **Scoring requires real tool output, not a green gate**: A score of **90 or above is invalid unless the report cites resolved tool versions and per-category finding counts** from an actual run of Knip / JSCPD / Madge (fill in the "Tool versions" line and the Category and Key Metrics tables with real numbers). A passing `smoke:qc` is a precondition, not evidence; never derive the score from a green gate (per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md)). Reports that only assert "no issues found" without resolved versions and counts must be scored as incomplete.

## Expected Deliverables

1. **Audit report**: `.aidd/audit-reports/HYGIENE-{YYYY-MM-DD}.md` following the Report Template above
2. **Feature issues**: `.aidd/features/audit-hygiene-{timestamp}-{slug}/feature.json` for high-priority findings
3. **Action plan**: Prioritized remediation steps with effort estimates

## Notes

- All tools run via `bunx`; no global installation required
- If a tool fails or is not applicable, document why and skip it
- Filter known false positives before classifying findings
- For template-origin files, evaluate at the template level; escalate to Spernakit if the fix belongs there
- Estimate total remediation effort and propose timeline

---

**Version**: 2.4
**Last Updated**: 2026-06-28
**Next Review**: 2026-09-28

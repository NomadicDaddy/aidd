---
title: 'Project Assertions / Invariants Audit'
last_updated: '2026-08-30'
version: '1.4'
category: 'Core Quality'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Per milestone / on-demand'
lifecycle: 'development'
---

# Project Assertions / Invariants Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

Use this audit to verify that the implemented codebase honors every invariant declared in `/.aidd/assertions.md`. Assertions are the project's behavioral, data, and UX rules - they are stricter than feature acceptance criteria and must hold across the entire codebase, not only in the feature that introduced them.

## Executive Summary

**Critical Priorities**

- Every invariant in `/.aidd/assertions.md` must be classified as Upheld, Partially upheld, Unenforced, Ambiguous, or Stale
- Security and data invariants must have defense-in-depth enforcement (backend guards + database constraints + UI affordances)
- Deferred (future-milestone) invariants must not be reported as gaps

**Essential Standards**

- `assertions.md` is a hard prerequisite - if missing, emit exactly one finding and abort
- Each `Unenforced` finding must include concrete grep evidence showing the absence of enforcement
- `assertions.md` itself is audited for stale numerical claims, status markers, and contradictions

**Requirements**

- 100% of in-scope invariants classified with file:line evidence
- Zero false positives on `Unenforced` classifications (verify indirect enforcement via plugins, framework defaults, migrations, scheduled jobs)
- Compliance matrix produced with one row per invariant

## Table of Contents

1. [Audit Objectives](#audit-objectives)
2. [Scope](#scope)
3. [Pre-Audit Setup](#pre-audit-setup)
4. [Methodology](#methodology)
5. [Audit Checklist](#audit-checklist)
6. [Spernakit Applicability](#spernakit-applicability)
7. [Finding Template](#finding-template)
8. [Report Template](#report-template)
9. [Deliverables & Success Criteria](#deliverables--success-criteria)

## Audit Objectives

- **Walk every invariant** in `/.aidd/assertions.md` and locate the code that upholds it
- **Surface regressions** where an invariant is contradicted by current code
- **Flag gaps** where an invariant has no enforcement mechanism anywhere in the codebase
- **Cross-check roadmap scope** - invariants scoped to shipped milestones must hold now; invariants scoped to future milestones are out-of-scope and should not be reported as gaps
- **Produce a line-by-line compliance matrix** so operators can see exactly which rules are enforced, partially enforced, or unenforced

## Scope

### In Scope

- All invariants listed in `/.aidd/assertions.md` (behavioral, data, UX, security, performance)
- Code paths that implement, enforce, or could regress each invariant
- Tests / crawltest evidence that confirms enforcement

### Out of Scope

- Feature acceptance tests (those live in `feature.json` - a separate concern)
- Invariants scoped to roadmap milestones that have not yet shipped (per `/.aidd/roadmap.json`)
- Informal "nice to have" language in prose docs that is not formalized in `assertions.md`

## Pre-Audit Setup

### Required Files

- `/.aidd/assertions.md` - project invariants (behavioral, data, UX, security, performance)
- `/.aidd/roadmap.json` - milestone scope gating (recommended but not required)
- `/.aidd/spec.md` - product specification (source of contextual invariant language)

### Verification Commands

> The `grep`/`ls`/`wc` commands below are illustrative (bash/GNU). On the primary Windows/PowerShell dev environment they are not native - the portable path is `bun run smoke:qc` plus file globs / your editor's search. No behavioral change either way; only `bun run smoke:qc` is required.

```bash
# Verify assertions.md exists
ls .aidd/assertions.md

# Verify roadmap.json exists (optional but recommended)
ls .aidd/roadmap.json

# Establish quality baseline (portable — required)
bun run smoke:qc

# Check for milestone tags in assertions.md (illustrative bash)
grep -n "MVP\|v[0-9]\|milestone" .aidd/assertions.md

# Count total invariants (approximate — headings + bullet rules; illustrative bash)
grep -c "^-\|^##" .aidd/assertions.md
```

### Prerequisites

- `/.aidd/assertions.md` must exist and contain at least one invariant. If missing, abort the audit with a single finding: `audit-assertions-missing-assertions-file` recommending the operator run `/doc2feature` on interview responses (if present) or author `assertions.md` directly.
- `/.aidd/roadmap.json` is recommended for scope gating. If missing, assume all invariants are in-scope for the current release.

## Methodology

### 1. Parse the assertions file

- Read `/.aidd/assertions.md` top to bottom
- For each discrete invariant, capture:
    - **ID or stable anchor** (heading or bullet - generate one if absent, e.g., `ASSERT-001`)
    - **Statement text** (the rule itself, verbatim)
    - **Category** (behavioral / data / UX / security / performance / accessibility)
    - **Milestone scope** if annotated (MVP, v1.0, v2.0). Default: applies now.
- **Verify numerical claims and status markers** in assertions.md against current codebase:
    - Feature counts, version numbers, completion percentages, boolean flags
    - Cross-check with `package.json`, `git tag`, and actual file counts
    - Flag stale assertions with a `Stale` classification (create finding `audit-assertions-<slug>-assertions-md-stale`)

### 2. Roadmap scope gating

- Read `/.aidd/roadmap.json` if present
- Determine the currently-shipped milestone set (entries with all tasks complete or marked shipped)
- For each invariant, mark in-scope or deferred:
    - **In-scope**: invariant is unmarked, or its milestone is in the shipped set, or no roadmap exists
    - **Deferred**: invariant is explicitly tagged with a milestone that has not shipped yet

Deferred invariants are not audited further - note them in the report's "Deferred" section.

### 3. Evidence search per invariant

For each in-scope invariant, search the codebase for enforcement:

- **First, locate the project's shared assertion helpers** (`invariant()`, `assertUser()`, `assertNever()`, or equivalents). Many invariants are enforced indirectly through a single central helper - finding it up front prevents false `Unenforced` classifications when a call site delegates to it.
- Extract keywords from the invariant statement (domain nouns, verbs, filenames if mentioned)
- Search `backend/src/` and `frontend/src/` for matching code
- Check for:
    - Validation (TypeBox schema on Elysia routes, Zod for config schemas, runtime guards, custom validators)
    - Guards / middleware (auth, workspace, role)
    - Database constraints (NOT NULL, UNIQUE, foreign keys, check constraints) in `backend/src/db/schema/`. **Note SQLite vs PostgreSQL divergence**: check-constraint and column-shape enforcement can differ between `backend/src/db/schema/` (SQLite) and `backend/src/db/schema-pg/` (PostgreSQL); the `check:schema-parity` gate is the canonical indirect signal that both dialects enforce the invariant equivalently - cite it rather than inspecting one dialect only.
    - Type-level / static invariants: TypeScript exhaustiveness checks (`assertNever()`, `never`-typed default branches on discriminated unions). A compile-time exhaustiveness guard is valid enforcement for invariants over a closed set of states.
    - UI affordances (disabled states, error toasts, redirects) in `frontend/src/pages/` and `frontend/src/components/`. For destructive-action UX invariants (irreversible-action confirmation, destructive-operation warnings), `bun run check:destructive-confirmation` is a fast indirect-enforcement signal - prefer it over a manual `ConfirmAlertDialog` component search.
    - Assertions inside code (`if (...) throw new Error(...)`)

Record exact file:line references for each evidence hit.

### 4. Classification

Classify each in-scope invariant into one of:

- **Upheld**: clear enforcement found in at least one appropriate layer (or multiple, for defense-in-depth invariants)
- **Partially upheld**: some layers enforce it, but an obvious gap exists (e.g., backend validates but frontend allows the bad input through, or frontend gates UI but backend has no check)
- **Unenforced**: no enforcement found anywhere, or code actively contradicts the invariant
- **Ambiguous**: invariant is too vague to verify without operator clarification (flag for rewording)
- **Stale**: assertion contains outdated numerical claims, status markers, or contradicted values (e.g., "206 total features" when actual count is 244)

### 5. False positive control (BLOCKING)

Before creating a finding for `Unenforced` or `Partially upheld`:

1. **Read the relevant files** you believe lack enforcement
2. **Record the exact grep commands** run and their results as evidence in the finding description
3. **Check for indirect enforcement**: plugins, framework defaults, database constraints applied via migrations, scheduled jobs
4. If enforcement is found via any mechanism, upgrade the classification to `Upheld` and do not create a finding

Failure to verify produces false positives that erode trust in the audit system.

## Audit Checklist

### Critical Checks

- [ ] Every invariant in `/.aidd/assertions.md` has been located and classified
- [ ] Every `Unenforced` finding includes concrete evidence (grep commands + results) showing the absence
- [ ] No invariant tagged with a future milestone is reported as a gap
- [ ] `assertions.md` exists - if missing, a single `audit-assertions-missing-assertions-file` finding is emitted

### High Priority Checks

- [ ] Data invariants (uniqueness, referential integrity) are enforced at the database layer, not only the application layer
- [ ] Security invariants (authz, workspace isolation, tenant scoping) have guard-level enforcement, not only UI-level hiding. **Exception**: for single-user / single-team self-hosted apps (e.g. aidd, which is no-auth/no-RBAC by design), authz/workspace/tenant-scoping invariants are typically absent on purpose - do not flag their absence as `Unenforced`. Verify only that any tenant-scoping invariant actually present in that app's `assertions.md` is enforced; do not require multi-tenant guards on apps that declare none.
- [ ] UX invariants (irreversible action confirmation, destructive operation warnings) exist as reachable components
- [ ] Each `Partially upheld` finding specifies which layer(s) enforce it and which layer(s) do not

### Medium Priority Checks

- [ ] Ambiguous invariants are flagged with suggested rewording for operator review
- [ ] Compliance matrix is written to the report (one row per invariant)
- [ ] Where defense-in-depth is expected (strictly security and data-integrity invariants), multiple layers are verified. For behavioral/UX invariants and for small self-hosted tools, a single correct enforcement layer is `Upheld` - not `Partially upheld`; do not require multiple layers there. **Single-realistic-layer exception**: for a data-integrity invariant where no second enforcement layer realistically applies (e.g. a uniqueness/referential rule fully enforced by a database constraint with no meaningful application-layer duplicate), the DB-layer enforcement alone is `Upheld`, not `Partially upheld`. Do not invent a missing application-layer "gap" when the database constraint is the correct and complete enforcement point.
- [ ] Stale assertions in `assertions.md` are flagged with current-correct values

### Low Priority Checks

- [ ] Recommendations for extracting repeated enforcement patterns into shared utilities
- [ ] Suggested invariants discovered during the audit that aren't yet in `assertions.md` but should be

## Spernakit Applicability

This audit is designed to be stack-agnostic, but the following notes adapt its generic evidence-search methodology to the **Spernakit v3** stack (React 19 + Vite 8 + Elysia + Drizzle ORM + SQLite/PostgreSQL + TanStack Query + Zustand + Bun).

| Generic Search Pattern | Spernakit Equivalent / Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Validation layer       | TypeBox via Elysia (`t.Object`, `t.String`) on route schemas. Zod used ONLY in `backend/src/config/configSchema.ts` for config validation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Guards / middleware    | Elysia `beforeHandle` guards (`requireRoleFresh`, `workspaceAccess`) enforce role and workspace access. API-key identity is resolved by `authPlugin`; the role guard caps its effective role to the key scope. Plugin pipeline (see the current template source and STACK.md for ordering): Client IP → Request ID → Logger → CORS → Security Headers → Auth → Password Change Guard → CSRF → Rate Limit → Auth Rate Limit → Workspace → Audit. **N/A for no-auth single-user apps**: the auth/RBAC/workspace stages and the `requireRoleFresh`/`workspaceAccess` guards do not exist in single-user self-hosted apps (e.g. aidd) - their absence is not a gap.                                                                                                                                                    |
| Database constraints   | Drizzle ORM schema in `backend/src/db/schema/` (SQLite) and `backend/src/db/schema-pg/` (PostgreSQL). Check `.notNull()`, `.unique()`, `.references()`, `index()`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| UI affordances         | React components in `frontend/src/pages/` and `frontend/src/components/`. Check disabled states, `ConfirmAlertDialog`, toast error handling, React Router redirects.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| Client state           | Zustand stores in `frontend/src/stores/` - never React Context for state.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Server state           | TanStack Query (`useQuery`, `useMutation`) with `queryClient.invalidateQueries()` for cache invalidation.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Code assertions        | `if (...) throw new Error(...)` or `assertUser()` helpers.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| Indirect enforcement   | Elysia plugins (auto-applied to all routes), Drizzle ORM parameterized queries (SQL injection prevention). The full `smoke:qc` gate list (canonical source: `scripts/smoke.json`) is a strong indirect-enforcement source for data/config/contract invariants - an `Upheld` classification can lean on these rather than re-deriving them. Relevant gates include `check:config`, `check:schema-drift`, `config:validate`, `check:secrets-shape`, `check:api-types`, `check:feature-integration` (reachability), `check:schema-parity` (SQLite/PG drift), and `check-deps`. Do not assert a fixed step count - read `scripts/smoke.json` for the current pipeline. For destructive-action UX invariants, `bun run check:destructive-confirmation` (a standalone script, not a `smoke:qc` step) is a direct signal. |
| Correlation IDs        | `X-Request-ID` + `X-Session-ID` headers for request tracing - check `plugins/requestId.ts` and `frontend/src/utils/correlationId.ts`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |

## Finding Template

Feature IDs for this audit use the `audit-assertions-` prefix. For each gap, create `.aidd/features/audit-assertions-<slug>/feature.json` with:

- `id`: `audit-assertions-<stable-slug>` (e.g., `audit-assertions-workspace-isolation-backend-gap`)
- `description`: The invariant that is not upheld, verbatim from `assertions.md`
- `spec`: Concrete work required to close the gap (add guard / add constraint / add UI check). Include the invariant ID and the specific layer(s) missing enforcement.
- `status`: `planned`
- `passes`: `false`

> **Invariant ID convention**: When `assertions.md` does not define stable IDs, generate them with a project prefix (e.g. `MM-ASSERT-001` for margin-planner, `VR-ASSERT-001` for hidden-path) rather than a bare `ASSERT-001`. The generated ID range MUST match the invariant count - if the file has 17 invariants, IDs run `…-001` through `…-017`, not `…-034`. A range that exceeds the count signals dropped, merged, or miscounted invariants and is itself a reportable inconsistency.

## Report Template

Create report: `.aidd/audit-reports/ASSERTIONS-YYYY-MM-DD.md`.

```markdown
# Project Assertions Audit Report - YYYY-MM-DD

## Executive Summary

**Total invariants in assertions.md**: [Number]
**In-scope (current milestone or unmarked)**: [Number]
**Deferred (future milestones)**: [Number]
**Upheld**: [Number] ([%])
**Partially upheld**: [Number]
**Unenforced**: [Number]
**Ambiguous**: [Number]
**Stale**: [Number]

## Compliance Matrix

| ID         | Invariant (excerpt) | Category | Scope | Classification   | Evidence                                |
| ---------- | ------------------- | -------- | ----- | ---------------- | --------------------------------------- |
| ASSERT-001 | ...                 | data     | MVP   | Upheld           | backend/src/db/schema/users.ts:42       |
| ASSERT-002 | ...                 | security | MVP   | Partially upheld | frontend guard present, backend missing |
| ASSERT-003 | ...                 | UX       | v2.0  | Deferred         | -                                       |

## Detailed Findings

### Unenforced Invariants (feature.json created)

- **ASSERT-002**: [invariant text]
    - Evidence of absence: `grep -rn "..." backend/src/` returned 0 matches
    - Missing layer(s): backend guard
    - Finding: `audit-assertions-<slug>`

### Partially Upheld Invariants (feature.json created)

- **ASSERT-004**: [invariant text]
    - Enforcement found in: frontend/src/pages/foo/Bar.tsx:88
    - Missing in: backend route handler (no matching validation)
    - Finding: `audit-assertions-<slug>`

### Ambiguous Invariants (no finding - flagged for rewording)

- **ASSERT-005**: "Users should have a good experience"
    - Reason: Not measurable / not testable - recommend rewording with concrete acceptance criteria.

### Stale Assertions (feature.json created)

- **ASSERT-006**: "[stale claim, e.g., 206 total features]"
    - Current value: 244 features
    - Source of truth: `ls .aidd/features/ | wc -l`
    - Finding: `audit-assertions-<slug>-assertions-md-stale`

### Deferred Invariants (out of scope - not audited)

- **ASSERT-003**: [invariant text] (scope: v2.0, not yet shipped)

## Recommendations

### Immediate (0-7 days)

1. Close `Unenforced` gaps for security and data invariants (highest risk class)
2. Add missing defense-in-depth layers for `Partially upheld` security findings
3. Update stale assertions in `assertions.md` with current-correct values

### Short-term (1-4 weeks)

1. Reword ambiguous invariants with operator input
2. Extract repeated enforcement patterns into shared utilities
3. Review `assertions.md` status markers against current codebase after any major release

### Long-term (1-3 months)

1. Add a CI check that re-runs this audit on every merge to main
2. Consider auto-generating invariant enforcement tests from `assertions.md`

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Deliverables & Success Criteria

### Deliverables

1. **Compliance matrix** (one row per invariant) with ID, category, scope, classification, and file:line evidence
2. **Classification counts** with percentages: Upheld, Partially upheld, Unenforced, Ambiguous, Stale, Deferred
3. **Feature.json files** for every `Unenforced`, `Partially upheld`, and `Stale` finding
4. **Executive summary** with total invariants, in-scope count, and critical/high/medium/low issue counts
5. **Concrete grep evidence** recorded for every `Unenforced` finding (commands + results)

### Success Criteria

- [ ] 100% of in-scope invariants classified with supporting evidence
- [ ] Zero deferred invariants misreported as gaps
- [ ] Zero false positives on `Unenforced` classifications (indirect enforcement verified)
- [ ] `assertions.md` stale claims identified and corrected values provided
- [ ] Report reviewed and signed off by lead developer or tech lead

## Usage Notes

Invoke via `aidd --audit ASSERTIONS --project-dir <path>`. The audit is safe to run standalone or as part of a multi-audit set (e.g. `--audit ASSERTIONS,SECURITY,DEAD_CODE`) since it does not modify code - it only creates findings under `.aidd/features/audit-assertions-*/`.

> **Companion audits**: Run alongside [SECURITY.md](./SECURITY.md) when the bulk of invariants are authz / tenant-scoping rules (security audit covers OWASP-class concerns the invariants may not name explicitly), and alongside [SCHEMA_CONSTRAINTS.md](./SCHEMA_CONSTRAINTS.md) when invariants are heavy on data integrity (schema audit verifies the DB-layer enforcement depth this audit only samples).

---
title: 'Shared vs Page UI Separation Audit'
last_updated: '2026-10-01'
version: '1.6'
category: 'Frontend'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'specialized'
---

# Shared vs Page UI Separation Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

**Critical Priorities**

- **Shared/page boundary enforcement**: Shared UI in `src/components/...` must never import from `src/pages/...`
- **Cross-page coupling prevention**: Page directories must not import from other page directories
- **Component placement accuracy**: Single-feature components must be co-located with their page, not in `components/shared/`

**Essential Standards**

- Import shared UI through the target's import convention (Spernakit and derived apps: the `@/components/...` path alias; aidd: relative paths, it has no alias); import page-scoped UI via `./<domain>/...` relative paths
- Shared components accept generic props with no route coupling (`useNavigate`, route params, page-local types)
- Page components orchestrate data fetching, permissions, and route-state management

**Requirements**

- `bun run smoke:qc` must pass as a baseline before auditing
- Boundary violations must be resolved before the audit is considered complete

## Table of Contents

1. [Spernakit Applicability](#spernakit-applicability)
2. [Pre-Audit Setup](#pre-audit-setup)
3. [Purpose](#purpose)
4. [Directory Rules](#directory-rules)
5. [Import Rules](#import-rules)
6. [Shared Component Criteria](#shared-component-criteria)
7. [Page Component Criteria](#page-component-criteria)
8. [Props & Types](#props--types)
9. [Data Fetching & Mutations](#data-fetching--mutations)
10. [Permissions & Access](#permissions--access)
11. [UI Consistency](#ui-consistency)
12. [Testing & Linting](#testing--linting)
13. [Anti-Patterns](#anti-patterns)
14. [Audit Checklist](#audit-checklist)
15. [Review Walkthrough](#review-walkthrough)
16. [Quick Examples](#quick-examples)
17. [Relationship to Other Audits](#relationship-to-other-audits)
18. [Report Template](#report-template)
19. [Deliverables & Success Criteria](#deliverables--success-criteria)

## Spernakit Applicability

This audit fully applies to the Spernakit template and the apps derived from it (React + Vite + Elysia + Drizzle). It does not apply to a target with no React frontend (a CLI, a static site, a mobile app on another UI stack); mark it N/A there with the falsification record the methodology requires.

**Applicability to aidd.** aidd is a single-user local tool with no RBAC and no multi-workspace concept. The [Permissions & Access](#permissions--access) section and any role-based-UI-visibility, `workspace` store, or workspace-switcher expectations are **N/A by design** for aidd - do not record their absence as a finding (per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Rule 4, audit the degenerate equivalent only if one exists; here there is none). The shared-vs-page boundary, `components/{ui,shared,layout}` placement, `pages/<domain>/` grouping and the barrel-file rules apply unchanged. Three things differ in aidd, and none of them is a finding:

- **No `@/` alias.** aidd's frontend declares no path alias and imports by relative path with the file extension (`../../components/shared/PageHeader.tsx`). Do not flag relative imports of shared UI in aidd. The boundary is judged by which directory an import reaches, not by how the path is written.
- **Pages are registered in `frontend/src/App.tsx`**, not in `routes/lazyPages.ts`.
- **The integration gate is narrower.** aidd's `check:feature-integration` checks route and page registration only. It does not check shared-to-page imports, cross-page imports or skeleton import paths, so in aidd those boundaries have no gate and this audit is the only check on them.

**Derived Spernakit apps.** Read `.templateoverrides` at the app root before recommending that a component be moved. A path with an entry is a recorded decision; do not recommend relocating or overwriting it. A shared component the template ships is template-managed: a placement problem in it is a finding against the template, filed once, not a relocation to carry out in the app. Components the app added are the app's to move.

### Stack Context

Read the target's own `package.json` files for the versions in use.

| Concept            | Spernakit Implementation                                                                                                                                                                                                                  |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend framework | React with React Compiler (automatic memoization)                                                                                                                                                                                         |
| Bundler            | Vite                                                                                                                                                                                                                                      |
| Server state       | TanStack Query (query keys, optimistic updates, invalidation)                                                                                                                                                                             |
| Client state       | Zustand stores in `frontend/src/stores/`                                                                                                                                                                                                  |
| UI primitives      | shadcn/ui in `frontend/src/components/ui/` (direct imports, no barrel)                                                                                                                                                                    |
| Path alias         | `@/` resolves to `frontend/src/` (Spernakit and derived apps; aidd has no alias)                                                                                                                                                          |
| Page registration  | Pages imported in `frontend/src/routes/lazyPages.ts`, route objects in `frontend/src/routes/routeGroups.tsx` and `settingsRoutes.tsx` (aidd: `frontend/src/App.tsx`)                                                                      |
| API and utilities  | API modules in `frontend/src/api/`, utilities in `frontend/src/lib/`. Neither Spernakit nor aidd has a `frontend/src/services/` directory                                                                                                 |
| Hooks              | All hooks live in `frontend/src/hooks/`; domain subdirectories are at most one level deep. STACK.md currently says 3+ related hooks while DEVELOPMENT.md says 2+; do not score that upstream documentation conflict as derived-app drift. |
| Testing            | Spernakit and derived apps: `crawltest` + `smoke:qc` only, no unit-test framework by design. aidd: `bun:test` unit tests run in `smoke:qc` and CI                                                                                         |

### React Compiler Note

React Compiler handles automatic memoization - **do not** add manual `React.memo`, `useMemo`, or `useCallback` to shared components unless profiling proves the compiler misses a hot path. See `STACK.md` for details.

## Pre-Audit Setup

Before beginning the audit, prepare search commands to identify boundary violations:

> **Note**: The `grep` commands below are diagnostic aids for manual scanning. The canonical reachability gate is `bun run check:feature-integration` (part of `smoke:qc`), which detects unwired routes and orphan pages. In Spernakit and derived apps the same gate also fails on a shared module under `components/`, `hooks/`, `lib/` or `stores/` that imports from `pages/`, and on the forbidden skeleton import path; read the header of `scripts/check-feature-integration.ts` in the target for the checks it really runs. aidd's gate covers registration only. Always scan **both** `*.tsx` and `*.ts` - hooks, API modules, and constants that bridge boundaries live in `.ts` files, not just `.tsx`.

> **Absence checks need a control**: steps 2 to 4 pass by printing nothing. Before reading an empty result as clean, run the same search for something known to be present (for example an import that page files certainly contain) to show the pattern and the paths work in this target and this shell. The `grep` forms need a POSIX shell; on Windows PowerShell use `rg` or the agent's search tool.

1. **Run quality checks**: `bun run smoke:qc` must pass to establish a clean baseline.
2. **Scan for shared → page imports** (should be zero). Scan every shared directory, not only `components/`:
    ```bash
    grep -rE "from ['\"].*pages/" frontend/src/components/ frontend/src/hooks/ frontend/src/lib/ frontend/src/stores/ frontend/src/api/ --include="*.tsx" --include="*.ts"
    ```
3. **Scan for cross-page imports** (cross-domain hits should be zero). Both commands produce candidates, not findings: review each hit and keep only those where the importing file's page domain differs from the imported one. An import within the same domain is fine, whether written as `@/pages/<same-domain>/...` or as `../` inside a nested page directory. The alias form applies to Spernakit and derived apps. The relative form is how a page directory reaches a sibling (`../<other-domain>/...`) and is the only form in aidd, which has no alias; it leaves out relative imports of the shared directories.
    ```bash
    grep -rE "from ['\"]@/pages/" frontend/src/pages/ --include="*.tsx" --include="*.ts"
    grep -rE "from ['\"](\.\./)+" frontend/src/pages/ --include="*.tsx" --include="*.ts" \
      | grep -vE "from ['\"](\.\./)+(components|hooks|lib|stores|api|types)/"
    ```
4. **Scan for barrel file boundary blurring**:
    ```bash
    # Top-level hooks/ should have NO barrel file; components/ui/ should have none either
    ls frontend/src/hooks/index.ts frontend/src/components/ui/index.ts 2>/dev/null
    ```
5. **Verify path alias usage** (Spernakit and derived apps only; skip for aidd, which has no alias):
    ```bash
    grep -r "\.\./components/" frontend/src/pages/ --include="*.tsx" --include="*.ts" -l
    ```

## Purpose

- Provide a quick review checklist to enforce the separation between shared UI in `src/components/...` and page-scoped UI in `src/pages/<route>/...`.

## Directory Rules

- Place reusable UI under the appropriate components directory:
    - `components/ui/` - shadcn/ui primitives (installed via CLI, not hand-edited)
    - `components/shared/` - application-level shared components (used by 2+ features)
    - `components/layout/` - layout shell components (sidebar, header, nav, workspace switcher)
- Place page-scoped UI under `src/pages/<route>/...` (e.g., `src/pages/users/UserTable`).
- Keep API types in `src/api/types/` (directory) or `src/api/types.ts` (single file) - choose by app scale; a single-file type module is appropriate for small self-hosted single-team apps and is not a violation. Keep page-only composite types in `src/pages/<route>/types.ts`.

## Import Rules

- From a page, import shared UI via `@/components/...` (path alias), not relative `../components/...`. This rule is for Spernakit and derived apps. aidd has no alias and imports shared UI by relative path; that is its convention, not a finding.
- Import page-scoped components via `./<domain>/...` within the same route directory.
- Shared components must never import from `src/pages/...`.
- Non-component shared code (hooks, API modules, `lib/` utilities, stores) must never import from
  `src/pages/...`. Page-local helpers stay in the page domain until a second genuine consumer
  justifies promotion to `hooks/`, `api/`, or `lib/`. All hooks live under
  `frontend/src/hooks/` (never `pages/*/hooks/`) and domain folders are at most one level deep.
  STACK.md currently says 3+ related hooks while DEVELOPMENT.md says 2+; report that once as
  upstream documentation drift and do not file either threshold as an application defect.
- Page components may import shared components, hooks, API modules, and utilities.

## Shared Component Criteria

- Encapsulates a focused UI concern; reusable across routes.
- Accepts generic props; does not depend on page-specific query state or route params.
- May perform intrinsic data fetching if central to the component's function, through an API module in `src/api/` and its own isolated query keys.
- Only imports from `src/components`, `src/hooks`, `src/api`, `src/lib`, `src/stores/`, API types (`src/api/types/` or `src/api/types.ts`), and other utility modules. Layout components legitimately access auth, theme, sidebar, and workspace stores (aidd has no workspace store).
- No navigation or route coupling (`useNavigate`, route params) unless explicitly designed as global UI.

## Page Component Criteria

- Orchestrates data fetching, optimistic updates, and mutations for the route.
- Computes permissions/access and passes them down to child components.
- Can compose shared components and page-scoped components.
- Keeps route-state management local (pagination, search, filters, UI state).

## Props & Types

- Shared component props are narrow and stable (`isOpen`, `onClose`, `onSubmit`, IDs, labels).
- Page components pass derived values: `permissions`, `accessLevel`, `currentUser`, etc.
- Page-only types live in `src/pages/<route>/types.ts`; API types in `src/api/types/` (directory) or `src/api/types.ts` (single file) by app scale.

## Data Fetching & Mutations

- Page components own list/detail queries and optimistic updates; invalidate route-level query keys.
- Shared components that fetch must use isolated query keys and services relevant to their function.
- Avoid having shared components reach into page query state or invalidate page-level keys unless necessary.

## Permissions & Access

- Page computes and supplies permission booleans/lists to children (e.g., `canManageRoles`, `delete` list).
- Shared components render based on provided props; avoid reading the `useAuth` hook / `authStore` directly unless truly cross-cutting.

## UI Consistency

- Use the design system classes consistently across both layers.
- Skeletons/loaders that can be reused belong in `components/shared/`.
- Build-enforced in Spernakit and derived apps (per DEVELOPMENT.md, checked by `check-feature-integration.ts`): shared skeletons must be imported via the DIRECT subdirectory path `@/components/shared/skeletons/<Name>`; a barrel re-export at `@/components/shared/<Name>` FAILS the build. aidd's gate has no skeleton check; apply the placement rule there by reading the imports.
- Keep action buttons and semantics consistent (e.g., `onClose`, `onSubmit`, `isPending`).
- React Compiler handles memoization automatically - do not add manual `React.memo`, `useMemo`, or `useCallback` unless profiling proves the compiler misses a hot path.

## Testing & Linting

- What the gates verify differs by target. In Spernakit and derived apps, `check:feature-integration` (in `smoke:qc`) fails on a shared module that imports from `pages/` and on the forbidden skeleton path; cross-page imports and props contracts are not gated. In aidd neither boundary is gated; `bun:test` unit tests and `smoke:qc` cover behavior, not placement. A green `smoke:qc` is therefore never evidence that the shared/page boundary holds: read the imports.
- `bun run crawltest` exercises the running app in Spernakit and derived apps (which have no unit-test framework by design). It does not check where a component lives.
- Ensure lints and type checks pass for any new components and props contracts.

> **Note**: Testing and linting are covered by CODE_QUALITY and HYGIENE audits respectively. This section checks only SSOC-specific concerns (e.g., props contract tests, shared/page boundary enforcement).

## Anti-Patterns

- Shared component imports anything from `src/pages/...`.
- Shared component depends on route params, navigation, or page-local types.
- Page component exposes services or business logic as props when it should be encapsulated.
- Duplicate skeletons or UI patterns in pages that belong in `components`.
- Logging secrets or leaking environment configuration from components.

## Audit Checklist

- [ ] **Critical**: No page directory imports from another page directory (cross-page coupling)
- [ ] **Critical**: Shared components never import from `src/pages/...`
- [ ] **High**: Single-feature components in shared/ identified - should be co-located with their feature page
- [ ] **High**: Layout components may use useNavigate/useLocation (expected route coupling, unlike shared components)
- [ ] **Medium**: No barrel file re-exports that blur the shared/page boundary
- [ ] **Medium**: Shared components used by 2+ features (not single-feature misplacements)
- [ ] **Medium**: Props contracts are narrow and stable for shared components
- [ ] **Low**: Skeletons and reusable loaders are in `components/shared/`, not duplicated in pages
- [ ] **Low**: Shared skeletons imported via the DIRECT path `@/components/shared/skeletons/<Name>` (Spernakit and derived apps, build-enforced by `check-feature-integration.ts`); no barrel re-export at `@/components/shared/<Name>`
- [ ] **Applicability**: The target was identified first; no alias, `lazyPages.ts`, permissions or workspace finding is filed against aidd, and the audit is marked N/A for a target with no React frontend
- [ ] **Derived Spernakit apps**: `.templateoverrides` was read; no relocation is recommended for a recorded path or for a template-shipped component (those are filed once against the template)

## Review Walkthrough

- Verify placement: is the component under `src/components/...` or `src/pages/<route>/...` appropriately?
- Scan imports:
    - Shared: only `components`, `hooks`, `api`, `lib`, `stores`, and other utility modules (written with the `@/` alias in Spernakit and derived apps, by relative path in aidd).
    - Page: shared `components/...` and `./<domain>/...` as needed.
- Check props contracts: shared components accept generic props; page components wire up complex state.
- Inspect data fetching:
    - Page orchestrates list/detail queries and optimistic updates.
    - Shared only fetches intrinsic data to its function and uses isolated keys.
- Validate permissions handling: page computes and passes; shared consumes.
- Confirm skeleton usage: reusable skeletons live in `components` and are imported by page tables.
- Ensure no route coupling in shared UI (navigation, params, page types).
- Run lints/type checks and the target's existing gates to verify contracts are honored.

## Quick Examples

These name files and symbols in the Spernakit template, not line numbers, because line numbers move. Read the live file and cite its `file:line` in the report.

- Correct shared import: `UsersTab` in `frontend/src/pages/settings/users/UsersTab.tsx` imports `DataTable` from `@/components/shared/data-table/DataTable`.
- Correct page-scoped imports: the same file imports its page-scoped pieces from `./index`, inside its own page directory.
- Same-domain alias import (not a cross-page finding): `SettingsLayout` in `frontend/src/pages/settings/SettingsLayout.tsx` imports `settingsTabs` from `@/pages/settings/settingsTabs`.
- aidd equivalent of a correct shared import: a page under `frontend/src/pages/` importing `PageHeader` from `../../components/shared/PageHeader.tsx` by relative path.

## Relationship to Other Audits

- **COMPOSITION_PATTERNS**: Overlaps on compound component patterns and slot-based APIs. SSOC focuses on where components live; COMPOSITION_PATTERNS focuses on how they compose internally.
- **REORG**: Overlaps on file organization and directory structure. SSOC prescribes the shared/page boundary rules; REORG addresses broader file placement and naming conventions.

## Report Template

This audit defines no scoring rubric, so it does not produce a numeric score, overall or per category. Write the score as `N/A` and let the severity counts, the metrics and the findings carry the result. Do not derive a number from checklist ticks or from a green gate.

Every location in the report is the live `file:line` read during this audit. The report must also carry the sections [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) requires: the instrument validation table, the methodology validity summary and the falsification records. Every "not applicable" disposition (for example Permissions & Access on aidd) needs a falsification record.

````markdown
# Shared vs Page UI Separation Audit Report - YYYY-MM-DD

## Executive Summary

**Application**: {app-name}
**Target**: [Spernakit template | derived Spernakit app | aidd | other - name it]
**Overall Score**: N/A (this audit defines no scoring rubric)
**Issues Found**: [Count] (Critical: [N], High: [N], Medium: [N], Low: [N])

**Separation Health Summary**:

- Cross-page coupling: [None/Minor/Major]
- Shared → page imports: [None/Minor/Major]
- Component placement: [count of misplaced components]
- Props contract quality: [count of violations]
- Import rule compliance: [count of violations]
- Boundary gated in this target: [yes - name the gate and what it checks / no]

## Category Breakdown

### 1. Boundary Enforcement (Critical)

**Issues Found**: [Number]

| ID   | Issue         | Severity | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | Critical | [File:Line] | [Solution] |

### 2. Component Placement (High)

**Issues Found**: [Number]

| ID   | Issue         | Severity | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | High     | [File:Line] | [Solution] |

### 3. Import & Props Compliance (Medium/Low)

**Issues Found**: [Number]

| ID   | Issue         | Severity | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | Medium   | [File:Line] | [Solution] |

## Detailed Findings

### Critical Issues

#### Issue #1: [Title]

- **Severity**: Critical
- **Category**: Boundary
- **Impact**: [Description]
- **Location**: `path/to/file.tsx:line`
- **Code**:
    ```tsx
    // Current code
    ```
- **Fix**:
    ```tsx
    // Corrected code
    ```
- **Effort Estimate**: [Hours/Days]

### High Priority Issues

[Similar format]

### Medium/Low Priority Issues

[Similar format]

## Recommendations

### Immediate Actions (0-7 days)

1. **[Resolve cross-page imports]**
    - Impact: Eliminates tight coupling between features
    - Effort: [Low/Medium/High]
    - Files: [List of affected files]

2. **[Move single-feature components to page directories]**
    - Impact: Clarifies component ownership
    - Effort: [Low/Medium/High]
    - Files: [List of affected files]

### Short-term Actions (1-4 weeks)

1. **[Enforce props contract discipline]**
    - Impact: Improves shared component reusability
    - Effort: [Low/Medium/High]

## Metrics

- **Cross-page imports**: [Count]
- **Shared → page imports**: [Count]
- **Single-feature components in shared/**: [Count]
- **Duplicate skeletons in pages**: [Count]
- **Props contract violations**: [Count]

## Next Audit Date

Recommended: [Date] (Quarterly for active development)

---

**Auditor**: [Name]
**Date**: [Date]
````

## Deliverables & Success Criteria

### Required Outputs

1. Audit report in `.aidd/audit-reports/SSOC-YYYY-MM-DD.md`
2. `feature.json` files for each boundary violation requiring code changes
3. List of single-feature components recommended for relocation to page directories (app-owned components only in a derived Spernakit app; template-shipped components and paths recorded in `.templateoverrides` are listed separately as template-owned or recorded decisions)

### Success Criteria

- [ ] 0 shared components importing from `src/pages/...`
- [ ] 0 cross-page directory imports
- [ ] 0 single-feature components misplaced in `components/shared/`
- [ ] All shared components use generic props with no route coupling
- [ ] `bun run smoke:qc` passes after all fixes

---

**Version**: 1.6
**Last Updated**: 2026-10-01

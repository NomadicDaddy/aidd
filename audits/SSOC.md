---
title: 'Shared vs Page UI Separation Audit'
last_updated: '2026-06-28'
version: '1.4'
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

- Import shared UI via `@/components/...` path aliases; import page-scoped UI via `./<domain>/...` relative paths
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

This audit fully applies to Spernakit v3 applications (React 19 + Vite 8 + Elysia + Drizzle).

**Applicability to aidd-class targets.** aidd is a single-user local tool with no RBAC and no multi-workspace concept. The [Permissions & Access](#permissions--access) section and any role-based-UI-visibility, `workspace` store, or workspace-switcher expectations are **N/A by design** for aidd - do not record their absence as a finding (per [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Rule 4, audit the degenerate equivalent only if one exists; here there is none). The shared-vs-page boundary, `components/{ui,shared,layout}` placement, the `@/` alias, and barrel-file rules apply unchanged - aidd uses this exact structure.

### Stack Context

| Concept            | Spernakit Implementation                                                                                                                                                                                      |
| ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Frontend framework | React 19 with React Compiler (automatic memoization)                                                                                                                                                          |
| Bundler            | Vite 8                                                                                                                                                                                                        |
| Server state       | TanStack Query (query keys, optimistic updates, invalidation)                                                                                                                                                 |
| Client state       | Zustand stores in `frontend/src/stores/`                                                                                                                                                                      |
| UI primitives      | shadcn/ui in `frontend/src/components/ui/` (direct imports, no barrel)                                                                                                                                        |
| Path alias         | `@/` resolves to `frontend/src/`                                                                                                                                                                              |
| Page registration  | Pages imported in `frontend/src/routes/lazyPages.ts`                                                                                                                                                          |
| Hooks              | Flat files in `frontend/src/hooks/`; subdirectories only when 3 or more related hooks (threshold governed by STACK.md's "3 or more"; treat DEVELOPMENT.md's "2+" wording as non-canonical, not a discrepancy) |
| Testing            | `crawltest` + `smoke:qc` only - no unit test frameworks                                                                                                                                                       |

### React Compiler Note

React Compiler handles automatic memoization - **do not** add manual `React.memo`, `useMemo`, or `useCallback` to shared components unless profiling proves the compiler misses a hot path. See `STACK.md` for details.

## Pre-Audit Setup

Before beginning the audit, prepare search commands to identify boundary violations:

> **Note**: The `grep` commands below are diagnostic aids for manual scanning. The canonical reachability gate is `bun run check:feature-integration` (part of `smoke:qc`), which detects unwired routes and orphan pages. Always scan **both** `*.tsx` and `*.ts` - hooks, services, and constants that bridge boundaries live in `.ts` files, not just `.tsx`.

1. **Run quality checks**: `bun run smoke:qc` must pass to establish a clean baseline.
2. **Scan for shared → page imports** (should be zero):
    ```bash
    grep -r "from.*pages/" frontend/src/components/ --include="*.tsx" --include="*.ts"
    ```
3. **Scan for cross-page imports** (should be zero):
    ```bash
    grep -r "from.*pages/" frontend/src/pages/ --include="*.tsx" --include="*.ts" | grep -v "from.*\./"
    ```
4. **Scan for barrel file boundary blurring**:
    ```bash
    # Top-level hooks/ and services/ should have NO barrel files
    ls frontend/src/hooks/index.ts frontend/src/services/index.ts 2>/dev/null
    ```
5. **Verify path alias usage**:
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

- From a page, import shared UI via `@/components/...` (path alias), not relative `../components/...`.
- Import page-scoped components via `./<domain>/...` within the same route directory.
- Shared components must never import from `src/pages/...`.
- Non-component shared code (hooks, services, `lib/` utilities, stores) must never import from `src/pages/...`. Page-local helpers stay in the page domain until a second genuine consumer justifies promotion to `hooks/`, `services/`, or `lib/`. Per STACK.md, all hooks live under `frontend/src/hooks/` (never colocated under `pages/*/hooks/`); subdirectories only when 3 or more related hooks (this threshold is governed by STACK.md's "3 or more" - DEVELOPMENT.md's "2+" wording is non-canonical and not a discrepancy).
- Page components may import shared components, hooks, and services.

## Shared Component Criteria

- Encapsulates a focused UI concern; reusable across routes.
- Accepts generic props; does not depend on page-specific query state or route params.
- May perform intrinsic data fetching if central to the component's function (e.g., `UserSecurityModal` using `userSecurityService`).
- Only imports from `src/components`, `src/hooks`, `src/services`, `src/stores/`, API types (`src/api/types/` or `src/api/types.ts`), and utility modules. Layout components legitimately access auth, theme, sidebar, and workspace stores.
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
- Build-enforced (per DEVELOPMENT.md, checked by `check-feature-integration.ts`): shared skeletons must be imported via the DIRECT subdirectory path `@/components/shared/skeletons/<Name>`; a barrel re-export at `@/components/shared/<Name>` FAILS the build.
- Keep action buttons and semantics consistent (e.g., `onClose`, `onSubmit`, `isPending`).
- React Compiler handles memoization automatically - do not add manual `React.memo`, `useMemo`, or `useCallback` unless profiling proves the compiler misses a hot path.

## Testing & Linting

- SSOC-specific concerns (props contract validation, shared/page boundary enforcement) are verified via `bun run smoke:qc` and `bun run crawltest`.
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
- [ ] **Low**: Shared skeletons imported via the DIRECT path `@/components/shared/skeletons/<Name>` (build-enforced by `check-feature-integration.ts`); no barrel re-export at `@/components/shared/<Name>`

## Review Walkthrough

- Verify placement: is the component under `src/components/...` or `src/pages/<route>/...` appropriately?
- Scan imports:
    - Shared: only `@/components`, `@/hooks`, `@/services`, `@/stores`, `@/api/types`, and utility modules.
    - Page: `@/components/...` and `./<domain>/...` as needed.
- Check props contracts: shared components accept generic props; page components wire up complex state.
- Inspect data fetching:
    - Page orchestrates list/detail queries and optimistic updates.
    - Shared only fetches intrinsic data to its function and uses isolated keys.
- Validate permissions handling: page computes and passes; shared consumes.
- Confirm skeleton usage: reusable skeletons live in `components` and are imported by page tables.
- Ensure no route coupling in shared UI (navigation, params, page types).
- Run lints/type checks and existing tests to verify contracts are honored.

## Quick Examples

- Correct shared import: `src/pages/Users.tsx:6` imports `UserSecurityModal` from `@/components/shared/UserSecurityModal`.
- Correct page-scoped imports: `src/pages/Users.tsx:11-13` import `UserCreateModal`, `UserEditModal`, `UserTable` from `./users/...`.
- Shared component service usage: `src/components/shared/UserSecurityModal.tsx:31-71` uses `userSecurityService` and isolated query/mutation keys.

## Relationship to Other Audits

- **COMPOSITION_PATTERNS**: Overlaps on compound component patterns and slot-based APIs. SSOC focuses on where components live; COMPOSITION_PATTERNS focuses on how they compose internally.
- **REORG**: Overlaps on file organization and directory structure. SSOC prescribes the shared/page boundary rules; REORG addresses broader file placement and naming conventions.

## Report Template

````markdown
# Shared vs Page UI Separation Audit Report - YYYY-MM-DD

## Executive Summary

**Application**: {app-name}
**Overall Score**: [Score]/100
**Issues Found**: [Count] (Critical: [N], High: [N], Medium: [N], Low: [N])

**Separation Health Summary**:

- Cross-page coupling: [None/Minor/Major]
- Shared → page imports: [None/Minor/Major]
- Component placement accuracy: [Score]/40
- Props contract quality: [Score]/30
- Import rule compliance: [Score]/30

## Category Breakdown

### 1. Boundary Enforcement (Critical)

**Score**: [Score]/40
**Issues Found**: [Number]

| ID   | Issue         | Severity | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | Critical | [File:Line] | [Solution] |

### 2. Component Placement (High)

**Score**: [Score]/30
**Issues Found**: [Number]

| ID   | Issue         | Severity | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | High     | [File:Line] | [Solution] |

### 3. Import & Props Compliance (Medium/Low)

**Score**: [Score]/30
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
3. List of single-feature components recommended for relocation to page directories

### Success Criteria

- [ ] 0 shared components importing from `src/pages/...`
- [ ] 0 cross-page directory imports
- [ ] 0 single-feature components misplaced in `components/shared/`
- [ ] All shared components use generic props with no route coupling
- [ ] `bun run smoke:qc` passes after all fixes

---

**Version**: 1.4
**Last Updated**: 2026-06-28
**Next Review**: 2026-09-28

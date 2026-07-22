---
title: 'Dead Code and Orphaned Files Audit'
last_updated: '2026-06-28'
version: '1.5'
category: 'Core Quality'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'development'
---

# Dead Code and Orphaned Files Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

**Critical Priorities**

- **Zero false positives**: Every dead-code finding must be verified against dynamic loading, framework registration, and cross-workspace patterns before reporting
- **Comprehensive coverage**: All source files across frontend, backend, and shared workspaces must be inventoried and classified
- **Manual verification**: Automated tools (`knip`) are the primary detector, but manual import-tracing catches patterns that static analysis misses, especially React.lazy with renamed-export adapters

**Essential Standards (Required)**

- **Framework-aware analysis**: Spernakit uses Elysia route plugins (not controllers), Drizzle schema files (not ORM models), and lazy-loaded React pages; analysis must respect these patterns
- **Cross-audit coordination**: HYGIENE runs the automated tool sweep (Knip/JSCPD/Madge); DEAD_CODE provides manual wiring verification, React.lazy tracing, and false-positive-controlled findings; TECHDEBT defers unused-code detection to this audit and HYGIENE
- **Evidence-backed findings**: Every finding must include the grep/search command used and its result
- **Policy alignment**: This audit enforces the CLAUDE.md rule _"No placeholder/transitional/dead/backward-compatibility/legacy code unless explicitly requested/approved"_

**Detection Categories**

- **Orphaned files**: Zero-import, zero-registration files with no runtime activation path
- **Dead exports**: Unused exported types, functions, or constants (below knip's default file-level granularity)
- **Unwired routes/pages**: Backend route plugins not registered in `create-api-app.ts`; frontend pages not in `routes.tsx` / `routes/lazyPages.ts`
- **Shared workspace dead code**: Types, constants, or pure functions in `shared/src/` imported nowhere
- **Orphaned stores/hooks**: Zustand stores or custom hooks with no component consumer

## Table of Contents

1. [Audit Objectives](#audit-objectives)
2. [Scope](#scope)
3. [Exclusions](#exclusions)
4. [Pre-Audit Setup](#pre-audit-setup)
5. [Methodology](#methodology)
6. [Deduplication with HYGIENE Audit](#deduplication-with-hygiene-audit)
    - [Boundaries vs Adjacent Audits](#boundaries-vs-adjacent-audits)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)
9. [Deliverables](#deliverables)
10. [Companion Audits](#companion-audits)

## Audit Objectives

- Detect **orphaned files** with zero references
- Identify **unexposed components/pages/route plugins** not wired into routes or parents
- Surface **dead code** (unused utilities, hooks, services, Drizzle schema files)
- Surface **unused exports** (functions, types, constants) that escape knip's default file-granularity scan
- Provide a **categorized report** with confirmed vs potential dead code
- Avoid false positives by respecting tests, examples, configs, migrations, and (on dual-dialect projects) SQLite/PostgreSQL schema pairs

## Scope

### Frontend

- All files under `frontend/src/` (components, pages, hooks, stores, utilities, etc.)
- Routing and entrypoints (e.g. `App.tsx`, `main.tsx`, route definitions, lazy-loaded routes in `routes/lazyPages.ts`)

### Backend

- All files under `backend/src/` (route plugins, services, guards, Drizzle schema files, config modules, utilities)
- Router/registration points (e.g. `create-api-app.ts` via `.use()` chaining)
- Entry scripts (`index.ts`, `server.ts`, workers)

### Shared

- All files under `shared/src/` (types, constants, pure functions)
- Shared types/constants are in-use if imported by either backend or frontend
- Re-export shim files in backend/frontend that re-export from `shared/` are alive by definition

## Exclusions

- Test files: `*.test.*`, `*.spec.*`, `__tests__/**`, `test/**`
- Example/demo directories (e.g. `frontend/src/components/examples/**`, `backend/src/examples/**`)
- Configuration/infra files (`vite-env.d.ts`, `drizzle.config.ts`, `bunfig.toml`, `components.json`, `tailwind.config.ts`, `config/*.json`, migrations, seeds)
- Dual database schema pairs (dual-dialect projects only): if the project ships both `backend/src/db/schema/*.ts` and `backend/src/db/schema-pg/*.ts` (SQLite + PostgreSQL), treat the pair as a structural mirror, not dead code. Single-dialect projects (e.g., aidd and other SQLite-only apps) have only `backend/src/db/schema/` (and `backend/src/db/schema.ts`) with NO `schema-pg/` directory; evaluate those files normally.
- Template-provided automation under `scripts/spernakit-browser/**` (evaluated at the template level)
- Generated/vendored UI primitives under `frontend/src/components/ui/*` (the knip frontend ignore, excluded from the dead-code scan by config)

## Pre-Audit Setup

### Required Tools

```bash
# Primary detection tool — canonical invocation is Spernakit's shipped script
bun run check:dead-code   # canonical (wraps knip); `bunx knip` is the fallback for non-Spernakit apps
bunx knip --version       # fallback / version probe

# Wiring verifier — catches unregistered routes/pages
bun run check:feature-integration

# Quality baseline — fix QC issues before auditing dead code
bun run smoke:qc
```

### Verification Commands

```bash
# Baseline knip scan (reads the project's knip config: knip.json at repo root for Spernakit; project-specific location otherwise)
# Canonical: Spernakit's shipped script. `bunx knip --no-progress` is the fallback for non-Spernakit apps.
bun run check:dead-code

# Wiring verification (fails on unregistered route plugins or unrouted pages)
bun run check:feature-integration

# Import and variable hygiene (eslint-plugin-unused-imports)
bun run lint
```

### Spernakit Tooling Reference

The Spernakit template ships these dead-code-relevant mechanisms. Verify each is operational before auditing:

> **Version source**: If the target project pins Knip in `package.json`, that pin is authoritative. Otherwise record the version resolved by `bunx knip --version` before interpreting output.

| Tool / Mechanism               | Invocation                                                                                                                                | What it detects                                                                                                                                                                                                                                                               |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `knip`                         | `bunx knip` (config: `knip.json` at repo root for Spernakit; project-specific location otherwise; e.g., aidd carries no root `knip.json`) | Unused files, exports, types, dependencies across workspaces                                                                                                                                                                                                                  |
| `check:feature-integration`    | `bun run check:feature-integration`                                                                                                       | Route plugins not registered in the project's backend route registration file (Spernakit: `create-api-app.ts`; aidd: `backend/src/server.ts`); pages missing from the project's frontend route configuration (Spernakit: `routes/lazyPages.ts`; aidd: `frontend/src/App.tsx`) |
| `eslint-plugin-unused-imports` | `bun run lint` (config: `eslint.config.js`)                                                                                               | Unused imports (error) and unused variables (warning) at file level                                                                                                                                                                                                           |
| `prettier` + `perfectionist`   | `bun run format` / `bun run lint`                                                                                                         | Import ordering; does not detect dead code but keeps exports organized                                                                                                                                                                                                        |

> **Note**: TypeScript's `noUnusedLocals` / `noUnusedParameters` are NOT enabled in Spernakit tsconfigs; the `unused-imports` ESLint plugin covers this at lint time instead. Do not recommend enabling the tsc flags without template-level approval.

## Methodology

> **Primary automated tool**: `knip` (via `bunx knip`) is the primary detection tool for unused files, exports, and dependencies. The manual import-tracing methodology below remains valuable for validation, for finding unused exports that knip's file-level scan misses (when `ignoreExportsUsedInFile: true`), and for edge cases such as React.lazy with renamed-export adapters.

### 1. Inventory all files

- Generate a list of all candidate files in `frontend/src/`, `backend/src/`, and `shared/src/` (excluding known examples/tests/configs)
- For each file, capture:
    - Path
    - Type (component/page/hook/service/route-plugin/schema/guard/util/store/etc.)

### 2. Reference analysis

For each candidate file:

- **Frontend**:
    - Search for import references across `frontend/src/`
    - Check routing (static and lazy routes in `routes.tsx` and `routes/lazyPages.ts`) for exposure
    - Check if the file is an entrypoint (e.g. `main.tsx`, `App.tsx`)
    - Treat type-only files as in-use if imported anywhere
    - For React.lazy-loaded components, grep for the component name AND any `.then((m) => ({ default: m.ComponentName }))` adapter (knip's file scan catches these; its export-level scan may not)

- **Backend**:
    - Search for import references across `backend/src/`
    - Check route registration via `.use()` in `create-api-app.ts`
    - Check for entry scripts (server/worker)
    - Consider plugin pipeline registration (Elysia `.use()` chaining)

- **Shared**:
    - Search for import references across both `frontend/src/` and `backend/src/`
    - Check re-export shim files that re-export from `shared/`
    - Shared constants and types are alive if imported by either workspace

### 3. Classification

Classify each file into one of:

- **Confirmed unused files**
    - Zero references in code
    - No dynamic loading/registration patterns
    - Not a config/migration/test/example

- **Potentially unused files**
    - Ambiguous or indirect usage (e.g. reflection, string-based routing)
    - Looks like it should be used but no explicit import found

- **In-use files**
    - Clearly referenced, registered, or used

### 4. Verification & False Positive Control

- Re-check any file flagged as unused against:
    - Dynamic imports (`lazy(() => import(...))`)
    - Renamed lazy adapters (`.then((m) => ({ default: m.ComponentName }))`)
    - String-based references (route names, job names)
    - Framework-specific registration (`.use()` in `create-api-app.ts`, Elysia plugin pipeline, Drizzle schema configs)
    - CSS-only imports (`@import` in stylesheets), not tracked by JS-focused tools
- If in doubt, categorize as **Potentially unused** instead of **Confirmed unused**.

#### 4.1 Framework-Aware Patterns (NOT Dead Code)

These patterns appear unused by static import analysis but are active at runtime. **Always check these before classifying a file as dead:**

> **Note**: The filenames below name the canonical Spernakit registration points. Derived apps rename them; always check the project's _actual_ registration files (see the Spernakit Tooling Reference table for the Spernakit/aidd mapping: aidd registers backend routes in `backend/src/server.ts` and frontend pages in `frontend/src/App.tsx`, and has no `lazyPages.ts`). Do not classify a correctly-wired file as orphaned just because the Spernakit-named registration file does not exist in the project.

| Pattern                                                                                        | Framework      | Why it is alive                                                                                                                                                                                                |
| ---------------------------------------------------------------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Files in `routes/` registered via `.use()` in `create-api-app.ts`                              | Elysia         | Dynamic route registration; grep for the import in create-api-app.ts                                                                                                                                           |
| Pages loaded via `lazy(() => import(...))` in `routes.tsx` or `lazyPages.ts`                   | React Router   | Code-split lazy loading; grep for the component name in routes.tsx                                                                                                                                             |
| React.lazy adapters: `.then((m) => ({ default: m.ComponentName }))` for named exports          | React          | Knip's export-level scan may miss the renamed adapter; grep manually                                                                                                                                           |
| Theme shell files referenced by `AppShell.tsx`                                                 | React          | Conditional dynamic imports based on theme config                                                                                                                                                              |
| `*Service.ts` files injected via plugin pipeline                                               | Elysia         | Plugin-based dependency injection via `.use()` chaining                                                                                                                                                        |
| Files referenced only in `config/*.json`                                                       | Spernakit      | Configuration-driven loading at startup                                                                                                                                                                        |
| API modules imported by hooks or TanStack Query calls                                          | TanStack Query | Indirect usage: `api/foo.ts` → `hooks/useFoo.ts` → page component                                                                                                                                              |
| Barrel file re-exports consumed by other workspaces                                            | Monorepo       | Cross-workspace imports may not appear in single-workspace grep                                                                                                                                                |
| `retryHandler.ts`, `withTimeout`, or similar client utilities                                  | fetch wrapper  | Used by the API client module, not by pages directly                                                                                                                                                           |
| Re-export shim files (e.g. `backend/src/types.ts`, `frontend/src/types.ts`)                    | Spernakit      | Thin re-exports from `shared/`, consumed by workspace imports                                                                                                                                                  |
| Dual schema files (dual-dialect projects only): `db/schema/*.ts` mirror of `db/schema-pg/*.ts` | Drizzle        | SQLite and PostgreSQL variants coexist; both alive by build target. Single-dialect projects (e.g., aidd) have only `db/schema/` and no `schema-pg/` mirror; do not treat the absence of a mirror as a finding. |
| CSS-only package imports: `@fontsource-variable/*`, `tw-animate-css`, `tailwindcss`            | CSS            | Imported via `@import` in CSS, invisible to JS import scanners                                                                                                                                                 |

#### 4.2 Mandatory Pre-Finding Verification (BLOCKING)

Before creating ANY feature.json finding from this audit, you MUST:

1. **Read the file** you claim is dead/unused
2. **Search for ALL of**: import references, dynamic imports (`lazy()`, `import()`), string-based loading, framework registration patterns (`.use()` in `create-api-app.ts` for routes, lazy-load patterns in `routes.tsx` / `lazyPages.ts` for pages, barrel file re-exports, CSS `@import` for style-only packages)
3. **Record the exact grep command and its result** as evidence in the finding's description
4. If ANY reference is found via any mechanism, the file is NOT dead; **do not create a finding**

Failure to perform this verification produces false positives that waste developer time and erode trust in the audit system.

#### 4.3 Dead Wiring (Dead Dependency Edges in Live Files)

Distinct from an orphaned _file_, **dead wiring** is a dependency that is registered or injected but whose injected value is never read; the file is alive, the dependency _edge_ is dead.

- **What to look for**: a service/dependency registered or injected (e.g., into `WebContext`, an Elysia `.use()` pipeline, or a service constructor) but whose injected value is never read at any real call site. A common shape is a dependency referenced only to satisfy the wiring or to suppress an unused-import/parameter error (a "void-only" reference).
- **How to verify**: trace the injected symbol to at least one _real read site_ (a property access, method call, or value use that affects behavior). A reference that exists solely to register, destructure-and-discard, or `void` the dependency does NOT count as a live use.
- **Scope guard**: do NOT flag legitimately deferred or interface-driven injection: dependencies wired for a documented future expansion, satisfying a required constructor/plugin contract, or consumed via dynamic/string-based dispatch. When the injection is intentional but currently unread, treat it as **Low** severity (a documentation/cleanup note), not a confirmed deletion.

## Deduplication with HYGIENE Audit

The HYGIENE audit uses the same automated tools (Knip, Madge, JSCPD) for dead code detection. When both audits run against the same codebase:

- **If HYGIENE has already run**: Focus DEAD_CODE on manual wiring verification (create-api-app.ts registration, routes.tsx pages, API module consumers), React.lazy adapter tracing, and unused-export analysis below knip's file-level granularity. Do not re-report findings already tracked in HYGIENE feature.json files.
- **If DEAD_CODE runs first**: Automated tool findings will be picked up by the subsequent HYGIENE run. Focus on the manual analysis that HYGIENE does not cover.
- **Unique DEAD_CODE value**: Manual file-by-file import tracing, wiring verification (all route files in create-api-app.ts, all pages in routes.tsx and `routes/lazyPages.ts`), unused-export discovery (functions, types, constants), and false-positive control methodology including React.lazy adapter and CSS-import blind spots.

### Boundaries vs Adjacent Audits

| Concern                           | Owner                                              |
| --------------------------------- | -------------------------------------------------- |
| Tool-driven unused files / deps   | [HYGIENE.md](./HYGIENE.md) (Knip, Madge, JSCPD)    |
| Manual wiring + React.lazy        | **DEAD_CODE (this audit)**                         |
| Unused exports below file level   | **DEAD_CODE (this audit)**                         |
| Unwired-but-coherent features     | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md) |
| Deprecated markers / placeholders | [TECHDEBT.md](./TECHDEBT.md)                       |

## Audit Checklist

### Critical Checks

- [ ] All `frontend/src/` files reviewed (excluding configured exclusions)
- [ ] All `backend/src/` files reviewed (excluding configured exclusions)
- [ ] All `shared/src/` files reviewed (types, constants, pure functions)
- [ ] Confirmed unused files have **zero** references and no dynamic registration
- [ ] No test, config, migration, example, or dual-schema file is incorrectly flagged
- [ ] `bun run check:feature-integration` passes (no unregistered routes/pages)

### High Priority Checks

- [ ] **High**: Unexposed routes/components identified and labeled
- [ ] **High**: Unused utilities/hooks/services/Drizzle schema files documented
- [ ] **High**: Orphan route plugins/handlers identified
- [ ] **High**: Orphaned Zustand stores or custom hooks flagged
- [ ] **High**: Dependencies that are only imported by dead code files flagged (defer simple unused-dependency detection to HYGIENE)
- [ ] **High**: Summary statistics computed (total files, unused count, dead-code %)

### Medium Priority Checks

- [ ] **Medium**: Potentially unused files clearly marked for manual review
- [ ] **Medium**: No unused exported types, functions, or barrel file re-exports
- [ ] **Medium**: No commented-out _executable_ code blocks (>3 lines) without an explanatory comment, excluding license headers and documented reference/example snippets (overlaps TECHDEBT; do not double-report the same finding)
- [ ] **Medium**: Notes captured for dynamic patterns that complicate detection
- [ ] **Medium**: Candidate files for deletion vs. consolidation identified
- [ ] **Medium**: React.lazy adapters with renamed-default exports verified alive
- [ ] **Medium**: Dead wiring checked: injected/registered dependencies (Elysia `.use()`, `WebContext`, service constructors) traced to a real read site; void-only/unread injections noted (excluding documented deferred or contract-required wiring)

### Low Priority Checks

- [ ] Dead code detection integrated into CI pipeline (`knip` + `check:feature-integration`)
- [ ] Cleanup schedule established for confirmed dead code
- [ ] Documentation updated after file removal

## Report Template

Create report: `.aidd/audit-reports/DEAD_CODE-YYYY-MM-DD.md`.

```markdown
# Dead Code & Orphaned Files Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Dead Code Level**: [Low/Moderate/High]
**Total Files Analyzed**: [Number]
**Confirmed Unused Files**: [Number]
**Potentially Unused Files**: [Number]
**Confirmed Unused Exports**: [Number]
**Estimated Dead Code Percentage**: [X]%

### Key Findings

- Major dead-code clusters by area (frontend/backend/shared, feature folders)
- Highest-risk orphaned files (route plugins, pages)
- Quick-win deletions vs. careful review items

## Detailed Findings

### Confirmed Unused Files

- `path/to/file1.ts` - [type] - Evidence: [grep command] → [result]

### Potentially Unused Files (Manual Review Required)

- `path/to/ambiguousFile.ts` - suspected unused, but used via [dynamic pattern]

### Confirmed Unused Exports (Below Knip File-Granularity)

> **Read the `knip.json` `rules` block first**: warn-level rules do NOT fail the gate, so their output is easy to overlook. In Spernakit, `exports: "warn"`, `types: "warn"`, and `enumMembers: "off"`. Explicitly scan the warn-level unused-export and unused-type findings (run knip without `--no-progress` suppression filtering them out); do not rely on file-level errors alone, since unused exports and types surface only as warnings.

- `symbolName` in `path/to/file.ts:line` - [kind: function/type/const] - Evidence: [grep command] → [result]

## Summary Statistics

- Total files analyzed: [Number]
- Confirmed unused files: [Number]
- Potentially unused files: [Number]
- Confirmed unused exports: [Number]
- Dead code percentage: [X]%

## Recommendations

### Immediate (0-7 days)

1. Remove clearly confirmed unused files (after one reviewer sanity check)
2. Open issues for high-importance orphan route plugins/pages

### Short-term (1-4 weeks)

1. Refactor ambiguous dynamic patterns to more explicit imports where possible
2. Add crawltest coverage for borderline files before removal

### Long-term (1-3 months)

1. Maintain `knip`, `check:feature-integration`, and `eslint-plugin-unused-imports` as CI gates; keep `knip.json` and `tsconfig` paths in sync with workspace layout
2. Schedule recurring DEAD_CODE audits as part of hygiene

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Deliverables

1. **Audit report** at `.aidd/audit-reports/DEAD_CODE-YYYY-MM-DD.md`
2. **Feature.json files** in `.aidd/features/` for each confirmed or potentially unused file (one file per finding)
3. **Summary statistics** included in report (total files, unused count, dead-code percentage by workspace)

## Companion Audits

> **Companion audit**: For detection of internally coherent features that are fully built but not wired into user-facing application paths (the "Cathedral of Dead Code" problem), see [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md). That audit uses entrypoint reachability traversal rather than import reference analysis, catching feature islands that pass this audit's checks because their internal modules reference each other.

> **Automated detection**: For tool-driven dead code detection (Knip, Madge, JSCPD) and dependency analysis, see [HYGIENE.md](./HYGIENE.md). This audit provides the manual verification layer on top of HYGIENE's automated findings.

> **Deprecated markers and placeholder code**: See [TECHDEBT.md](./TECHDEBT.md). TECHDEBT explicitly defers unused-code detection to this audit and to HYGIENE.

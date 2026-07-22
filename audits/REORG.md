---
title: 'Codebase Reorganization Audit'
last_updated: '2026-06-28'
version: '2.4'
category: 'Architecture'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
---

# Codebase Reorganization Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

Systematic review of file organization, naming conventions, directory structure, and architectural alignment for Spernakit v3 applications (React 19 + Vite frontend, Elysia backend, Drizzle ORM, monorepo workspace).

## Executive Summary

**Critical Priorities**

- **Directory convention compliance**: Files in correct locations per spernakit architecture
- **Naming consistency**: PascalCase components, camelCase utilities/hooks/services, snake_case DB columns
- **File granularity**: No god files (>300 lines without justification), no multi-component files
- **Handler extraction**: Route handlers >30 lines extracted as named functions (NOT controller classes)

**Essential Standards**

- **Service organization**: Flat for simple (<200 lines), subdirectory + facade for complex
- **Named exports only**: No `export default` anywhere
- **ES Modules only**: No CommonJS (`require`, `module.exports`)
- **Barrel file discipline**: Subdirectory barrels only: no top-level `hooks/` or `services/` barrels, no `components/ui/` barrel

## Table of Contents

1. [Relationship to Other Audits](#relationship-to-other-audits)
2. [Spernakit Directory Reference](#spernakit-directory-reference)
3. [Pre-Audit Setup](#pre-audit-setup)
4. [File & Component Granularity](#1-file--component-granularity)
5. [Naming Conventions](#2-naming-conventions)
6. [Directory Structure](#3-directory-structure)
7. [Service Organization](#4-service-organization)
8. [Route Organization](#5-route-organization)
9. [Dead & Zombie Code](#6-dead--zombie-code)
10. [Audit Checklist](#audit-checklist)
11. [Known False Positive Patterns](#known-false-positive-patterns)
12. [Report Template](#report-template)

## Relationship to Other Audits

| Concern               | REORG covers                        | Specialized audit                                                                   |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Dead code detection   | Commented-out blocks, generic names | [DEAD_CODE.md](./DEAD_CODE.md): automated unused file/export detection              |
| Code duplication      | Not covered                         | [HYGIENE.md](./HYGIENE.md): JSCPD clone detection                                   |
| Circular dependencies | Barrel file risks only              | [HYGIENE.md](./HYGIENE.md): Madge circular dependency analysis                      |
| Feature wiring        | Not covered                         | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md): route registration, page wiring |
| Component separation  | Not covered                         | [SSOC.md](./SSOC.md): shared vs page component boundaries                           |

## Spernakit Directory Reference

| Directory                          | Convention                                         | Contents                                                                                                                                                                     |
| ---------------------------------- | -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/routes/`              | One file per domain                                | Elysia route groups with TypeBox validation                                                                                                                                  |
| `backend/src/services/`            | Flat for simple, subdirectory + facade for complex | Business logic (NOT in routes)                                                                                                                                               |
| `backend/src/plugins/`             | One file per concern                               | Elysia plugins for cross-cutting concerns                                                                                                                                    |
| `backend/src/guards/`              | One file per concern                               | requireAuth, requireRoleFresh, workspaceAccess (present when the app has authenticated/multi-tenant surfaces; absent by design in `spernakit-web` / single-purpose variants) |
| `backend/src/db/schema/`           | One file per entity                                | Drizzle schema definitions                                                                                                                                                   |
| `backend/src/config/`              | configSchema + configSchemas/ + defaults.json      | JSON-based configuration                                                                                                                                                     |
| `frontend/src/pages/{domain}/`     | One directory per feature area                     | Page components with domain grouping                                                                                                                                         |
| `frontend/src/components/ui/`      | shadcn/ui components (direct imports, NO barrel)   | Installed via `bunx shadcn@latest add`                                                                                                                                       |
| `frontend/src/components/shared/`  | Reusable across features                           | Generic props, no route coupling                                                                                                                                             |
| `frontend/src/components/layout/`  | App shell components                               | AppLayout, AuthenticatedLayout, PublicLayout                                                                                                                                 |
| `frontend/src/api/`                | One file per domain                                | API modules using centralized fetch client                                                                                                                                   |
| `frontend/src/api/types/`          | Domain-specific types                              | Frontend-only type definitions                                                                                                                                               |
| `frontend/src/routes/lazyPages.ts` | Lazy page component imports                        | All `*Page.tsx` components imported here for code-splitting                                                                                                                  |
| `frontend/src/hooks/`              | Custom hooks (NO barrel file)                      | Direct imports only                                                                                                                                                          |
| `frontend/src/stores/`             | Zustand stores with persist                        | auth, theme, sidebar, workspace, command, ws                                                                                                                                 |
| `shared/src/`                      | Cross-workspace types, constants, pure functions   | Zero runtime deps                                                                                                                                                            |
| `config/`                          | Project root                                       | `{slug}.json`: JSON-only configuration                                                                                                                                       |

## Pre-Audit Setup

> **Cross-platform note**: aidd apps run on both POSIX and Windows. The commands below use `rg` (ripgrep) and `bun`, which behave identically on every platform; prefer them over POSIX-only one-liners (`find` / `xargs` / `2>/dev/null`), which silently return empty results on Windows/PowerShell and read as a false clean pass. `bun run smoke:qc` is the canonical, cross-platform baseline.

```bash
# Run quality baseline (cross-platform) — if this fails, fix QC issues before auditing reorganization
bun run smoke:qc

# File-size cap enforcement (canonical) — fails the build on any file >300 lines
bun run check:max-lines

# Rank near-cap files for proactive splitting — the custom walk is ONLY for ranking,
# NOT for pass/fail (check:max-lines above is the authoritative gate)
bun -e "import {readdirSync,statSync,readFileSync} from 'fs';import {join} from 'path';const walk=(d,a=[])=>{for(const e of readdirSync(d,{withFileTypes:true})){const p=join(d,e.name);if(e.isDirectory())walk(p,a);else if(/\.(ts|tsx)$/.test(e.name))a.push([readFileSync(p,'utf8').split('\n').length,p]);}return a;};console.log(['backend/src','frontend/src'].flatMap(d=>walk(d)).sort((a,b)=>b[0]-a[0]).slice(0,30).map(([n,p])=>n+' '+p).join('\n'));"

# Multi-component files (count exported components per .tsx)
rg -c "export (function|const) [A-Z]" frontend/src -g "*.tsx" | rg -v ":1$"

# Default exports (should be zero)
rg -l "export default" backend/src frontend/src -g "*.ts" -g "*.tsx"

# CommonJS patterns (should be zero)
rg -l "require\(" backend/src frontend/src -g "*.ts" -g "*.tsx"

# Controller classes (forbidden — breaks Elysia type chain)
rg -l "class\s+\w*Controller" backend/src -g "*.ts"

# Barrel files in wrong locations (should not exist)
rg --files frontend/src -g "hooks/index.ts" -g "services/index.ts" -g "components/ui/index.ts"
```

---

## 1. File & Component Granularity

### Evaluation Criteria

| Check                                    | Threshold                             | Remediation                                         |
| ---------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| File length (hard cap)                   | >300 lines = build failure            | Split into focused modules or subdirectory + facade |
| Near-cap files (proactive split)         | approaching 300 lines                 | Split before the next change pushes it over the cap |
| Multiple exported components in one .tsx | >1 exported component                 | Extract to separate files                           |
| Route handler inline complexity          | >30 lines in handler body             | Extract as named function in same route file        |
| Service file complexity                  | ~200 lines (DEVELOPMENT.md guideline) | Use subdirectory + facade pattern                   |

**File-size cap is hard, single-tier, and mechanically enforced**: STACK.md / DEVELOPMENT.md and `package.json` define a hard **300-line cap with NO exemptions**, enforced by `check:max-lines` (`const MAX_LINES = 300`) inside `smoke:qc`. Any file over 300 lines fails the build. There is no graduated/soft tier and no "god service" tier; a file is either under the cap (passes) or over it (build broken). Because the raw line count is now guaranteed clean by the gate, REORG's file-size role is **not** to re-count lines; it is to catch (i) **near-cap files** that should be split proactively before the next edit breaks the build, and (ii) what the line-counter cannot see: **multi-component files, fat handlers, and missing facades** where a file is under 300 lines but still doing too much.

**Service thresholds** (two distinct concepts; do not conflate):

- **~200-line extraction guideline** (soft, auditor judgment): the DEVELOPMENT.md service-organization guideline that _recommends_ moving to a subdirectory + facade once a service approaches ~200 lines. This is a design recommendation, not a build gate.
- **300-line hard cap** (mechanical, build-failing): the `check:max-lines` gate. This is NOT a soft auditor judgment call; exceeding it breaks `smoke:qc`. A service at 250 lines passes the gate but may still warrant a facade per the ~200-line guideline above.

### What to Flag

- `.tsx` files containing multiple exported React components (exception: tiny sub-components internal to the main export)
- Route files with inline handlers exceeding 30 lines
- Service files exceeding the ~200-line extraction guideline without subdirectory extraction
- Near-cap files approaching the hard 300-line limit that should be split proactively (the cap itself is already enforced by `check:max-lines`; flag files at risk of breaking the build on the next edit, plus files under the cap that are still doing too much)

### What NOT to Flag

- Schema files that are long due to many columns (one entity = one file)
- Configuration files (configSchema.ts, defaults.json)
- Test files with many test cases
- Generated files (shadcn/ui components in `components/ui/`)

---

## 2. Naming Conventions

### File Naming

| Category         | Convention                      | Examples                               |
| ---------------- | ------------------------------- | -------------------------------------- |
| React components | PascalCase                      | `UserProfile.tsx`, `DashboardPage.tsx` |
| Hooks            | camelCase with `use` prefix     | `useAuth.ts`, `useFormatters.ts`       |
| Utilities        | camelCase                       | `formatDate.ts`, `parseConfig.ts`      |
| Services         | camelCase with `Service` suffix | `userService.ts`, `authService.ts`     |
| Route files      | camelCase or kebab-case         | `users.ts`, `audit-logs.ts`            |
| Schema files     | camelCase or kebab-case         | `users.ts`, `auditLogs.ts`             |
| Stores           | camelCase with `Store` suffix   | `authStore.ts`, `themeStore.ts`        |
| API modules      | camelCase                       | `users.ts`, `settings.ts`              |

### Export Naming

| Check                            | Rule                                   |
| -------------------------------- | -------------------------------------- |
| File name matches primary export | `userService.ts` exports `userService` |
| Named exports only               | No `export default` anywhere           |
| Type imports use `import type`   | `import type { User } from './types'`  |

### Database Naming (Drizzle)

| Element               | Convention                     | Example                                                   |
| --------------------- | ------------------------------ | --------------------------------------------------------- |
| Table names           | Plural snake_case              | `users`, `audit_logs`, `workspace_members`                |
| Column names (DB)     | snake_case                     | `created_at`, `is_deleted`                                |
| Column names (schema) | camelCase                      | `createdAt`, `isDeleted`                                  |
| Indexes               | `idx_{table}_{columns}`        | `idx_users_email`                                         |
| Foreign keys          | `fk_{table}_{column}_{target}` | `fk_audit_logs_user_id_users` (enforced on both dialects) |

**FK declaration pattern**: Declare foreign keys via Drizzle's table-builder `foreignKey({ columns, foreignColumns, name }).onDelete(...)` in the constraints array; do NOT use inline `.references()`, which produces anonymous, unnameable constraints. The column-qualified naming format (`{table}_{column}_{target}`) is required to disambiguate multiple FKs pointing at the same target table (e.g., `created_by`, `updated_by`, `deleted_by` all referencing `users`). Enforced across both SQLite and PostgreSQL schemas.

---

## 3. Directory Structure

### What to Check

- [ ] Frontend pages organized in `pages/{domain}/` directories (not flat)
- [ ] API modules in `frontend/src/api/` (one per domain, not a single file)
- [ ] Schema files in `backend/src/db/schema/` (one per entity)
- [ ] If `config.database.dialect` supports `postgres`, `backend/src/db/schema-pg/` mirrors `backend/src/db/schema/` (parity enforced by `bun run check:schema-parity`)
- [ ] No `src/features/` directory (spernakit uses domain-based organization, not feature folders)
- [ ] No `src/controllers/` directory (controllers break Elysia type chain)
- [ ] `components/ui/` has NO barrel file: direct imports only (`@/components/ui/button`)
- [ ] Top-level `hooks/` and `services/` have NO barrel files
- [ ] Service subdirectories have NO `index.ts` barrels; the facade imports directly from sub-files (legacy barrels in older subdirectories are acceptable but should not be replicated)
- [ ] Hook subdirectories exist only when 2+ hooks share a domain (e.g., `hooks/dashboards/useDashboardLayout.ts` + `hooks/dashboards/useDashboardWidgets.ts`); single-file hooks remain flat at `hooks/{name}.ts`
- [ ] Shared skeletons imported via direct subdirectory path `@/components/shared/skeletons/<Name>`; no barrel re-export from `@/components/shared/<Name>` (CI-enforced by `scripts/check-feature-integration.ts`)
- [ ] `shared/` workspace exists with types, constants, pure functions
- [ ] Database files in `data/` at project root (NEVER `backend/data/`)

### What NOT to Flag

- Application-specific directories outside the template convention (if justified and documented)
- Empty directories that are git-tracked for structure
- Template-origin files: evaluate at template level, not per-app
- A single consolidated `backend/src/db/schema.ts` (instead of per-entity files in `db/schema/`) for small single-team apps below a modest table count (~10 tables). The per-entity `db/schema/` split is **recommended, not mandatory**; it becomes worthwhile once the schema grows or multiple contributors edit it concurrently. Do not flag a deliberate single-file schema on a small derived app as a violation.
- **Hybrid case**: both a standalone `backend/src/db/schema.ts` AND a populated `backend/src/db/schema/` directory coexisting. This is legitimate when the standalone is a thin **barrel** that re-exports the per-entity files (a single import surface). Do not flag that. DO investigate when the standalone `schema.ts` defines tables of its own that overlap or duplicate the per-entity definitions; that is a duplication / drift risk, or a legacy remnant left behind by a partial migration to the per-entity split. Confirm which case applies before flagging: a barrel passes, real duplication is a finding.

---

## 4. Service Organization

### Expected Pattern

```
services/
├── authService.ts              # Facade: imports directly from auth/ sub-files
├── auth/                       # Internal modules (subdirectory)
│   ├── authCore.ts
│   └── authLogin.ts            # NO index.ts barrel
├── settingsService.ts          # Simple service (flat, <200 lines)
└── ...
```

### What to Check

- [ ] Simple services (<200 lines, single responsibility) are flat files
- [ ] Complex services use subdirectory + facade pattern
- [ ] Facade files re-export the public API from subdirectory modules
- [ ] Consumers import from facades only (never from subdirectory modules directly)
- [ ] Services use subdirectory + facade extraction per the ~200-line DEVELOPMENT.md guideline; the 300-line hard cap (`check:max-lines`) already prevents any service from exceeding 300 lines, so flag services that are _approaching_ the cap or are under it but doing too much, not raw line counts
- [ ] Business logic is in services, NOT in route handlers

### DB Worker / Command-Module Placement (`spernakit-web` variant only)

> **Applies only to the web-DB-worker variant** (apps where SQLite runs in a Bun worker, e.g. `[typescript+spernakit-web]`). Non-web apps using the standard in-process Drizzle setup are exempt; do NOT flag the absence of a `db/commands/` directory on a standard app.

- [ ] Transaction logic lives in command modules under `backend/src/db/commands/*`, behind the worker boundary, never as inline `db.transaction()` calls in routes or services. New multi-statement transactions must be added as commands, not invoked directly at the call site. Note the facade+directory pairing: a top-level `backend/src/db/commands.ts` facade typically sits alongside the `backend/src/db/commands/` directory, re-exporting the individual command modules; both coexisting is the expected shape, not a duplication.

---

## 5. Route Organization

### What to Check

- [ ] Route files in `backend/src/routes/` (one file per domain)
- [ ] All route files registered in the API composition root (`create-api-app.ts` in the template; may be `server.ts` or `app.ts` in derived apps); verify against the app's actual composition root, do not assert a single filename
- [ ] Complex handlers (>30 lines) extracted as named functions in the route file
- [ ] No controller classes: named functions only (controller classes break Elysia type chain)
- [ ] TypeBox schemas for request/response validation on routes
- [ ] Route files use Elysia plugin pipeline (NOT Express/Fastify middleware)

### Plugin Pipeline Order

Verify plugins are registered in this order:
Client IP → Request ID → Logger → CORS → Security Headers → Auth → Password Change Guard → CSRF → Rate Limit → Auth Rate Limit → Workspace → Audit

**Note**: `apiKey` is a per-route guard, NOT a plugin in the pipeline. API-key authentication is absorbed into `authPlugin`'s bearer-token verification path. Do not flag the absence of an "API Key" plugin entry between Security Headers and Auth.

---

## 6. Dead & Zombie Code

### What to Flag

- Commented-out code blocks (>3 lines of disabled code, not explanatory comments)
- Generic names: `data`, `temp`, `handleStuff`, `doSomething`, `process`, `util`
- Unused imports (should be caught by ESLint `unused-imports` plugin)
- Backward-compatibility shims, `_unused` prefixed variables, `// removed` comments

> **Orphan detection: defer to tooling, do not hand-roll.** Do NOT flag "files with no imports from anywhere (orphaned)" via manual import scanning here; it is false-positive-prone (type-only files, lazy-loaded pages, and re-export shims all read as orphans) and duplicates dedicated tooling. Rely on `knip`, [DEAD_CODE.md](./DEAD_CODE.md), and [HYGIENE.md](./HYGIENE.md) for orphan/unused-file detection (spernakit ships `check:dead-code`). In REORG, flag only obvious commented-out blocks and generic names.

### What NOT to Flag

- `// eslint-disable` with justification comments (verify justification is valid)
- Template-provided files that exist for reference
- Type-only files that may appear unused to import scanners

> For comprehensive dead code analysis, defer to [DEAD_CODE.md](./DEAD_CODE.md) and [HYGIENE.md](./HYGIENE.md).

---

## Audit Checklist

### Critical Checks

> **Expected-clean guardrails**: The no-`export default`, no-CommonJS, no-controller-class, and naming-convention checks are enforced by ESLint/lint and template scaffolding, so a clean result is the norm, not a coverage gap. They are kept as regression protection against template drift; a clean pass does not warrant deeper investigation.

- [ ] No `export default` in any module
- [ ] No CommonJS patterns (`require`, `module.exports`)
- [ ] No controller classes in backend (breaks Elysia type chain)
- [ ] No `src/features/` or `src/controllers/` directories
- [ ] Database files in `data/` at project root (NOT `backend/data/`)
- [ ] No Express/Fastify patterns in backend code

### High Priority Checks

- [ ] Route handlers >30 lines extracted as named functions
- [ ] Complex services use subdirectory + facade extraction per the ~200-line DEVELOPMENT.md guideline (raw line count over 300 is already a build failure via `check:max-lines`; flag near-cap and under-cap-but-overloaded services here)
- [ ] All route files registered in the API composition root (`create-api-app.ts` in the template; may be `server.ts`/`app.ts` in derived apps)
- [ ] All pages have routes in `routes.tsx` and imports in `routes/lazyPages.ts`
- [ ] Frontend pages organized in `pages/{domain}/` directories
- [ ] Schema files: one per entity in `backend/src/db/schema/`
- [ ] `components/ui/` has no barrel file: direct imports only

### Medium Priority Checks

- [ ] File naming conventions consistent (PascalCase components, camelCase utilities)
- [ ] Export names match file names
- [ ] Database naming conventions followed (snake_case tables, idx/fk naming)
- [ ] No files near the hard 300-line cap that should be split proactively (the cap itself is mechanically enforced by `check:max-lines`; the build already fails on any file >300 lines)
- [ ] No multi-exported-component .tsx files
- [ ] Barrel files only in subdirectories (not top-level hooks/, services/)
- [ ] `shared/` workspace exists and is consumed by both workspaces

### Low Priority Checks

- [ ] No commented-out code blocks (>3 lines)
- [ ] No generic variable/function names (`data`, `temp`, `handleStuff`)
- [ ] Import paths use `@/` alias consistently (not relative `../../../`)
- [ ] Type imports use `import type` syntax

---

## Known False Positive Patterns

| Pattern                                         | Why it's not an issue                           |
| ----------------------------------------------- | ----------------------------------------------- |
| shadcn/ui components >300 lines                 | Generated code: evaluate at template level      |
| Schema files with many columns                  | One entity = one file, regardless of line count |
| `backend/src/db/schema-pg/` mirroring `schema/` | Dual-dialect (SQLite/PostgreSQL) by design      |
| Template-origin files                           | Evaluate drift at template level, not per-app   |

---

## Report Template

```markdown
# Codebase Reorganization Audit Report - YYYY-MM-DD

## Executive Summary

**Application**: {app-name}
**Overall Score**: [Score]/100
**Issues Found**: [Count] (Critical: [N], High: [N], Medium: [N], Low: [N])

## Category Breakdown

### 1. File Granularity

**Score**: [Score]/25

- Near-cap files flagged for proactive split (approaching 300-line `check:max-lines` cap): [Count] ([List])
- Multi-component .tsx files: [Count]
- Route handlers >30 lines not extracted: [Count]

### 2. Naming Conventions

**Score**: [Score]/25

- Naming violations: [Count]
- Default exports: [Count]
- Database naming violations: [Count]

### 3. Directory Structure

**Score**: [Score]/25

- Directory convention violations: [Count]
- Barrel file violations: [Count]
- Misplaced files: [Count]

### 4. Service & Route Organization

**Score**: [Score]/25

- Services needing extraction (per ~200-line guideline / approaching 300-line cap): [Count]
- Missing facades: [Count]
- Unregistered routes: [Count]
- Controller classes: [Count]

## Detailed Findings

### Critical Issues 🚨

{Findings with severity, location, and remediation}

### High Priority Issues ⚠️

{Findings}

### Medium Priority Issues 📋

{Findings}

### Low Priority Issues 💡

{Findings}

## Recommendations

### Immediate (0-7 days)

1. {Critical fixes}

### Short-term (1-4 weeks)

1. {High priority improvements}

### Long-term (1-3 months)

1. {Structural improvements}

## Metrics

- Total files analyzed: [Count]
- Files over the 300-line cap (must be 0 - `check:max-lines` fails the build otherwise): [Count]
- Near-cap files flagged for proactive split: [Count] ([Percentage]%)
- Default exports remaining: [Count]
- Service facade compliance: [Count]/[Total] complex services
- Route registration compliance: [Count]/[Total] route files
```

## Deliverables

### Required Outputs

1. Audit report in `.aidd/audit-reports/REORG-YYYY-MM-DD.md`
2. Feature.json files for each finding requiring code changes; emitted `feature.json` must be prettier-normalized (run `prettier --write`; sorted keys, tabs) so it passes `--check-features`
3. Summary of template-origin issues (escalate to spernakit template)

### Success Criteria

- [ ] 0 default exports
- [ ] 0 CommonJS patterns
- [ ] 0 controller classes
- [ ] 0 files over the hard 300-line cap (mechanically enforced by `check:max-lines` inside `smoke:qc`; no exemptions)
- [ ] 100% route registration in the API composition root (`create-api-app.ts`, or `server.ts`/`app.ts` in derived apps)
- [ ] All complex services use facade pattern

---

**Version**: 2.4
**Last Updated**: 2026-06-28
**Next Review**: 2026-09-28

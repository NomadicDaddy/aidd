---
title: 'Codebase Reorganization Audit'
last_updated: '2026-10-01'
version: '2.6'
category: 'Architecture'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
---

# Codebase Reorganization Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

Systematic review of file organization, naming conventions, directory structure, and architectural alignment. The conventions below are those of the Spernakit template and the apps derived from it (React + Vite frontend, Elysia backend, Drizzle ORM, monorepo workspace). See [Applicability](#applicability) for how they apply to aidd and to other targets.

## Executive Summary

**Critical Priorities**

- **Directory convention compliance**: Files in correct locations per the target's own architecture
- **Naming consistency**: PascalCase components, camelCase utilities/hooks/services, snake_case DB columns
- **File granularity**: No file over the target's file-size gate (300 lines in Spernakit, derived apps and aidd), no multi-component files
- **Handler extraction**: Route handlers >30 lines extracted as named functions (NOT controller classes)
- **Ownership before recommendation**: In a derived Spernakit app, `.templateoverrides` is read first. A recorded path is not moved, overwritten or realigned, and a template-managed file is reorganized in the template, not in the app

**Essential Standards**

- **Service organization**: Flat for simple (<200 lines), subdirectory + facade for complex
- **Named exports only**: No `export default` anywhere
- **ES Modules only**: No CommonJS (`require`, `module.exports`)
- **Barrel file discipline**: Subdirectory barrels only: no top-level `hooks/` or `services/` barrels, no `components/ui/` barrel

## Table of Contents

1. [Relationship to Other Audits](#relationship-to-other-audits)
2. [Applicability](#applicability)
3. [Spernakit Directory Reference](#spernakit-directory-reference)
4. [Pre-Audit Setup](#pre-audit-setup)
5. [File & Component Granularity](#1-file--component-granularity)
6. [Naming Conventions](#2-naming-conventions)
7. [Directory Structure](#3-directory-structure)
8. [Service Organization](#4-service-organization)
9. [Route Organization](#5-route-organization)
10. [Dead & Zombie Code](#6-dead--zombie-code)
11. [Audit Checklist](#audit-checklist)
12. [Known False Positive Patterns](#known-false-positive-patterns)
13. [Report Template](#report-template)

## Relationship to Other Audits

| Concern               | REORG covers                        | Specialized audit                                                                   |
| --------------------- | ----------------------------------- | ----------------------------------------------------------------------------------- |
| Dead code detection   | Commented-out blocks, generic names | [DEAD_CODE.md](./DEAD_CODE.md): automated unused file/export detection              |
| Code duplication      | Not covered                         | [HYGIENE.md](./HYGIENE.md): JSCPD clone detection                                   |
| Circular dependencies | Barrel file risks only              | [HYGIENE.md](./HYGIENE.md): Madge circular dependency analysis                      |
| Feature wiring        | Not covered                         | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md): route registration, page wiring |
| Component separation  | Not covered                         | [SSOC.md](./SSOC.md): shared vs page component boundaries                           |

## Applicability

Identify the target before applying any rule. A convention stated here is a requirement only for the target that adopted it.

| Target                     | What applies                                                                                                                                                                                                                                                                                                                                              |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spernakit template         | Everything in this audit. The template documents (`docs/template/STACK.md` and `DEVELOPMENT.md`) are the convention source                                                                                                                                                                                                                                |
| Derived Spernakit app      | Everything in this audit, for app-owned files only. Read `.templateoverrides` first (see below)                                                                                                                                                                                                                                                           |
| aidd                       | The file-size gate, named exports, ES modules, no controller classes, service and route organization, `pages/{domain}/`, `components/{ui,shared,layout}`, and the database rule. aidd has its own registration files, a database worker with a command layer, a `cli/` workspace, and no guards, `schema-pg/`, `routes/lazyPages.ts` or `@/` import alias |
| Other targets (CLI, site…) | The universal checks only: the target's own file-size gate if it has one, its own documented layout and naming, no dead or commented-out code. Mark Spernakit-specific sections N/A with the falsification record the methodology requires                                                                                                                |

### Derived Spernakit apps: read `.templateoverrides` first

A derived app records every deliberate difference from the template in `.templateoverrides` at its root. Each line is `ACTION  PATH  # REASON`, where the action is `KEEP`, `SKIP` or `DELETED` (parsed by `loadTemplateOverrides` in the template's `scripts/lib/template/overrides.ts`; the parser accepts an entry with no reason, and no gate requires one). Read the file in full before recommending that anything in a derived app be moved, renamed, split, merged, deleted, restored or "realigned" with the template.

- **A path with an entry is a recorded decision.** Do not recommend moving, renaming or overwriting it, and do not recommend restoring a path recorded as `DELETED`. That destroys work the app's owner chose to keep. Example: a derived app's `KEEP backend/src/create-api-app.ts` entry is what holds its own domain routes in the API app assembly; overwriting that file from the template unregisters every one of them. If the written reason no longer holds, the finding is against the entry and is owned by [SPERNAKIT.md](./SPERNAKIT.md).
- **A template-managed file is not the app's to reorganize.** `check:drift` requires a `pure` file to match the template byte for byte, so moving, renaming or splitting it in the app fails the gate or is undone at the next template sync. A reorganization recommendation for such a file belongs to the template: list it under template-origin issues and do not file it against the app. The classification is in the template's `scripts/template-manifest.json` (`branded` and `infrastructure` lists; everything else the template ships is `pure`) and `SECURITY_INFRASTRUCTURE_FILES` in `scripts/lib/template/security.ts`.
- **Infrastructure files the app extends** (for example `backend/src/app.ts`, `backend/src/create-api-app.ts`, `frontend/src/routes.tsx`, navigation): the app's own additions are in scope; the template's structure around them is not.
- **App-owned files** (domain routes, services, pages and schema the app added) are fully in scope.

To tell these apart, compare the path with the template checkout the project registers and with `.templateoverrides`. Do not infer ownership from the file's content.

## Spernakit Directory Reference

This table describes the Spernakit template and derived apps. Read the live tree before citing it; the names here are a guide.

| Directory                                                   | Convention                                         | Contents                                                                                                                                                                |
| ----------------------------------------------------------- | -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/routes/`                                       | One file per domain                                | Elysia route groups with TypeBox validation                                                                                                                             |
| `backend/src/services/`                                     | Flat for simple, subdirectory + facade for complex | Business logic (NOT in routes)                                                                                                                                          |
| `backend/src/plugins/`                                      | One file per concern                               | Elysia plugins for cross-cutting concerns                                                                                                                               |
| `backend/src/guards/`                                       | One file per concern                               | Role guards (`requireAuth`, `requireRoleFresh` in `role.ts`) and workspace access guards. aidd has no `guards/` directory by design; its bearer-token guard is a plugin |
| `backend/src/db/schema/`                                    | One file per entity                                | Drizzle schema definitions                                                                                                                                              |
| `backend/src/config/`                                       | configSchema + configSchemas/ + defaults.json      | JSON-based configuration                                                                                                                                                |
| `frontend/src/pages/{domain}/`                              | One directory per feature area                     | Page components with domain grouping                                                                                                                                    |
| `frontend/src/components/ui/`                               | shadcn/ui components (direct imports, NO barrel)   | Installed via `bunx shadcn@latest add`                                                                                                                                  |
| `frontend/src/components/shared/`                           | Reusable across features                           | Generic props, no route coupling                                                                                                                                        |
| `frontend/src/components/layout/`                           | App shell components                               | `AppShell`, `Sidebar`, `Header`, `TopBar`, navigation config                                                                                                            |
| `frontend/src/api/`                                         | One file per domain                                | API modules using centralized fetch client                                                                                                                              |
| `frontend/src/api/types/`                                   | Domain-specific types                              | Frontend-only type definitions                                                                                                                                          |
| `frontend/src/routes/lazyPages.ts`                          | Lazy page component imports                        | All `*Page.tsx` components imported here for code-splitting                                                                                                             |
| `frontend/src/routes/routeGroups.tsx`, `settingsRoutes.tsx` | Route objects                                      | Public, protected and settings route groups. `frontend/src/routes.tsx` only assembles them and must not gain page entries                                               |
| `frontend/src/hooks/`                                       | Custom hooks (NO barrel file)                      | Direct imports only                                                                                                                                                     |
| `frontend/src/stores/`                                      | Zustand stores                                     | auth, theme, sidebar, layout, workspace, command, ws                                                                                                                    |
| `shared/src/`                                               | Cross-workspace types, constants, pure functions   | Zero runtime deps                                                                                                                                                       |
| `config/`                                                   | Project root                                       | `{slug}.json`: JSON-only configuration                                                                                                                                  |

## Pre-Audit Setup

> **Cross-platform note**: aidd apps run on both POSIX and Windows. The commands below use `rg` (ripgrep) and `bun`, which behave identically on every platform; prefer them over POSIX-only one-liners (`find` / `xargs` / `2>/dev/null`), which silently return empty results on Windows/PowerShell and read as a false clean pass. `bun run smoke:qc` is the canonical, cross-platform baseline.

> **Absence checks need a control**: several commands below pass by printing nothing. A search over a directory the target does not have also prints nothing. Before reading an empty result as clean, run the same command for something known to be present in that tree.

```bash
# Run quality baseline (cross-platform) - if this fails, fix QC issues before auditing reorganization
bun run smoke:qc

# Derived Spernakit apps only - recorded differences from the template (read in full first)
cat .templateoverrides

# File-size cap enforcement (canonical) - read scripts/check-max-lines.ts first for the cap,
# the scanned roots and any baseline, then run it
bun run check:max-lines

# Rank near-cap files for proactive splitting - the custom walk is ONLY for ranking,
# NOT for pass/fail (check:max-lines above is the authoritative gate). The roots and the
# skipped directories mirror the gate's scannedRoots and skippedDirs; change them if the
# target's gate differs. aidd's gate already prints every file at 290-300 lines as [WARN],
# so in aidd read that list instead.
bun -e "import {existsSync,readdirSync,readFileSync} from 'node:fs';import {join} from 'node:path';const roots=['backend/src','frontend/src','shared/src','scripts','cli/src'];const skip=new Set(['build','dist','node_modules','snapshots']);const rows=[];const walk=(d)=>{for(const e of readdirSync(d,{withFileTypes:true})){if(skip.has(e.name))continue;const p=join(d,e.name);if(e.isDirectory())walk(p);else if(/\.tsx?$/.test(e.name)&&!e.name.endsWith('.d.ts')){const t=readFileSync(p,'utf8');const n=(t.endsWith('\n')?t.slice(0,-1):t).split(/\r?\n/).length;if(n>=250)rows.push([n,p]);}}};for(const r of roots){if(existsSync(r))walk(r);}rows.sort((a,b)=>b[0]-a[0]);for(const [n,p] of rows.slice(0,30)){console.log(n+' '+p);}"

# Multi-component files (count exported components per .tsx)
rg -c "export (function|const) [A-Z]" frontend/src -g "*.tsx" | rg -v ":1$"

# Default exports (should be zero)
rg -l "export default" backend/src frontend/src -g "*.ts" -g "*.tsx"

# CommonJS patterns (should be zero)
rg -l "require\(" backend/src frontend/src -g "*.ts" -g "*.tsx"

# Controller classes (forbidden - breaks Elysia type chain)
rg -l "class\s+\w*Controller" backend/src -g "*.ts"

# Barrel files in wrong locations (should not exist)
rg --files frontend/src -g "hooks/index.ts" -g "services/index.ts" -g "components/ui/index.ts"
```

---

## 1. File & Component Granularity

### Evaluation Criteria

| Check                                    | Threshold                             | Remediation                                         |
| ---------------------------------------- | ------------------------------------- | --------------------------------------------------- |
| File length (hard cap)                   | Over the gate's cap = build failure   | Split into focused modules or subdirectory + facade |
| Near-cap files (proactive split)         | approaching the cap                   | Split before the next change pushes it over the cap |
| Multiple exported components in one .tsx | >1 exported component                 | Extract to separate files                           |
| Route handler inline complexity          | >30 lines in handler body             | Extract as named function in same route file        |
| Service file complexity                  | ~200 lines (DEVELOPMENT.md guideline) | Use subdirectory + facade pattern                   |

**The file-size cap is a gate. Read the gate; do not re-derive a count.** Open the target's `scripts/check-max-lines.ts` and record the cap (`MAX_LINES`), the scanned roots (`scannedRoots`), the skipped directories, and whether it carries a baseline. Then run `bun run check:max-lines` and report its result. What the gate is differs by target:

- **Spernakit and derived apps**: a hard **300-line cap with no grandfather list**, over `.ts`/`.tsx` files in `backend/src`, `frontend/src`, `shared/src` and `scripts`, run inside `smoke:qc`. A file is either under the cap or the build is broken. DEVELOPMENT.md states the same rule.
- **aidd**: the same hard 300-line cap with no grandfather list, with `cli/src` added to the scanned roots. Its gate also prints a non-failing `[WARN]` list of files at 290 to 300 lines (`WARNING_LINES`); that list is the near-cap inventory.
- **Repositories whose gate carries a baseline** (a map of files that were over the cap when the gate landed, each pinned at its recorded size): the baseline is part of the gate. A baselined file at or under its recorded size is existing, recorded debt. Do not report it as a new finding. Report it only if it has grown past its baseline (the gate fails), or list it once under existing debt when recommending which baselined files to split first. A file over the cap with no baseline entry is a new finding.
- **Targets with no file-size gate**: the cap is not enforced. Apply a 300-line guideline only if the target's own rules state one, and say in the report that nothing enforces it.

The gate scans only its listed roots and file types. A long file outside them (another directory, a `.js` or `.css` file) is not covered; say so in the report without presenting it as a gate failure.

There is no graduated tier and no "god service" tier. Because the gate decides the raw line count, REORG's file-size role is **not** to re-count lines; it is to catch (i) **near-cap files** that should be split proactively before the next edit breaks the build, and (ii) what the line-counter cannot see: **multi-component files, fat handlers, and missing facades** where a file is under the cap but still doing too much.

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
- A file listed in the target gate's baseline that has not grown past its recorded size (see above)
- In a derived Spernakit app: a template-managed file, or a path recorded in `.templateoverrides` (see [Applicability](#applicability)). A size or granularity problem in a template-managed file is a template-origin issue

---

## 2. Naming Conventions

These are the Spernakit conventions (template documents, Coding Style). For aidd and other targets, read the target's own stated convention and the prevailing pattern in each directory, and flag inconsistency within the target; do not flag a file for differing from the Spernakit table.

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
- [ ] Hooks stay under `frontend/src/hooks/` with at most one domain-directory level; while
      STACK.md says 3+ related hooks and DEVELOPMENT.md says 2+, record that upstream documentation
      drift once rather than scoring either grouping threshold as an application defect
- [ ] Shared skeletons imported via direct subdirectory path `@/components/shared/skeletons/<Name>`; no barrel re-export from `@/components/shared/<Name>` (Spernakit and derived apps, where `scripts/check-feature-integration.ts` enforces it; aidd's gate of the same name checks route and page registration only and aidd has no `@/` alias)
- [ ] `shared/` workspace exists with types, constants, pure functions
- [ ] Database files in `data/` at the application root (NEVER `backend/data/`). Verify the resolved database path in the code that opens the database, not only the directory listing; Spernakit and derived apps also gate this with `check:db-location`. An existing `backend/data/` directory is a finding to report with its contents listed: do not recommend moving or deleting data without the owner's direction

### What NOT to Flag

- Application-specific directories outside the template convention (if justified and documented)
- Empty directories that are git-tracked for structure
- Template-origin files: evaluate at template level, not per-app
- Any path recorded in a derived app's `.templateoverrides`: its location, presence or absence is a recorded decision (see [Applicability](#applicability))
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

The facade pattern and the ~200-line guideline come from the Spernakit DEVELOPMENT.md. In a derived app they apply to the services the app added; a template-shipped service is reorganized in the template.

### DB Worker / Command-Module Placement (aidd only)

> **Applies to aidd**, where the backend database runs in a Bun worker and `backend/src/db/commands.ts` is the only place a transaction is opened. Single-statement writes through the Drizzle client in services are normal in aidd and are not a finding. Spernakit and derived apps use the in-process Drizzle setup and have no `db/commands/`; do NOT flag its absence there. If another target runs its database behind a worker with a command facade, apply the same check to that target's own files.

- [ ] Every multi-statement transaction is a command registered in `backend/src/db/commands.ts` (`createInProcessCommands`), implemented in a module under `backend/src/db/commands/`, behind the worker boundary. No `db.transaction()` call appears in a route or service. New multi-statement transactions are added as commands, not invoked at the call site. Note the facade+directory pairing: `backend/src/db/commands.ts` sits alongside the `backend/src/db/commands/` directory and wires the individual command modules; both coexisting is the expected shape, not a duplication.

---

## 5. Route Organization

### What to Check

- [ ] Route files in `backend/src/routes/` (one file per domain)
- [ ] All route files registered through the target's API app assembly. Spernakit and derived apps: `backend/src/create-api-app.ts` (the `routePlugins` chain) or a registered domain route aggregator such as a route directory's `index.ts`. aidd: `backend/src/server.ts`. Other targets: the composition root found by reading the entry point. Derived apps do not move the assembly to `server.ts` or `app.ts`; `create-api-app.ts` is security infrastructure there and its removal fails `check:drift`
- [ ] All pages registered through the target's router. Spernakit and derived apps: page imports in `frontend/src/routes/lazyPages.ts`, route objects in `frontend/src/routes/routeGroups.tsx` (settings routes in `settingsRoutes.tsx`), and no page entry added to `frontend/src/routes.tsx`, which only assembles the groups; a route added there sits outside `ProtectedRoute` and `AppShell`. aidd: page imports and routes in `frontend/src/App.tsx`, top-level destinations in `frontend/src/components/layout/nav-items.ts`
- [ ] Complex handlers (>30 lines) extracted as named functions in the route file
- [ ] No controller classes: named functions only (controller classes break Elysia type chain)
- [ ] TypeBox schemas for request/response validation on routes
- [ ] Route files use Elysia plugin pipeline (NOT Express/Fastify middleware)

### Plugin Pipeline Order

Spernakit and derived apps only. Verify plugins are registered in this order in `createApiApp` (`backend/src/create-api-app.ts`):
Client IP → Request ID → Logger → CORS → Security Headers → Auth → Password Change Guard → CSRF → Rate Limit → Auth Rate Limit → Workspace → Audit

aidd has a different, shorter chain in `backend/src/server.ts` (error handler, request id, security headers, data-movement trace, bearer-token guard with its trusted-Host check, the origin guard, then the routes). Read it there; do not score aidd against the Spernakit order.

**Note**: API-key authentication is handled by `authPlugin` from the `X-API-Key` header; the
role guard then caps the effective role to the key's scope. Do not invent a separate "API Key"
plugin or per-route API-key guard when reviewing the pipeline.

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
- A compatibility shim the project owner approved explicitly, where the approval is on record. Without a recorded approval a backward-compatibility shim is a finding in any target whose rules forbid such code (routed to [TECHDEBT.md](./TECHDEBT.md) for classification)
- Type-only files that may appear unused to import scanners

> For comprehensive dead code analysis, defer to [DEAD_CODE.md](./DEAD_CODE.md) and [HYGIENE.md](./HYGIENE.md).

---

## Audit Checklist

### Critical Checks

> **Expected-clean guardrails**: The no-`export default`, no-CommonJS, no-controller-class, and naming-convention checks are enforced by ESLint/lint and template scaffolding, so a clean result is the norm, not a coverage gap. They are kept as regression protection against template drift; a clean pass does not warrant deeper investigation.

- [ ] Target identified per [Applicability](#applicability) before any check is scored
- [ ] Derived Spernakit apps: `.templateoverrides` read in full; no recommendation moves, renames, overwrites, restores or realigns a recorded path
- [ ] Derived Spernakit apps: no recommendation reorganizes a template-managed file in the app; such items are listed as template-origin issues
- [ ] No `export default` in any module
- [ ] No CommonJS patterns (`require`, `module.exports`)
- [ ] No controller classes in backend (breaks Elysia type chain)
- [ ] No `src/features/` or `src/controllers/` directories
- [ ] Database files in `data/` at project root (NOT `backend/data/`)
- [ ] No Express/Fastify patterns in backend code

### High Priority Checks

- [ ] Route handlers >30 lines extracted as named functions
- [ ] Complex services use subdirectory + facade extraction per the ~200-line DEVELOPMENT.md guideline (raw line count over 300 is already a build failure via `check:max-lines`; flag near-cap and under-cap-but-overloaded services here)
- [ ] All route files registered through the target's API app assembly (Spernakit and derived apps: `create-api-app.ts` or a registered route aggregator; aidd: `server.ts`)
- [ ] All pages registered through the target's router (Spernakit and derived apps: imports in `routes/lazyPages.ts`, route objects in `routes/routeGroups.tsx` or `routes/settingsRoutes.tsx`, no page entries added to `routes.tsx`; aidd: `App.tsx`)
- [ ] Frontend pages organized in `pages/{domain}/` directories
- [ ] Schema files: one per entity in `backend/src/db/schema/`
- [ ] `components/ui/` has no barrel file: direct imports only

### Medium Priority Checks

- [ ] File naming conventions consistent (PascalCase components, camelCase utilities)
- [ ] Export names match file names
- [ ] Database naming conventions followed (snake_case tables, idx/fk naming)
- [ ] No files near the cap that should be split proactively (the cap itself is enforced by the target's `check:max-lines` gate; read the gate and any baseline it carries, and do not report a baselined file as a new finding)
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

| Pattern                                         | Why it's not an issue                                                                                                                                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Long shadcn/ui components                       | Generated code: do not flag for granularity. The file-size gate has no exemption for them, so one over the cap still fails the build and is a template-level issue |
| Schema files with many columns                  | One entity = one file: do not flag for granularity. The file-size gate still applies to them                                                                       |
| `backend/src/db/schema-pg/` mirroring `schema/` | Dual-dialect (SQLite/PostgreSQL) by design (Spernakit and derived apps)                                                                                            |
| Template-origin files                           | Evaluate at template level, not per-app; list under template-origin issues                                                                                         |
| Paths recorded in `.templateoverrides`          | A recorded decision, normally with a written reason; not misplaced, not drift, not to be realigned                                                                 |
| Files in the file-size gate's baseline          | Recorded existing debt in repositories whose gate carries a baseline; a finding only if grown past the recorded size                                               |

---

## Report Template

This audit defines no scoring rubric, so it does not produce a numeric score, overall or per category. Write the score as `N/A` and let the severity counts, the category counts and the findings carry the result. Do not derive a number from checklist ticks or from a green gate.

Every location in the report is the live `file:line` read during this audit, with the symbol name where one applies. The report must also carry the sections [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) requires: the instrument validation table (including `check:max-lines` and every other gate cited), the methodology validity summary and the falsification records.

```markdown
# Codebase Reorganization Audit Report - YYYY-MM-DD

## Executive Summary

**Application**: {app-name}
**Target**: [Spernakit template | derived Spernakit app | aidd | other - name it]
**Overall Score**: N/A (this audit defines no scoring rubric)
**Issues Found**: [Count] (Critical: [N], High: [N], Medium: [N], Low: [N])
**File-size gate**: [cap, scanned roots, baseline: none / N files] - result: [pass / fail]

## Category Breakdown

### 1. File Granularity

- Near-cap files flagged for proactive split (approaching the `check:max-lines` cap): [Count] ([List])
- Baselined files (existing recorded debt, not new findings): [Count, or "gate has no baseline"]
- Multi-component .tsx files: [Count]
- Route handlers >30 lines not extracted: [Count]

### 2. Naming Conventions

- Naming violations: [Count]
- Default exports: [Count]
- Database naming violations: [Count]

### 3. Directory Structure

- Directory convention violations: [Count]
- Barrel file violations: [Count]
- Misplaced files: [Count]

### 4. Service & Route Organization

- Services needing extraction (per ~200-line guideline / approaching 300-line cap): [Count]
- Missing facades: [Count]
- Unregistered routes: [Count]
- Unregistered pages, or page entries outside the target's route files: [Count]
- Controller classes: [Count]

## Template-Origin Issues and Recorded Overrides (derived Spernakit apps)

| Path   | Status                                                       | Note                                |
| ------ | ------------------------------------------------------------ | ----------------------------------- |
| [path] | [template-managed: owner is the template / override: ACTION] | [issue for the template, or reason] |

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
- Files over the cap with no baseline entry (must be 0 - `check:max-lines` fails the build otherwise): [Count]
- Near-cap files flagged for proactive split: [Count] ([Percentage]%)
- Default exports remaining: [Count]
- Service facade compliance: [Count]/[Total] complex services
- Route registration compliance: [Count]/[Total] route files
```

## Deliverables

### Required Outputs

1. Audit report in `.aidd/audit-reports/REORG-YYYY-MM-DD.md`
2. Feature.json files for each finding requiring code changes; emitted `feature.json` must be prettier-normalized (run `prettier --write`; sorted keys, tabs) so it passes `--check-features`
3. Summary of template-origin issues (filed once against the Spernakit template, never as a change to a derived app's copy) and of the `.templateoverrides` entries that were respected

### Success Criteria

- [ ] 0 default exports
- [ ] 0 CommonJS patterns
- [ ] 0 controller classes
- [ ] 0 files over the cap that the target's `check:max-lines` gate does not account for (Spernakit, derived apps and aidd: a hard 300-line cap with no exemptions; a repository whose gate carries a baseline: no file past its recorded size and no unbaselined file over the cap)
- [ ] 100% route registration through the target's API app assembly (Spernakit and derived apps: `create-api-app.ts` or a registered route aggregator; aidd: `server.ts`)
- [ ] 100% page registration through the target's router, with no page entry added to `routes.tsx` in Spernakit and derived apps
- [ ] All complex services use facade pattern
- [ ] Derived Spernakit apps: no recommendation touches a path recorded in `.templateoverrides` or reorganizes a template-managed file

---

**Version**: 2.6
**Last Updated**: 2026-10-01

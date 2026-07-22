---
title: 'Spernakit v3 Derived Application Audit Framework'
last_updated: '2026-06-28'
version: '3.6'
category: 'Architecture'
priority: 'High'
estimated_time: '2-4 hours'
frequency: 'Quarterly'
trigger: model_decision
description: 'Comprehensive audit framework for Spernakit v3-derived applications covering structure alignment and feature utilization'
lifecycle: 'specialized'
---

# Spernakit v3 Derived Application Audit Framework

> **Severity Classification**: See [SEVERITY_CLASSIFICATION.md](SEVERITY_CLASSIFICATION.md) for severity level definitions.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

This document provides a structured audit framework for evaluating derived applications against the Spernakit v3 template, identifying drift, and executing remediation.

## Table of Contents

- [Applicability Tiers](#applicability-tiers) - Scoping checks to full apps, spernakit-lite, and local-only tools
- [Section 1: Architecture Compliance](#section-1-architecture-compliance) - Project, backend, and frontend structure
- [Section 2: Frontend API Standards](#section-2-frontend-api-standards) - HTTP client, shared workspace, API modules, TanStack Query, response format, exports
- [Section 3: State Management (Zustand)](#section-3-state-management-zustand) - Store patterns and global state
- [Section 4: Component Library (shadcn/ui)](#section-4-component-library-shadcnui) - shadcn/ui usage and custom components
- [Section 5: Backend Architecture (Elysia)](#section-5-backend-architecture-elysia) - Plugins, guards, routes, services, schema
- [Section 6: Frontend Architecture](#section-6-frontend-architecture) - Pages, layout
- [Section 7: Verification Strategy (crawltest)](#section-7-verification-strategy-crawltest) - crawltest + smoke:qc
- [Section 8: Template Sync Verification](#section-8-template-sync-verification) - Core file alignment, technology versions
- [Section 9: Feature Utilization & Anti-Pattern Detection](#section-9-feature-utilization--anti-pattern-detection) - Auth, DB, API, state, components, logging, validation, verification, config, file org, hooks
- [Section 10: Remediation Workflow](#section-10-remediation-workflow) - Analysis, execution, validation
- [Appendix A: Checklist Template](#appendix-a-checklist-template)
- [Appendix B: Common Anti-Patterns](#appendix-b-common-anti-patterns)
- [Appendix C: Typical Files to Review](#appendix-c-typical-files-to-review)
- [Appendix D: Audit Reporting Format](#appendix-d-audit-reporting-format)
- [Appendix E: Version History](#appendix-e-version-history)
- [Pre-Audit Setup](#pre-audit-setup)
- [Consolidated Audit Checklist](#consolidated-audit-checklist)
- [Deliverables](#deliverables)

## Related Documents

| Document          | Path                                    | Purpose                                      |
| ----------------- | --------------------------------------- | -------------------------------------------- |
| Stack Reference   | `spernakit/docs/template/STACK.md`      | Core architecture and commands               |
| Project Overrides | `spernakit/.aidd/project.md`            | Technology-specific constraints              |
| Template Refactor | `skills/template-refactor/SKILL.md`     | Bidirectional enhancement detection workflow |
| Enhancement Log   | `.claude/logs/template-enhancements.md` | Historical record of template improvements   |

## Audit Objectives

This audit framework validates two distinct aspects of compliance:

| Objective               | Focus                                 | Detection Method                      |
| ----------------------- | ------------------------------------- | ------------------------------------- |
| **Structure Alignment** | Drift detection, template conformance | File comparison, diff analysis        |
| **Feature Utilization** | Wheel reinvention, underutilization   | Anti-pattern detection, grep searches |

Both objectives must be validated during a comprehensive audit.

## Audit Scope

### What to Audit

**Frontend** (`frontend/src/`):

- Components, hooks, pages, API modules, utilities, configuration, stores

**Backend** (`backend/src/`):

- Routes, plugins, guards, services, utilities, configuration, database schema

**Configuration** (root level):

- package.json, tsconfig.json, vite.config.ts, bunfig.toml

### What to Flag

Infrastructure differences that should be homogenized:

- Component structure and patterns
- Error handling patterns
- State management patterns
- Import styles (type imports, verbatimModuleSyntax)
- Accessibility patterns (ARIA, semantic HTML)
- API response handling patterns
- Plugin/guard structure and ordering
- Security patterns (CORS, auth, validation)

### What to Preserve

Legitimate application-specific differences:

- Menu items and navigation structure
- Application-specific routes and API endpoints
- Business logic unique to each application
- Application-specific database schemas
- Custom features not suitable for templating
- Application identity (names, descriptions, branding)
- Port numbers (33x0/33x1 pattern)

---

## Applicability Tiers

Not every check applies to every derived application. Classify the target app into a tier first so small, single-team, and local-only tools are not scored against rules for a full multi-user registered Spernakit app. The per-app source of truth for tier and exemptions is `.aidd/project.md`.

| Tier                         | Description                                                                      | Examples                                     |
| ---------------------------- | -------------------------------------------------------------------------------- | -------------------------------------------- |
| **Tier 1 - Full app**        | Multi-user, registered Spernakit app with RBAC, workspaces, and network exposure | Standard registered apps in `spernakit.psd1` |
| **Tier 2 - spernakit-lite**  | Single-team app with no or limited RBAC; may omit workspace isolation            | devdiary                                     |
| **Tier 3 - Local-only tool** | Loopback / single-user tool, single origin, no remote exposure                   | aidd                                         |

**Tier-scoped checks** (mandatory in Tier 1; advisory in Tiers 2-3 when the exemption is documented in `.aidd/project.md`):

| Check                                          | Tier 1    | Tier 2    | Tier 3                   |
| ---------------------------------------------- | --------- | --------- | ------------------------ |
| 5-tier RBAC (Section 1.2, 5.2)                 | Mandatory | Advisory  | Advisory                 |
| Soft delete on core entities (1.2, 5.5, 9.2)   | Mandatory | Advisory  | Advisory                 |
| CSRF / CORS enforcement (9.1, 9.9)             | Mandatory | Advisory  | Advisory (loopback-only) |
| Workspace isolation (`workspaceAccess`)        | Mandatory | Advisory  | Advisory                 |
| Monorepo frontend/backend split                | Mandatory | Mandatory | Advisory                 |
| Third-party-test-framework absence + crawltest | Mandatory | Mandatory | Mandatory (bun:test OK)  |

A check marked Advisory for a tier is NOT a finding when the app documents the exemption in `.aidd/project.md`. Do not re-derive the same dismissal on every run - read the tier and the override file first.

**`bun:test` is permitted - do not flag it.** The "test-framework absence" check targets _third-party_ runners (vitest, jest, @testing-library, jsdom). Bun's built-in `bun:test` is a runtime built-in, not a dependency, and the `spernakit-web` variant (notably **aidd**) deliberately uses `"test": "bun test"` over `test/{backend,cli,frontend,integration}` for backend/CLI-internal logic. Finding `.test.ts` files / `bun test` scripts / `describe`/`it`/`expect` importing from `bun:test`, with no third-party runner installed, is **NOT** a violation (this aligns SPERNAKIT.md with the Permitted-Runtime Carve-Out in [TESTING.md](./TESTING.md); the Section 7 checklist rows below that list `bun:test` are scoped to base Spernakit apps, not the `bun:test`-adopting variant).

---

## Application Registry

**Source of truth:** `<spernakit-root>/spernakit.psd1` (`ExpectedConfigs` hashtable - app slugs, ports, names, spernakit versions).

The audit dynamically discovers the application list from `spernakit.psd1` at runtime. Do not hard-code application lists in this document.

## Pre-Audit Setup

Before running the checklist, collect the target-specific context that controls applicability:

- Read the target app's `.aidd/project.md` for tier, stack profile, and documented exemptions.
- Read root `package.json`, workspace package manifests, `bunfig.toml`, and config files.
- Read the repo's live `smoke:qc` source: Spernakit uses `scripts/smoke.json` mode `qc`; aidd uses `scripts/smoke-qc.ts` `SMOKE_QC_STEPS`.
- Run or inspect `bun run check:feature-integration`, `bun run check:schema-parity`, and the relevant smoke/crawl scripts before filing integration or verification findings.
- For derived apps, generate or inspect the current template drift evidence before recommending overwrites or merges.

---

# Section 1: Architecture Compliance

## 1.1 Project Structure

| Check | Criteria                                                       | Remediation                                                   |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------- |
| `[ ]` | Monorepo workspace with `frontend/` and `backend/` directories | Restructure to match template layout                          |
| `[ ]` | Root `package.json` with workspace scripts                     | Copy from spernakit, preserve app-specific values             |
| `[ ]` | `bunfig.toml` with `env = false` setting                       | Copy from spernakit                                           |
| `[ ]` | `config/{appname}.json` configuration file present             | Create from template, set app-specific values                 |
| `[ ]` | Database in `data/` at project root (NEVER backend/data/)      | Move database files to correct location                       |
| `[ ]` | Deterministic Bun lockfile (`bun.lock`) present and committed  | Restore `bun.lock`; `bun run check:lockfile-frozen` must pass |

## 1.2 Backend Structure

| Check | Criteria                                                                                                                                                                                       | Remediation                                                                                                                           |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | **Elysia** framework with service layer pattern                                                                                                                                                | Migrate from Express/Fastify to Elysia                                                                                                |
| `[ ]` | **Drizzle ORM** with SQLite (default) or PostgreSQL (via `config.database.dialect`)                                                                                                            | Migrate from Prisma to Drizzle                                                                                                        |
| `[ ]` | Plugin pipeline: Client IP > ReqID > Logger > CORS > SecHeaders > Auth > PwdChange > CSRF > RateLimit > AuthRateLimit > Workspace > Audit (`apiKey` is a per-route guard, not a plugin)        | Review plugin order against STACK.md                                                                                                  |
| `[ ]` | Elysia guards for authorization (requireAuth, requireRoleFresh, workspaceAccess)                                                                                                               | Check guard implementations (API key auth lives in `authPlugin`, not a guard)                                                         |
| `[ ]` | 5-tier RBAC system (SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER) - **Tier 1 only**; Tier 2-3 may document an RBAC exemption in `.aidd/project.md`                                              | Check role definitions                                                                                                                |
| `[ ]` | Soft delete on core entities (NOT ephemeral/security tables) - applies to apps with recoverable user-facing entities; exempt ephemeral/local-tool data stores (document in `.aidd/project.md`) | Verify `isDeleted`, `deletedAt`, `deletedBy` on core models; hard delete OK for token_blacklist, password_history, rate_limit_entries |
| `[ ]` | Audit trail logging via audit plugin                                                                                                                                                           | Verify auditService implementation                                                                                                    |
| `[ ]` | WebSocket using Bun native WebSocket (NOT Socket.IO)                                                                                                                                           | Replace socket.io with native Bun WebSocket                                                                                           |
| `[ ]` | **pino** logging (NOT Winston)                                                                                                                                                                 | Replace Winston with pino                                                                                                             |
| `[ ]` | **TypeBox** validation via Elysia (NOT Joi/Zod)                                                                                                                                                | Replace validation schemas with TypeBox                                                                                               |

## 1.3 Frontend Structure

| Check | Criteria                                                | Remediation                                                                                      |
| ----- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| `[ ]` | React 19 with Vite 8 bundler                            | Check package versions                                                                           |
| `[ ]` | `babel-plugin-react-compiler` enabled in vite.config.ts | Verify React Compiler plugin is active - no manual `React.memo`, `useMemo`, `useCallback` needed |
| `[ ]` | **Zustand** stores for client state                     | Verify store patterns                                                                            |
| `[ ]` | TanStack Query for server state                         | Verify query/mutation patterns                                                                   |
| `[ ]` | **shadcn/ui** components (NOT DaisyUI)                  | Replace DaisyUI with shadcn/ui                                                                   |
| `[ ]` | **sonner** for toasts (NOT react-hot-toast)             | Replace toast implementation                                                                     |
| `[ ]` | ProtectedRoute component with role-based access         | Verify route protection                                                                          |
| `[ ]` | Lazy loading with code splitting                        | Check route lazy imports                                                                         |

---

# Section 2: Frontend API Standards

## 2.1 HTTP Client

| Check | Criteria                                                                                                                       | Remediation                                                                                                |
| ----- | ------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `[ ]` | **Native fetch** API (NOT Axios)                                                                                               | Replace Axios instances with native fetch                                                                  |
| `[ ]` | API modules in `frontend/src/api/` by domain                                                                                   | Organize by resource/domain                                                                                |
| `[ ]` | Shared types via `spernakit-shared` workspace (`shared/`)                                                                      | Verify `shared/` workspace exists and is wired via `workspace:*` in both frontend and backend package.json |
| `[ ]` | Shared types include `ErrorCode`, `UserRole`, `ROLE_HIERARCHY`, response envelopes (`DataResponse<T>`, `PaginatedResponse<T>`) | Verify canonical shared types present in `shared/`                                                         |
| `[ ]` | Domain-specific types in `frontend/src/api/types/` directory                                                                   | Verify frontend-only types (User, ApiKey, etc.) are in types/ directory                                    |
| `[ ]` | Centralized fetch wrapper at `api/client.ts` with CSRF, retry, error interception                                              | Verify apiClient handles auth tokens, CSRF cookie, 5xx retry with exponential backoff                      |
| `[ ]` | Auth token handling automatic (HTTP-only cookies)                                                                              | Verify cookie attachment                                                                                   |

## 2.2 Shared Workspace

| Check | Criteria                                                                                                 | Remediation                                     |
| ----- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------- |
| `[ ]` | `shared/` directory exists at project root with `package.json`                                           | Create shared workspace from template           |
| `[ ]` | Both `frontend/package.json` and `backend/package.json` depend on `spernakit-shared: workspace:*`        | Add workspace dependency                        |
| `[ ]` | Shared types include `ErrorCode`, `UserRole`, `ROLE_HIERARCHY`, `ROLES`                                  | Verify canonical types in shared/               |
| `[ ]` | Shared response envelopes: `DataResponse<T>`, `PaginatedResponse<T>`, `SuccessResponse`, `ErrorResponse` | Verify response types in shared/                |
| `[ ]` | Shared constants: `AUTH_ERROR_CODES`, `ERROR_CODES`, `APP_FEATURES_DEFAULTS`                             | Verify constants in shared/                     |
| `[ ]` | Shared functions: `hasMinimumRole()`, `validateUserRole()`                                               | Verify pure functions in shared/                |
| `[ ]` | Re-export shims in backend and frontend maintain original import paths                                   | Verify consumers don't need import path changes |
| `[ ]` | Zero runtime deps in shared/ (types, constants, and pure functions only)                                 | Remove any runtime dependencies from shared/    |

## 2.3 API Module Pattern

| Check | Criteria                                                    | Remediation                                                        |
| ----- | ----------------------------------------------------------- | ------------------------------------------------------------------ |
| `[ ]` | API modules in `api/` directory (one file per domain)       | Organize by resource/domain                                        |
| `[ ]` | Functions return typed responses                            | Verify return types                                                |
| `[ ]` | Consistent method signatures across modules                 | Audit naming conventions                                           |
| `[ ]` | OpenAPI spec at `/api/v1/docs/json` is source of truth      | Verify spec generation (dev mode only - not mounted in production) |
| `[ ]` | `bun run check:api-types` passes (enum/union type contract) | Run `bun run check:api-types`                                      |

**Expected API module pattern:**

```typescript
import type { ApiResponse, Resource, ResourceForm } from './types';

export async function getAllResources(): Promise<ApiResponse<Resource[]>> {
	const response = await fetch('/api/resources');
	return response.json();
}

export async function createResource(data: ResourceForm): Promise<ApiResponse<Resource>> {
	const response = await fetch('/api/resources', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify(data),
	});
	return response.json();
}
```

## 2.4 TanStack Query Integration

| Check | Criteria                                    | Remediation                      |
| ----- | ------------------------------------------- | -------------------------------- |
| `[ ]` | Custom hooks in `hooks/` wrap API calls     | Create useResource pattern hooks |
| `[ ]` | `refetchOnWindowFocus: false` by default    | Add to all queries               |
| `[ ]` | Mutations invalidate relevant query keys    | Verify cache invalidation        |
| `[ ]` | WebSocket events trigger cache invalidation | Implement subscription pattern   |

**Expected hook pattern:**

```typescript
export function useResources() {
	return useQuery({
		queryKey: ['resources'],
		queryFn: getAllResources,
		refetchOnWindowFocus: false,
	});
}

export function useCreateResource() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: createResource,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['resources'] });
		},
	});
}
```

## 2.5 Response Format

| Check | Criteria                                                                  | Remediation                   |
| ----- | ------------------------------------------------------------------------- | ----------------------------- |
| `[ ]` | Success responses include `{ data, success: true, message, error: null }` | Standardize backend responses |
| `[ ]` | Error responses include `{ success: false, error, message, details }`     | Standardize error envelope    |
| `[ ]` | Paginated responses use `{ data: { items, pagination }, ... }`            | Verify pagination structure   |

## 2.6 Module Export Pattern

| Check | Criteria                                                                                                        | Remediation                                                                                                                          |
| ----- | --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | Named exports only - no `export default` in modules                                                             | Remove default exports, update imports                                                                                               |
| `[ ]` | Barrel files (`index.ts`) only in route/plugin subdirectories (e.g., `routes/auth/`)                            | Verify subdirectory barrels re-export public API                                                                                     |
| `[ ]` | No `index.ts` barrel in service subdirectories - facade file at `services/` root is the sole public entry point | Remove new-code barrels; existing barrels in `backup/`, `dashboard/`, `scheduler/`, `file/`, and `health/` are documented exceptions |
| `[ ]` | Top-level `hooks/` and `services/` have NO barrel files - import directly                                       | Remove any top-level barrel files                                                                                                    |
| `[ ]` | `components/ui/` uses direct imports (no barrel)                                                                | No `components/ui/index.ts`; imports use `@/components/ui/button`                                                                    |
| `[ ]` | `React.lazy()` uses `.then()` pattern for named exports                                                         | `import('./X').then(m => ({ default: m.X }))`                                                                                        |

---

# Section 3: State Management (Zustand)

## 3.1 Store Pattern

| Check | Criteria                                               | Remediation                         |
| ----- | ------------------------------------------------------ | ----------------------------------- |
| `[ ]` | Zustand stores in `frontend/src/stores/`               | Organize stores by domain           |
| `[ ]` | Persist middleware for auth, theme, sidebar, workspace | Add persist where needed            |
| `[ ]` | TypeScript with proper typing for state and actions    | Verify store types                  |
| `[ ]` | No React Context for state (use Zustand instead)       | Replace Context with Zustand stores |

**Expected store pattern:**

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AuthState {
	user: User | null;
	isAuthenticated: boolean;
	login: (user: User) => void;
	logout: () => void;
}

export const useAuthStore = create<AuthState>()(
	persist(
		(set) => ({
			user: null,
			isAuthenticated: false,
			login: (user) => set({ user, isAuthenticated: true }),
			logout: () => set({ user: null, isAuthenticated: false }),
		}),
		{ name: 'auth-storage' }
	)
);
```

## 3.2 Global State Stores

| Store               | Purpose                                                   | Persist |
| ------------------- | --------------------------------------------------------- | ------- |
| `useAuthStore`      | Authentication state                                      | Yes     |
| `useThemeStore`     | Theme mode and app color theme                            | Yes     |
| `useSidebarStore`   | Sidebar collapsed/expanded state                          | Yes     |
| `useWorkspaceStore` | Active workspace selection                                | Yes     |
| `useLayoutStore`    | Layout mode (sidebar/topbar), container width, UI density | Yes     |
| `useCommandStore`   | Command palette state                                     | No      |
| `useWsStore`        | WebSocket connection state                                | No      |

---

# Section 4: Component Library (shadcn/ui)

## 4.1 shadcn/ui Usage

| Check | Criteria                                               | Remediation                      |
| ----- | ------------------------------------------------------ | -------------------------------- |
| `[ ]` | shadcn/ui components in `frontend/src/components/ui/`  | Install missing components       |
| `[ ]` | Tailwind CSS for styling (NOT custom CSS or DaisyUI)   | Replace custom CSS with Tailwind |
| `[ ]` | Components installed via `bunx shadcn@latest add`      | Follow install pattern           |
| `[ ]` | Custom components in `frontend/src/components/shared/` | Organize shared components       |
| `[ ]` | Layout components in `frontend/src/components/layout/` | Organize layout components       |

## 4.2 Common shadcn/ui Components

| Component | Location                     | Usage                          |
| --------- | ---------------------------- | ------------------------------ |
| Button    | `components/ui/button.tsx`   | All button variants            |
| Input     | `components/ui/input.tsx`    | Form inputs                    |
| Select    | `components/ui/select.tsx`   | Dropdowns                      |
| Textarea  | `components/ui/textarea.tsx` | Multi-line inputs              |
| Dialog    | `components/ui/dialog.tsx`   | Modals                         |
| Table     | `components/ui/table.tsx`    | Data tables                    |
| Card      | `components/ui/card.tsx`     | Cards                          |
| Badge     | `components/ui/badge.tsx`    | Status indicators              |
| Alert     | `components/ui/alert.tsx`    | Alert messages                 |
| Toast     | `sonner` (direct import)     | Toast notifications via sonner |

## 4.3 Custom Component Guidelines

| Check | Criteria                                          | Remediation                        |
| ----- | ------------------------------------------------- | ---------------------------------- |
| `[ ]` | Custom components extend shadcn/ui patterns       | Follow shadcn/ui conventions       |
| `[ ]` | Reusable components in `components/shared/`       | Move shared logic to shared folder |
| `[ ]` | Feature-specific components in `pages/{domain}/`  | Organize by feature area           |
| `[ ]` | Proper TypeScript typing for all props            | Add type definitions               |
| `[ ]` | Accessibility support (ARIA, keyboard navigation) | Verify a11y compliance             |

---

# Section 5: Backend Architecture (Elysia)

## 5.1 Elysia Plugins

| Check | Criteria                                                                                                                                                                                      | Remediation                                       |
| ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `[ ]` | Plugins in `backend/src/plugins/` (one file per concern)                                                                                                                                      | Organize plugins by domain                        |
| `[ ]` | Plugin order: Client IP → ReqID → Logger → CORS → SecHeaders → Auth → PwdChange → CSRF → RateLimit → AuthRateLimit → Workspace → Audit (`apiKey` is a per-route guard, not a pipeline plugin) | Verify plugin registration order matches STACK.md |
| `[ ]` | Cross-cutting concerns use plugin pattern                                                                                                                                                     | Move middleware to plugins                        |
| `[ ]` | Type-safe plugin configuration via TypeBox                                                                                                                                                    | Use TypeBox for plugin schemas                    |

**Expected plugin pattern:**

```typescript
import { Elysia } from 'elysia';

export const authPlugin = new Elysia({ name: 'auth' })
	.derive({ as: 'scoped' }, async ({ cookie }) => {
		const token = cookie.auth_token?.value;
		const user = token ? await verifyToken(token) : null;
		return { user, isAuthenticated: !!user };
	})
	.beforeHandle(({ user, set, path }) => {
		// Public routes skip auth check
		if (isPublicRoute(path)) return;
		if (!user) {
			set.status = 401;
			return { success: false, error: 'Unauthorized' };
		}
	});
```

**Note:** `derive({ as: 'scoped' })` ensures types propagate to the parent via `.use()`. Without `as: 'scoped'`, derived types are volatile (local only). Named plugins are deduplicated by Elysia at runtime.

## 5.2 Elysia Guards

| Check | Criteria                                                              | Remediation                                          |
| ----- | --------------------------------------------------------------------- | ---------------------------------------------------- |
| `[ ]` | Guards in `backend/src/guards/` (one file per concern)                | Organize guards by domain                            |
| `[ ]` | `requireAuth` guard for logged-in users                               | Verify auth guard                                    |
| `[ ]` | `requireRoleFresh()` guard for RBAC (re-validates role from database) | Verify role guard                                    |
| `[ ]` | `workspaceAccess` guard for multi-tenant isolation                    | Verify workspace guard                               |
| `[ ]` | API key authentication lives in `authPlugin` (NOT a separate guard)   | Verify apiKey logic is folded into `plugins/auth.ts` |
| `[ ]` | Guard usage on protected routes                                       | Apply guards where needed                            |

**Expected guard pattern:**

```typescript
import { Elysia } from 'elysia';

// requireRoleFresh re-validates the user's role from the database on each request
export const requireRoleFresh = (minimumRole: UserRole) =>
	new Elysia({ name: `require-role-${minimumRole}` }).beforeHandle(async ({ user, set }) => {
		if (!user) {
			set.status = 401;
			return { success: false, error: 'Unauthorized' };
		}
		const freshUser = await getUserById(user.id);
		if (!freshUser || !hasMinimumRole(freshUser.role, minimumRole)) {
			set.status = 403;
			return { success: false, error: 'Forbidden' };
		}
	});
```

## 5.3 Route Organization

| Check | Criteria                                                                | Remediation                                                                       |
| ----- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `[ ]` | Route groups in `backend/src/routes/` (one file per domain)             | Organize routes by domain                                                         |
| `[ ]` | Elysia instance with plugins registered                                 | Verify plugin attachment                                                          |
| `[ ]` | TypeBox schemas for request/response validation                         | Add TypeBox schemas                                                               |
| `[ ]` | Service layer called from routes (NOT direct Drizzle calls)             | Move logic to services                                                            |
| `[ ]` | Complex handlers (>30 lines) extracted as named functions in route file | Extract inline handlers; do NOT use controller classes (breaks Elysia type chain) |
| `[ ]` | All route files registered in `create-api-app.ts`                       | Verify route registration                                                         |

**Expected route pattern:**

```typescript
import { Elysia, t } from 'elysia';
import { resourceService } from '../services/resourceService';

export const resourceRoutes = new Elysia({ prefix: '/resources' })
	.get('/', async () => {
		return await resourceService.getAll();
	})
	.post(
		'/',
		async ({ body }) => {
			return await resourceService.create(body as ResourceForm);
		},
		{
			body: t.Object({
				name: t.String(),
				description: t.Optional(t.String()),
			}),
		}
	);
```

## 5.4 Service Layer

| Check | Criteria                                                                         | Remediation                                                                                                                          |
| ----- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | Simple services as flat files in `backend/src/services/`                         | One file per simple service domain                                                                                                   |
| `[ ]` | Complex services use subdirectory + facade file                                  | Split into `services/{domain}/` + facade                                                                                             |
| `[ ]` | Facade file at `services/` root re-exports public API from subdirectory modules  | Create facade, move internals to subdir                                                                                              |
| `[ ]` | No `index.ts` barrel in service subdirectories - facade is the sole public entry | Remove new-code barrels; existing barrels in `backup/`, `dashboard/`, `scheduler/`, `file/`, and `health/` are documented exceptions |
| `[ ]` | Internal modules inside a service subdirectory import each other by filename     | No `import from './index'` within a service subdirectory                                                                             |
| `[ ]` | Consumers import from facade only (never from subdirectory modules directly)     | Fix imports to use facade                                                                                                            |
| `[ ]` | Business logic in services (NOT routes)                                          | Move logic from routes                                                                                                               |
| `[ ]` | Drizzle ORM for database operations                                              | Use Drizzle queries                                                                                                                  |
| `[ ]` | Proper error handling and logging                                                | Add error handling                                                                                                                   |

**Service organization pattern** (hybrid flat + subdirectory):

```
services/
├── authService.ts              # Facade: re-exports public API from auth/
├── auth/                       # Internal modules
│   ├── tokenService.ts
│   ├── emailService.ts
│   └── passwordResetService.ts
├── userService.ts              # Facade: re-exports public API from user/
├── user/                       # Internal modules
│   ├── userQueries.ts
│   ├── userMutationService.ts
│   └── passwordService.ts
├── settingsService.ts          # Simple service (no subdirectory needed)
└── ...
```

**When to create a subdirectory**: When a service exceeds ~200 lines or handles multiple distinct responsibilities. This is a soft guideline - services up to ~300 lines are acceptable if single-responsibility. Only flag services approaching 400+ lines as needing extraction.

**Expected facade pattern:**

```typescript
// services/userService.ts (facade)
import { passwordService } from './user/passwordService';
import { userMutationService } from './user/userMutationService';
import { userQueries } from './user/userQueries';

export { passwordService, userMutationService, userQueries };
```

**Expected simple service pattern:**

```typescript
import { db } from '../db';
import { resources } from '../db/schema';
import { eq } from 'drizzle-orm';

export const resourceService = {
	async getAll() {
		return await db.select().from(resources);
	},
	async create(data: ResourceForm) {
		const [resource] = await db.insert(resources).values(data).returning();
		return resource;
	},
};
```

## 5.5 Database Schema (Drizzle)

| Check | Criteria                                                                                                                                                                                                                      | Remediation                                                                                                                                        |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `[ ]` | Schemas in `backend/src/db/schema/` (one file per entity)                                                                                                                                                                     | Organize schemas by entity                                                                                                                         |
| `[ ]` | Snake_case column names in database, camelCase in schema                                                                                                                                                                      | Follow naming convention                                                                                                                           |
| `[ ]` | Plural snake_case table names (users, audit_logs)                                                                                                                                                                             | Follow naming convention                                                                                                                           |
| `[ ]` | Soft delete fields: `isDeleted`, `deletedAt`, `deletedBy` on core entities - applies to apps with recoverable user-facing entities; exempt ephemeral/local-tool data stores (document in `.aidd/project.md`)                  | Add to core entities (NOT ephemeral/security tables like token_blacklist, password_history, rate_limit_entries)                                    |
| `[ ]` | Audit fields: `createdAt`, `updatedAt`, `createdBy`, `updatedBy`                                                                                                                                                              | Add to all entities                                                                                                                                |
| `[ ]` | Indexes: `idx_{table}_{columns}` format                                                                                                                                                                                       | Follow naming convention                                                                                                                           |
| `[ ]` | Foreign keys: `fk_{table}_{column}_{target}` format (e.g., `fk_audit_logs_user_id_users`), declared via `foreignKey({ columns, foreignColumns, name }).onDelete(...)` in the constraints array - never inline `.references()` | Follow naming convention; the column qualifier disambiguates multiple FKs to one target (e.g., `created_by`, `updated_by`, `deleted_by` → `users`) |
| `[ ]` | Parallel `schema-pg/` dialect mirrors `schema/`; `bun run check:schema-parity` passes (no column or index drift)                                                                                                              | Add the PG dialect mirror; resolve parity drift                                                                                                    |

**Expected schema pattern:**

```typescript
import { sqliteTable, text, integer, foreignKey } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	username: text('username').notNull().unique(),
	email: text('email').notNull().unique(),
	isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
	deletedAt: integer('deleted_at', { mode: 'timestamp' }),
	deletedBy: integer('deleted_by'),
	createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
	updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull(),
	createdBy: integer('created_by'),
	updatedBy: integer('updated_by'),
});

export const auditLogs = sqliteTable(
	'audit_logs',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id'),
		action: text('action').notNull(),
		createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
		createdBy: integer('created_by'),
		updatedBy: integer('updated_by'),
	},
	(table) => [
		// FKs are declared in the constraints array via foreignKey({...}), NOT inline .references().
		// Name format: fk_{table}_{column}_{target}. The column qualifier disambiguates
		// multiple FKs to the same target table (created_by, updated_by → users).
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_audit_logs_user_id_users',
		}).onDelete('set null'),
		foreignKey({
			columns: [table.createdBy],
			foreignColumns: [users.id],
			name: 'fk_audit_logs_created_by_users',
		}).onDelete('set null'),
	]
);
```

---

# Section 6: Frontend Architecture

## 6.1 Page Organization

| Check | Criteria                                                                                                       | Remediation                                                                                                        |
| ----- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `[ ]` | Pages in `frontend/src/pages/{domain}/` (one directory per feature)                                            | Organize pages by feature area                                                                                     |
| `[ ]` | Lazy loading for all pages                                                                                     | Add lazy imports                                                                                                   |
| `[ ]` | Data fetching via TanStack Query hooks                                                                         | Use query hooks                                                                                                    |
| `[ ]` | Error boundaries around lazily-loaded routed pages - every lazy route element is wrapped in an `ErrorBoundary` | Wrap route element in `ErrorBoundary`; a lazy route with no boundary surfaces a blank screen on chunk/load failure |
| `[ ]` | Loading states with skeleton loaders or spinners                                                               | Add loading states                                                                                                 |

## 6.2 Layout Components

| Component           | Location                                    | Purpose             |
| ------------------- | ------------------------------------------- | ------------------- |
| AppLayout           | `components/layout/AppLayout.tsx`           | Main app shell      |
| AuthenticatedLayout | `components/layout/AuthenticatedLayout.tsx` | Authenticated pages |
| PublicLayout        | `components/layout/PublicLayout.tsx`        | Public pages        |

---

# Section 7: Verification Strategy (crawltest)

**Spernakit does not use third-party unit test frameworks** (no vitest, jest, @testing-library, jsdom, happy-dom, or similar). The base-template verification strategy is `smoke:qc` + crawltest (end-to-end page traversal in the running app). Bun's built-in `bun:test` is permitted for documented Spernakit-family variants such as aidd; do not flag it unless a forbidden third-party runner dependency is present.

| Check | Criteria                                                                                                            | Remediation                                  |
| ----- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `[ ]` | **No third-party test framework dependencies** in frontend/package.json or backend/package.json                     | Remove vitest, @testing-library, jsdom, etc. |
| `[ ]` | Test files are absent in base apps or use only permitted `bun:test` in documented variants                          | Remove orphaned or third-party-backed tests  |
| `[ ]` | **No `[test]` section in bunfig.toml** files unless the variant documents a deliberate `bun:test` verification flow | Remove stale test sections                   |
| `[ ]` | `bun run smoke:qc` passes clean                                                                                     | Fix quality gate failures                    |
| `[ ]` | `bun run crawltest` verifies critical pages end-to-end                                                              | Use `--page` or `--start-from` after changes |

**Detection commands:**

```bash
# Verify no unit test framework dependencies
grep -E "vitest|@testing-library|jsdom|happy-dom" frontend/package.json backend/package.json
# Should return nothing

# Verify test files are either absent or intentionally backed by bun:test only
find . -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) -not -path "*/node_modules/*"
# For documented bun:test variants, inspect imports before filing a finding.

# Verify no [test] section in bunfig.toml
grep -rn "^\[test\]" bunfig.toml backend/bunfig.toml 2>/dev/null
# Should return nothing
```

---

# Section 8: Template Sync Verification

## 8.1 Core File Alignment

| File                          | Check | Action if Drifted                                    |
| ----------------------------- | ----- | ---------------------------------------------------- |
| `bunfig.toml`                 | `[ ]` | Verify `env = false` setting                         |
| `config/{appname}.json`       | `[ ]` | Create from template, set app-specific values        |
| `backend/src/plugins/`        | `[ ]` | Align plugin implementations                         |
| `backend/src/guards/`         | `[ ]` | Align guard implementations                          |
| `backend/src/routes/`         | `[ ]` | Verify route patterns                                |
| `backend/src/db/schema/`      | `[ ]` | Verify schema naming conventions                     |
| `shared/`                     | `[ ]` | Verify shared workspace exists and is linked         |
| `frontend/src/api/types/`     | `[ ]` | Verify domain-specific API types in types/ directory |
| `frontend/src/api/`           | `[ ]` | Verify API module patterns                           |
| `frontend/src/stores/`        | `[ ]` | Verify Zustand store patterns                        |
| `frontend/src/components/ui/` | `[ ]` | Install missing shadcn/ui components                 |

## 8.2 Technology Verification

| Technology         | Status | Check Command                                                                                            |
| ------------------ | ------ | -------------------------------------------------------------------------------------------------------- |
| Bun 1.3.14+        | `[ ]`  | `bun --version` (matches `packageManager`/`engines` in package.json)                                     |
| Elysia             | `[ ]`  | Check backend/package.json                                                                               |
| Drizzle ORM        | `[ ]`  | Check backend/package.json                                                                               |
| pino logging       | `[ ]`  | Check backend/package.json                                                                               |
| React 19           | `[ ]`  | Check frontend/package.json                                                                              |
| Zustand            | `[ ]`  | Check frontend/package.json                                                                              |
| TanStack Query     | `[ ]`  | Check frontend/package.json                                                                              |
| shadcn/ui          | `[ ]`  | Check components/ui/ directory                                                                           |
| sonner toasts      | `[ ]`  | Check frontend/package.json                                                                              |
| native fetch       | `[ ]`  | `grep -r "axios" frontend/src/` (should be empty)                                                        |
| TypeBox            | `[ ]`  | Check backend/package.json                                                                               |
| Tailwind CSS 4     | `[ ]`  | Check frontend/package.json                                                                              |
| TypeScript 6       | `[ ]`  | Check root/frontend/backend package.json                                                                 |
| react-router-dom 7 | `[ ]`  | Check frontend/package.json                                                                              |
| Vite 8             | `[ ]`  | Check frontend/package.json                                                                              |
| React Compiler     | `[ ]`  | Check `babel-plugin-react-compiler` in frontend                                                          |
| No unit test deps  | `[ ]`  | `grep -E "vitest\|@testing-library\|jsdom" frontend/package.json backend/package.json` (should be empty) |

**Version pinning:** Every Spernakit dependency is pinned exactly without caret or tilde ranges.
Treat the major-version rows above as the compatibility floor and verify every exact pin against
the live workspace `package.json` files.

### smoke:qc Pipeline Steps

Read the repo's live `smoke:qc` source before judging pipeline shape. Spernakit uses `scripts/smoke.json` mode `qc`; aidd uses `scripts/smoke-qc.ts` `SMOKE_QC_STEPS`. Each relevant check should pass clean as part of `bun run smoke:qc`, and the gate must be check-only (`lint` + `format:check`, not `lint:fix` + `format`). Run individual checks when diagnosing failures.

| Check | Criteria                                        | Purpose                                                               |
| ----- | ----------------------------------------------- | --------------------------------------------------------------------- |
| `[ ]` | `bun run check:drift` passes                    | Template drift detection against spernakit source                     |
| `[ ]` | `bun run check:fresh-release` passes            | Public baseline excludes retired release-history material (template)  |
| `[ ]` | `bun run check:config` passes                   | Config invariants (required sections, types)                          |
| `[ ]` | `bun run check:schema-drift` passes             | Config schema artifact drift (codegen outputs match source)           |
| `[ ]` | `bun run config:validate` passes                | Config schema validation (defaults + example + instance)              |
| `[ ]` | `bun run check:secrets-shape` passes            | Secrets file shape parity (Split-secrets apps only - no-op if unused) |
| `[ ]` | `bun run check:process-env` passes              | Process environment access stays inside approved config boundaries    |
| `[ ]` | `bun run check:max-lines` passes                | Source files stay within the repo's max-lines gate                    |
| `[ ]` | `bun run check-application` passes              | Application structure validation                                      |
| `[ ]` | `bun run check:destructive-confirmation` passes | Destructive actions require explicit confirmation                     |
| `[ ]` | `bun run check-docs` passes                     | Documentation consistency check                                       |
| `[ ]` | `bun run typecheck` passes                      | TypeScript types (frontend + backend)                                 |
| `[ ]` | `bun run lint` passes                           | ESLint rules                                                          |
| `[ ]` | `bun run build` passes                          | Production build validation                                           |
| `[ ]` | `bun run check:api-types` passes                | API type contract (OpenAPI spec vs frontend types)                    |
| `[ ]` | `bun run check:feature-integration` passes      | Route and page reachability - no unwired routes or orphan pages       |
| `[ ]` | `bun run check:schema-parity` passes            | SQLite/PG schema structural parity (no column or index drift)         |
| `[ ]` | `bun run format:check` passes                   | Prettier formatting check                                             |
| `[ ]` | `bun run check-deps` passes                     | Dependency version check                                              |

### Additional Quality Scripts

These scripts may exist in `package.json` but are not universal across all apps. Run them as targeted checks when present or when the changed surface makes them relevant.

| Check | Criteria                                                                | Priority |
| ----- | ----------------------------------------------------------------------- | -------- |
| `[ ]` | `bun run check:dead-code` (knip) - no unused exports/files              | P3       |
| `[ ]` | App-specific standalone, audit-artifact, or backend/CLI boundary checks | P3       |

---

# Section 9: Feature Utilization & Anti-Pattern Detection

## 9.1 Authentication & Authorization

| Check | Criteria                                                                                                                                                                                                      | Anti-Patterns to Detect                                 |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| `[ ]` | Using `authPlugin` for authentication logic                                                                                                                                                                   | Custom JWT implementation, manual token signing         |
| `[ ]` | Using Elysia guards (`roleGuard`, `workspaceAccessGuard`)                                                                                                                                                     | Manual role checking in routes, custom permission logic |
| `[ ]` | Using HTTP-only cookies for sessions                                                                                                                                                                          | Custom session storage, localStorage for auth tokens    |
| `[ ]` | CSRF protection: CSRF cookie + Origin header validation - applies to apps exposed beyond localhost; loopback-only single-origin tools (Tier 3) may document a reduced CSRF/CORS posture in `.aidd/project.md` | Missing CSRF configuration, custom CSRF implementation  |
| `[ ]` | Session correlation: X-Request-ID + X-Session-ID headers                                                                                                                                                      | Missing correlation ID implementation                   |
| `[ ]` | Using `useAuthStore` for frontend auth state                                                                                                                                                                  | React Context for auth, manual state management         |
| `[ ]` | Using `ProtectedRoute` component for route protection                                                                                                                                                         | Manual auth checks in page components                   |

**Validation Commands:**

```bash
# Check for custom JWT implementations
grep -r "jwt\.sign\|jwt\.verify" backend/src/

# Check for Prisma/Express usage (should NOT exist)
grep -r "prisma\.\|express\(" backend/src/

# Check for Axios usage (should NOT exist)
grep -r "axios" frontend/src/

# Check for localStorage auth tokens (should use cookies)
grep -r "localStorage.*auth" frontend/src/
```

## 9.2 Database Operations

| Check | Criteria                                                                                                                                                    | Anti-Patterns to Detect                      |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------- |
| `[ ]` | Using **Drizzle ORM** for database operations                                                                                                               | Custom SQL, Prisma, other ORM                |
| `[ ]` | Soft delete on core models (not ephemeral/security) - apps with recoverable user-facing entities; exempt ephemeral/local-tool stores via `.aidd/project.md` | Hard deletes (`.delete()`) on core entities  |
| `[ ]` | Schema in `backend/src/db/schema/` (one file per entity)                                                                                                    | Single large schema file, incorrect location |
| `[ ]` | Database in `data/` at project root                                                                                                                         | Database in backend/data/                    |

**Validation Commands:**

```bash
# Check for Prisma usage (should NOT exist)
grep -r "prisma\." backend/src/

# Check for direct SQL queries (should use Drizzle)
grep -r "executeRaw\|queryRaw" backend/src/

# Check database location
ls -la data/ backend/data/
```

## 9.3 API Client

| Check | Criteria                                            | Anti-Patterns to Detect             |
| ----- | --------------------------------------------------- | ----------------------------------- |
| `[ ]` | Using **native fetch** API                          | Axios, other HTTP clients           |
| `[ ]` | API modules in `frontend/src/api/` (one per domain) | Single api.ts file, scattered calls |
| `[ ]` | Shared types via `spernakit-shared` workspace       | Missing shared workspace            |
| `[ ]` | Types in `frontend/src/api/types/` directory        | Missing type definitions            |
| `[ ]` | Error handling in fetch wrapper                     | Scattered error handling            |

**Validation Commands:**

```bash
# Check for Axios usage
grep -r "from 'axios'\|import axios" frontend/src/

# Verify API modules exist
ls -la frontend/src/api/

# Validate API type contract (enum/union consistency)
bun run check:api-types
```

## 9.4 State Management

| Check | Criteria                                  | Anti-Patterns to Detect                 |
| ----- | ----------------------------------------- | --------------------------------------- |
| `[ ]` | Using **Zustand** stores for client state | React Context for state                 |
| `[ ]` | Stores in `frontend/src/stores/`          | Missing store files, scattered state    |
| `[ ]` | Persist middleware for long-term state    | Missing persist for auth/theme/sidebar  |
| `[ ]` | TanStack Query for server state           | Manual fetch + useState for server data |

**Validation Commands:**

```bash
# Check for Context state usage (should use Zustand)
grep -r "createContext\|Context.Provider" frontend/src/pages/

# Verify Zustand stores exist
ls -la frontend/src/stores/
```

## 9.5 Component Library

| Check | Criteria                       | Anti-Patterns to Detect        |
| ----- | ------------------------------ | ------------------------------ |
| `[ ]` | Using **shadcn/ui** components | DaisyUI, custom CSS components |
| `[ ]` | Using **sonner** for toasts    | react-hot-toast, custom toasts |
| `[ ]` | Tailwind CSS for styling       | Custom CSS, inline styles      |
| `[ ]` | Components installed via CLI   | Manual component copying       |

**Validation Commands:**

```bash
# Check for DaisyUI usage
grep -r " DaisyUI\|daisyui" frontend/

# Check for react-hot-toast
grep -r "react-hot-toast" frontend/

# Verify shadcn/ui components exist
ls -la frontend/src/components/ui/
```

## 9.6 Logging

| Check | Criteria                              | Anti-Patterns to Detect |
| ----- | ------------------------------------- | ----------------------- |
| `[ ]` | Using **pino** logging                | Winston, console.log    |
| `[ ]` | Structured logging with proper levels | Unstructured logs       |
| `[ ]` | Logging middleware in plugin pipeline | Missing logging         |

**Validation Commands:**

```bash
# Check for Winston usage
grep -r "winston" backend/src/

# Check for console.log (should use pino)
grep -r "console\.log" backend/src/
```

## 9.7 Route Validation

| Check | Criteria                     | Anti-Patterns to Detect  |
| ----- | ---------------------------- | ------------------------ |
| `[ ]` | Using **TypeBox** via Elysia | Joi, Zod on routes       |
| `[ ]` | Validation schemas on routes | Missing validation       |
| `[ ]` | Config validation uses Zod   | Using TypeBox for config |

**Validation Commands:**

```bash
# Check for Joi usage (should use TypeBox)
grep -r "joi\|from 'joi'" backend/src/

# Check for Zod on routes (should use TypeBox)
grep -r "from 'zod'" backend/src/routes/
```

## 9.8 Verification

| Check | Criteria                                                                                      | Anti-Patterns to Detect                                            |
| ----- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `[ ]` | crawltest + smoke:qc is the baseline verification strategy                                    | Presence of vitest/jest/@testing-library/jsdom third-party runners |
| `[ ]` | Test files are absent in base apps or intentionally use `bun:test` in documented variants     | Orphaned or third-party-backed test files                          |
| `[ ]` | No `[test]` section in any `bunfig.toml` unless explicitly documented for a permitted variant | Stale test preload configuration                                   |
| `[ ]` | UI changes verified via `bun scripts/crawltest.ts --page <route>`                             | Untested UI changes                                                |

**Validation Commands:**

```bash
# Verify no unit test framework dependencies (should be empty)
grep -E "vitest|@testing-library|jsdom|happy-dom" frontend/package.json backend/package.json

# Verify test files are absent or inspect for permitted bun:test usage
find . -type f \( -name "*.test.ts" -o -name "*.test.tsx" -o -name "*.spec.ts" \) -not -path "*/node_modules/*"
```

## 9.9 Configuration

| Check | Criteria                                                                                                                                                                           | Anti-Patterns to Detect                                                                              |
| ----- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `[ ]` | JSON-only config (`config/{appname}.json`)                                                                                                                                         | .env files                                                                                           |
| `[ ]` | `bunfig.toml` has `env = false`                                                                                                                                                    | Auto-loading .env files                                                                              |
| `[ ]` | No hardcoded config values                                                                                                                                                         | Secrets in code, environment variables                                                               |
| `[ ]` | `defaults.json` contains all config sections                                                                                                                                       | Missing sections, Zod-only defaults                                                                  |
| `[ ]` | App-specific schemas in `configSchemas/` have matching `defaults.json` entries                                                                                                     | Schema registered but no defaults.json section (or vice versa)                                       |
| `[ ]` | **If app uses Split secrets** (`config/{slug}.secrets.json` present): `*Ref` fields resolve at load, `getSecret('dot.path')` used at consumption sites, secrets file is gitignored | Applies only to apps with Split pattern (currently aidd-web); skip for apps using inline config only |

Every section registered in `configSchema.ts` must have a corresponding entry in `backend/src/config/defaults.json` with matching default values. The `withEmptyDefault()` wrapper provides runtime fallbacks, but `defaults.json` is the documented source of truth for what the default configuration looks like. A missing section means the config is invisible to anyone reading the JSON file.

**Validation Commands:**

```bash
# Check for .env files (should NOT exist)
find . -name ".env*" -type f

# Check bunfig.toml
grep "env =" bunfig.toml

# List sections registered in configSchema.ts
grep -oP '\w+(?=: withEmptyDefault)' backend/src/config/configSchema.ts | sort

# List sections in defaults.json
node -e "console.log(Object.keys(JSON.parse(require('fs').readFileSync('backend/src/config/defaults.json','utf8'))).sort().join('\n'))"

# Compare: every configSchema section must appear in defaults.json
# Also check for orphaned schema files not imported in configSchema.ts
ls backend/src/config/configSchemas/*.ts | xargs -I{} basename {} .ts | sort
```

## 9.10 File Organization

| Check | Criteria                                                                                                                        | Anti-Patterns to Detect                                                     |
| ----- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `[ ]` | Named exports only (no export default)                                                                                          | Default exports                                                             |
| `[ ]` | ES Modules only (no require/module.exports)                                                                                     | CommonJS patterns                                                           |
| `[ ]` | Barrel files (`index.ts`) for re-exports in route/plugin subdirectories only; service subdirectories use facade pattern instead | Direct imports where barrels expected, or barrels in service subdirectories |
| `[ ]` | `components/ui/` has no barrel (direct file imports)                                                                            | Barrel `index.ts` in `components/ui/`                                       |
| `[ ]` | Services use hybrid flat + subdirectory with facades                                                                            | All flat (missing structure) or all nested (over-structured)                |
| `[ ]` | Pages in `pages/{domain}/` directories                                                                                          | Pages scattered, missing domain organization                                |

**Validation Commands:**

```bash
# Check for CommonJS patterns
grep -r "require(\|module\.exports" backend/src/ frontend/src/

# Check for default exports
grep -r "export default" backend/src/ frontend/src/
```

## 9.11 Hooks Organization

| Check | Criteria                                                                                                     | Anti-Patterns to Detect                                                                 |
| ----- | ------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `[ ]` | All hooks live under `frontend/src/hooks/` (never colocated under `pages/*/hooks/`)                          | Hooks inside a page directory                                                           |
| `[ ]` | Flat `hooks/{name}.ts` for single-hook domains; create a hook subdirectory only when 2+ hooks share a domain | Single hook inside a subdirectory, or multiple same-domain hooks scattered at top level |
| `[ ]` | Subdirectory nesting limited to one level (`hooks/{domain}/{name}.ts`)                                       | `hooks/{domain}/{sub}/{name}.ts` deeper nesting                                         |
| `[ ]` | No barrel `index.ts` at the top of `frontend/src/hooks/`                                                     | `frontend/src/hooks/index.ts` exists                                                    |
| `[ ]` | No React Context state exposed via custom hooks (Zustand is the state tool)                                  | `useContext(SomeStateContext)` inside a custom hook                                     |

**Validation Commands:**

```bash
# Verify no hooks colocated under pages
find frontend/src/pages -type d -name hooks

# Verify no top-level barrel
ls frontend/src/hooks/index.ts 2>/dev/null

# Verify no Context state via hooks (Zustand is the state tool)
grep -rn "useContext(" frontend/src/hooks/
```

---

# Section 10: Remediation Workflow

## 10.1 Analysis Phase

1. Review enhancement log (if exists):

```powershell
$logPath = "C:\path\to\workspace\.claude\logs\template-enhancements.md"
if (Test-Path $logPath) {
    Get-Content $logPath | Select-String -Pattern $TARGET_APP
}
```

2. Run diff comparison:

```powershell
$template = Get-ChildItem -Path "C:\path\to\workspace\spernakit" -Recurse -File
$target = Get-ChildItem -Path "C:\path\to\workspace\{appname}" -Recurse -File

Compare-Object $template $target -Property Name, Length |
    Where-Object { $_.SideIndicator -eq "=>" } |
    Select-Object Name, Length
```

3. Classify differences:
    - **[KEEP]**: App-specific logic, schemas, domain routes, unique UI
    - **[FIX]**: Unintended drift in shared utils, tooling, build configs
    - **[MIXED]**: Files needing partial merge (package.json, configs)
    - **[ENHANCEMENT]**: Improved implementation in target

## 10.2 Execution Phase

Derived apps at Spernakit v3.28.2 or later sync template changes using a manual cherry-pick
workflow driven by the `/template-upgrade` slash command. Earlier sources are unsupported and
must be initialized from the current template. Do not auto-apply changes: domain-extended template
files require individual review. Drift detection (`bun run check:drift`) is the source of truth
for sync status. Before applying changes, run
`bun run template:sync-plan -- --app ../<app>` to generate a read-only review packet in
`upgrade-review/{app}/`.

```powershell
# Generate the read-only review packet before applying any changes
bun run template:sync-plan -- --app ../{app} --from v{source} --to v{target}
```

### Full Overwrites ([FIX])

For pure template files (build configs, `scripts/*.ts`, `docs/template/*`, `shared/src/*.ts`, `components/ui/*`): copy from spernakit and overwrite - but always diff against the source version first to detect silent domain extensions (e.g., custom helpers in response examples, domain re-exports in seed files). If extensions exist, treat as infrastructure.

```powershell
# Always diff first to detect domain extensions
git -C C:\path\to\workspace\spernakit diff v{source}..v{target} -- path/to/file
Copy-Item "spernakit/path/to/file" "${TARGET_APP}/path/to/file" -Force
```

### Intelligent Merges ([MIXED])

For branded files (`Dockerfile`, `README.md`, `package.json`): copy from spernakit then re-apply app-specific branding (name, slug, ports).

For infrastructure files (`backend/src/app.ts`, `frontend/src/routes.tsx`, navigation, re-export shims): do not copy; diff the three versions (source tag, target tag, current app) and hand-apply only the template delta, preserving app extensions.

```powershell
# Three-way diff for infrastructure files
git -C C:\path\to\workspace\spernakit diff v{source}..v{target} -- path/to/file
# Then manually apply only the template delta to the app's copy
```

## 10.3 Validation

After each batch of changes:

```powershell
Set-Location ${TARGET_APP}
bun run smoke:qc     # Must exit 0
bun run dev          # Must start successfully
```

If validation fails:

1. Analyze error output
2. Fix specific error
3. If fix requires [KEEP] file modification, stop and get user guidance
4. If unable to fix, revert last change

## 10.4 Completion Criteria

- All [FIX] files aligned
- All [MIXED] files properly merged
- All [ENHANCEMENT] items reviewed and documented
- `bun run smoke:qc` passes
- `bun run dev` starts without errors
- Domain-specific files preserved (~14-20 files typical)

---

## Consolidated Audit Checklist

- [ ] Applicability tier and documented exemptions read from `.aidd/project.md`.
- [ ] Pre-audit context gathered from package manifests, config, live smoke source, and drift evidence.
- [ ] Sections 1-6 structural and architecture checks completed.
- [ ] Section 7 verification checks completed against the repo's actual `smoke:qc` and crawltest scripts.
- [ ] Section 8 template-sync and technology-version checks completed against live Spernakit references.
- [ ] Section 9 feature-utilization and anti-pattern checks completed.
- [ ] Section 10 remediation workflow followed for any recommended sync or merge.
- [ ] Findings cite concrete files, commands, and tier/applicability rationale.

## Deliverables

The audit should produce:

- Spernakit application audit report at `.aidd/audit-reports/SPERNAKIT-YYYY-MM-DD.md`.
- Applicability-tier summary and documented exemption list.
- Structural compliance checklist for Sections 1-8.
- Feature-utilization and anti-pattern findings for Section 9.
- Template drift/sync evidence when file alignment changes are recommended.
- Feature JSON remediation files for confirmed Critical/High/Medium findings.

---

# Appendix A: Checklist Template

Copy this section for each application audit:

## Application: **\*\***\_\_\_**\*\***

**Audit Date:** **\*\***\_\_\_**\*\***
**Auditor:** **\*\***\_\_\_**\*\***

### Quick Summary

- [ ] Section 1: Architecture Compliance
- [ ] Section 2: Frontend API Standards (incl. Shared Workspace)
- [ ] Section 3: State Management (Zustand)
- [ ] Section 4: Component Library (shadcn/ui)
- [ ] Section 5: Backend Architecture (Elysia)
- [ ] Section 6: Frontend Architecture
- [ ] Section 7: Verification Strategy (crawltest)
- [ ] Section 8: Template Sync Verification
- [ ] Section 9: Feature Utilization & Anti-Pattern Detection

### Critical Issues Found

1.
2.
3.

### Remediation Plan

1.
2.
3.

### Validation

- [ ] `bun run smoke:qc` passes
- [ ] `bun run dev` starts successfully
- [ ] Manual route verification complete

---

# Appendix B: Common Anti-Patterns

| Anti-Pattern               | Symptom                                                          | Fix                                                                       |
| -------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Express/Fastify backend    | `express.Router()`, `fastify()` imports                          | Migrate to Elysia with plugins/guards                                     |
| Prisma ORM                 | `prisma.user.find()`, `prisma.$transaction`                      | Migrate to Drizzle ORM                                                    |
| Winston logging            | `winston.Logger()`, `winston.createLogger()`                     | Replace with pino structured logging                                      |
| Axios HTTP client          | `axios.get()`, `import axios`                                    | Replace with native fetch API                                             |
| React Context state        | `createContext()`, `Context.Provider`                            | Replace with Zustand stores                                               |
| DaisyUI components         | `btn btn-primary`, DaisyUI class names                           | Install shadcn/ui components via CLI                                      |
| react-hot-toast            | `toast.success()`, `toast.error()`                               | Replace with sonner's `toast()`                                           |
| Zod route validation       | `z.object()` schemas in Elysia routes                            | Replace with TypeBox schemas                                              |
| .env files                 | `.env`, `.env.local` files                                       | Use config/{appname}.json, set env=false                                  |
| Console.log in backend     | `console.log()` scattered in backend                             | Use pino logger throughout backend                                        |
| Database in wrong location | Database files in `backend/data/`                                | Move database to `data/` at project root                                  |
| Direct Prisma calls        | `prisma.auditLog.create()` in controllers                        | Use Drizzle in services, audit plugin for logs                            |
| Custom WebSocket           | Socket.IO or custom WebSocket setup                              | Use Bun native WebSocket via Elysia                                       |
| Missing soft delete        | `.delete()` on core entity records                               | Implement soft delete (OK for ephemeral/security tables)                  |
| JSX router                 | `<BrowserRouter>`, `<Routes>` in App.tsx                         | Use createBrowserRouter with RouterProvider                               |
| All-flat services          | 40+ service files with no subdirectories                         | Use subdirectory + facade for complex services                            |
| Export default             | `export default ComponentName`                                   | Use named exports only                                                    |
| CommonJS patterns          | `require()`, `module.exports`                                    | Use ES modules (`import`, `export`)                                       |
| Manual React.memo          | `React.memo()`, manual `useMemo`/`useCallback`                   | Remove - React Compiler handles memoization                               |
| Missing shared workspace   | No `shared/` directory, no `spernakit-shared` dep                | Set up shared workspace per template                                      |
| Lazy route w/o boundary    | `React.lazy()` route element with no surrounding `ErrorBoundary` | Wrap the lazy route element in an `ErrorBoundary`                         |
| Inline `.references()` FK  | `.references(() => other.id)` on a column                        | Declare FK via `foreignKey({...}).onDelete(...)` in the constraints array |

---

# Appendix C: Typical Files to Review

## High-Impact Files (Check First)

| File                          | Why                                                                             |
| ----------------------------- | ------------------------------------------------------------------------------- |
| `bunfig.toml`                 | Verify env=false, Bun configuration                                             |
| `shared/`                     | Verify shared workspace exists and is linked                                    |
| `backend/src/index.ts`        | Elysia setup, plugin registration                                               |
| `frontend/src/main.tsx`       | React entry, store providers                                                    |
| `backend/package.json`        | Verify Elysia, Drizzle, pino, spernakit-shared; no third-party test runner deps |
| `frontend/package.json`       | Verify React 19, Zustand, spernakit-shared; NO vitest/@testing-library          |
| `config/{appname}.json`       | Verify JSON-only config                                                         |
| `backend/src/db/schema/`      | Verify Drizzle schemas, naming                                                  |
| `frontend/src/api/types/`     | Verify domain-specific API types in types/ directory                            |
| `shared/`                     | Verify shared workspace types, constants, functions                             |
| `frontend/src/stores/`        | Verify Zustand stores                                                           |
| `frontend/src/components/ui/` | Verify shadcn/ui components                                                     |

## Common Drift Locations

| Location                      | Common Issue                                       |
| ----------------------------- | -------------------------------------------------- |
| `backend/src/plugins/`        | Express/Fastify middleware instead of plugins      |
| `backend/src/services/`       | Prisma calls, missing facades for complex services |
| `frontend/src/stores/`        | React Context instead of Zustand                   |
| `frontend/src/components/ui/` | DaisyUI classes instead of shadcn/ui               |
| `backend/package.json`        | Winston, Express, Prisma dependencies              |
| `frontend/package.json`       | Axios, react-hot-toast, react-context              |
| `config/`                     | Missing .env files, .env usage                     |

---

# Appendix D: Audit Reporting Format

## Issue Template

```
## [Category] Issue Title

**Severity**: Critical/High/Medium/Low
**Feature**: Template Feature Name
**Location**: Path to file(s)
**Type**: Structure Drift | Feature Underutilization | Technology Mismatch

**Description**:
Brief description of the issue - structural deviation, missing feature, or technology mismatch.

**Current Implementation**:
Code snippet or description of current (problematic) implementation.

**Recommended Fix**:
Code snippet or description of how to fix the issue.

**Impact**:
- Code duplication
- Missed functionality
- Performance impact
- Security implications
- Technology debt

**Evidence**:
Commands or observations that confirm the issue.
```

## Summary Report Template

```
# Spernakit Application Audit Report

## Executive Summary

**Target Application**: [Application Name]
**Template Version**: Spernakit v[X.Y.Z] (v3.28.2 or later)
**Application Version**: v[X.Y.Z]
**Audit Date**: [Date]
**Auditor**: [Name]

### Overall Compliance: [X]%

**Issues Found**: [Count]
- Critical: [Count]
- High: [Count]
- Medium: [Count]
- Low: [Count]

## Structural Compliance (Section 1-8)

- [ ] Architecture Compliance (Section 1)
- [ ] Frontend API Standards (Section 2)
- [ ] State Management (Section 3)
- [ ] Component Library (Section 4)
- [ ] Backend Architecture (Section 5)
- [ ] Frontend Architecture (Section 6)
- [ ] Verification Strategy / crawltest (Section 7)
- [ ] Template Sync Verification (Section 8)

### Structure Drift Issues Found: [Count]

[List structural alignment issues]

## Feature Utilization (Section 9)

- [ ] Authentication & Authorization (9.1)
- [ ] Database Operations (9.2)
- [ ] API Client (9.3)
- [ ] State Management (9.4)
- [ ] Component Library (9.5)
- [ ] Logging (9.6)
- [ ] Route Validation (9.7)
- [ ] Verification (9.8)
- [ ] Configuration (9.9)
- [ ] File Organization (9.10)
- [ ] Hooks Organization (9.11)

### Anti-Pattern Issues Found: [Count]

[List feature underutilization and technology mismatch issues]

## Critical Issues

[Critical issues requiring immediate attention]

## Recommendations

[High-level recommendations for improvement]

## Remediation Plan

### Phase 1: Structural Fixes (Days 1-3)
1. [Priority 1 structural fix]
2. [Priority 2 structural fix]

### Phase 2: Technology Migrations (Days 4-7)
1. [Priority 1 technology migration]
2. [Priority 2 technology migration]

### Phase 3: Validation & Testing (Days 8-10)
1. Run `bun run smoke:qc`
2. Run `bun run dev` and verify functionality
3. Manual testing of critical flows

## Next Steps

1. [Immediate action]
2. [Short-term improvement]
3. [Long-term enhancement]
```

## Severity Classification

| Level        | Definition                                                                                          | Examples                                                                      |
| ------------ | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| **Critical** | Security vulnerabilities, data loss risk, breaking template architecture, major technology mismatch | Wrong backend framework, missing auth, wrong database location                |
| **High**     | Significant technology mismatch, performance issues, major anti-patterns                            | Express instead of Elysia, Prisma instead of Drizzle, Winston instead of pino |
| **Medium**   | Minor technology mismatches, missing optimizations, small deviations                                | Wrong logging levels, missing validation, incomplete test coverage            |
| **Low**      | Style deviations, minor inconsistencies, unused template features                                   | Minor formatting deviations, missing utility functions                        |

## When to Allow Customization

Custom implementation is acceptable when:

1. Template feature doesn't meet specific business requirement
2. Custom implementation is documented and justified
3. No breaking changes to template infrastructure
4. Performance or security concerns warrant custom approach
5. Feature is application-specific and not suitable for template

## When to Flag as Issue

Flag as issue when:

1. Template technology is not being used without justification
2. Custom implementation duplicates template functionality
3. No documentation or rationale for technology deviation
4. Implementation breaks template architecture patterns
5. Security or performance implications exist
6. Database in wrong location
7. Configuration files (.env) present when JSON-only is required

## Validation Checklist

### Before Reporting

- [ ] All structural checks completed (Sections 1-8)
- [ ] All feature utilization checks completed (Section 9)
- [ ] All validation commands executed
- [ ] Evidence gathered for all findings
- [ ] Severity levels assigned appropriately

### After Reporting

- [ ] Report reviewed for accuracy
- [ ] Findings validated against template
- [ ] Recommendations are actionable
- [ ] Remediation plan is feasible
- [ ] Stakeholders have reviewed report

---

# Appendix E: Version History

| Version | Date       | Changes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| ------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 3.6     | 2026-06-28 | Audit definition review: aligned `bun:test` wording with TESTING.md so documented aidd/spernakit-web variants are not false positives; replaced frozen `smoke:qc` step-count language with live-source guidance for `scripts/smoke.json` and `scripts/smoke-qc.ts`; moved current process-env, max-lines, docs, lockfile, destructive-confirmation, and LTS gates into the smoke pipeline table; added Pre-Audit Setup, Consolidated Audit Checklist, and Deliverables sections.                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 3.5     | 2026-06-09 | Audit definition review: fixed FK format to `fk_{table}_{column}_{target}` declared via `foreignKey({...})` not inline `.references()` (5.5, schema example, Appendix B); corrected plugin pipeline to lead with Client IP and drop the ApiKey stage (`apiKey` is a per-route guard) (1.2, 5.1); fixed hooks-subdirectory threshold 3+ → 2+ (9.11); added Applicability Tiers framework (Tier 1 full / Tier 2 lite / Tier 3 local-only) and narrowed RBAC, soft-delete, and CSRF/CORS with tier exceptions; added Bun lockfile / `check:lockfile-frozen` check (1.1) and an "Additional Quality Scripts" subsection (8); promoted lazy-route error-boundary check (6.1, Appendix B); added LTS-gating + exact-pin posture notes and bumped Bun floor to 1.3.14 (8.2); added `template:sync-plan` / `/template-upgrade` to 10.2; relabeled Section 7 as "Verification Strategy (crawltest)" in Appendices A/D |
| 3.4     | 2026-04-23 | Audit definition review: consolidated facade/barrel rule across 2.6 + 5.4 + 9.10 sourced from DEVELOPMENT.md facade rule (with legacy-barrel exceptions called out), moved apiKey out of guards list in 1.2 and 5.2 (apiKey auth lives in authPlugin), added layoutStore/commandStore/wsStore to 3.2, added conditional Split secrets pattern row to 9.9, added 14-step smoke:qc pipeline table to Section 8, added new Section 9.11 for hooks organization                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3.3     | 2026-04-23 | Documentation alignment: replaced removed template-upgrade --apply references in Section 10.2 with manual cherry-pick workflow, updated last_updated timestamp                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 3.2     | 2026-03-29 | Audit definition review: fixed 5 P1 stale rules (plugin pipeline, barrel files, guards, soft delete, auth plugin pattern), added shared workspace section, React Compiler checks, handler extraction rule, CSRF/correlation ID checks, PostgreSQL dialect, updated dependency versions, narrowed testing severity, consolidated duplicate Appendix B tables, added severity reference and TOC                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 3.1     | 2026-03-04 | Updated all references from Spernakit v2 to v3, added spernakit-shared workspace references                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 3.0     | 2025-02    | Complete rewrite for Spernakit v3 - Elysia, Drizzle, pino, Zustand, shadcn/ui, native fetch, TypeBox                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 2.0     | 2025-01    | Consolidated feature-check.md content, added Section 6 (Feature Utilization), expanded anti-pattern detection                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| 1.0     | 2025-01    | Initial comprehensive document (archived as SPERNAKITV1.md)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

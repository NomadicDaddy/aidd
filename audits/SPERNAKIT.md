---
title: 'Spernakit Derived Application Audit Framework'
last_updated: '2025-01-15'
version: '1.0'
category: 'Architecture'
priority: 'High'
estimated_time: '2-3 hours'
frequency: 'Quarterly'
trigger: model_decision
description: 'Comprehensive audit framework for Spernakit-derived applications'
---

# Spernakit Derived Application Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

This document provides a structured audit framework for evaluating derived applications against the Spernakit template, identifying drift, and executing remediation.

## Related Documents

| Document              | Path                                          | Purpose                        |
| --------------------- | --------------------------------------------- | ------------------------------ |
| Stack Reference       | `stack-spernakit.md`                          | Core architecture and commands |
| Frontend API Standard | `std-frontend-api.md`                         | API service patterns           |
| Compliance Kit        | `d:/applications/SPERNAKIT_COMPLIANCE_KIT.md` | App registry, quick reference  |

## Audit Scope

### What to Audit

**Frontend** (`frontend/src/`):

- Components, hooks, pages, services, utilities, configuration

**Backend** (`backend/src/`):

- Routes, middleware, services, utilities, configuration

**Configuration** (root level):

- package.json, tsconfig.json, vite.config.ts, bunfig.toml

### What to Flag

Infrastructure differences that should be homogenized:

- Component structure and patterns
- Error handling patterns
- State management patterns
- Import styles (type imports, verbatimModuleSyntax)
- Accessibility patterns (ARIA, semantic HTML)
- CSS/styling patterns (semantic classes vs inline)
- API response handling patterns
- Middleware structure and ordering
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

# Section 1: Architecture Compliance

## 1.1 Project Structure

| Check | Criteria                                                       | Remediation                                       |
| ----- | -------------------------------------------------------------- | ------------------------------------------------- |
| `[ ]` | Monorepo workspace with `frontend/` and `backend/` directories | Restructure to match template layout              |
| `[ ]` | Root `package.json` with workspace scripts                     | Copy from spernakit, preserve app-specific values |
| `[ ]` | `bunfig.toml` with `env = false` setting                       | Copy from spernakit                               |
| `[ ]` | `config/{appname}.json` configuration file present             | Create from template, set app-specific values     |

## 1.2 Backend Structure

| Check | Criteria                                                         | Remediation                                         |
| ----- | ---------------------------------------------------------------- | --------------------------------------------------- |
| `[ ]` | Express 5 with service layer pattern                             | Align controller/service separation                 |
| `[ ]` | Prisma ORM with SQLite database                                  | Verify schema structure                             |
| `[ ]` | Middleware pipeline: Auth > Authz > Rate limit > Audit           | Review middleware order                             |
| `[ ]` | JWT authentication with HTTP-only cookies                        | Verify auth implementation                          |
| `[ ]` | 5-tier RBAC system (SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER) | Check role definitions                              |
| `[ ]` | Soft delete pattern on all entities                              | Verify `isDeleted`, `deletedAt`, `deletedBy` fields |
| `[ ]` | Audit trail logging service                                      | Verify auditService implementation                  |

## 1.3 Frontend Structure

| Check | Criteria                                            | Remediation                          |
| ----- | --------------------------------------------------- | ------------------------------------ |
| `[ ]` | React 19 with Vite bundler                          | Check package versions               |
| `[ ]` | TanStack Query for server state                     | Verify query/mutation patterns       |
| `[ ]` | React Context for global state only                 | Avoid Redux/Zustand unless justified |
| `[ ]` | Tailwind CSS with DaisyUI-inspired semantic classes | See Section 4                        |
| `[ ]` | `ProtectedRoute` component with role-based access   | Verify route protection              |
| `[ ]` | Lazy loading with code splitting                    | Check route lazy imports             |

---

# Section 2: Frontend API Standards

## 2.1 HTTP Client

| Check | Criteria                                        | Remediation                                  |
| ----- | ----------------------------------------------- | -------------------------------------------- |
| `[ ]` | Centralized Axios instance in `services/api.ts` | Create if missing, consolidate if fragmented |
| `[ ]` | No raw `fetch()` in application code            | Search and replace with service calls        |
| `[ ]` | Error handling via interceptors                 | Implement centralized error interceptor      |
| `[ ]` | Auth token handling automatic                   | Verify cookie/header attachment              |

## 2.2 Service Layer Pattern

| Check | Criteria                                                    | Remediation                              |
| ----- | ----------------------------------------------------------- | ---------------------------------------- |
| `[ ]` | Service modules in `services/` directory                    | Organize by resource/domain              |
| `[ ]` | Default helpers return `response.data`                      | Verify return shapes                     |
| `[ ]` | `*WithStatus` helpers return `AxiosResponse<T>` when needed | Add where HTTP status branching required |
| `[ ]` | Consistent method signatures across services                | Audit naming conventions                 |

**Expected service pattern:**

```typescript
export const resourceService = {
	getAll: async (): Promise<ApiResponse<Resource[]>> => {
		const response = await api.get('/resources');
		return response.data;
	},
	create: async (data: ResourceForm): Promise<ApiResponse<Resource>> => {
		const response = await api.post('/resources', data);
		return response.data;
	},
};
```

## 2.3 TanStack Query Integration

| Check | Criteria                                    | Remediation                      |
| ----- | ------------------------------------------- | -------------------------------- |
| `[ ]` | Custom hooks in `hooks/` wrap service calls | Create useResource pattern hooks |
| `[ ]` | `refetchOnWindowFocus: false` by default    | Add to all queries               |
| `[ ]` | Mutations invalidate relevant query keys    | Verify cache invalidation        |
| `[ ]` | WebSocket events trigger cache invalidation | Implement subscription pattern   |

**Expected hook pattern:**

```typescript
export function useResources() {
	return useQuery({
		queryKey: ['resources'],
		queryFn: resourceService.getAll,
		refetchOnWindowFocus: false,
	});
}

export function useCreateResource() {
	const queryClient = useQueryClient();
	return useMutation({
		mutationFn: resourceService.create,
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['resources'] });
		},
	});
}
```

## 2.4 Response Format

| Check | Criteria                                                                  | Remediation                   |
| ----- | ------------------------------------------------------------------------- | ----------------------------- |
| `[ ]` | Success responses include `{ data, success: true, message, error: null }` | Standardize backend responses |
| `[ ]` | Error responses include `{ success: false, error, message, details }`     | Standardize error envelope    |
| `[ ]` | Paginated responses use `{ data: { items, pagination }, ... }`            | Verify pagination structure   |

## 2.5 Module Export Pattern

| Check | Criteria                                                | Remediation                                   |
| ----- | ------------------------------------------------------- | --------------------------------------------- |
| `[ ]` | Named exports only - no `export default` in modules     | Remove default exports, update imports        |
| `[ ]` | Barrel files use named re-exports (`hooks/index.ts`)    | Verify `export { x } from './x'` pattern      |
| `[ ]` | `React.lazy()` uses `.then()` pattern for named exports | `import('./X').then(m => ({ default: m.X }))` |

---

# Section 3: Data Router Pattern

## 3.1 Router Structure

| Check | Criteria                                          | Remediation                       |
| ----- | ------------------------------------------------- | --------------------------------- |
| `[ ]` | Uses `createBrowserRouter()` + `<RouterProvider>` | Migrate from `<BrowserRouter>`    |
| `[ ]` | Route definitions in `routes.tsx`                 | Extract from App.tsx              |
| `[ ]` | `lazyPage()` helper for lazy-loaded routes        | Implement consistent lazy pattern |
| `[ ]` | Object-based route config (not JSX `<Route>`)     | Convert route definitions         |

## 3.2 Route Organization

| Check | Criteria                                                     | Remediation              |
| ----- | ------------------------------------------------------------ | ------------------------ |
| `[ ]` | Unauthenticated routes (login, reset-password) at root level | Restructure route tree   |
| `[ ]` | Authenticated routes under `AuthenticatedLayout`             | Create layout wrapper    |
| `[ ]` | Nested routes use `<Outlet />` pattern                       | Remove nested `<Routes>` |
| `[ ]` | Index routes redirect appropriately                          | Add `Navigate` elements  |

## 3.3 Preserved Patterns

| Check | Criteria                                        | Remediation                  |
| ----- | ----------------------------------------------- | ---------------------------- |
| `[ ]` | `ProtectedRoute` wrapper in AuthenticatedLayout | Move protection to layout    |
| `[ ]` | `RouteErrorBoundary` as element wrapper         | Keep error boundary pattern  |
| `[ ]` | Role-based protection preserved                 | Verify role checks in routes |
| `[ ]` | `RouteTitleUpdater` in layout                   | Move from App.tsx            |

## 3.4 Implementation Reference

**Key insight:** This pattern uses data router **structure** without data router **features** (no loaders/actions). TanStack Query remains the data-fetching solution.

**lazyPage() helper:**

```typescript
function lazyPage(importFn: () => Promise<{ default: ComponentType }>) {
	return {
		lazy: importFn,
		Component: () => {
			const LazyComponent = React.lazy(importFn);
			return (
				<React.Suspense fallback={<HydrateFallback />}>
					<LazyComponent />
				</React.Suspense>
			);
		},
	};
}
```

**Target route structure:**

```typescript
createBrowserRouter([
	// Unauthenticated routes
	{ path: '/login', lazy: () => import('./pages/Login') },
	{ path: '/reset-password', lazy: () => import('./pages/ResetPassword') },

	// Authenticated routes
	{
		path: '/',
		element: <AuthenticatedLayout />,
		children: [
			{ index: true, element: <Navigate to="/dashboard" replace /> },
			{ path: 'dashboard', ...lazyPage(() => import('./pages/Dashboard')) },
			{
				path: 'settings',
				element: <SettingsLayout />,
				children: [
					{ index: true, element: <Navigate to="application" replace /> },
					{ path: 'application', element: <ApplicationSettings /> },
					{ path: 'authentication', ...lazyPage(() => import('./components/settings/AuthenticationSettings')) },
				],
			},
		],
	},
]);
```

---

# Section 4: Styling Consistency

## 4.1 CSS Layer Setup

| Check | Criteria                                                  | Remediation                       |
| ----- | --------------------------------------------------------- | --------------------------------- |
| `[ ]` | `frontend/src/tailwind.css` has `@layer components` block | Copy from spernakit template      |
| `[ ]` | DaisyUI-inspired semantic classes defined                 | Verify completeness per checklist |
| `[ ]` | Theme variants (ocean/forest/sunset) defined              | Add missing themes                |
| `[ ]` | OKLCH color definitions present                           | Verify color system               |

## 4.2 Button Classes

| Check | Criteria                                                                         | Remediation                  |
| ----- | -------------------------------------------------------------------------------- | ---------------------------- |
| `[ ]` | Base `.btn` class used                                                           | Replace inline button styles |
| `[ ]` | Semantic variants: `.btn-primary`, `.btn-secondary`, `.btn-accent`, `.btn-error` | Apply appropriate variants   |
| `[ ]` | Size modifiers: `.btn-xs`, `.btn-sm`, `.btn-lg`                                  | Use instead of custom sizing |
| `[ ]` | Style modifiers: `.btn-outline`, `.btn-ghost`                                    | Apply where appropriate      |

**Pattern mapping:**

| Inline Pattern                                                        | Semantic Class         |
| --------------------------------------------------------------------- | ---------------------- |
| `bg-teal-500 hover:bg-teal-600 text-white rounded-lg px-4 py-2`       | `btn btn-primary`      |
| `rounded-lg border bg-slate-800 px-4 py-2 text-sm hover:bg-slate-700` | `btn btn-outline`      |
| `bg-rose-500 hover:bg-rose-600 text-white`                            | `btn btn-error`        |
| `text-slate-400 hover:text-white` (icon buttons)                      | `btn btn-ghost btn-sm` |

## 4.3 Form Input Classes

| Check | Criteria                                   | Remediation                 |
| ----- | ------------------------------------------ | --------------------------- |
| `[ ]` | `.input`, `.input-bordered` on text inputs | Replace inline input styles |
| `[ ]` | `.select`, `.select-bordered` on dropdowns | Standardize select elements |
| `[ ]` | `.textarea` on multiline inputs            | Apply to textareas          |
| `[ ]` | `.label`, `.label-text` on form labels     | Standardize label styling   |

## 4.4 Card Classes

| Check | Criteria                                     | Remediation                      |
| ----- | -------------------------------------------- | -------------------------------- |
| `[ ]` | `.card` base class on card containers        | Replace inline card styles       |
| `[ ]` | `.card-body`, `.card-title` nested structure | Apply internal structure classes |
| `[ ]` | `.card-hover` on interactive cards           | Add hover variant where needed   |

## 4.5 Alert Classes

| Check | Criteria                                                                             | Remediation                 |
| ----- | ------------------------------------------------------------------------------------ | --------------------------- |
| `[ ]` | `.alert` base class on status boxes                                                  | Replace inline alert styles |
| `[ ]` | Semantic variants: `.alert-info`, `.alert-success`, `.alert-warning`, `.alert-error` | Apply appropriate variants  |

## 4.6 Badge Classes

| Check | Criteria                                                                                | Remediation                 |
| ----- | --------------------------------------------------------------------------------------- | --------------------------- |
| `[ ]` | `.badge` base class                                                                     | Replace inline badge styles |
| `[ ]` | Semantic variants: `.badge-primary`, `.badge-success`, `.badge-error`, `.badge-warning` | Apply appropriate variants  |

## 4.7 Additional Components

| Check | Criteria                                                    | Remediation                    |
| ----- | ----------------------------------------------------------- | ------------------------------ |
| `[ ]` | `.dropdown`, `.dropdown-content`, `.dropdown-end` for menus | Standardize dropdown structure |
| `[ ]` | `.tabs`, `.tab`, `.tab-active` for tab navigation           | Apply tab classes              |
| `[ ]` | `.modal`, `.modal-box`, `.modal-action` for dialogs         | Standardize modal structure    |
| `[ ]` | `.table` for data tables                                    | Apply table classes            |
| `[ ]` | `.loading`, `.loading-spinner` for spinners                 | Standardize loading states     |
| `[ ]` | `.skeleton` for loading placeholders                        | Apply skeleton classes         |

## 4.8 CSS Class Completeness Checklist

Ensure `frontend/src/tailwind.css` `@layer components` block includes:

### Buttons

- Base: `.btn`
- Variants: `.btn-primary`, `.btn-secondary`, `.btn-accent`, `.btn-error`, `.btn-warning`, `.btn-success`, `.btn-info`
- Styles: `.btn-outline`, `.btn-ghost`
- Sizes: `.btn-xs`, `.btn-sm`, `.btn-lg`, `.btn-circle`

### Forms

- Inputs: `.input`, `.input-bordered`, `.input-sm`
- Selects: `.select`, `.select-bordered`, `.select-sm`
- Textareas: `.textarea`
- Controls: `.form-control`, `.checkbox`, `.toggle`, `.toggle-*`, `.range`
- Grouping: `.join`, `.join-item`
- Labels: `.label`, `.label-text`

### Cards

- Base: `.card`, `.card-hover`
- Parts: `.card-body`, `.card-title`, `.card-actions`

### Modals

- Structure: `.modal`, `.modal-box`, `.modal-action`, `.modal-backdrop`

### Badges

- Base: `.badge`
- Variants: `.badge-primary`, `.badge-success`, `.badge-error`, `.badge-warning`, `.badge-info`, `.badge-accent`
- Styles: `.badge-outline`, `.badge-ghost`
- Sizes: `.badge-sm`, `.badge-lg`

### Navigation

- Navbar: `.navbar`, `.navbar-start`, `.navbar-center`, `.navbar-end`
- Menu: `.menu`, `.menu-horizontal`, `.menu-title`

### Tables

- Structure: `.table`, `table th`, `table td`, `table tbody tr:hover`

### Alerts

- Base: `.alert`
- Variants: `.alert-info`, `.alert-success`, `.alert-warning`, `.alert-error`

### Tooltips

- Base: `.tooltip`
- Positions: `.tooltip-bottom`, `.tooltip-top`

### Loading/Skeletons

- Spinners: `.loading`, `.loading-spinner`, `.loading-sm`, `.loading-lg`
- Placeholders: `.skeleton`

### Stats

- Structure: `.stats`, `.stat`, `.stat-title`, `.stat-value`, `.stat-desc`

### Tabs

- Structure: `.tabs`, `.tabs-boxed`, `.tab`, `.tab-active`

### Dropdowns

- Structure: `.dropdown`, `.dropdown-end`, `.dropdown-content`, `.dropdown-open`

### Avatars

- Base: `.avatar`
- Sizes: `.avatar-sm`, `.avatar-lg`

### Utilities

- Grids: `.util-grid-cards`, `.util-grid-2col`
- Cards: `.util-card`, `.util-cq`
- Rounding: `.rounded-box`
- Semantic colors: `.bg-base-100`, `.bg-base-200`, `.bg-base-300`, `.text-base-content`

### Themes

- Variants: `.theme-ocean`, `.theme-forest`, `.theme-sunset`

---

# Section 5: Template Sync Verification

## 5.1 Core File Alignment

| File                           | Check | Action if Drifted                            |
| ------------------------------ | ----- | -------------------------------------------- |
| `frontend/src/tailwind.css`    | `[ ]` | Full overwrite from template                 |
| `frontend/src/hooks/index.ts`  | `[ ]` | Merge - preserve app hooks, add missing core |
| `frontend/src/services/api.ts` | `[ ]` | Review and align pattern                     |
| `frontend/vite.config.ts`      | `[ ]` | Verify `manualChunks` matches template       |
| `backend/src/middleware/`      | `[ ]` | Align middleware implementations             |

## 5.2 Component Presence

| Component       | Location                            | Check |
| --------------- | ----------------------------------- | ----- |
| StatCard        | `components/ui/StatCard.tsx`        | `[ ]` |
| DonutChart      | `components/ui/DonutChart.tsx`      | `[ ]` |
| MiniChart       | `components/ui/MiniChart.tsx`       | `[ ]` |
| ProgressRing    | `components/ui/ProgressRing.tsx`    | `[ ]` |
| TabNav          | `components/ui/TabNav.tsx`          | `[ ]` |
| HydrateFallback | `components/ui/HydrateFallback.tsx` | `[ ]` |
| DataTable       | `components/shared/DataTable.tsx`   | `[ ]` |
| EmptyState      | `components/shared/EmptyState.tsx`  | `[ ]` |
| StatusBadge     | `components/shared/StatusBadge.tsx` | `[ ]` |

## 5.3 Hook Exports

| Hook               | Check | Purpose                        |
| ------------------ | ----- | ------------------------------ |
| `useAuth`          | `[ ]` | Authentication state           |
| `useAuthorization` | `[ ]` | Role-based permission checking |
| `useWebSocket`     | `[ ]` | Real-time connection           |
| `useApi`           | `[ ]` | Base API client                |

---

# Section 6: Remediation Workflow

## 6.1 Analysis Phase

1. Run diff comparison:

```powershell
# PowerShell
$template = Get-ChildItem -Path "d:/applications/spernakit" -Recurse -File
$target = Get-ChildItem -Path "d:/applications/{appname}" -Recurse -File

Compare-Object $template $target -Property Name, Length |
    Where-Object { $_.SideIndicator -eq "=>" } |
    Select-Object Name, Length
```

2. Classify differences:
    - **[KEEP]**: App-specific logic, schemas, domain routes, unique UI
    - **[FIX]**: Unintended drift in shared utils, tooling, build configs
    - **[MIXED]**: Files needing partial merge (package.json, configs)

## 6.2 Execution Phase

### Full Overwrites ([FIX])

```powershell
Copy-Item "spernakit/path/to/file" "${TARGET_APP}/path/to/file" -Force
```

### Intelligent Merges ([MIXED])

1. Read both source and target
2. Update target to match template structure
3. Preserve app-specific values
4. Use section markers where helpful:
    ```typescript
    // ===== Template Core (Spernakit) =====
    // ===== App-Specific =====
    ```

## 6.3 Validation

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

## 6.4 Completion Criteria

- All [FIX] files aligned
- All [MIXED] files properly merged
- `bun run smoke:qc` passes
- `bun run dev` starts without errors
- Domain-specific files preserved (~14-20 files typical)

---

# Appendix A: Checklist Template

Copy this section for each application audit:

## Application: **\*\***\_\_\_**\*\***

**Audit Date:** **\*\***\_\_\_**\*\***
**Auditor:** **\*\***\_\_\_**\*\***

### Quick Summary

- [ ] Section 1: Architecture Compliance
- [ ] Section 2: Frontend API Standards
- [ ] Section 3: Data Router Pattern
- [ ] Section 4: Styling Consistency
- [ ] Section 5: Template Sync Verification

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

# Appendix B: Common Drift Patterns

| Pattern                      | Symptom                                | Fix                               |
| ---------------------------- | -------------------------------------- | --------------------------------- |
| Raw fetch usage              | `fetch()` calls in components          | Replace with service method       |
| Inline button styles         | Long Tailwind class strings on buttons | Apply `.btn` + variant            |
| Nested `<Routes>`            | `<Routes>` inside page components      | Convert to `<Outlet>`             |
| Missing refetchOnWindowFocus | Queries refetch unexpectedly           | Add `refetchOnWindowFocus: false` |
| Component-based router       | `<BrowserRouter>` in App.tsx           | Migrate to `createBrowserRouter`  |
| Missing soft delete          | No `isDeleted` field on models         | Add fields to Prisma schema       |
| Inconsistent response format | Varied API response shapes             | Standardize to envelope format    |

---

# Appendix C: Typical Files to Review

## High-Impact Files (Check First)

| File                           | Why                          |
| ------------------------------ | ---------------------------- |
| `frontend/src/App.tsx`         | Router setup, provider order |
| `frontend/src/routes.tsx`      | Route definitions            |
| `frontend/src/tailwind.css`    | Semantic CSS classes         |
| `frontend/src/services/api.ts` | HTTP client setup            |
| `frontend/src/hooks/index.ts`  | Hook exports                 |
| `backend/src/app.ts`           | Middleware pipeline          |
| `backend/prisma/schema.prisma` | Soft delete fields           |

## Common Drift Locations

| Location             | Common Issue                    |
| -------------------- | ------------------------------- |
| `components/ui/`     | Missing semantic classes        |
| `components/shared/` | Inconsistent patterns           |
| `pages/`             | Nested Routes instead of Outlet |
| `services/`          | Raw fetch instead of api client |
| `hooks/`             | Missing refetchOnWindowFocus    |

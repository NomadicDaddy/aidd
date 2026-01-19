---
title: 'Spernakit Derived Application Audit Framework'
last_updated: '2025-01-19'
version: '2.0'
category: 'Architecture'
priority: 'High'
estimated_time: '3-5 hours'
frequency: 'Quarterly'
trigger: model_decision
description: 'Comprehensive audit framework for Spernakit-derived applications covering structure alignment and feature utilization'
---

# Spernakit Derived Application Audit Framework

This document provides a structured audit framework for evaluating derived applications against the Spernakit template, identifying drift, and executing remediation.

## Related Documents

| Document              | Path                                    | Purpose                                      |
| --------------------- | --------------------------------------- | -------------------------------------------- |
| Stack Reference       | `stack-spernakit.md`                    | Core architecture and commands               |
| Frontend API Standard | `std-frontend-api.md`                   | API service patterns                         |
| Template Refactor     | `.claude/commands/template-refactor.md` | Bidirectional enhancement detection workflow |
| Enhancement Log       | `.claude/logs/template-enhancements.md` | Historical record of template improvements   |

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

## Application Registry

### Spernakit-Derived Applications

| Application   | Location                        | Stack          | Frontend | Backend | Description          |
| ------------- | ------------------------------- | -------------- | -------- | ------- | -------------------- |
| spernakit     | `d:/applications/spernakit`     | spernakit      | 3330     | 3331    | Core template        |
| deeper        | `d:/applications/deeper`        | spernakit+pode | 8573     | 8572    | Deep dive tool       |
| groundtruth   | `d:/applications/groundtruth`   | spernakit      | 3380     | 3381    | Homelab survival kit |
| openplanner   | `d:/applications/openplanner`   | spernakit      | 3410     | 3411    | Project manager      |
| ottoboard     | `d:/applications/ottoboard`     | spernakit      | 3340     | 3341    | Kanban board         |
| reportal      | `d:/applications/reportal`      | spernakit      | 3350     | 3351    | Reporting portal     |
| skedman       | `d:/applications/skedman`       | spernakit      | 3360     | 3361    | Scheduling manager   |
| synchronosity | `d:/applications/synchronosity` | spernakit      | 3370     | 3371    | Timeline visualizer  |
| syndicate85   | `d:/applications/syndicate85`   | spernakit      | 3390     | 3391    | Retro PBM game       |
| tribewall     | `d:/applications/tribewall`     | spernakit      | 3420     | 3421    | Family hub           |

### Non-Spernakit Applications

| Application    | Location                         | Stack        | Description             |
| -------------- | -------------------------------- | ------------ | ----------------------- |
| astrid.chat.v3 | `d:/applications/astrid.chat.v3` | react+convex | Astrid.Chat v3          |
| keystrike      | `d:/applications/keystrike`      | react+convex | Keystrike               |
| aidd           | `d:/applications/aidd`           | ink          | AI Development Director |
| automaker      | `d:/applications/automaker`      | electron     | Automaker               |

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
| `[ ]` | WebSocket using native `ws` package (NOT Socket.IO)              | Replace socket.io with ws if present                |

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

| File                                  | Check | Action if Drifted                            |
| ------------------------------------- | ----- | -------------------------------------------- |
| `frontend/src/tailwind.css`           | `[ ]` | Full overwrite from template                 |
| `frontend/src/hooks/index.ts`         | `[ ]` | Merge - preserve app hooks, add missing core |
| `frontend/src/services/api.ts`        | `[ ]` | Review and align pattern                     |
| `frontend/vite.config.ts`             | `[ ]` | Verify `manualChunks` matches template       |
| `backend/src/middleware/`             | `[ ]` | Align middleware implementations             |
| `backend/src/services/websocket/*.ts` | `[ ]` | Verify native ws pattern, no socket.io       |
| `frontend/src/services/wsClient.ts`   | `[ ]` | Verify native WebSocket client               |

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

# Section 6: Feature Utilization & Anti-Pattern Detection

## 6.1 Authentication & Authorization

| Check | Criteria                                                       | Anti-Patterns to Detect                                      |
| ----- | -------------------------------------------------------------- | ------------------------------------------------------------ |
| `[ ]` | Using `authService` for authentication logic                   | Custom JWT implementation, manual token signing              |
| `[ ]` | Using `authorize()` middleware for RBAC                        | Manual role checking in controllers, custom permission logic |
| `[ ]` | Using HTTP-only cookies for sessions                           | Custom session storage, localStorage for auth tokens         |
| `[ ]` | Using `passwordResetService` for reset flows                   | Reinvented password reset logic                              |
| `[ ]` | Using `useAuthorization()` hook for frontend permission checks | Custom permission checking in components                     |

**Validation Commands:**

```bash
# Check auth middleware usage
grep -r "authenticate" backend/src/routes/
grep -r "authorize" backend/src/routes/

# Check frontend auth context usage
grep -r "useAuth" frontend/src/pages/
grep -r "ProtectedRoute" frontend/src/App.tsx

# Check for custom JWT implementations (should only be in tokenService.ts)
find backend/src -name "*.ts" -exec grep -l "jwt\.sign\|jwt\.verify" {} \;
```

## 6.2 User Management

| Check | Criteria                                               | Anti-Patterns to Detect                        |
| ----- | ------------------------------------------------------ | ---------------------------------------------- |
| `[ ]` | Using `userQueries.ts` for user queries                | Custom user queries scattered in services      |
| `[ ]` | Using `passwordService.ts` for password management     | Manual password hashing, custom password logic |
| `[ ]` | Using `userValidation.ts` for validation               | Custom validation logic                        |
| `[ ]` | Using provided UserTable/UserCreateModal/UserEditModal | Reinvented user table UI, custom user modals   |
| `[ ]` | Using `usersService.ts` for user API calls             | Direct API calls, custom user service methods  |

## 6.3 Audit Logging

| Check | Criteria                                                     | Anti-Patterns to Detect                              |
| ----- | ------------------------------------------------------------ | ---------------------------------------------------- |
| `[ ]` | Using `auditMiddleware` for automatic logging                | Manual audit logging scattered in controllers        |
| `[ ]` | Using `auditService` for audit queries                       | Custom audit log queries                             |
| `[ ]` | Not manually calling `prisma.auditLog.create` in controllers | Direct Prisma audit calls (middleware should handle) |

**Validation Commands:**

```bash
# Check if audit middleware is registered
grep -r "auditMiddleware" backend/src/config/middleware.ts

# Check for manual audit logging (should use middleware instead)
find backend/src/controllers -name "*.ts" -exec grep -l "await prisma.auditLog.create" {} \;
```

## 6.4 Real-Time Features

### Notifications

| Check | Criteria                                          | Anti-Patterns to Detect                |
| ----- | ------------------------------------------------- | -------------------------------------- |
| `[ ]` | Using `websocketService` for WebSocket management | Custom WebSocket implementations       |
| `[ ]` | Using `notificationService` for notification CRUD | Manual notification queries            |
| `[ ]` | Using provided notification components            | Reinvented notification UI             |
| `[ ]` | Using WebSocketContext for connection sharing     | Manual WebSocket connection management |

**Validation Commands:**

```bash
# Check for Socket.IO usage (should NOT exist - use native ws instead)
find backend/src -name "*.ts" -exec grep -l "socket\.io\|from 'socket.io'" {} \;
find frontend/src -name "*.ts" -exec grep -l "socket\.io-client\|from 'socket.io-client'" {} \;
```

### Keyboard Shortcuts

| Check | Criteria                                | Anti-Patterns to Detect               |
| ----- | --------------------------------------- | ------------------------------------- |
| `[ ]` | Using `useKeyboardShortcuts` hook       | Custom keyboard event handlers        |
| `[ ]` | Using KeyboardShortcutsProvider at root | Manual keyboard shortcut registration |
| `[ ]` | Using provided KeyboardShortcutsModal   | Custom keyboard shortcuts UI          |

**Validation Commands:**

```bash
# Check if keyboard shortcuts context is provided
grep -r "KeyboardShortcutsProvider" frontend/src/

# Check for manual keyboard event handling
grep -r "onKeyDown\|onKeyPress" frontend/src/pages/
```

## 6.5 Monitoring & Health Checks

| Check | Criteria                                         | Anti-Patterns to Detect             |
| ----- | ------------------------------------------------ | ----------------------------------- |
| `[ ]` | Using `healthCheckService` for health monitoring | Custom health check implementations |
| `[ ]` | Using provided health check components           | Reinvented health monitoring UI     |
| `[ ]` | Using `systemMetricsService` for metrics         | Custom metrics collection           |

## 6.6 Security Features

| Check | Criteria                                          | Anti-Patterns to Detect                       |
| ----- | ------------------------------------------------- | --------------------------------------------- |
| `[ ]` | Using `passwordPolicyService` for password policy | Custom password validation logic              |
| `[ ]` | Using `usePasswordValidation` hook                | Manual password strength calculation          |
| `[ ]` | Using `keyManagementService` for key generation   | Hardcoded secrets, weak key generation        |
| `[ ]` | Using `securityEmailService` for email operations | Custom email validation, manual email sending |

## 6.7 Settings & Configuration

| Check | Criteria                                            | Anti-Patterns to Detect                |
| ----- | --------------------------------------------------- | -------------------------------------- |
| `[ ]` | Using `settingsService` for runtime configuration   | Hardcoded configuration values         |
| `[ ]` | Using provided settings components                  | Custom settings storage implementation |
| `[ ]` | Using `useEmailConfig` hook for email configuration | Hardcoded email settings               |

## 6.8 Frontend Components

### Component Library

| Check | Criteria                                       | Anti-Patterns to Detect              |
| ----- | ---------------------------------------------- | ------------------------------------ |
| `[ ]` | Using `Modal`/`LazyModal` for dialogs          | Custom modal implementations         |
| `[ ]` | Using `DataTable` for tabular data             | Reinvented data tables               |
| `[ ]` | Using `StatusBadge` for status indicators      | Custom badge components              |
| `[ ]` | Using `LoadingSpinner` for loading states      | Manual loading state implementations |
| `[ ]` | Using `ErrorBoundary` and `RouteErrorBoundary` | Missing error boundaries             |

**Validation Commands:**

```bash
# Check for custom modal implementations
find frontend/src -name "*Modal*.tsx" | grep -v "Modal.tsx\|LazyModal.tsx"

# Check for custom table implementations
find frontend/src -name "*Table*.tsx" | grep -v "UserTable.tsx\|DataTable.tsx"
```

### Performance

| Check | Criteria                                  | Anti-Patterns to Detect                                    |
| ----- | ----------------------------------------- | ---------------------------------------------------------- |
| `[ ]` | Using `VirtualScrollList` for large lists | Rendering large lists with `.map()` without virtualization |
| `[ ]` | Using `OptimizedImage` for images         | Unoptimized `<img>` tags                                   |
| `[ ]` | Implementing code splitting               | Not lazy-loading heavy components                          |

**Validation Commands:**

```bash
# Check for large list rendering without virtual scrolling
grep -r "\.map(" frontend/src/pages/ | grep -v "VirtualScrollList"

# Check for unoptimized image usage
grep -r "<img" frontend/src/ | grep -v "OptimizedImage"
```

## 6.9 Backend Architecture

### Service Layer Pattern

| Check | Criteria                                     | Anti-Patterns to Detect            |
| ----- | -------------------------------------------- | ---------------------------------- |
| `[ ]` | Business logic in services, not controllers  | Direct Prisma calls in controllers |
| `[ ]` | Using existing template services             | Reinventing service functionality  |
| `[ ]` | Service methods follow single responsibility | Overloaded service methods         |

**Validation Commands:**

```bash
# Check for direct Prisma calls in controllers
find backend/src/controllers -name "*.ts" -exec grep -l "prisma\." {} \;

# Check if services are being used
grep -r "await.*Service\." backend/src/controllers/
```

### Middleware Pipeline

| Check | Criteria                                      | Anti-Patterns to Detect                        |
| ----- | --------------------------------------------- | ---------------------------------------------- |
| `[ ]` | Using provided middleware                     | Custom authentication/authorization middleware |
| `[ ]` | Using `auditMiddleware` for automatic logging | Manual audit logging in controllers            |

### API Patterns

| Check | Criteria                                 | Anti-Patterns to Detect                               |
| ----- | ---------------------------------------- | ----------------------------------------------------- |
| `[ ]` | Using response utilities (`response.ts`) | Custom response formats, inconsistent error responses |
| `[ ]` | Using pagination utilities               | Manual pagination logic                               |

**Validation Commands:**

```bash
# Check for custom response formats
grep -r "res\.json({" backend/src/controllers/ | grep -v "success"

# Check if pagination utilities are used
grep -r "parsePagination\|formatPaginatedResponse" backend/src/controllers/
```

## 6.10 Database & Prisma

| Check | Criteria                             | Anti-Patterns to Detect                              |
| ----- | ------------------------------------ | ---------------------------------------------------- |
| `[ ]` | Using Prisma for database operations | Custom SQL queries (`$queryRaw`, `executeRaw`)       |
| `[ ]` | Soft delete pattern on all models    | Hard deletes (`.delete({}`)                          |
| `[ ]` | Audit fields on models               | Missing `createdAt`, `updatedAt`, `createdBy` fields |

**Validation Commands:**

```bash
# Check for custom SQL queries
grep -r "db\.executeRaw\|prisma.\$queryRaw" backend/src/

# Check for hard deletes
grep -r "\.delete({" backend/src/services/

# Check for soft deletes
grep -r "\.update.*isDeleted.*true" backend/src/services/
```

## 6.11 Testing Infrastructure

| Check | Criteria                           | Anti-Patterns to Detect                 |
| ----- | ---------------------------------- | --------------------------------------- |
| `[ ]` | Using test utilities from template | Tests without proper providers          |
| `[ ]` | Configured test query client       | Missing test query client configuration |

**Validation Commands:**

```bash
# Check if test utilities are imported
grep -r "from.*test-utils" frontend/src/*.test.tsx
```

## 6.12 Build & Tooling

| Check | Criteria                               | Anti-Patterns to Detect                       |
| ----- | -------------------------------------- | --------------------------------------------- |
| `[ ]` | Using provided ESLint/Prettier configs | Custom ESLint rules conflicting with template |
| `[ ]` | Using provided scripts                 | Manual tasks that should be automated         |

**Validation Commands:**

```bash
# Compare configurations with template
diff <(cat eslint.config.js) <(cat ../spernakit/eslint.config.js)

# Check for custom modifications
git diff eslint.config.js
```

---

# Section 7: Remediation Workflow

## 7.1 Analysis Phase

1. Review enhancement log (if exists):

```powershell
# Check for existing enhancements previously identified for this app
$logPath = "d:\applications\.claude\logs\template-enhancements.md"
if (Test-Path $logPath) {
    Get-Content $logPath | Select-String -Pattern $TARGET_APP
}
```

2. Run diff comparison:

```powershell
# PowerShell
$template = Get-ChildItem -Path "d:/applications/spernakit" -Recurse -File
$target = Get-ChildItem -Path "d:/applications/{appname}" -Recurse -File

Compare-Object $template $target -Property Name, Length |
    Where-Object { $_.SideIndicator -eq "=>" } |
    Select-Object Name, Length
```

3. Classify differences:
    - **[KEEP]**: App-specific logic, schemas, domain routes, unique UI
    - **[FIX]**: Unintended drift in shared utils, tooling, build configs
    - **[MIXED]**: Files needing partial merge (package.json, configs)
    - **[ENHANCEMENT]**: Improved implementation in target that should be considered for porting back to spernakit template (see template-refactor.md Phase 3.5 for bidirectional workflow)

    Note: Any new [ENHANCEMENT] items should be documented in the enhancement log (see template-refactor.md for log format).

## 7.2 Execution Phase

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

## 7.3 Validation

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

## 7.4 Completion Criteria

- All [FIX] files aligned
- All [MIXED] files properly merged
- All [ENHANCEMENT] items reviewed and documented (see template-refactor.md Phase 3.5 for handling workflow)
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
- [ ] Section 6: Feature Utilization & Anti-Pattern Detection

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

# Appendix B: Common Issues & Anti-Patterns

| Pattern                      | Symptom                                | Fix                               |
| ---------------------------- | -------------------------------------- | --------------------------------- |
| Raw fetch usage              | `fetch()` calls in components          | Replace with service method       |
| Inline button styles         | Long Tailwind class strings on buttons | Apply `.btn` + variant            |
| Nested `<Routes>`            | `<Routes>` inside page components      | Convert to `<Outlet>`             |
| Missing refetchOnWindowFocus | Queries refetch unexpectedly           | Add `refetchOnWindowFocus: false` |
| Component-based router       | `<BrowserRouter>` in App.tsx           | Migrate to `createBrowserRouter`  |
| Missing soft delete          | No `isDeleted` field on models         | Add fields to Prisma schema       |
| Inconsistent response format | Varied API response shapes             | Standardize to envelope format    |
| Socket.IO usage              | `socket.io` in package.json            | Replace with native `ws` package  |

## Common Anti-Patterns

| Anti-Pattern                 | Symptom                                       | Fix                                            |
| ---------------------------- | --------------------------------------------- | ---------------------------------------------- |
| Custom JWT implementation    | Manual `jwt.sign`/`jwt.verify` in services    | Use `authService` and `tokenService`           |
| Reinvented user table        | Custom table component with manual pagination | Use provided `DataTable` and `UserTable`       |
| Manual audit logging         | `prisma.auditLog.create` in controllers       | Use `auditMiddleware` for automatic logging    |
| Custom WebSocket connection  | Manual WebSocket setup in components          | Use `useWebSocket` hook and `WebSocketContext` |
| Missing error boundaries     | Crashes without error handling                | Add `ErrorBoundary` and `RouteErrorBoundary`   |
| Unoptimized large lists      | Large arrays rendered with `.map()`           | Use `VirtualScrollList` for performance        |
| Manual password validation   | Custom regex/logic in forms                   | Use `usePasswordValidation` hook               |
| Hardcoded configuration      | Config values in code                         | Use `settingsService` for runtime config       |
| Custom modal implementations | Custom dialog components                      | Use `Modal` or `LazyModal`                     |
| Direct Prisma in controllers | `prisma.user.find()` in controller methods    | Move to service layer                          |
| Missing soft delete          | `.delete({}` operations                       | Use soft delete pattern (`isDeleted: true`)    |
| Raw fetch in frontend        | `fetch()` calls in components                 | Use service layer and TanStack Query           |
| Custom keyboard handlers     | Manual `onKeyDown` in components              | Use `useKeyboardShortcuts` hook                |
| Missing virtual scrolling    | Performance issues with large lists           | Implement `VirtualScrollList`                  |
| Custom status badges         | Inline badge styles                           | Use `StatusBadge` component                    |
| Manual loading states        | `if (loading) return <div>Loading...</div>`   | Use `LoadingSpinner` component                 |
| Custom permission checks     | Manual role checking in components            | Use `useAuthorization()` hook                  |

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

---

# Appendix D: Audit Reporting Format

## Issue Template

```
## [Category] Issue Title

**Severity**: Critical/High/Medium/Low
**Feature**: Template Feature Name
**Location**: Path to file(s)
**Type**: Structure Drift | Feature Underutilization | Wheel Reinvention

**Description**:
Brief description of the issue - structural deviation, missing feature, or anti-pattern.

**Current Implementation**:
Code snippet or description of current (problematic) implementation.

**Recommended Fix**:
Code snippet or description of how to fix the issue.

**Impact**:
- Code duplication
- Missed functionality
- Performance impact
- Security implications

**Evidence**:
Commands or observations that confirm the issue.
```

## Summary Report Template

```
# Spernakit Application Audit Report

## Executive Summary

**Target Application**: [Application Name]
**Template Version**: Spernakit v[X.Y.Z]
**Application Version**: v[X.Y.Z]
**Audit Date**: [Date]
**Auditor**: [Name]

### Overall Compliance: [X]%

**Issues Found**: [Count]
- Critical: [Count]
- High: [Count]
- Medium: [Count]
- Low: [Count]

## Structural Compliance (Section 1-5)

- [ ] Architecture Compliance (Section 1)
- [ ] Frontend API Standards (Section 2)
- [ ] Data Router Pattern (Section 3)
- [ ] Styling Consistency (Section 4)
- [ ] Template Sync Verification (Section 5)

### Structure Drift Issues Found: [Count]

[List structural alignment issues]

## Feature Utilization (Section 6)

- [ ] Authentication & Authorization (6.1)
- [ ] User Management (6.2)
- [ ] Audit Logging (6.3)
- [ ] Real-Time Features (6.4)
- [ ] Monitoring & Health Checks (6.5)
- [ ] Security Features (6.6)
- [ ] Settings & Configuration (6.7)
- [ ] Frontend Components (6.8)
- [ ] Backend Architecture (6.9)
- [ ] Database & Prisma (6.10)
- [ ] Testing Infrastructure (6.11)
- [ ] Build & Tooling (6.12)

### Anti-Pattern Issues Found: [Count]

[List feature underutilization and wheel reinvention issues]

## Critical Issues

[Critical issues requiring immediate attention]

## Recommendations

[High-level recommendations for improvement]

## Remediation Plan

### Phase 1: Structural Fixes (Days 1-3)
1. [Priority 1 structural fix]
2. [Priority 2 structural fix]

### Phase 2: Feature Utilization (Days 4-7)
1. [Priority 1 anti-pattern fix]
2. [Priority 2 anti-pattern fix]

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

| Level        | Definition                                                               | Examples                                                            |
| ------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------- |
| **Critical** | Security vulnerabilities, data loss risk, breaking template architecture | Custom auth without RBAC, hard deletes, missing audit trails        |
| **High**     | Significant wheel reinvention, performance issues, major anti-patterns   | Custom WebSocket instead of native ws, reinvented user table        |
| **Medium**   | Minor duplications, missing optimizations, small deviations              | Not using password validation hook, missing virtual scrolling       |
| **Low**      | Style deviations, minor inconsistencies, unused template features        | Custom modal when LazyModal would work, minor formatting deviations |

## When to Allow Customization

Custom implementation is acceptable when:

1. Template feature doesn't meet specific business requirement
2. Custom implementation is documented and justified
3. No breaking changes to template infrastructure
4. Performance or security concerns warrant custom approach
5. Feature is application-specific and not suitable for template

## When to Flag as Issue

Flag as issue when:

1. Template feature exists but isn't being used without justification
2. Custom implementation duplicates template functionality
3. No documentation or rationale for deviation from template
4. Implementation breaks template architecture patterns
5. Security or performance implications exist

## Validation Checklist

### Before Reporting

- [ ] All structural checks completed (Sections 1-5)
- [ ] All feature utilization checks completed (Section 6)
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

| Version | Date    | Changes                                                                                                                                                          |
| ------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2.0     | 2025-01 | Consolidated feature-check.md content, added Section 6 (Feature Utilization), expanded anti-pattern detection, added validation commands, reorganized appendices |
| 1.0     | 2025-01 | Initial comprehensive document                                                                                                                                   |

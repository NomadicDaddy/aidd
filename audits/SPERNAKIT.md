---
title: 'Spernakit v2 Derived Application Audit Framework'
last_updated: '2025-02-03'
version: '3.0'
category: 'Architecture'
priority: 'High'
estimated_time: '3-5 hours'
frequency: 'Quarterly'
trigger: model_decision
description: 'Comprehensive audit framework for Spernakit v2-derived applications covering structure alignment and feature utilization'
lifecycle: 'specialized'
---

# Spernakit v2 Derived Application Audit Framework

This document provides a structured audit framework for evaluating derived applications against the Spernakit v2 template, identifying drift, and executing remediation.

## Related Documents

| Document          | Path                                    | Purpose                                      |
| ----------------- | --------------------------------------- | -------------------------------------------- |
| Stack Reference   | `spernakit/docs/template/STACK.md`     | Core architecture and commands               |
| Project Overrides | `spernakit/.automaker/project.txt`     | Technology-specific constraints              |
| Template Refactor | `.claude/commands/template-refactor.md` | Bidirectional enhancement detection workflow |
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

## Application Registry

### Spernakit v2-Derived Applications

| Application   | Location                        | Stack     | Frontend | Backend | Description          |
| ------------- | ------------------------------- | --------- | -------- | ------- | -------------------- |
| spernakit    | `d:/applications/spernakit`    | spernakit | 3330     | 3331    | Core template v2     |
| deeper        | `d:/applications/deeper`        | spernakit | 8573     | 8572    | Deep dive tool       |
| groundtruth   | `d:/applications/groundtruth`   | spernakit | 3380     | 3381    | Homelab survival kit |
| openplanner   | `d:/applications/openplanner`   | spernakit | 3410     | 3411    | Project manager      |
| ottoboard     | `d:/applications/ottoboard`     | spernakit | 3340     | 3341    | Kanban board         |
| reportal      | `d:/applications/reportal`      | spernakit | 3350     | 3351    | Reporting portal     |
| skedman       | `d:/applications/skedman`       | spernakit | 3360     | 3361    | Scheduling manager   |
| synchronosity | `d:/applications/synchronosity` | spernakit | 3370     | 3371    | Timeline visualizer  |
| syndicate85   | `d:/applications/syndicate85`   | spernakit | 3390     | 3391    | Retro PBM game       |
| tribewall     | `d:/applications/tribewall`     | spernakit | 3420     | 3421    | Family hub           |

### Non-Spernakit Applications

| Application    | Location                         | Stack        | Description             |
| -------------- | -------------------------------- | ------------ | ----------------------- |
| astrid.chat.v3 | `d:/applications/astrid.chat.v3` | react+convex | Astrid.Chat v3          |
| keystrike      | `d:/applications/keystrike`      | react+convex | Keystrike               |
| aidd           | `d:/applications/aidd`           | shell        | AI Development Director |
| automaker      | `d:/applications/automaker`      | electron     | Automaker               |

---

# Section 1: Architecture Compliance

## 1.1 Project Structure

| Check | Criteria                                                       | Remediation                                        |
| ----- | -------------------------------------------------------------- | -------------------------------------------------- |
| `[ ]` | Monorepo workspace with `frontend/` and `backend/` directories | Restructure to match template layout               |
| `[ ]` | Root `package.json` with workspace scripts                     | Copy from spernakit, preserve app-specific values |
| `[ ]` | `bunfig.toml` with `env = false` setting                       | Copy from spernakit                               |
| `[ ]` | `config/{appname}.json` configuration file present             | Create from template, set app-specific values      |
| `[ ]` | Database in `data/` at project root (NEVER backend/data/)      | Move database files to correct location            |

## 1.2 Backend Structure

| Check | Criteria                                                               | Remediation                                         |
| ----- | ---------------------------------------------------------------------- | --------------------------------------------------- |
| `[ ]` | **Elysia** framework with service layer pattern                        | Migrate from Express/Fastify to Elysia              |
| `[ ]` | **Drizzle ORM** with SQLite database                                   | Migrate from Prisma to Drizzle                      |
| `[ ]` | Plugin pipeline: Auth > Authz > Rate limit > Audit > Workspace         | Review plugin order                                 |
| `[ ]` | Elysia guards for authorization (authenticated, role, workspaceAccess) | Check guard implementations                         |
| `[ ]` | 5-tier RBAC system (SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER)       | Check role definitions                              |
| `[ ]` | Soft delete pattern on all entities                                    | Verify `isDeleted`, `deletedAt`, `deletedBy` fields |
| `[ ]` | Audit trail logging via audit plugin                                   | Verify auditService implementation                  |
| `[ ]` | WebSocket using Bun native WebSocket (NOT Socket.IO)                   | Replace socket.io with native Bun WebSocket         |
| `[ ]` | **pino** logging (NOT Winston)                                         | Replace Winston with pino                           |
| `[ ]` | **TypeBox** validation via Elysia (NOT Joi/Zod)                        | Replace validation schemas with TypeBox             |

## 1.3 Frontend Structure

| Check | Criteria                                        | Remediation                    |
| ----- | ----------------------------------------------- | ------------------------------ |
| `[ ]` | React 19 with Vite bundler                      | Check package versions         |
| `[ ]` | **Zustand** stores for client state             | Verify store patterns          |
| `[ ]` | TanStack Query for server state                 | Verify query/mutation patterns |
| `[ ]` | **shadcn/ui** components (NOT DaisyUI)          | Replace DaisyUI with shadcn/ui |
| `[ ]` | **sonner** for toasts (NOT react-hot-toast)     | Replace toast implementation   |
| `[ ]` | ProtectedRoute component with role-based access | Verify route protection        |
| `[ ]` | Lazy loading with code splitting                | Check route lazy imports       |

---

# Section 2: Frontend API Standards

## 2.1 HTTP Client

| Check | Criteria                                          | Remediation                                 |
| ----- | ------------------------------------------------- | ------------------------------------------- |
| `[ ]` | **Native fetch** API (NOT Axios)                  | Replace Axios instances with native fetch   |
| `[ ]` | API modules in `frontend/src/api/` by domain      | Organize by resource/domain                 |
| `[ ]` | Type definitions in `frontend/src/api/types.ts`   | Verify API contract types                   |
| `[ ]` | Error handling via centralized fetch wrapper      | Implement fetch wrapper with error handling |
| `[ ]` | Auth token handling automatic (HTTP-only cookies) | Verify cookie attachment                    |

## 2.2 API Module Pattern

| Check | Criteria                                              | Remediation                 |
| ----- | ----------------------------------------------------- | --------------------------- |
| `[ ]` | API modules in `api/` directory (one file per domain) | Organize by resource/domain |
| `[ ]` | Functions return typed responses                      | Verify return types         |
| `[ ]` | Consistent method signatures across modules           | Audit naming conventions    |
| `[ ]` | OpenAPI spec at `/api/docs/json` is source of truth   | Verify spec generation      |

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

## 2.3 TanStack Query Integration

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

| Store               | Purpose              | Persist |
| ------------------- | -------------------- | ------- |
| `useAuthStore`      | Authentication state | Yes     |
| `useThemeStore`     | Theme preferences    | Yes     |
| `useSidebarStore`   | Sidebar state        | Yes     |
| `useWorkspaceStore` | Current workspace    | Yes     |

---

# Section 4: Component Library (shadcn/ui)

## 4.1 shadcn/ui Usage

| Check | Criteria                                               | Remediation                      |
| ----- | ------------------------------------------------------ | -------------------------------- |
| `[ ]` | shadcn/ui components in `frontend/src/components/ui/`  | Install missing components       |
| `[ ]` | Tailwind CSS for styling (NOT custom CSS or DaisyUI)   | Replace custom CSS with Tailwind |
| `[ ]` | Components installed via `npx shadcn-ui@latest add`    | Follow install pattern           |
| `[ ]` | Custom components in `frontend/src/components/shared/` | Organize shared components       |
| `[ ]` | Layout components in `frontend/src/components/layout/` | Organize layout components       |

## 4.2 Common shadcn/ui Components

| Component | Location                     | Usage                        |
| --------- | ---------------------------- | ---------------------------- |
| Button    | `components/ui/button.tsx`   | All button variants          |
| Input     | `components/ui/input.tsx`    | Form inputs                  |
| Select    | `components/ui/select.tsx`   | Dropdowns                    |
| Textarea  | `components/ui/textarea.tsx` | Multi-line inputs            |
| Dialog    | `components/ui/dialog.tsx`   | Modals                       |
| Table     | `components/ui/table.tsx`    | Data tables                  |
| Card      | `components/ui/card.tsx`     | Cards                        |
| Badge     | `components/ui/badge.tsx`    | Status indicators            |
| Alert     | `components/ui/alert.tsx`    | Alert messages               |
| Toast     | `components/ui/use-toast.ts` | Toast notifications (sonner) |

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

| Check | Criteria                                                             | Remediation                      |
| ----- | -------------------------------------------------------------------- | -------------------------------- |
| `[ ]` | Plugins in `backend/src/plugins/` (one file per concern)             | Organize plugins by domain       |
| `[ ]` | Plugin order: auth > cors > logging > rate limit > audit > workspace | Verify plugin registration order |
| `[ ]` | Cross-cutting concerns use plugin pattern                            | Move middleware to plugins       |
| `[ ]` | Type-safe plugin configuration via TypeBox                           | Use TypeBox for plugin schemas   |

**Expected plugin pattern:**

```typescript
import { Elysia, t } from 'elysia';

export const authPlugin = new Elysia({ name: 'auth' }).derive(async ({ cookie, set }) => {
	const token = cookie.auth_token?.value;
	if (!token) {
		set.status = 401;
		return { user: null, isAuthenticated: false };
	}
	const user = await verifyToken(token);
	return { user, isAuthenticated: true };
});
```

## 5.2 Elysia Guards

| Check | Criteria                                               | Remediation               |
| ----- | ------------------------------------------------------ | ------------------------- |
| `[ ]` | Guards in `backend/src/guards/` (one file per concern) | Organize guards by domain |
| `[ ]` | `authenticated` guard for logged-in users              | Verify auth guard         |
| `[ ]` | `role` guard for RBAC checking                         | Verify role guard         |
| `[ ]` | `workspaceAccess` guard for multi-tenant               | Verify workspace guard    |
| `[ ]` | Guard usage on protected routes                        | Apply guards where needed |

**Expected guard pattern:**

```typescript
import { Elysia, t } from 'elysia';

export const roleGuard = (roles: string[]) =>
	new Elysia({ name: 'role-guard' }).guard({
		user: t.Object({
			role: t.Union([...roles.map((r) => t.Literal(r))]),
		}),
	});
```

## 5.3 Route Organization

| Check | Criteria                                                    | Remediation               |
| ----- | ----------------------------------------------------------- | ------------------------- |
| `[ ]` | Route groups in `backend/src/routes/` (one file per domain) | Organize routes by domain |
| `[ ]` | Elysia instance with plugins registered                     | Verify plugin attachment  |
| `[ ]` | TypeBox schemas for request/response validation             | Add TypeBox schemas       |
| `[ ]` | Service layer called from routes (NOT direct Drizzle calls) | Move logic to services    |

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

| Check | Criteria                                              | Remediation                 |
| ----- | ----------------------------------------------------- | --------------------------- |
| `[ ]` | Services in `backend/src/services/` (flat, NO facade) | Organize services by domain |
| `[ ]` | One file per service domain                           | Split large services        |
| `[ ]` | Business logic in services (NOT routes)               | Move logic from routes      |
| `[ ]` | Drizzle ORM for database operations                   | Use Drizzle queries         |
| `[ ]` | Proper error handling and logging                     | Add error handling          |

**Expected service pattern:**

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

| Check | Criteria                                                         | Remediation                |
| ----- | ---------------------------------------------------------------- | -------------------------- |
| `[ ]` | Schemas in `backend/src/db/schema/` (one file per entity)        | Organize schemas by entity |
| `[ ]` | Snake_case column names in database, camelCase in schema         | Follow naming convention   |
| `[ ]` | Plural snake_case table names (users, audit_logs)                | Follow naming convention   |
| `[ ]` | Soft delete fields: `isDeleted`, `deletedAt`, `deletedBy`        | Add to all entities        |
| `[ ]` | Audit fields: `createdAt`, `updatedAt`, `createdBy`, `updatedBy` | Add to all entities        |
| `[ ]` | Indexes: `idx_{table}_{columns}` format                          | Follow naming convention   |
| `[ ]` | Foreign keys: `fk_{table}_{referenced_table}` format             | Follow naming convention   |

**Expected schema pattern:**

```typescript
import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

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
```

---

# Section 6: Frontend Architecture

## 6.1 Page Organization

| Check | Criteria                                                            | Remediation                    |
| ----- | ------------------------------------------------------------------- | ------------------------------ |
| `[ ]` | Pages in `frontend/src/pages/{domain}/` (one directory per feature) | Organize pages by feature area |
| `[ ]` | Lazy loading for all pages                                          | Add lazy imports               |
| `[ ]` | Data fetching via TanStack Query hooks                              | Use query hooks                |
| `[ ]` | Error boundaries around page components                             | Add error boundaries           |
| `[ ]` | Loading states with skeleton loaders or spinners                    | Add loading states             |

## 6.2 Layout Components

| Component           | Location                                    | Purpose             |
| ------------------- | ------------------------------------------- | ------------------- |
| AppLayout           | `components/layout/AppLayout.tsx`           | Main app shell      |
| AuthenticatedLayout | `components/layout/AuthenticatedLayout.tsx` | Authenticated pages |
| PublicLayout        | `components/layout/PublicLayout.tsx`        | Public pages        |

## 6.3 Testing (Vitest)

| Check | Criteria                                                | Remediation       |
| ----- | ------------------------------------------------------- | ----------------- |
| `[ ]` | Frontend tests use **Vitest** (NOT bun:test)            | Configure Vitest  |
| `[ ]` | Component tests in `frontend/src/components/__tests__/` | Add test coverage |
| `[ ]` | Page tests in `frontend/src/pages/__tests__/`           | Add test coverage |
| `[ ]` | Test utilities and mocks available                      | Use test helpers  |
| `[ ]` | Test query client configured for TanStack Query         | Add test setup    |

---

# Section 7: Backend Testing (bun:test)

| Check | Criteria                                           | Remediation        |
| ----- | -------------------------------------------------- | ------------------ |
| `[ ]` | Backend tests use **bun:test** (NOT Vitest)        | Configure bun:test |
| `[ ]` | Service tests in `backend/src/services/__tests__/` | Add test coverage  |
| `[ ]` | Plugin tests in `backend/src/plugins/__tests__/`   | Add test coverage  |
| `[ ]` | Guard tests in `backend/src/guards/__tests__/`     | Add test coverage  |
| `[ ]` | Route tests in `backend/src/routes/__tests__/`     | Add test coverage  |

---

# Section 8: Template Sync Verification

## 8.1 Core File Alignment

| File                          | Check | Action if Drifted                             |
| ----------------------------- | ----- | --------------------------------------------- |
| `bunfig.toml`                 | `[ ]` | Verify `env = false` setting                  |
| `config/{appname}.json`       | `[ ]` | Create from template, set app-specific values |
| `backend/src/plugins/`        | `[ ]` | Align plugin implementations                  |
| `backend/src/guards/`         | `[ ]` | Align guard implementations                   |
| `backend/src/routes/`         | `[ ]` | Verify route patterns                         |
| `backend/src/db/schema/`      | `[ ]` | Verify schema naming conventions              |
| `frontend/src/api/types.ts`   | `[ ]` | Verify API contract types                     |
| `frontend/src/api/`           | `[ ]` | Verify API module patterns                    |
| `frontend/src/stores/`        | `[ ]` | Verify Zustand store patterns                 |
| `frontend/src/components/ui/` | `[ ]` | Install missing shadcn/ui components          |

## 8.2 Technology Verification

| Technology         | Status | Check Command                                     |
| ------------------ | ------ | ------------------------------------------------- |
| Bun 1.3+           | `[ ]`  | `bun --version`                                   |
| Elysia             | `[ ]`  | Check backend/package.json                        |
| Drizzle ORM        | `[ ]`  | Check backend/package.json                        |
| pino logging       | `[ ]`  | Check backend/package.json                        |
| React 19           | `[ ]`  | Check frontend/package.json                       |
| Zustand            | `[ ]`  | Check frontend/package.json                       |
| TanStack Query     | `[ ]`  | Check frontend/package.json                       |
| shadcn/ui          | `[ ]`  | Check components/ui/ directory                    |
| sonner toasts      | `[ ]`  | Check frontend/package.json                       |
| native fetch       | `[ ]`  | `grep -r "axios" frontend/src/` (should be empty) |
| TypeBox            | `[ ]`  | Check backend/package.json                        |
| Vitest (frontend)  | `[ ]`  | Check frontend/package.json                       |
| bun:test (backend) | `[ ]`  | Check backend/package.json                        |

---

# Section 9: Feature Utilization & Anti-Pattern Detection

## 9.1 Authentication & Authorization

| Check | Criteria                                                  | Anti-Patterns to Detect                                 |
| ----- | --------------------------------------------------------- | ------------------------------------------------------- |
| `[ ]` | Using `authPlugin` for authentication logic               | Custom JWT implementation, manual token signing         |
| `[ ]` | Using Elysia guards (`roleGuard`, `workspaceAccessGuard`) | Manual role checking in routes, custom permission logic |
| `[ ]` | Using HTTP-only cookies for sessions                      | Custom session storage, localStorage for auth tokens    |
| `[ ]` | Using `useAuthStore` for frontend auth state              | React Context for auth, manual state management         |
| `[ ]` | Using `ProtectedRoute` component for route protection     | Manual auth checks in page components                   |

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

| Check | Criteria                                                 | Anti-Patterns to Detect                      |
| ----- | -------------------------------------------------------- | -------------------------------------------- |
| `[ ]` | Using **Drizzle ORM** for database operations            | Custom SQL, Prisma, other ORM                |
| `[ ]` | Soft delete pattern on all models                        | Hard deletes (`.delete()`)                   |
| `[ ]` | Schema in `backend/src/db/schema/` (one file per entity) | Single large schema file, incorrect location |
| `[ ]` | Database in `data/` at project root                      | Database in backend/data/                    |

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
| `[ ]` | Types in `frontend/src/api/types.ts`                | Missing type definitions            |
| `[ ]` | Error handling in fetch wrapper                     | Scattered error handling            |

**Validation Commands:**

```bash
# Check for Axios usage
grep -r "from 'axios'\|import axios" frontend/src/

# Verify API modules exist
ls -la frontend/src/api/
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

## 9.8 Testing

| Check | Criteria                               | Anti-Patterns to Detect |
| ----- | -------------------------------------- | ----------------------- |
| `[ ]` | Frontend uses **Vitest**               | bun:test for frontend   |
| `[ ]` | Backend uses **bun:test**              | Vitest for backend      |
| `[ ]` | Test files in `__tests__/` directories | Missing test coverage   |
| `[ ]` | Proper test configuration and setup    | Missing test setup      |

**Validation Commands:**

```bash
# Check test frameworks
grep -r "vitest" frontend/package.json
grep -r "bun:test" backend/package.json
```

## 9.9 Configuration

| Check | Criteria                                   | Anti-Patterns to Detect                |
| ----- | ------------------------------------------ | -------------------------------------- |
| `[ ]` | JSON-only config (`config/{appname}.json`) | .env files                             |
| `[ ]` | `bunfig.toml` has `env = false`            | Auto-loading .env files                |
| `[ ]` | No hardcoded config values                 | Secrets in code, environment variables |

**Validation Commands:**

```bash
# Check for .env files (should NOT exist)
find . -name ".env*" -type f

# Check bunfig.toml
grep "env =" bunfig.toml
```

## 9.10 File Organization

| Check | Criteria                                    | Anti-Patterns to Detect                      |
| ----- | ------------------------------------------- | -------------------------------------------- |
| `[ ]` | Named exports only (no export default)      | Default exports                              |
| `[ ]` | ES Modules only (no require/module.exports) | CommonJS patterns                            |
| `[ ]` | Barrel files (index.ts) for re-exports      | Direct imports from domain files             |
| `[ ]` | Services flat (NO sub-directories)          | Service facade pattern, sub-directories      |
| `[ ]` | Pages in `pages/{domain}/` directories      | Pages scattered, missing domain organization |

**Validation Commands:**

```bash
# Check for CommonJS patterns
grep -r "require(\|module\.exports" backend/src/ frontend/src/

# Check for default exports
grep -r "export default" backend/src/ frontend/src/
```

---

# Section 10: Remediation Workflow

## 10.1 Analysis Phase

1. Review enhancement log (if exists):

```powershell
$logPath = "d:\applications\.claude\logs\template-enhancements.md"
if (Test-Path $logPath) {
    Get-Content $logPath | Select-String -Pattern $TARGET_APP
}
```

2. Run diff comparison:

```powershell
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
    - **[ENHANCEMENT]**: Improved implementation in target

## 10.2 Execution Phase

### Full Overwrites ([FIX])

```powershell
Copy-Item "spernakit/path/to/file" "${TARGET_APP}/path/to/file" -Force
```

### Intelligent Merges ([MIXED])

1. Read both source and target
2. Update target to match template structure
3. Preserve app-specific values

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

# Appendix A: Checklist Template

Copy this section for each application audit:

## Application: **\*\***\_\_\_**\*\***

**Audit Date:** **\*\***\_\_\_**\*\***
**Auditor:** **\*\***\_\_\_**\*\***

### Quick Summary

- [ ] Section 1: Architecture Compliance
- [ ] Section 2: Frontend API Standards
- [ ] Section 3: State Management (Zustand)
- [ ] Section 4: Component Library (shadcn/ui)
- [ ] Section 5: Backend Architecture (Elysia)
- [ ] Section 6: Frontend Architecture
- [ ] Section 7: Backend Testing
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

# Appendix B: Common Issues & Anti-Patterns

| Pattern                   | Symptom                               | Fix                             |
| ------------------------- | ------------------------------------- | ------------------------------- |
| Express/Fastify usage     | `express()`, `fastify()` in backend   | Migrate to Elysia               |
| Prisma usage              | `prisma.user.find()` in services      | Migrate to Drizzle              |
| Winston logging           | `winston.createLogger()`              | Replace with pino               |
| Axios HTTP client         | `import axios` in frontend            | Replace with native fetch       |
| React Context for state   | `createContext()` for auth/state      | Replace with Zustand stores     |
| DaisyUI components        | `btn btn-primary` classes             | Install and use shadcn/ui       |
| react-hot-toast           | `toast()` calls                       | Replace with sonner             |
| Zod on routes             | `z.object()` validation               | Replace with TypeBox            |
| .env files                | `.env` files in project root          | Use config/{appname}.json       |
| Console.log               | `console.log()` scattered in backend  | Use pino logging                |
| Database in backend/data/ | Database in `backend/data/` directory | Move to `data/` at project root |

## Common Anti-Patterns

| Anti-Pattern               | Symptom                                     | Fix                                            |
| -------------------------- | ------------------------------------------- | ---------------------------------------------- |
| Express/Fastify backend    | `express.Router()`, `fastify()` imports     | Migrate to Elysia with plugins/guards          |
| Prisma ORM                 | `prisma.user.find()`, `prisma.$transaction` | Migrate to Drizzle ORM                         |
| Winston logging            | `winston.Logger()`, `logger.info()`         | Replace with pino structured logging           |
| Axios HTTP client          | `axios.get()`, `axios.post()`               | Replace with native fetch API                  |
| React Context state        | `createContext()`, `Context.Provider`       | Replace with Zustand stores                    |
| DaisyUI components         | DaisyUI class names in templates            | Install shadcn/ui components via CLI           |
| react-hot-toast            | `toast.success()`, `toast.error()`          | Replace with sonner's `toast()`                |
| Zod route validation       | `z.object()` schemas in Elysia routes       | Replace with TypeBox schemas                   |
| .env files                 | `.env`, `.env.local` files                  | Use config/{appname}.json, set env=false       |
| Console.log                | `console.log()` for logging                 | Use pino logger throughout backend             |
| Database in wrong location | Database files in `backend/data/`           | Move database to `data/` at project root       |
| Direct Prisma calls        | `prisma.auditLog.create()` in controllers   | Use Drizzle in services, audit plugin for logs |
| Custom WebSocket           | Socket.IO or custom WebSocket setup         | Use Bun native WebSocket via Elysia            |
| Missing soft delete        | `.delete()` operations on records           | Implement soft delete with audit fields        |
| Hard deletes               | Database records permanently deleted        | Implement soft delete with audit fields        |
| JSX router                 | `<BrowserRouter>`, `<Routes>` in App.tsx    | Use createBrowserRouter with RouterProvider    |
| Service sub-directories    | `services/user/`, `services/auth/` folders  | Flatten services to one file per domain        |
| Export default             | `export default ComponentName`              | Use named exports only                         |
| CommonJS patterns          | `require()`, `module.exports`               | Use ES modules (`import`, `export`)            |

---

# Appendix C: Typical Files to Review

## High-Impact Files (Check First)

| File                          | Why                                    |
| ----------------------------- | -------------------------------------- |
| `bunfig.toml`                 | Verify env=false, Bun configuration    |
| `backend/src/index.ts`        | Elysia setup, plugin registration      |
| `frontend/src/main.tsx`       | React entry, store providers           |
| `backend/package.json`        | Verify Elysia, Drizzle, pino, bun:test |
| `frontend/package.json`       | Verify React 19, Zustand, Vitest       |
| `config/{appname}.json`       | Verify JSON-only config                |
| `backend/src/db/schema/`      | Verify Drizzle schemas, naming         |
| `frontend/src/api/types.ts`   | Verify API contract types              |
| `frontend/src/stores/`        | Verify Zustand stores                  |
| `frontend/src/components/ui/` | Verify shadcn/ui components            |

## Common Drift Locations

| Location                      | Common Issue                                  |
| ----------------------------- | --------------------------------------------- |
| `backend/src/plugins/`        | Express/Fastify middleware instead of plugins |
| `backend/src/services/`       | Prisma calls, service sub-directories         |
| `frontend/src/stores/`        | React Context instead of Zustand              |
| `frontend/src/components/ui/` | DaisyUI classes instead of shadcn/ui          |
| `backend/package.json`        | Winston, Express, Prisma dependencies         |
| `frontend/package.json`       | Axios, react-hot-toast, react-context         |
| `config/`                     | Missing .env files, .env usage                |

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
# Spernakit v2 Application Audit Report

## Executive Summary

**Target Application**: [Application Name]
**Template Version**: Spernakit v2
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
- [ ] Backend Testing (Section 7)
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
- [ ] Testing (9.8)
- [ ] Configuration (9.9)
- [ ] File Organization (9.10)

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

| Version | Date    | Changes                                                                                                       |
| ------- | ------- | ------------------------------------------------------------------------------------------------------------- |
| 3.0     | 2025-02 | Complete rewrite for Spernakit v2 - Elysia, Drizzle, pino, Zustand, shadcn/ui, native fetch, TypeBox          |
| 2.0     | 2025-01 | Consolidated feature-check.md content, added Section 6 (Feature Utilization), expanded anti-pattern detection |
| 1.0     | 2025-01 | Initial comprehensive document (archived as SPERNAKITV1.md)                                                   |

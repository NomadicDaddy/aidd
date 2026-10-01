---
title: 'Architecture, API Design, and Code Complexity Audit'
last_updated: '2026-10-01'
version: '3.3'
category: 'Core Architecture'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
consolidates: 'API_DESIGN.md'
---

# Architecture Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

**Critical Architecture Priorities**

- **API Consistency**: Uniform patterns for API functions (read operations, write operations, actions)
- **Code Complexity**: Functions score ≤7 cyclomatic complexity, ≤40 lines, ≤5 parameters (measured and scored by [COMPLICATION.md](./COMPLICATION.md); only complexity over 10 is a Critical check here)
- **Route/Handler Standards**: Explicit status codes and consistent response shapes (Elysia handlers, not controller classes)
- **Logic Quality**: Clear control flow, minimal nesting, appropriate algorithms
- **Documentation**: 100% API documentation coverage for public endpoints
- **Single Source of Truth**: Clear authorities for configuration and data domains, with no conflicting sources.

**Essential Standards (Required)**

- **API Functions**: All functions have proper input validation and type safety
- **Naming Conventions**: Consistent naming across all API functions
- **Response Formats**: Consistent response shape across all endpoints (the `{ data }` success envelope and the `{ code, error, message }` error body in Spernakit and derived apps; see [Stack Applicability](#stack-applicability))
- **Error Handling**: Appropriate status codes and clear error messages
- **Complexity Limits**: Cyclomatic complexity ≤7, function length ≤40 lines (orientation targets; COMPLICATION owns the measurement)

**Architecture Requirements**

- **API Performance**: Query functions <100ms execution time
- **Code Simplicity**: Simplest solution that meets requirements
- **Pattern Consistency**: Uniform patterns reduce cognitive load
- **Maintainability**: Code is easy to understand and modify

## Table of Contents

1. [Pre-Audit Setup](#pre-audit-setup)
2. [API Design Standards](#api-design-standards)
3. [Elysia Route Conventions](#elysia-route-conventions)
4. [Stack Applicability](#stack-applicability)
5. [Target Architectural Rules](#target-architectural-rules)
6. [Code Complexity Assessment](#code-complexity-assessment)
7. [Logic Quality Evaluation](#logic-quality-evaluation)
8. [Audit Checklist](#audit-checklist)
9. [Report Template](#report-template)

## Pre-Audit Setup

### Required Artifact Files

Consult these before forming findings; they anchor what "correct" architecture means for this project:

- `/.aidd/spec.md` - product source of truth. Architectural decisions that contradict the spec (e.g. introducing layers the spec rules out) are high-priority findings.
- `/.aidd/project-structure.md` - declared module boundaries and responsibilities. Architectural drift findings should cite a specific deviation from this file rather than abstract "best practice".
- `/.aidd/assertions.md` - architectural invariants (e.g. "no databases outside `data/`", "every route file registered in the API app assembly"). Every architecture finding should be checked against assertions before being filed.
- The target's agent-instruction file (`AGENTS.md`, or `CLAUDE.md` where a project uses that), including any parent-directory file that applies to it. Where it states architectural rules, they are the authority for [Target Architectural Rules](#target-architectural-rules).
- `/.templateoverrides` (derived Spernakit apps only) - the app's recorded differences from the template. Read it in full before recommending any structural change (see [Derived Spernakit Apps](#derived-spernakit-apps-recorded-differences-and-template-managed-files)).
- `/.aidd/roadmap.json` - milestone scope gate. Architectural patterns intended for unshipped milestones are out-of-scope; do not flag missing scaffolding that is roadmapped for later.
- `/CONTEXT.md` (if present) - domain vocabulary and entity relationships. Architectural findings should use the glossary's entity names when describing modules or boundaries; mismatched naming between code and glossary is itself a finding.

### Required Tools

```bash
# API documentation (Spernakit and derived apps only): the swagger plugin mounted in
# createApiApp serves the OpenAPI spec at /api/v1/docs/json in development mode.
# aidd mounts no OpenAPI endpoint; read its route files and check:api-types instead.

# Code quality tools (Spernakit, derived apps and aidd all define these scripts)
bun run lint          # ESLint with perfectionist plugin
bun run typecheck     # TypeScript type checking
bun run smoke:qc      # Full quality gate (runs check:max-lines - see below)
```

For any other target, read its `package.json` (or equivalent) for the real script names before running anything. Per the methodology gate, a script this audit names is not evidence that the target has it.

> **File-size gate**: `bun run smoke:qc` runs `check:max-lines` (`scripts/check-max-lines.ts`, `MAX_LINES`). This is the authoritative file-size gate. In Spernakit, derived apps and aidd it is a hard 300-line cap with no grandfather list. Some other repositories keep a baseline of files that were over the cap when the gate landed; there the baseline is part of the gate. File-size findings belong to **REORG**, not ARCHITECTURE - preserve the no-double-count boundary with REORG/COMPLICATION (architecture covers structure and boundaries; raw line counts do not move here).

### Verification Commands

```bash
# API route inventory (rg shown; plain grep -r works identically)
rg "new Elysia|\.get\(|\.post\(|\.put\(|\.patch\(|\.delete\(" backend/src/routes/ -g "*.ts"

# Lint warnings (not a complexity report - per-function cyclomatic/length
# metrics come from the COMPLICATION audit tooling, not raw eslint)
bun run lint

# Check route registration against the target's API app assembly
# Spernakit and derived apps: the routePlugins chain in create-api-app.ts
rg "\.use\(" backend/src/create-api-app.ts
# aidd: the route chain in server.ts
rg "\.use\(" backend/src/server.ts

# The enforcing gate in all three (reads the same assembly file)
bun run check:feature-integration
```

## API Design Standards

### API Function Patterns

**MANDATORY: All API functions must have proper input validation and type safety**

✅ **Good: Complete Function Definition**:

```typescript
interface User {
	id: string;
	email: string;
	name: string;
	role: string;
}

async function getUser(userId: string): Promise<User> {
	if (!userId) {
		throw new Error('User ID is required');
	}

	// Drizzle: db.query.users.findFirst({ where: eq(users.id, userId) })
	const user = await db.query.users.findFirst({ where: eq(users.id, userId) });
	if (!user) {
		throw new Error('User not found');
	}
	return user;
}
```

❌ **Bad: Missing Validation**:

```typescript
// ❌ No input validation
async function getUser(userId: any) {
	return await db.query.users.findFirst({ where: eq(users.id, userId) });
}

// ❌ No type safety
async function getUser(userId) {
	return await db.query.users.findFirst({ where: eq(users.id, userId) });
}
```

### Naming Conventions

**Consistent Patterns**:

- **Read Operations**: `get*`, `list*`, `find*` (queries/reads)
- **Write Operations**: `create*`, `update*`, `delete*`, `set*` (mutations/writes)
- **External Actions**: `sync*`, `process*`, `send*` (external integrations)

✅ **Good Examples**:

```typescript
// Read operations
async function getUser(userId: string): Promise<User> {...}
async function listUsers(filters: UserFilters): Promise<User[]> {...}
async function findUserByEmail(email: string): Promise<User | null> {...}

// Write operations
async function createUser(data: CreateUserData): Promise<User> {...}
async function updateUser(userId: string, data: UpdateUserData): Promise<User> {...}
async function deleteUser(userId: string): Promise<void> {...}

// External actions
async function syncExternalData(source: string): Promise<SyncResult> {...}
async function sendNotification(userId: string, message: string): Promise<void> {...}
```

### Response Format Standards

**Use one response shape consistently across all endpoints.**

In Spernakit and derived apps the shape is fixed. The types live in the shared workspace (`shared/src/apiTypes.ts`) and the builders in the backend (`backend/src/utils/apiResponse.ts` and `backend/src/utils/errorResponse.ts`):

- `dataResponse(data)` - returns `{ data }`
- `paginatedResponse(result)` - returns `{ data, limit, page, total }`
- `successResponse()` - returns `{ data: null }` for operations without return data
- Error builders (`notFoundError`, `badRequestError`, `validationError`, `internalError` and the others exported from `errorResponse.ts`) - return `{ code, error, message }` with optional `details` and `requestId`. `code` is an `ErrorCode` value from the shared workspace.

There is no `success` flag in this envelope. A handler that hand-builds an object in one of these shapes instead of calling the builder is a finding; so is a route that returns a different shape.

aidd returns bare typed objects and has no such builders. The requirement there is consistency within the app (see [Stack Applicability](#stack-applicability)).

See the [Elysia Route Conventions](#elysia-route-conventions) section for implementation examples.

### Service-Layer Boundary

**Route handlers delegate to a service; non-trivial business logic does not live inline in `routes/`.**

Business logic is separated from route handlers. This holds for Spernakit, derived apps and aidd, all of which keep a `backend/src/services/` directory. Route files own request/response shaping and validation wiring; the actual work (queries, mutations, external calls, multi-step orchestration) belongs in `services/`. A route handler that performs database access and business rules inline - rather than delegating to a named service function - is an architecture finding.

In aidd one more boundary applies: the database runs in a Bun worker and `backend/src/db/commands.ts` is the only place a transaction is opened. Every multi-statement transaction is a command registered there (`createInProcessCommands`, implemented under `backend/src/db/commands/`). A `db.transaction()` call in a route or service is a finding in aidd. A single-statement write through the Drizzle client in a service (`db.insert(...)`, `db.update(...)`, `db.delete(...)`) is normal there and is not a finding: the client forwards each statement to the worker. Spernakit and derived apps have no worker and no command layer; do not look for one there.

```typescript
// ✅ GOOD: route delegates to a service
app.post('/products', ({ body, set, user }) => {
	set.status = 201;
	return dataResponse(createProduct(body, user!.id)); // logic in productService
});

// ❌ BAD: business logic inline in the route handler
app.post('/products', ({ body }) => {
	const db = getDb();
	// validation, audit logging, multi-step writes... all inline
});
```

### Shared-Contract Single Source of Truth

**Cross-workspace types (response envelopes, enums, error codes) are defined once in the `shared/` workspace; no duplicate divergent definitions exist in backend or frontend.**

The `shared/` workspace is the canonical type-contract source consumed by both backend and frontend. `bun run check:api-types` is the enforcing gate and runs in `smoke:qc`. It is a different check in each repository, so read `scripts/check-api-types.ts` in the target before citing it:

- **Spernakit and derived apps**: it extracts the OpenAPI spec from the Elysia app and validates enum/union consistency between the backend TypeBox schemas and the frontend type definitions.
- **aidd**: it compares the browser API modules with their backend endpoints against an inventory (`scripts/api-type-inventory.json`).

Duplicated, drifting copies of `ErrorCode`, role enums, or response envelope types across workspaces are findings.

### Module Export Standard

**Modules use named exports (no `export default`); barrel files follow the target's documented convention.**

All modules use named exports exclusively. This is enforced by lint in Spernakit, derived apps and aidd. `export default` is a finding.

Barrel rules are a Spernakit convention, stated in the template documents (`docs/template/STACK.md` and `DEVELOPMENT.md` in the Spernakit checkout the project registers): route subdirectories re-export through `index.ts` (e.g. `routes/auth/index.ts`); `components/ui/` uses direct file imports; top-level `hooks/` and `services/` have no barrels. The two documents differ on service subdirectories: STACK.md still lists `services/auth/index.ts` as an example, while DEVELOPMENT.md says new service subdirectories must not add an `index.ts` barrel because the facade file is the public entry point. Apply the DEVELOPMENT.md rule to new code, accept the older service barrels it names, and record the document mismatch once as a template finding. For aidd and other targets, check barrels against the target's own documented convention; where it documents none, do not import Spernakit's.

### Input Validation

**All inputs must be properly validated**:

✅ **Good: Comprehensive Validation**:

```typescript
interface CreateUserData {
	email: string;
	name: string;
	role: 'ADMIN' | 'OPERATOR' | 'VIEWER';
	preferences?: {
		theme: string;
		notifications: boolean;
	};
}

async function createUser(data: CreateUserData): Promise<{ userId: string }> {
	// Validate required fields
	if (!data.email || !data.name || !data.role) {
		throw new Error('Missing required fields');
	}

	// Validate email format
	const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
	if (!emailRegex.test(data.email)) {
		throw new Error('Invalid email format');
	}

	// Validate role
	const validRoles = ['ADMIN', 'OPERATOR', 'VIEWER'];
	if (!validRoles.includes(data.role)) {
		throw new Error('Invalid role');
	}

	// Drizzle insert (illustrative)
	const [created] = await db
		.insert(users)
		.values({ ...data })
		.returning({ id: users.id });

	return { userId: created.id };
}
```

## Elysia Route Conventions

> **Note**: Spernakit, derived apps and aidd all use Elysia (NOT Express, NOT Fastify). Handlers return values directly - there is no `res` object. This section does not apply to a target with a different HTTP framework or none (a CLI, a static site, a mobile app); mark it N/A there with the falsification record the methodology requires.

### Response Standards

**Use a consistent response shape and Elysia's built-in status handling.** Spernakit and derived apps use the `dataResponse` builder and the error builders; aidd returns bare typed objects and is exempt from the specific envelope shape (see [Stack Applicability](#stack-applicability)). The universal requirement is consistency within the app.

✅ **Good: Elysia handler with TypeBox validation** (Spernakit shape; the import paths are relative to a file in `backend/src/routes/`):

```typescript
import { Elysia, t } from 'elysia';

import { dataResponse } from '../utils/apiResponse.ts';
import { notFoundError } from '../utils/errorResponse.ts';

app.get(
	'/users/:id',
	async ({ params, set }) => {
		const user = await userService.getById(params.id);
		if (!user) {
			set.status = 404;
			return notFoundError('User');
		}
		return dataResponse(user);
	},
	{
		params: t.Object({
			id: t.String(),
		}),
	},
);
```

❌ **Bad: Express-style patterns in Elysia**:

```typescript
// ❌ NEVER: No res.status().json() in Elysia
app.get('/users/:id', (req, res) => {
	res.status(200).json({ success: true, data: user });
});
```

### Response Envelope

**Spernakit and derived apps use the response types defined in the shared workspace (`shared/src/apiTypes.ts`, imported as `spernakit-shared`; derived apps keep that package name):**

- `DataResponse<T>` - `{ data: T }`
- `PaginatedResponse<T>` - `{ data: T[], limit, page, total }`
- `SuccessResponse` - `{ data: null }`
- `ErrorResponse` - `{ code, error, message, details?, requestId? }`

Read the live file before scoring; these shapes have changed before and this list is a guide, not the source.

### Error Handling

**Consistent Error Responses with Elysia** (Spernakit shape). `ErrorCode` is a type, not an object: the code values come from the constant groups in `shared/src/errorCodes.ts` (`AUTH_ERROR_CODES`, `RESOURCE_ERROR_CODES`, `SERVER_ERROR_CODES` and the others), and each error builder supplies a default code.

```typescript
import { dataResponse } from '../utils/apiResponse.ts';
import { internalError } from '../utils/errorResponse.ts';

app.post(
	'/posts',
	async ({ body, set, user }) => {
		try {
			const post = await postService.create(body, user!.id);
			set.status = 201;
			return dataResponse(post);
		} catch (err) {
			set.status = 500;
			return internalError();
		}
	},
	{
		body: t.Object({
			content: t.String({ maxLength: 50000 }),
			title: t.String({ minLength: 1, maxLength: 200 }),
		}),
	},
);
```

### Handler Extraction

**Extract handlers >30 lines as named functions co-located in the route file (NOT controller classes - breaks Elysia type chain)**:

```typescript
// ✅ GOOD: Named function in route file
async function handleCreatePost({ body, set, user }: CreatePostContext) {
	// Complex logic here (>30 lines)
	// ...
	set.status = 201;
	return dataResponse(post);
}

app.post('/posts', handleCreatePost, { body: createPostBody });

// ❌ BAD: Controller class (breaks Elysia type chain)
class PostController {
	static create(ctx: any) {
		/* ... */
	}
}
```

### API Versioning

**Spernakit, derived apps and aidd all serve their API under the `/api/v1` prefix**:

```typescript
const apiApp = new Elysia({ prefix: '/api/v1' }).use(authRoutes).use(userRoutes).use(postRoutes);
```

Where the prefix is set differs. Spernakit and derived apps set it once on the app built by `createApiApp`. aidd sets it on each route plugin (`new Elysia({ prefix: '/api/v1/...' })` inside each `create*Routes` function), so in aidd a route plugin that omits the prefix is the thing to look for. A nested route group that takes its prefix as a parameter from the `create*Routes` plugin that mounts it (the `*RouteGroup` functions in `backend/src/routes/`) is not a finding.

> **Applicability**: The `/api/v1` prefix is the convention of these repositories, not a universal requirement. The universal requirement is a stable, documented API surface. Do not flag another target that omits the prefix by design (see [Stack Applicability](#stack-applicability)).

When evolving the API:

- Add new fields to existing endpoints without changing the meaning of existing ones
- Where the target's rules forbid backward-compatibility code (see [Target Architectural Rules](#target-architectural-rules)), a breaking change moves every consumer in the same change. Do not recommend a deprecated-field period, a parallel `/api/v2`, or a compatibility alias for such a target unless its owner has approved one in writing
- For a target with outside consumers and no such rule, mark deprecated fields in the OpenAPI schema annotations and introduce `/api/v2` only when breaking changes are unavoidable
- Spernakit and derived apps: the OpenAPI spec at `/api/v1/docs/json` (development mode only) is the source of truth for the API contract

### REST Resource Design

**Consistent URL patterns**:

```typescript
// Resource collections
app.get('/posts', listPosts); // List with pagination
app.post('/posts', createPost); // Create new

// Specific resources
app.get('/posts/:id', getPost); // Get by ID
app.put('/posts/:id', updatePost); // Full update
app.patch('/posts/:id', patchPost); // Partial update
app.delete('/posts/:id', deletePost); // Soft delete

// Nested resources
app.get('/posts/:id/comments', listPostComments);

// Actions on resources
app.post('/posts/:id/publish', publishPost);
```

### Route Registration

**Every route file in `routes/` MUST be registered through the target's API app assembly.** The invariant is the same everywhere - no orphaned, unregistered route files. Where the assembly lives depends on the target:

- **Spernakit and derived apps**: `backend/src/create-api-app.ts`. Route plugins are `.use()`'d on the `routePlugins` chain there, or reached from it through a registered domain route aggregator (a route `index.ts` that itself `.use()`s the files in its directory, e.g. `routes/auth/index.ts`). A file reachable only through an aggregator is registered; trace the chain before filing.
- **aidd**: `backend/src/server.ts`. Route plugins are exported as `create*Routes` functions and the server `.use()`s each one. Files in `routes/` that export only schemas or helpers for a plugin are not route plugins.
- **Other targets**: find the composition root by reading the entry point. Do not assume either filename.

```typescript
// Spernakit and derived apps: backend/src/create-api-app.ts
const routePlugins = new Elysia({ name: 'routes' })
	.use(authRoutes)
	.use(userRoutes)
	.use(postRoutes) // Every route plugin is .use()'d here or by an aggregator that is
	.use(settingsRoutes);
```

### Page Registration

**Every frontend page in `pages/` MUST be registered through the target's router and reachable from a user path.**

- **Spernakit and derived apps**: page imports live in `frontend/src/routes/lazyPages.ts`; route objects live in `frontend/src/routes/routeGroups.tsx` (settings routes in `frontend/src/routes/settingsRoutes.tsx`). `frontend/src/routes.tsx` only assembles those groups into the browser router, plus the default redirect and the not-found route it already carries. Any other page entry added directly to `routes.tsx` is a finding even though the page renders: it sits outside `ProtectedRoute` and `AppShell`, so it is unguarded and has no app chrome. A derived app on an older template version may not have `routeGroups.tsx` yet; read the app's own `frontend/src/routes/` directory, and treat the gap as release-level template drift owned by [SPERNAKIT.md](./SPERNAKIT.md), not as an architecture finding.
- **aidd**: page imports and routes live in `frontend/src/App.tsx`. Top-level destinations belong in `frontend/src/components/layout/nav-items.ts`; detail, create, report and not-found pages may be reachable through in-page links, redirects or route parameters instead.

`bun run check:feature-integration` enforces the route-file and page-import halves in all three. It does not check that a Spernakit route object sits in the right file, so read `routes.tsx` for stray page entries. Detailed reachability analysis is owned by [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md).

## Stack Applicability

This audit is applied to three kinds of target: the **Spernakit template and the apps derived from it**, **aidd**, and **other projects** (CLIs, static sites, mobile apps, services on another stack). Several rules are conventions of one target only. Identify the target first, apply the column that fits, and do not file findings against a target for omitting a convention it never adopted.

| Rule                          | Spernakit and derived apps                                                                     | aidd                                                                      | Other targets                                     |
| ----------------------------- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------- |
| Response envelope             | Required - `dataResponse` and the error builders (`{ data }`, `{ code, error, message }`)      | Exempt - bare typed objects; require consistency within the app           | Require consistency within the app                |
| `/api/v1` prefix              | Required - set once in `createApiApp`                                                          | Used - set on each route plugin                                           | Not required; require a stable documented surface |
| Shared workspace package      | `spernakit-shared` (derived apps keep the name; `shared/package.json` is a pure template file) | `aidd-shared`                                                             | Whatever the target declares                      |
| API app assembly              | `backend/src/create-api-app.ts` or a registered route aggregator                               | `backend/src/server.ts`                                                   | The target's own composition root                 |
| Page registration             | `routes/lazyPages.ts` + `routes/routeGroups.tsx` + `routes/settingsRoutes.tsx`                 | `frontend/src/App.tsx` + `components/layout/nav-items.ts`                 | The target's own router                           |
| Database write surface        | Drizzle in process, called from services                                                       | Bun worker; transactions only as commands in `backend/src/db/commands.ts` | The target's own data layer                       |
| OpenAPI document              | `/api/v1/docs/json` in development mode                                                        | None mounted                                                              | Only if the target ships one                      |
| Automated tests               | No unit-test framework by design; `crawltest`, `smoke:qc` and integration scripts              | `bun:test` unit tests run in `smoke:qc` and CI                            | The target's own test setup                       |
| Recorded template differences | `.templateoverrides` in each derived app                                                       | Not applicable                                                            | Not applicable                                    |

There is no separate registered "web" variant of Spernakit. Earlier versions of this audit used that label for aidd alone; treat any report that uses it as describing aidd.

**Universal rules** (apply to every Elysia target): input validation and type safety, naming conventions, route-registration invariant (in whichever assembly the target uses), service-layer boundary, shared-contract single-source-of-truth, named-export standard, TypeBox route validation, handler extraction (>30 lines as named functions, never controller classes), and all complexity/logic-quality thresholds. For a target that is not an Elysia application, apply the rules that have a real counterpart (validation at boundaries, naming, one composition root, named exports where the target requires them, complexity and logic quality) and mark the rest N/A with a falsification record.

### Derived Spernakit Apps: Recorded Differences and Template-Managed Files

A derived app records every deliberate difference from the template in `.templateoverrides` at its root. Each line is `ACTION  PATH  # REASON`, where the action is `KEEP`, `SKIP` or `DELETED` (parsed by `loadTemplateOverrides` in the template's `scripts/lib/template/overrides.ts`; the parser accepts an entry with no reason, and no gate requires one). Read the file in full before recommending any structural change to a derived app.

- **A path with an entry is a recorded decision.** Do not recommend overwriting it from the template, moving it, or "realigning" it. Doing so destroys work the app's owner chose to keep. If the reason no longer holds, the finding is against the entry (stale or unjustified reason), and it is owned by [SPERNAKIT.md](./SPERNAKIT.md).
- **A template-managed file is not the app's to restructure.** `check:drift` compares every file the template ships with the app's copy. The classification lives in the template: `scripts/template-manifest.json` lists the `branded` and `infrastructure` files, everything else the template ships is `pure`, and `SECURITY_INFRASTRUCTURE_FILES` in `scripts/lib/template/security.ts` names the security set, which takes precedence over the manifest's `infrastructure` list. Pure files must be byte-identical, branded files identical after name and port substitution, and security infrastructure (`backend/src/routes/auth/index.ts`, `backend/src/create-api-app.ts` and `backend/src/config/configSchemas/security.ts`) fails the gate on drift or removal unless a `.templateoverrides` entry acknowledges it. Infrastructure files (for example `backend/src/app.ts`, `frontend/src/routes.tsx`, navigation) are expected to carry the app's own extensions, but their structure is still the template's. An architecture problem in the template's part of any of these files is a finding against the template. File it once, name the template as the owner, and do not recommend that the derived app split, move or rewrite its copy. The app's own additions inside an infrastructure file are the app's to change.
- **App-owned files** (domain routes, services, pages, schema the app added) are the app's to change. Architecture findings and restructuring recommendations for a derived app belong here.

To tell the three apart, compare the path with the template checkout the project registers and with `.templateoverrides`. Do not infer ownership from the file's content.

### aidd context (Class B)

aidd is a single-user **local CLI + embedded Elysia control panel + spawned agent subprocesses + SQLite single-writer**, with NO multi-tenant / workspace / container / cloud layer. The backend database runs inside a Bun worker and every multi-statement transaction is a command registered in `backend/src/db/commands.ts`. Architecture rules that presuppose multi-tenant request routing, workspace-scoped service boundaries, or a horizontally-scaled API tier are **N/A (by design)** for aidd and should be scored as such rather than as Pass/finding - but only after confirming no degenerate equivalent exists. Marking a SaaS-only control N/A is permitted ONLY after confirming it truly does not exist in aidd; if a degenerate equivalent exists (e.g. the web bearer token in place of RBAC, or the single-writer SQLite handle in place of a connection pool), audit that equivalent.

## Target Architectural Rules

Many targets state architectural rules in their agent-instruction file. Where the target states them, they are requirements, and this audit must agree with them. Read the file, including any parent-directory instruction file that covers the target; do not assume the list below applies to a target that does not state it. The instruction file that covers Spernakit, its derived apps and aidd states all of these:

| Rule                                                                                                 | What to verify                                                                                                                                          | Detailed detection owned by                        |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| Application databases live under `data/` at the application root, never `backend/data/`              | The resolved database path in the config loader or database client, not only the directory listing (Spernakit also gates this with `check:db-location`) | [REORG.md](./REORG.md)                             |
| No placeholder, transitional, dead, backward-compatibility or legacy code unless explicitly approved | Compatibility aliases, dual code paths and "remove later" branches have a recorded approval or are findings                                             | [TECHDEBT.md](./TECHDEBT.md)                       |
| Schema migrations only in development, applied with the aligned code                                 | No transitional or compatibility layer bridges an old and a new schema                                                                                  | [DATABASE.md](./DATABASE.md)                       |
| No new feature-flag surface unless explicitly requested; any flag is wired end to end                | A new flag has a recorded request and a reader on every path it claims to control                                                                       | This audit                                         |
| Every feature is wired end to end; no library code without an immediate consumer                     | Each new service, utility or abstraction has a caller in the same change                                                                                | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md) |
| Every backend route file is registered through the API app assembly                                  | See [Route Registration](#route-registration)                                                                                                           | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md) |
| Every frontend page is registered through the router and reachable from a user path                  | See [Page Registration](#page-registration)                                                                                                             | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md) |
| Every new endpoint has an immediate real consumer (frontend, CLI, webhook sender or integration)     | Each route has a caller; each frontend call has a working backend counterpart                                                                           | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md) |
| No abstractions, services or utilities built for future use                                          | Single-implementation interfaces and one-caller frameworks with no second consumer                                                                      | [REFACTOR.md](./REFACTOR.md)                       |
| Source files stay under 300 lines                                                                    | Read the `check:max-lines` gate and any baseline it carries; do not re-count                                                                            | [REORG.md](./REORG.md)                             |

This audit records an architecture-level violation of a rule (for example a design that depends on a compatibility layer, or a second composition root that bypasses the assembly) and routes instance-level detection to the owning audit so the same issue is not filed twice.

A recommendation this audit makes must itself obey the target's rules. Do not recommend a feature flag, a compatibility shim, a staged dual-path rollout or an abstraction "for later" to a target whose rules forbid them. If the only sound fix conflicts with a rule, say so in the finding and state that it needs the project owner's written approval.

## Code Complexity Assessment

> **Detailed Metrics**: See [COMPLICATION.md](./COMPLICATION.md) for comprehensive complexity analysis including cyclomatic complexity thresholds, function length limits, parameter count guidelines, nesting depth standards, and optimization decision frameworks. COMPLICATION owns the measurement and the compliance targets; the values below are orientation only and are not scored here.

**Quick Reference Targets**:

- **Cyclomatic Complexity**: ≤7 per function
- **Function Length**: ≤40 lines per function
- **Parameter Count**: ≤5 parameters (use object for more)
- **Nesting Depth**: ≤3 levels (use early returns)

## Logic Quality Evaluation

### Control Flow Assessment

**Evaluation Criteria**:

- Logical sequence matches business requirements
- No unreachable code or dead code paths
- Conditional statements make sense in context
- No infinite loops without termination conditions
- Error handling flows logically from failure points

**Scoring** (1-5 scale):

- **5**: Perfect logical flow, no dead code
- **4**: Minor logical inconsistencies
- **3**: Some confusing logic, occasional dead code
- **2**: Multiple logical issues, significant dead code
- **1**: Illogical flow, extensive dead code

### Branching Logic Assessment

**Evaluation Criteria**:

- Nested if-else statements are necessary
- Complex boolean expressions are simplified
- No redundant conditions checked multiple times
- Switch statements used appropriately

**Scoring** (1-5 scale):

- **5**: Optimal branching, clear conditions
- **4**: Minor nesting issues
- **3**: Some complex branching
- **2**: Excessive nesting, complex conditions
- **1**: Deep nesting, unreadable conditions

### Complexity Justification

**Decision Framework**: When is complexity justified?

```
Is the complexity necessary?
├── Does it solve a real, measured problem?
│   ├── YES → Is the problem significant enough?
│   │   ├── YES → Is this the simplest solution?
│   │   │   ├── YES → ✅ JUSTIFIED
│   │   │   └── NO → ❌ OVER-ENGINEERED
│   │   └── NO → ❌ PREMATURE OPTIMIZATION
│   └── NO → ❌ UNNECESSARY
└── Is it required by external constraints?
    ├── YES → ✅ JUSTIFIED
    └── NO → ❌ UNNECESSARY
```

## Audit Checklist

### **Critical Architecture Checks**

#### API Design

- [ ] **Critical**: All API functions have proper input validation
- [ ] **Critical**: All API functions have proper type safety
- [ ] **Critical**: Consistent naming conventions (get*, create*, sync\*)
- [ ] **Critical**: Consistent response shape across endpoints (the `dataResponse` and error-builder envelope in Spernakit and derived apps; see [Stack Applicability](#stack-applicability))
- [ ] **Critical**: Complete input validation
- [ ] **Critical**: Route handlers delegate to a service; non-trivial business logic is not inline in `routes/`
- [ ] **Critical**: Cross-workspace types defined once in `shared/`; no duplicate divergent definitions (`check:api-types` passes, and the auditor has read what that gate checks in this target)
- [ ] **Critical** (aidd): Every multi-statement transaction is a command in `backend/src/db/commands.ts`; no `db.transaction()` in a route or service

#### Elysia Route Standards

- [ ] **Applicability**: The target is identified per [Stack Applicability](#stack-applicability) before any check below is scored; the response-envelope check applies to Spernakit and derived apps, and aidd is exempt from the envelope shape only
- [ ] **Critical**: Responses use a consistent shape (`dataResponse` and the error builders in Spernakit and derived apps)
- [ ] **Critical**: All routes use TypeBox schemas for input validation (`t.Object()`)
- [ ] **Critical**: Consistent error handling (Spernakit and derived apps: the error builders, with `ErrorCode` values from the shared workspace)
- [ ] **Critical**: Handlers >30 lines extracted as named functions (NOT controller classes)
- [ ] **Critical**: Every route file registered through the target's API app assembly (Spernakit and derived apps: `create-api-app.ts` or a registered route aggregator; aidd: `server.ts`)
- [ ] **Critical**: Every page registered through the target's router and reachable from a user path (Spernakit and derived apps: `routes/lazyPages.ts` and `routes/routeGroups.tsx` or `settingsRoutes.tsx`, with no stray page entry in `routes.tsx`; aidd: `App.tsx`)
- [ ] **Critical**: Endpoints use the `/api/v1` prefix (Spernakit, derived apps and aidd; not required of other targets)

#### Target Rules and Ownership

- [ ] **Critical**: The target's stated architectural rules were read, and each architecture-level violation is recorded or routed to its owning audit (see [Target Architectural Rules](#target-architectural-rules))
- [ ] **Critical** (derived Spernakit apps): `.templateoverrides` was read in full; no recommendation overwrites, moves or realigns a path that has an entry
- [ ] **Critical** (derived Spernakit apps): No recommendation restructures the template's part of a template-managed file; such findings name the template as owner
- [ ] **High**: No recommendation in the report proposes a feature flag, compatibility layer or future-use abstraction to a target whose rules forbid it

#### Backend Function Standards

- [ ] **Critical**: All functions have input validation
- [ ] **Critical**: All functions have explicit return types
- [ ] **Critical**: Consistent use of `throw new Error()` for failures
- [ ] **Critical**: Authentication checks on protected functions
- [ ] **Critical**: Authorization checks where needed (user ownership, roles)

#### Code Complexity

Measured and scored by [COMPLICATION.md](./COMPLICATION.md), which sets the compliance targets. Record here only what an architecture reader needs:

- [ ] **Critical**: No functions with complexity >10 (cite the COMPLICATION finding where one exists)
- [ ] **High**: Functions outside the orientation targets (≤7 cyclomatic complexity, ≤40 lines, ≤5 parameters, nesting ≤3) are routed to COMPLICATION, not filed here

### **High Priority Architecture Checks**

#### API Quality

- [ ] **High**: 100% API documentation coverage
- [ ] **High**: Clear error messages for all failure cases
- [ ] **High**: Consistent parameter structures across similar functions
- [ ] **High**: API performance <100ms for queries. This needs a measurement with an instrument record (methodology Phase 0); without one, report it as not measured and do not tick it
- [ ] **High**: Proper authentication/authorization checks (aidd: the bearer-token guard and the loopback-versus-forwarded decision stand in for role checks)

#### Code Organization

- [ ] **High**: Single responsibility per function
- [ ] **High**: Appropriate abstraction levels
- [ ] **High**: No duplicate logic across functions
- [ ] **High**: Clear separation of concerns
- [ ] **High**: Consistent patterns across similar code
- [ ] **High**: Named exports only (no `export default`); barrels follow the target's documented convention (Spernakit and derived apps: the template documents)
- [ ] **High**: Manual `React.memo`/`useMemo`/`useCallback` not used unless profiling proves a React Compiler miss - detailed enforcement DEFERS to [REACT_BEST_PRACTICES.md](./REACT_BEST_PRACTICES.md)

#### Logic Quality

- [ ] **High**: No dead code or unreachable paths
- [ ] **High**: Logical flow matches business requirements
- [ ] **High**: Simplified boolean expressions
- [ ] **High**: Early returns instead of deep nesting
- [ ] **High**: Appropriate use of switch vs if-else

### **Medium Priority Architecture Checks**

#### Documentation

- [ ] **Medium**: Function purposes clearly documented
- [ ] **Medium**: Complex algorithms explained
- [ ] **Medium**: Business rules documented
- [ ] **Medium**: API usage examples provided
- [ ] **Medium**: Error conditions documented

#### Maintainability

- [ ] **Medium**: Code is self-documenting
- [ ] **Medium**: Variable names are descriptive
- [ ] **Medium**: Functions are testable
- [ ] **Medium**: Dependencies are minimal
- [ ] **Medium**: Code follows DRY principle

## Report Template

This audit defines no rubric for an overall score or for per-area scores out of 25, so it does not produce them. Write the overall score as `N/A` and let the severity counts and the findings carry the result. Do not derive a number from checklist ticks or from a green gate. The two Logic Quality scores keep their 1-5 scale because [Logic Quality Evaluation](#logic-quality-evaluation) defines how to assign them.

Every location in the report is the live `file:line` read during this audit, with the symbol name beside it. This document names symbols and files, not line numbers, because line numbers move; do not copy a location from an earlier report without re-reading the file.

The report must also carry the sections [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) requires: the instrument validation table, the methodology validity summary and the falsification records. Every "not applicable" disposition, including each Spernakit-specific rule set aside for another target, needs a falsification record.

```markdown
# Architecture Audit Report - YYYY-MM-DD

## Executive Summary

**Target**: [Spernakit template | derived Spernakit app | aidd | other - name it]
**Overall Architecture Score**: N/A (this audit defines no scoring rubric)
**Logic Quality**: Control Flow [1-5], Branching [1-5]

**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]

### Key Findings

- [API design assessment]
- [Code complexity evaluation]
- [Logic quality analysis]
- [Route/handler standards review]

## API Design Analysis

### API Functions

- **Total Functions**: [Number]
- **With Input Validation**: [Percentage]%
- **With Type Safety**: [Percentage]%
- **Naming Consistency**: [Percentage]%
- **Documentation Coverage**: [Percentage]%

### Response Formats

- **Standardized Responses**: [Percentage]%
- **Explicit Status Codes**: [Percentage]%
- **Error Handling Consistency**: [Percentage]%

## Code Complexity Summary

Report a quick-reference complexity snapshot against the targets (≤7 CC, ≤40 lines, ≤5 params, ≤3 nesting). Detailed per-function cyclomatic/length/parameter/nesting scoring and refactoring priorities are produced by the COMPLICATION audit - do not duplicate the full metric tables here; cite COMPLICATION findings and route structural file-size concerns to REORG to avoid double-counting.

- **Functions over CC 10**: [Number] (Critical - list in findings)
- **Functions over 40 lines**: [Number]
- **Functions over 5 params**: [Number]
- **Detailed metrics**: see COMPLICATION audit report

## Logic Quality Assessment

### Control Flow

- **Score**: [1-5]
- **Dead Code Found**: [Number] instances
- **Unreachable Paths**: [Number] instances
- **Logical Inconsistencies**: [Number] instances

### Branching Logic

- **Score**: [1-5]
- **Deep Nesting**: [Number] instances
- **Complex Conditions**: [Number] instances
- **Redundant Checks**: [Number] instances

## Detailed Findings

### Critical Issues 🚨

| Issue | Category               | Location    | Complexity | Impact   | Remediation | Timeline |
| ----- | ---------------------- | ----------- | ---------- | -------- | ----------- | -------- |
| [ID]  | [API/Complexity/Logic] | [File:Line] | [Score]    | [Impact] | [Fix]       | [Days]   |

### High Priority Issues ⚠️

| Issue | Category               | Location    | Complexity | Impact   | Remediation | Timeline |
| ----- | ---------------------- | ----------- | ---------- | -------- | ----------- | -------- |
| [ID]  | [API/Complexity/Logic] | [File:Line] | [Score]    | [Impact] | [Fix]       | [Days]   |

## Recommendations

### Immediate Actions (0-7 days)

1. [Critical complexity issues]
2. [Missing validators]
3. [Deep nesting refactoring]

### Short-term Actions (1-4 weeks)

1. [API documentation completion]
2. [Function length reduction]
3. [Logic simplification]

### Long-term Actions (1-3 months)

1. [Architecture pattern standardization]
2. [Complexity monitoring automation]

## Template-Owned Findings (derived Spernakit apps)

| Issue | Template file | Why it belongs to the template | `.templateoverrides` entry |
| ----- | ------------- | ------------------------------ | -------------------------- |
| [ID]  | [path]        | [reason]                       | [none / ACTION + reason]   |

## Next Steps

1. **Immediate**: Fix all functions with complexity >10
2. **Week 1**: Add missing validators to all backend functions
3. **Week 2**: Refactor functions >60 lines
4. **Month 1**: Complete API documentation
5. **Quarter**: Implement automated complexity monitoring

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Deliverables

### Required Outputs

- **Architecture Assessment Report**: Comprehensive analysis of current architecture
- **API Design Review**: Consistency and documentation evaluation
- **Complexity Analysis**: Detailed complexity metrics and refactoring priorities
- **Logic Quality Report**: Control flow and branching assessment
- **Refactoring Plan**: Prioritized list of improvements with effort estimates

### Success Criteria

Architecture-level criteria scored here:

- **100% API functions** have proper validation and type safety
- **100% API documentation** coverage
- **Consistent patterns** across all code

Numeric complexity / length / parameter thresholds (≤7 CC, ≤40 lines, ≤5 params, and the like) **DEFER to [COMPLICATION.md](./COMPLICATION.md)** - score them there, not here, to avoid double-counting. The Quick-Reference orientation targets above remain for orientation only.

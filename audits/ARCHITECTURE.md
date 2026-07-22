---
title: 'Architecture, API Design, and Code Complexity Audit'
last_updated: '2026-06-28'
version: '3.2'
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
- **Code Complexity**: Functions score ≤7 cyclomatic complexity, ≤40 lines, ≤5 parameters
- **Route/Handler Standards**: Explicit status codes and consistent response shapes (Elysia handlers, not controller classes)
- **Logic Quality**: Clear control flow, minimal nesting, appropriate algorithms
- **Documentation**: 100% API documentation coverage for public endpoints
- **Single Source of Truth**: Clear authorities for configuration and data domains, with no conflicting sources.

**Essential Standards (Required)**

- **API Functions**: All functions have proper input validation and type safety
- **Naming Conventions**: Consistent naming across all API functions
- **Response Formats**: Consistent response shape across all endpoints (the `{ success, message?, data? }` envelope in full Spernakit apps; see [Stack Applicability](#stack-applicability))
- **Error Handling**: Appropriate status codes and clear error messages
- **Complexity Limits**: Cyclomatic complexity ≤7, function length ≤40 lines

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
5. [Code Complexity Assessment](#code-complexity-assessment)
6. [Logic Quality Evaluation](#logic-quality-evaluation)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)

## Pre-Audit Setup

### Required Artifact Files

Consult these before forming findings; they anchor what "correct" architecture means for this project:

- `/.aidd/spec.md` - product source of truth. Architectural decisions that contradict the spec (e.g. introducing layers the spec rules out) are high-priority findings.
- `/.aidd/project-structure.md` - declared module boundaries and responsibilities. Architectural drift findings should cite a specific deviation from this file rather than abstract "best practice".
- `/.aidd/assertions.md` - architectural invariants (e.g. "no databases outside `data/`", "every route registered in `create-api-app.ts`"). Every architecture finding should be checked against assertions before being filed.
- `/.aidd/roadmap.json` - milestone scope gate. Architectural patterns intended for unshipped milestones are out-of-scope; do not flag missing scaffolding that is roadmapped for later.
- `/CONTEXT.md` (if present) - domain vocabulary and entity relationships. Architectural findings should use the glossary's entity names when describing modules or boundaries; mismatched naming between code and glossary is itself a finding.

### Required Tools

```bash
# API documentation (Elysia generates OpenAPI spec automatically)
# Access at /api/v1/docs/json in development mode

# Code quality tools (already configured in Spernakit)
bun run lint          # ESLint with perfectionist plugin
bun run typecheck     # TypeScript type checking
bun run smoke:qc      # Full quality gate (runs check:max-lines — see below)
```

> **File-size gate**: `bun run smoke:qc` runs `check:max-lines`, a hard **300-line cap with no exemptions**. This is the authoritative file-size gate. File-size findings belong to **REORG**, not ARCHITECTURE - preserve the no-double-count boundary with REORG/COMPLICATION (architecture covers structure and boundaries; raw line counts do not move here).

### Verification Commands

```bash
# API route inventory (rg shown; plain grep -r works identically)
rg "new Elysia|\.get\(|\.post\(|\.put\(|\.patch\(|\.delete\(" backend/src/routes/ -g "*.ts"

# Lint warnings (not a complexity report — per-function cyclomatic/length
# metrics come from the COMPLICATION audit tooling, not raw eslint)
bun run lint

# Check route registration against the app's API-app assembly file
# (create-api-app.ts in canonical Spernakit, server.ts in spernakit-web apps)
rg "\.use\(" backend/src/create-api-app.ts backend/src/server.ts
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

**Use the shared response types from `shared/` workspace consistently across all endpoints.**

- `dataResponse(data)` - wraps data in `{ success: true, data }`
- `paginatedResponse(data, pagination)` - includes pagination metadata
- `successResponse(message)` - for operations without return data
- `errorResponse(code, message)` - standardized error format

See the [Elysia Route Conventions](#elysia-route-conventions) section for implementation examples.

### Service-Layer Boundary

**Route handlers delegate to a service; non-trivial business logic does not live inline in `routes/`.**

Per the Spernakit service-layer pattern, business logic is separated from route handlers. Route files own request/response shaping and validation wiring; the actual work (queries, mutations, external calls, multi-step orchestration) belongs in `services/`. A route handler that performs database access and business rules inline - rather than delegating to a named service function - is an architecture finding.

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

The `shared/` workspace is the canonical type-contract source consumed by both backend and frontend. `bun run check:api-types` is the enforcing gate (mandatory in `smoke:qc`) - it validates enum/union consistency between the OpenAPI spec (backend TypeBox schemas) and frontend type definitions. Duplicated, drifting copies of `ErrorCode`, role enums, or response envelope types across workspaces are findings.

### Module Export Standard

**Modules use named exports (no `export default`); barrel files follow the STACK.md convention.**

Per Module Export Standards, all modules use named exports exclusively. Barrels (`index.ts`) re-export in subdirectories where the convention calls for them (e.g., `services/auth/`, `routes/auth/`), with documented exceptions (`components/ui/` uses direct file imports; top-level `hooks/`/`services/` have no barrels). `export default` and undocumented barrels are findings. This is enforced by lint.

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

> **Note**: Spernakit uses Elysia (NOT Express, NOT Fastify). Handlers return values directly - there is no `res` object.

### Response Standards

**Use a consistent response shape and Elysia's built-in status handling.** Full Spernakit apps use the shared `dataResponse`/`errorResponse` envelope; spernakit-web / minimal-API apps that return bare typed objects are exempt from the specific envelope shape (see [Stack Applicability](#stack-applicability)). The universal requirement is consistency within the app.

✅ **Good: Elysia handler with TypeBox validation**:

```typescript
import { Elysia, t } from 'elysia';
// from the app's shared workspace package (e.g. spernakit-shared, aidd-shared)
import { dataResponse, errorResponse } from '~shared';

app.get(
	'/users/:id',
	async ({ params, set }) => {
		const user = await userService.getById(params.id);
		if (!user) {
			set.status = 404;
			return errorResponse('USER_NOT_FOUND', 'User not found');
		}
		return dataResponse(user);
	},
	{
		params: t.Object({
			id: t.String(),
		}),
	}
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

**Spernakit uses standardized response types from `shared/` workspace:**

- `DataResponse<T>` - `{ success: true, data: T }`
- `PaginatedResponse<T>` - `{ success: true, data: T[], pagination: {...} }`
- `SuccessResponse` - `{ success: true, message: string }`
- `ErrorResponse` - `{ success: false, error: { code, message } }`

### Error Handling

**Consistent Error Responses with Elysia**:

```typescript
// from the app's shared workspace package (e.g. spernakit-shared, aidd-shared)
import { ErrorCode } from '~shared';

app.post(
	'/posts',
	async ({ body, set, user }) => {
		try {
			const post = await postService.create(body, user!.id);
			set.status = 201;
			return dataResponse(post);
		} catch (err) {
			set.status = 500;
			return errorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to create post');
		}
	},
	{
		body: t.Object({
			content: t.String({ maxLength: 50000 }),
			title: t.String({ minLength: 1, maxLength: 200 }),
		}),
	}
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

**Canonical Spernakit API endpoints use the `/api/v1` prefix**:

```typescript
const apiApp = new Elysia({ prefix: '/api/v1' }).use(authRoutes).use(userRoutes).use(postRoutes);
```

> **Applicability**: The `/api/v1` prefix is the canonical-Spernakit convention, not a universal requirement. The universal requirement is a stable, documented API surface. Do not flag spernakit-web / minimal-API apps that omit the prefix by design (see [Stack Applicability](#stack-applicability)).

When evolving the API:

- Add new fields to existing endpoints (backward compatible)
- Mark deprecated fields in OpenAPI schema annotations
- Only introduce `/api/v2` when breaking changes are unavoidable
- The OpenAPI spec at `/api/v1/docs/json` is the source of truth for the API contract

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

**Every route file in `routes/` MUST be registered in the app's API-app assembly file** (`create-api-app.ts` in canonical Spernakit; `server.ts` in spernakit-web apps). The invariant is the same - no orphaned, unregistered route files; only the filename differs by app type.

```typescript
// backend/src/create-api-app.ts
export function createApiApp() {
	return new Elysia({ prefix: '/api/v1' })
		.use(authRoutes)
		.use(userRoutes)
		.use(postRoutes) // Every route file must be .use()'d here
		.use(settingsRoutes);
}
```

## Stack Applicability

Several rules in this audit are conventions of **canonical Spernakit** (the full template). **spernakit-web / minimal-API derivatives** (e.g. `aidd`) deliberately diverge from some of them. Apply stack-divergent rules according to the app type below; do not file findings against a derivative for omitting a convention it never adopted.

| Rule                                               | Canonical Spernakit                            | spernakit-web / minimal-API                                             |
| -------------------------------------------------- | ---------------------------------------------- | ----------------------------------------------------------------------- |
| Response envelope (`dataResponse`/`errorResponse`) | Required - shared `{ success, data }` envelope | Exempt - bare typed objects allowed; require only intra-app consistency |
| `/api/v1` prefix                                   | Required                                       | Exempt if omitted by design; require a stable documented surface        |
| Shared workspace package name                      | `spernakit-shared`                             | App-renamed (e.g. `aidd-shared`); use the `~shared` alias generically   |
| API-app assembly file                              | `backend/src/create-api-app.ts`                | `backend/src/server.ts`                                                 |

**Universal rules** (apply to all app types regardless of stack): input validation and type safety, naming conventions, route-registration invariant (in whichever assembly file the app uses), service-layer boundary, shared-contract single-source-of-truth, named-export standard, TypeBox route validation, handler extraction (>30 lines as named functions, never controller classes), and all complexity/logic-quality thresholds.

### aidd context (Class B)

aidd is a single-user **local CLI + embedded Elysia control panel + spawned agent subprocesses + SQLite single-writer**, with NO multi-tenant / workspace / container / cloud layer. Architecture rules that presuppose multi-tenant request routing, workspace-scoped service boundaries, or a horizontally-scaled API tier are **N/A (by design)** for aidd and should be scored as such rather than as Pass/finding - but only after confirming no degenerate equivalent exists. Marking a SaaS-only control N/A is permitted ONLY after confirming it truly does not exist in aidd; if a degenerate equivalent exists (e.g. the web bearer token in place of RBAC, or the single-writer SQLite handle in place of a connection pool), audit that equivalent.

## Code Complexity Assessment

> **Detailed Metrics**: See [COMPLICATION.md](./COMPLICATION.md) for comprehensive complexity analysis including cyclomatic complexity thresholds, function length limits, parameter count guidelines, nesting depth standards, and optimization decision frameworks.

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
- [ ] **Critical**: Consistent response shape across endpoints (shared envelope in full Spernakit; see [Stack Applicability](#stack-applicability))
- [ ] **Critical**: Complete input validation
- [ ] **Critical**: Route handlers delegate to a service; non-trivial business logic is not inline in `routes/`
- [ ] **Critical**: Cross-workspace types defined once in `shared/`; no duplicate divergent definitions (`check:api-types` passes)

#### Elysia Route Standards

- [ ] **Applicability**: Response-envelope and `/api/v1` checks below apply to full Spernakit apps; spernakit-web / minimal-API apps are exempt per [Stack Applicability](#stack-applicability)
- [ ] **Critical**: Responses use a consistent shape (shared `dataResponse`/`errorResponse` in full Spernakit apps)
- [ ] **Critical**: All routes use TypeBox schemas for input validation (`t.Object()`)
- [ ] **Critical**: Consistent error handling with `ErrorCode` from the shared workspace
- [ ] **Critical**: Handlers >30 lines extracted as named functions (NOT controller classes)
- [ ] **Critical**: Every route file registered in the app's API-app assembly file (`create-api-app.ts`, or `server.ts` in spernakit-web apps)
- [ ] **Critical**: Endpoints use the `/api/v1` prefix (canonical Spernakit; exempt for spernakit-web apps that omit it by design)

#### Backend Function Standards

- [ ] **Critical**: All functions have input validation
- [ ] **Critical**: All functions have explicit return types
- [ ] **Critical**: Consistent use of `throw new Error()` for failures
- [ ] **Critical**: Authentication checks on protected functions
- [ ] **Critical**: Authorization checks where needed (user ownership, roles)

#### Code Complexity

- [ ] **Critical**: All functions ≤7 cyclomatic complexity
- [ ] **Critical**: All functions ≤40 lines
- [ ] **Critical**: All functions ≤5 parameters (or use object)
- [ ] **Critical**: Nesting depth ≤3 levels
- [ ] **Critical**: No functions with complexity >10

### **High Priority Architecture Checks**

#### API Quality

- [ ] **High**: 100% API documentation coverage
- [ ] **High**: Clear error messages for all failure cases
- [ ] **High**: Consistent parameter structures across similar functions
- [ ] **High**: API performance <100ms for queries
- [ ] **High**: Proper authentication/authorization checks

#### Code Organization

- [ ] **High**: Single responsibility per function
- [ ] **High**: Appropriate abstraction levels
- [ ] **High**: No duplicate logic across functions
- [ ] **High**: Clear separation of concerns
- [ ] **High**: Consistent patterns across similar code
- [ ] **High**: Named exports only (no `export default`); barrels follow the STACK.md convention
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

```markdown
# Architecture Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Architecture Score**: [Score]/100
**API Design Score**: [Score]/25
**Code Complexity Score**: [Score]/25
**Logic Quality Score**: [Score]/25
**Route/Handler Standards Score**: [Score]/25

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
3. [Team training on best practices]

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

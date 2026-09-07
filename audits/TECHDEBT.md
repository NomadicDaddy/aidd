---
title: 'Technical Debt Audit Specification'
last_updated: '2026-08-30'
version: '2.4'
category: 'Core Quality'
priority: 'High'
estimated_time: '30-60 min'
frequency: 'Quarterly'
lifecycle: 'any'
---

# Technical Debt Audit Specification

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

> **Validated against the current Spernakit v3 manifests (React 19.2, Vite 8, Bun 1.4).**

> **Applicability tiers**: This audit serves two app shapes. **Full-stack apps** (ship the Spernakit auth/RBAC/workspace/notification layer) apply every rule, including the auth/admin/role-check remediation examples. **Web-layer apps** (e.g. aidd - no auth/RBAC/workspace surface) skip all auth/RBAC/workspace/role-check examples entirely; they are guidance for full-stack apps, not universal detection rules. Determine the tier before scoring and do not file findings for surfaces the app does not ship.

## Executive Summary

**🎯 Critical Priorities**

- **Zero deprecated code in production**: All `@deprecated` markers, past-due migration shims, and legacy aliases that create source-of-truth drift must be tracked and resolved. A bare `TODO`/`FIXME` with no removal deadline and no canonical replacement is NOT a CRITICAL finding (see the Legacy Alias Threshold gate in Category 1).
- **Zero placeholder/mock data in production paths**: Hardcoded data, artificial delays, and stub implementations must be replaced with real functionality
- **Stack compliance**: Stack drift (wrong libraries, wrong patterns) is owned by [SPERNAKIT](./SPERNAKIT.md) and [CODE_QUALITY](./CODE_QUALITY.md) - TECHDEBT only points to them, it does not re-detect

**📋 Essential Standards (Required)**

- **Categorization boundaries**: Every finding must fit exactly one of the 6 categories - if it could fit multiple, use the highest-priority match
- **Evidence-backed findings**: Every finding must include file path, line number, the specific pattern detected, and the recommended remediation
- **Cross-audit awareness**: TECHDEBT focuses on manual pattern detection; defer automated dead code detection to [HYGIENE](./HYGIENE.md), manual file tracing to [DEAD_CODE](./DEAD_CODE.md), and stack drift to [SPERNAKIT](./SPERNAKIT.md)

**Detection Categories**

TECHDEBT's two **primary, uniquely-owned** deliverables are Category 1 and Category 4. The remaining categories are **defer-stubs** that route to companion audits and only cover manual edge cases those tools miss.

- **Legacy/Deprecated** (🚨 CRITICAL - primary): `@deprecated` markers, past-due migration code, or aliases that preserve completed migrations and create source-of-truth drift. Bare TODO/FIXME without a deadline or canonical replacement is not CRITICAL.
- **Placeholder/Mock** (⚠️ HIGH - primary): Hardcoded data, simulated delays, stub implementations in production paths
- **Unused/Dead Code** (defer-stub → HYGIENE/DEAD_CODE): Manual edge-case verification only
- **Duplicated Functionality** (defer-stub → HYGIENE/JSCPD): Semantic duplication only
- **Architectural Inconsistencies** (defer-stub → SPERNAKIT): Mixed server-data strategies; stack drift defers to SPERNAKIT
- **Code Quality Issues** (defer-stub → CODE_QUALITY): `any` types and naming only

## Table of Contents

1. [Relationship to Other Audits](#relationship-to-other-audits)
2. [Technical Debt Categorization Flowchart](#technical-debt-categorization-flowchart)
3. [Audit Objectives](#audit-objectives)
4. [Audit Categories with Clear Boundaries](#audit-categories-with-clear-boundaries)
5. [Technical Debt Decision Matrix](#technical-debt-decision-matrix)
6. [Specific Detection Patterns](#specific-detection-patterns)
7. [Spernakit Stack Violation Patterns](#spernakit-stack-violation-patterns)
8. [Known False Positive Patterns](#known-false-positive-patterns)
9. [Pre-Audit Setup](#pre-audit-setup)
10. [Technical Standards](#technical-standards)
11. [Deliverables](#deliverables)
12. [Focus Areas](#focus-areas)
13. [Success Criteria](#success-criteria)
14. [Companion Audits](#companion-audits)

## Relationship to Other Audits

TECHDEBT is the **manual pattern-detection audit** that complements automated tool-driven audits. It focuses on semantic analysis that automated tools cannot perform.

| Concern                       | TECHDEBT covers                                          | Defer to                                                                  |
| ----------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------- |
| Unused files/exports/deps     | Only manual verification of edge cases                   | [HYGIENE.md](./HYGIENE.md) - Knip automated detection                     |
| Dead code (file-level)        | Manual import tracing for ambiguous cases                | [DEAD_CODE.md](./DEAD_CODE.md) - file-by-file analysis                    |
| Code duplication              | Only semantic duplication (same purpose, different impl) | [HYGIENE.md](./HYGIENE.md) - JSCPD automated detection                    |
| Stack drift                   | Anti-pattern detection (wrong libraries, wrong patterns) | [SPERNAKIT.md](./SPERNAKIT.md) - template diff analysis                   |
| Structural complexity         | Not covered                                              | [REORG.md](./REORG.md) - module reorganization / structural complexity    |
| Feature reachability          | Not covered                                              | [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md) - entrypoint traversal |
| Code quality (lint, ordering) | Only type violations (`any`) and naming                  | [CODE_QUALITY.md](./CODE_QUALITY.md) - lint, ordering, comments           |

### Deduplication Guidance

- **If HYGIENE has already run**: Skip Category 2 (Unused/Dead Code) and Category 3 (Duplicated Functionality) automated detection - focus only on manual pattern analysis that HYGIENE cannot detect
- **If SPERNAKIT has already run**: Skip the "Spernakit Stack Anti-Patterns" section - SPERNAKIT covers stack drift more thoroughly via template diff
- **Unique TECHDEBT value (primary deliverables)**: Category 1 (legacy/deprecation-with-evidence) and Category 4 (placeholder/mock detection). Everything else is a defer-stub - stack drift and React Compiler conflicts route to SPERNAKIT/CODE_QUALITY, dead code/duplication to HYGIENE/DEAD_CODE, structural to REORG.

## Technical Debt Categorization Flowchart

```
Code Element Identified
├── Is it actively used?
│   ├── NO → Category 2: Unused/Dead Code (HIGH priority)
│   │         NOTE: Defer bulk detection to HYGIENE (Knip)
│   └── YES → Continue evaluation
├── Is it deprecated or marked for removal?
│   ├── YES → Category 1: Legacy/Deprecated Code (CRITICAL priority)
│   └── NO → Continue evaluation
├── Is it placeholder/mock/hardcoded data?
│   ├── YES → Category 4: Placeholder/Mock Code (HIGH priority)
│   └── NO → Continue evaluation
├── Does similar functionality exist elsewhere?
│   ├── YES → Category 3: Duplicated Functionality (MEDIUM priority)
│   │         NOTE: Defer bulk detection to HYGIENE (JSCPD)
│   └── NO → Continue evaluation
├── Does it follow project patterns consistently?
│   ├── NO → Category 5: Architectural Inconsistencies (MEDIUM priority)
│   └── YES → Continue evaluation
├── Does it meet code quality standards?
│   ├── NO → Category 6: Code Quality Issues (LOW-MEDIUM priority)
│   └── YES → No technical debt detected
```

**When multiple categories apply**: Use the highest-priority match. Document all contributing factors in the finding description.

## Audit Objectives

Identify and catalog technical debt for removal or refactoring. This specification provides a systematic approach for code quality improvement with clear categorization boundaries and detection criteria.

## Audit Categories with Clear Boundaries

### 1. Legacy/Deprecated Code (🚨 CRITICAL Priority)

**Definition**: Code explicitly marked as deprecated, outdated, or scheduled for removal.

**Clear Boundaries**:

- ✅ **Include**: Code with `@deprecated` markers, explicit version comments, or aliases that preserve a superseded API after the replacement is already the canonical source of truth
- ✅ **Include (gated)**: A `TODO`/`FIXME` marker ONLY when it carries a removal deadline OR names a canonical replacement (same gate as the Legacy Alias Threshold below). A bare `TODO`/`FIXME` is a backlog note, not CRITICAL tech debt.
- ❌ **Exclude**: Bare `TODO`/`FIXME` with no removal deadline and no canonical replacement - track in the backlog, do not file as a CRITICAL finding
- ❌ **Exclude**: Working code that uses older but still supported patterns
- ❌ **Exclude**: Rename-only churn, harmless compatibility aliases, and names containing "legacy" that do not preserve a past-due migration, duplicate a canonical type/source, or create concrete drift risk

**Detection Patterns**:

```typescript
// ✅ DETECT: Explicit deprecation markers
/**
 * @deprecated Use newFunction() instead
 */
function oldFunction() { }

// TODO: Remove after the v2 cutover ships (2026-Q3) — has a deadline, so DETECT
const legacyAuth = useOldAuth();

// ❌ DON'T DETECT as CRITICAL: bare marker, no deadline, no canonical replacement → backlog note
// TODO: revisit pagination later
// FIXME: tidy this up someday

// ✅ DETECT: Version-specific comments
// Remove after v2.0 migration
// Legacy support for pre-v1.5 users

// ✅ DETECT: Explicit naming patterns with removal evidence
// Requires a deprecation marker, migration deadline, or canonical replacement.
const legacyUserService = new LegacyUserService();
const deprecatedComponent = <OldButton />;
```

#### Legacy Alias Threshold

Do not file a TECHDEBT finding just because a type, function, or file name contains
"legacy", "old", "alias", or an earlier domain term. Flag a legacy alias only when
at least one of these is true:

- The alias duplicates a canonical type or utility that has already moved to the shared/source-of-truth layer.
- The alias preserves a compatibility surface after its documented migration deadline.
- The alias causes cross-workspace, API-contract, or schema drift because consumers keep importing the old name.
- The alias blocks removal of deprecated code or forces new code to support two names for the same concept.

Default severity is LOW for rename-only cleanup with no runtime impact. Escalate to
MEDIUM/HIGH only when the alias causes real source-of-truth drift, blocks migration
completion, or creates security/authorization ambiguity.

> **Cross-audit note**: Database files in the wrong location (`backend/data/` instead of project-root `data/`) are a **structural** violation owned by [REORG.md](./REORG.md), not TECHDEBT. If observed during a TECHDEBT sweep, route it to REORG rather than filing it here.

**Severity Assessment**:

- **CRITICAL**: Blocks future upgrades or has security implications
- **HIGH**: Affects maintainability or performance
- **MEDIUM**: Cosmetic or documentation issues

### 2. Unused/Dead Code (defer-stub → HYGIENE / DEAD_CODE)

> **Defer-stub**: Automated bulk detection of unused files, exports, and dependencies is owned by [HYGIENE.md](./HYGIENE.md) (Knip) and file-by-file import tracing by [DEAD_CODE.md](./DEAD_CODE.md). TECHDEBT does **not** re-run this detection.

**TECHDEBT covers only the manual edge cases automated tools miss**: ambiguous dynamic/conditional imports, and framework registration patterns (`.use()` in `create-api-app.ts`, `lazy()` in `routes.tsx`) that Knip cannot statically resolve. If you suspect dead code outside those edge cases, route it to HYGIENE/DEAD_CODE rather than filing it here.

### 3. Duplicated Functionality (defer-stub → HYGIENE)

> **Defer-stub**: Automated clone detection is owned by [HYGIENE.md](./HYGIENE.md) (JSCPD). TECHDEBT does **not** re-run this detection.

**TECHDEBT covers only semantic duplication** - two functions that serve the same business purpose but differ enough in implementation that JSCPD won't flag them (e.g. `formatUserName` and `formatFullName` returning the same value via different field access). Token-level copy-paste belongs to HYGIENE. Consolidate when functions share the same business purpose with only parameter or field-access differences.

### 4. Placeholder/Mock/Simulated Code (⚠️ HIGH Priority - primary)

**Definition**: Temporary or fake implementations that should be replaced with real functionality.

**Clear Boundaries**:

- ✅ **Include**: Hardcoded data in production, mock implementations, artificial delays
- ❌ **Exclude**: Test mocks, legitimate fallbacks, development-only code

**Detection Patterns**:

```typescript
// ✅ DETECT: Hardcoded production data
const MOCK_USERS = [
  { id: '1', name: 'Test User' }, // Should use real data
];

// ✅ DETECT: Artificial delays
await new Promise(resolve => setTimeout(resolve, 50)); // Simulated delay

// ✅ DETECT: Mock implementations
function getMockData() {
  return { placeholder: 'data' }; // Should use real API
}

// ✅ DETECT: Placeholder markers
const PlaceholderComponent = () => <div>TODO: Implement</div>;

// ❌ DON'T DETECT: Test mocks
// In test files only
const mockUser = { id: 'test', name: 'Test User' };

// ❌ DON'T DETECT: Legitimate fallbacks
const userName = user?.name || 'Anonymous'; // Valid fallback
```

**Priority Assessment**:

- **CRITICAL**: Affects production functionality or user experience
- **HIGH**: Blocks feature completion or testing
- **MEDIUM**: Cosmetic or development experience issues

### 5. Architectural Inconsistencies (📋 MEDIUM Priority)

**Definition**: Code that works but doesn't follow established project patterns.

**Clear Boundaries**:

- ✅ **Include**: Mixed patterns for same functionality, inconsistent approaches
- ❌ **Exclude**: Intentional variations for different use cases, experimental patterns

**Detection Patterns**:

```typescript
// ✅ DETECT: Inconsistent error handling
function handleErrorA(error: Error) {
	console.error(error);
	throw error;
}
function handleErrorB(error: Error) {
	alert(error.message); // Different pattern!
	return null;
}

// ✅ DETECT: Manual fetch + useState + useEffect for server data alongside useQuery
// This is the actual anti-pattern — mixing two server-data strategies in the same codebase
const ComponentA = () => {
	const [data, setData] = useState(null);
	useEffect(() => {
		fetch('/api/data')
			.then((r) => r.json())
			.then(setData); // Manual server fetch
	}, []);
};
const ComponentB = () => {
	const { data } = useQuery({ queryKey: ['data'], queryFn: fetchData }); // TanStack Query
};

// ❌ DON'T DETECT: useState for local UI state (this is NOT tech debt)
const ComponentC = () => {
	const [isOpen, setIsOpen] = useState(false); // Local UI state — perfectly valid
	const { data } = useQuery({ queryKey: ['items'], queryFn: fetchItems });
};

// ❌ DON'T DETECT: Intentional variations
const PublicAPI = () => useQuery({ queryKey: ['publicData'], queryFn: fetchPublic });
const InternalAPI = () => useQuery({ queryKey: ['internalData'], queryFn: fetchInternal });
```

#### Stack Anti-Patterns & React Compiler Conflicts (defer-stub → SPERNAKIT / CODE_QUALITY)

> **Defer-stub**: Stack drift (wrong libraries - Express, Fastify, Prisma, Winston, DaisyUI, react-hot-toast, Axios, Zod-on-routes; controller classes; CommonJS; default exports; `.env`/dotenv; cross-workspace imports; React Context for global state) and **manual memoization conflicts** (`React.memo`/`useMemo`/`useCallback` redundant under `babel-plugin-react-compiler`, except files with the `'use no memo'` directive) are owned by [SPERNAKIT.md](./SPERNAKIT.md) (template diff) and [CODE_QUALITY.md](./CODE_QUALITY.md). TECHDEBT does **not** re-detect them - if SPERNAKIT/CODE_QUALITY have run, skip entirely; otherwise route findings to them. The consolidated detection table is retained under [Spernakit Stack Violation Patterns](#spernakit-stack-violation-patterns) below as a reference for those audits, not as a TECHDEBT detection mandate.

### 6. Code Quality Issues (defer-stub → CODE_QUALITY)

**Definition**: Code that works but doesn't meet quality standards.

**Clear Boundaries**:

- ✅ **Include**: Magic numbers, hardcoded strings, poor naming
- ❌ **Exclude**: Legitimate constants, configuration values, domain-specific terms

> **Defer-stub**: Comprehensive code quality (ordering, lint, comments, file organization) is owned by [CODE_QUALITY.md](./CODE_QUALITY.md). TECHDEBT covers only `any`-type violations and naming. `npm`/`npx`-vs-`bun` packaging convention is a single checklist line (see [Audit Checklist](#audit-checklist)), not a detection block here.

> **Magic-number/string exception (avoid over-engineering)**: Only flag a magic number or string as debt when it is (a) repeated 3+ times, or (b) encodes a business rule whose meaning is non-obvious from context. A single-use literal in a clear conditional (e.g. `if (users.length > 50)`) is NOT debt for a small self-hosted tool - do not mandate a constants module for every literal. Severity stays LOW.

**Detection Patterns**:

```typescript
// ✅ DETECT: Magic numbers (only when repeated 3+ times or encoding a non-obvious business rule)
if (users.length > 50) {
	/* ... */
} // Flag only if the 50 is duplicated elsewhere or its meaning is non-obvious → MAX_USERS constant

// ✅ DETECT: Magic strings (only when repeated 3+ times or encoding a non-obvious business rule)
if (user.role === 'admin') {
	/* ... */
} // Flag only if 'admin' is duplicated or non-obvious → USER_ROLES.ADMIN

// ❌ DON'T DETECT: Single-use literal in a clear conditional (not debt for a small tool)

// ✅ DETECT: Poor naming
const d = new Date(); // Should be currentDate or similar
const temp = calculateValue(); // Should be descriptive name

// ❌ DON'T DETECT: Legitimate constants
const API_VERSION = 'v1'; // Valid configuration
const HTTP_STATUS_OK = 200; // Standard constant

// ✅ DETECT: any types (zero tolerance policy in spernakit)
const data: any = fetchData(); // Explicit any type
const result = value as any; // Type assertion to any
function process<any>(input: any) {} // Generic any

// npm/npx-vs-bun is a single checklist item, not a TECHDEBT detection block —
// see the Low Priority Checks in the Audit Checklist.
```

## Technical Debt Decision Matrix

| Category                          | Priority      | Time to Fix | Impact     | Detection Difficulty        | Primary Tool                         |
| --------------------------------- | ------------- | ----------- | ---------- | --------------------------- | ------------------------------------ |
| **Legacy/Deprecated**             | 🚨 CRITICAL   | 1-2 days    | High       | Easy (comments/markers)     | Manual (grep TODO/FIXME/@deprecated) |
| **Unused/Dead Code**              | ⚠️ HIGH       | 1-4 hours   | Medium     | Medium (reference checking) | HYGIENE (Knip) + manual              |
| **Placeholder/Mock**              | ⚠️ HIGH       | 2-8 hours   | High       | Easy (keywords/patterns)    | Manual (grep mock/placeholder)       |
| **Duplicated Functionality**      | 📋 MEDIUM     | 4-16 hours  | Medium     | Hard (similarity analysis)  | HYGIENE (JSCPD) + manual             |
| **Architectural Inconsistencies** | 📋 MEDIUM     | 1-3 days    | Low-Medium | Hard (pattern analysis)     | Manual + SPERNAKIT audit             |
| **Code Quality Issues**           | 📝 LOW-MEDIUM | 1-2 hours   | Low        | Easy (static analysis)      | CODE_QUALITY + manual                |

## Specific Detection Patterns

### Legacy Data Fetching Patterns

#### Legacy Implementation Patterns (HIGH Severity)

- Manual polling implementations instead of using reactive data fetching
- Custom WebSocket implementations for real-time updates
- Legacy callback-based functions for data fetching operations
- Manual state synchronization without using modern data hooks
- Custom event emitters for data change notifications
- Built-in polling patterns using deprecated helpers or timers

```typescript
// ❌ BAD: Manual polling (Legacy Pattern)
useEffect(() => {
	const interval = setInterval(async () => {
		const data = await fetch('/api/data');
		setData(await data.json());
	}, 1000);
	return () => clearInterval(interval);
}, []);

// ❌ BAD: Custom WebSocket implementation (when app uses spernakit wsStore)
const [socket, setSocket] = useState(null);
useEffect(() => {
	const ws = new WebSocket('ws://localhost:3001');
	ws.onmessage = (event) => {
		setData(JSON.parse(event.data));
	};
	setSocket(ws);
}, []);
```

#### Correct Implementation Patterns (DO NOT FLAG)

- Using TanStack Query hooks for data fetching
- Server state management with proper caching and refetching
- Proper use of data fetching libraries for automatic UI updates
- Client-side hooks from official data fetching libraries
- Server actions for data modifications
- Proper error handling for external API calls
- Using spernakit's `wsStore` + `useWebSocket` for real-time data

```typescript
// ✅ GOOD: TanStack Query data subscription
import { useMutation, useQuery } from '@tanstack/react-query';

const { data } = useQuery({
	queryKey: ['myData'],
	queryFn: () => fetchData(),
});

const mutation = useMutation({
	mutationFn: (newData) => updateData(newData),
});
```

### Deprecated Service Patterns

> **Applicability tier - FULL-STACK ONLY**: Every auth/admin/role-check example in this section is gated to the full-stack tier (see the [Applicability tiers](#technical-debt-audit-specification) callout at the top). Web-layer apps (e.g. aidd) ship no auth/RBAC surface - skip this entire section for them. The `useAuth`/`requireRoleFresh()`/role-check examples are guidance for full-stack apps, not universal detection rules.

- Legacy admin check methods (replace with auth-based user management patterns)
- Deprecated user hooks (replace with modern data hooks for user data)
- Simplified polling functions (replace with reactive data subscriptions)
- Legacy manual state management hooks (replace with modern state management)
- Custom authentication flows (replace with JWT authentication using the Elysia guard `requireRoleFresh()`)
- Manual data synchronization patterns (replace with automatic sync libraries)

```typescript
// ❌ BAD: Legacy admin check
const isAdmin = localStorage.getItem('isAdmin') === 'true';

// ✅ GOOD: Auth-based admin check (apps that ship the Spernakit auth/RBAC layer)
const { user } = useAuth();
const isAdmin = user?.role === 'admin';

// ❌ BAD: Manual user data fetching
const [user, setUser] = useState(null);
useEffect(() => {
	fetchUser().then(setUser);
}, []);

// ✅ GOOD: Modern data hook
const { data: user } = useQuery({
	queryKey: ['currentUser'],
	queryFn: () => fetchCurrentUser(),
});
```

### Authentication Anti-patterns

- `localStorage` auth usage outside of test contexts
- `sessionStorage` auth usage for authentication
- Device-specific auth patterns (replace with standard authentication flows)

### Commented Code Detection

- Commented imports/exports (excluding JSDoc @import)
- Commented function calls with parameters
- Commented variable assignments with values
- Commented React hooks with actual implementation

## Spernakit Stack Violation Patterns

> **Reference table - owned by SPERNAKIT / CODE_QUALITY**: This consolidated table is retained as a quick reference for the audits that actually own stack-drift detection ([SPERNAKIT.md](./SPERNAKIT.md), [CODE_QUALITY.md](./CODE_QUALITY.md)). It is **not** a TECHDEBT detection mandate - TECHDEBT routes these findings to those audits (see Category 5 defer-stub). Database-location is structural and routes to [REORG.md](./REORG.md).

| Pattern                     | Detection                                                                                                                                                                                                                                            | Category / Owner   | Priority |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | -------- |
| Database in `backend/data/` | Directory exists                                                                                                                                                                                                                                     | Structural → REORG | CRITICAL |
| Express middleware          | `app.use()` with Express middleware, `express.Router()`, `from 'express'`                                                                                                                                                                            | 5 (Architectural)  | HIGH     |
| Fastify plugins             | `fastify.register()`, `from 'fastify'`                                                                                                                                                                                                               | 5 (Architectural)  | HIGH     |
| Controller classes          | `class *Controller`, handler methods on classes                                                                                                                                                                                                      | 5 (Architectural)  | HIGH     |
| Zod on routes               | `z.object()`, `z.string()` in route validation (should be `t.Object()`)                                                                                                                                                                              | 5 (Architectural)  | HIGH     |
| Prisma ORM                  | `@prisma/client`, `PrismaClient` (should be Drizzle)                                                                                                                                                                                                 | 5 (Architectural)  | HIGH     |
| Winston logging             | `from 'winston'`, `winston.createLogger` (should be pino)                                                                                                                                                                                            | 5 (Architectural)  | HIGH     |
| DaisyUI components          | `from 'daisyui'`, `@daisyui/*` imports (should be shadcn/ui)                                                                                                                                                                                         | 5 (Architectural)  | HIGH     |
| react-hot-toast             | `from 'react-hot-toast'`, `useToaster` (should be sonner)                                                                                                                                                                                            | 5 (Architectural)  | HIGH     |
| Axios HTTP client           | `from 'axios'`, `axios.get/post` (should be native fetch via apiClient)                                                                                                                                                                              | 5 (Architectural)  | HIGH     |
| React Context for state     | `createContext` + `useReducer` for global state (should be Zustand)                                                                                                                                                                                  | 5 (Architectural)  | HIGH     |
| Manual memoization          | `React.memo`, `useMemo`, `useCallback` without `'use no memo'` directive or a narrow `// eslint-disable-next-line react-hooks/incompatible-library` escape hatch for third-party libraries (e.g. `@tanstack/react-virtual`, `@tanstack/react-table`) | 5 (Architectural)  | HIGH     |
| CommonJS patterns           | `require()`, `module.exports`, `__dirname`, `__filename`                                                                                                                                                                                             | 5 (Architectural)  | MEDIUM   |
| Default exports             | `export default` (stack mandates named exports only)                                                                                                                                                                                                 | 5 (Architectural)  | MEDIUM   |
| .env files                  | `.env`, `.env.local`, `dotenv` import, `process.env.*` outside the approved `configLoader.ts` / `SECRET_CONFIG_KEYS` exception                                                                                                                       | 5 (Architectural)  | HIGH     |
| Cross-workspace imports     | Frontend importing from backend or vice versa outside `shared/`                                                                                                                                                                                      | 5 (Architectural)  | HIGH     |
| `any` types                 | `as any`, `: any`, `<any>` - zero tolerance                                                                                                                                                                                                          | 6 (Code Quality)   | HIGH     |
| npm/npx usage               | `npm run`, `npx`, `npm install` in scripts or docs                                                                                                                                                                                                   | 6 (Code Quality)   | MEDIUM   |

## Known False Positive Patterns

These patterns are consistently flagged during tech debt audits but are not actual issues. Verify before dismissing, but expect these to be false positives:

| Pattern                                                                       | Why it's a false positive                                                                                                                                                                           |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `@fontsource-variable/*` reported unused                                      | Imported in CSS (`@import`), not in JS - static analysis only scans JS imports                                                                                                                      |
| `tw-animate-css` reported unused                                              | Referenced via CSS `@import` - static analysis only scans JS imports                                                                                                                                |
| `pino-pretty` reported unused                                                 | Used as a runtime pino transport (`transport: 'pino-pretty'`), not a static import                                                                                                                  |
| `babel-plugin-*` reported unused                                              | Referenced in `vite.config.ts` plugins array, not directly imported                                                                                                                                 |
| `tailwindcss` reported unused                                                 | Imported in CSS (`@import "tailwindcss"`) or via `@tailwindcss/vite` plugin                                                                                                                         |
| `@tailwindcss/vite` reported unused                                           | Referenced in `vite.config.ts` plugins array                                                                                                                                                        |
| SQLite/PostgreSQL dual schema duplication                                     | `schema/*.ts` and `schema-pg/*.ts` produce expected structural duplication - exclude from clone detection                                                                                           |
| Frontend/backend type mirroring                                               | `frontend/src/api/types/` mirrors backend types by design (workspace isolation)                                                                                                                     |
| Template-origin files                                                         | Files that also exist in `spernakit/` are template infrastructure - fix belongs in template, not derived app                                                                                        |
| Barrel file re-exports                                                        | `index.ts` re-exports may appear unused if consumers import from the barrel                                                                                                                         |
| `useMemo`/`useCallback` in files with `'use no memo'`                         | Opted out of React Compiler - manual memoization is intentional                                                                                                                                     |
| Re-export shim files from `shared/`                                           | Thin re-exports are alive by definition (consumed by workspace imports)                                                                                                                             |
| `process.env.*` in `configLoader.ts` for `SECRET_CONFIG_KEYS`                 | Approved exception - single loader path responsible for reading configured Docker secret injection variables                                                                                        |
| `config/{slug}.secrets.json` + `*Ref` pointers / `getSecret('dot.path')`      | Approved split-secrets pattern for operator-provided third-party credentials (resolved in `configSecretsFile.ts`) - an allowed config read path, not a banned `.env`/`process.env` pattern          |
| Deprecation markers / `@deprecated` in `dist/` or other compiled build output | Build artifacts, not source. A deprecated method inside `dist/` is the classic lure here. Only score source; never file findings against generated/compiled output (see [Exclusions](#exclusions)). |

## Pre-Audit Setup

### Quality Baseline

Run these commands before beginning the audit to establish a clean baseline:

```bash
# Run full quality gate — fix any failures before auditing.
# smoke:qc runs the steps defined in scripts/smoke.json (canonical source of the
# gate pipeline — do not hardcode a step count; read that file for the current list).
bun run smoke:qc

# Verify codebase is clean
bun run typecheck && bun run lint
```

### Quick Detection Sweep

Run these verification commands before beginning the audit to quickly identify banned technology markers.

> **Shell**: The primary dev host is Windows/PowerShell. Prefer the Claude Code `Grep` tool (it accepts these patterns verbatim) or PowerShell `Select-String -Path ... -Pattern ...` (and `Get-ChildItem -Recurse -Filter ...` in place of `find`). The `grep -r` / `find` forms below are the bash alternate (Git Bash, WSL, or macOS/Linux).

```bash
# Check for CommonJS patterns
grep -r "require(" backend/src/ frontend/src/ --include="*.ts" --include="*.tsx"

# Check for default exports
grep -r "export default" backend/src/ frontend/src/ --include="*.ts" --include="*.tsx"

# Check for any types (zero tolerance)
grep -r ": any" backend/src/ frontend/src/ --include="*.ts" --include="*.tsx"

# Check for Express usage
grep -r "from 'express'" backend/src/ --include="*.ts"

# Check for Prisma usage
grep -r "from 'prisma'" backend/src/ --include="*.ts"
grep -r "from '@prisma/client'" backend/src/ --include="*.ts"

# Check for Winston logging
grep -r "from 'winston'" backend/src/ --include="*.ts"

# Check for Zod on routes
grep -r "from 'zod'" backend/src/routes/ --include="*.ts"

# Check for .env files and dotenv
find . -name ".env*" -not -path "*/node_modules/*" -not -path "*/.git/*"
grep -r "dotenv" backend/src/ frontend/src/ --include="*.ts" --include="*.tsx"

# Check for manual memoization (React Compiler handles this)
grep -r "React.memo\|useMemo\|useCallback" frontend/src/ --include="*.ts" --include="*.tsx"

# Check for cross-workspace imports
grep -r "from '.*backend/" frontend/src/ --include="*.ts" --include="*.tsx"
grep -r "from '.*frontend/" backend/src/ --include="*.ts"

# Check database location
ls -d backend/data/ 2>/dev/null && echo "CRITICAL: Database in wrong location!"

# Check for npm/npx references
grep -r "npm run\|npx " scripts/ docs/ --include="*.ts" --include="*.md" --include="*.sh"

# Check for wrong UI libraries
grep -r "from 'daisyui'\|from 'react-hot-toast'\|from 'axios'" frontend/src/ --include="*.ts" --include="*.tsx"
```

## Audit Checklist

### Critical Checks 🚨

- [ ] No deprecated code marked for removal still in production
- [ ] No security-affecting workarounds or hacks
- [ ] No legacy patterns with explicit migration deadlines past due
- [ ] All `@deprecated` marked code has removal plan
- [ ] Bare `TODO`/`FIXME` (no deadline, no canonical replacement) tracked in backlog, not filed as CRITICAL
- [ ] Database-location violations (`backend/data/`) routed to REORG (structural, not TECHDEBT)

### High Priority Checks ⚠️

- [ ] No unused/dead code (zero references) in codebase
- [ ] No placeholder/mock data in production code paths
- [ ] No hardcoded credentials or secrets
- [ ] Legacy real-time patterns replaced with modern subscriptions
- [ ] No spernakit stack violations (wrong libraries: Express, Prisma, Winston, DaisyUI, Axios, react-hot-toast)
- [ ] No manual memoization in React Compiler-compiled files
- [ ] No `any` types in the codebase (zero tolerance)

### Medium Priority Checks 📋

- [ ] Duplicated functionality consolidated (<80% code similarity threshold)
- [ ] Architectural patterns consistent across similar components
- [ ] Error handling follows established project patterns
- [ ] State management approach unified (Zustand for global, TanStack Query for server)
- [ ] No cross-workspace import violations
- [ ] No CommonJS patterns in ESM codebase
- [ ] No `.env` files or `dotenv` usage (JSON-only config)

### Low Priority Checks 💡

- [ ] Magic numbers replaced with named constants
- [ ] Variable naming follows project conventions
- [ ] Code comments accurate and up-to-date
- [ ] TODO/FIXME items tracked and prioritized
- [ ] No `export default` in non-entry files (stack mandates named exports)
- [ ] No `npm`/`npx` references in scripts or docs

## Technical Standards

### Code Quality Requirements

- Zero TypeScript errors and zero lint errors across all files
- Follow established framework best practices and guidelines
- Use consistent component libraries and icon sets throughout the project
- Maintain standard authentication integration and state management patterns
- Ensure all code follows established project architecture standards

### Verification Process

1. Run build and formatting commands to verify build success
2. Execute application checks to ensure no runtime errors or exceptions
3. Fix any remaining lint errors when touching files (zero tolerance policy)
4. Ensure all imports are used and all functions are properly typed

## Deliverables

### Analysis Requirements

- Provide specific file paths and line numbers for each finding
- Categorize findings by severity (critical, high, medium, low priority)
- Suggest specific remediation actions for each category
- Prioritize findings that affect build performance, bundle size, or maintainability
- Focus on production-ready code quality with zero tolerance for technical debt

### Report Location

Create report at: `.aidd/audit-reports/TECHDEBT-YYYY-MM-DD.md`

### Report Structure

- Categorized list of findings with file paths and line numbers
- Priority assessment (critical, high, medium, low)
- Recommended actions for each item (remove, refactor, consolidate)
- Estimated impact of cleanup on codebase quality
- False positives filtered (listed for transparency)
- Cross-audit deduplication notes (what was deferred to HYGIENE/SPERNAKIT/etc.)

### Feature.json Deliverables

Create feature.json files in `.aidd/features/` for each high-priority finding:

- `id`: `audit-techdebt-{unix_timestamp}-{descriptive-slug}`
- `auditSource`: `TECHDEBT`
- `auditSeverity`: mapped from category priority
- `affectedFiles`: array of file paths
- `spec`: detailed remediation steps
- `verificationEvidence`: `file:line` reference and specific pattern observed

## Focus Areas

### Priority Directories

- `backend/src/routes/` - Route handlers (highest priority for lint compliance and type safety)
- `backend/src/services/` - Business logic and service layer
- `backend/src/plugins/` and `backend/src/guards/` - Cross-cutting concerns (auth, cors, logging, rate limit, audit, workspace)
- `frontend/src/pages/` - Page components (one directory per feature area)
- `frontend/src/hooks/` - Custom hooks (state management and side effects)
- `frontend/src/components/` - UI components (shared/ and layout/ subdirectories)
- `frontend/src/stores/` - Zustand stores (with persist for auth, theme, sidebar, workspace)
- `frontend/src/api/` - API modules (one file per domain, independently defined types)
- `shared/src/` - Cross-workspace types (the ONLY allowed bridge between frontend and backend)
- Configuration files (`config.json`, `bunfig.toml`) as needed

### Exclusions

- Skip node_modules, .git, and build output directories
- Exclude vendor/third-party directories from analysis
- Don't flag legitimate fallback patterns or error handling code
- Don't flag test helper patterns and mock implementations
- Don't flag JSDoc comments and legitimate documentation
- Don't flag template-origin files (evaluate at template level, escalate to Spernakit)
- Don't flag known false positive patterns (see [Known False Positive Patterns](#known-false-positive-patterns))

## Success Criteria

The audit should result in actionable items that can improve codebase quality while maintaining:

- Zero TypeScript errors and full production readiness
- Clean, maintainable, production-ready codebase with no technical debt
- Following all established project standards
- Achieving high code quality rating
- No duplicate findings with companion audits (HYGIENE, DEAD_CODE, SPERNAKIT, CODE_QUALITY)

## Report Template

Create report at: `.aidd/audit-reports/TECHDEBT-YYYY-MM-DD.md`

```markdown
# Technical Debt Audit Report - YYYY-MM-DD

## Executive Summary

**Application**: {app-name} v{version}
**Overall Tech Debt Score**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Estimated Cleanup Effort**: [Hours/Days]
**Companion Audits Run**: [List which companion audits ran before this one]

### Debt by Category

| Category                      | Count    | Priority    | Est. Fix Time |
| ----------------------------- | -------- | ----------- | ------------- |
| Legacy/Deprecated Code        | [Number] | 🚨 Critical | [Time]        |
| Unused/Dead Code              | [Number] | ⚠️ High     | [Time]        |
| Placeholder/Mock Code         | [Number] | ⚠️ High     | [Time]        |
| Duplicated Functionality      | [Number] | 📋 Medium   | [Time]        |
| Architectural Inconsistencies | [Number] | 📋 Medium   | [Time]        |
| Code Quality Issues           | [Number] | 💡 Low      | [Time]        |

### Key Findings

- [Summary of major findings]

## Detailed Findings

### Critical Issues 🚨 (Legacy/Deprecated)

| Issue | Location    | Category   | Impact   | Remediation | Timeline |
| ----- | ----------- | ---------- | -------- | ----------- | -------- |
| [ID]  | [File:Line] | [Category] | [Impact] | [Fix]       | 1-2 days |

### High Priority Issues ⚠️ (Dead Code/Placeholders/Stack Violations)

| Issue | Location    | Category   | Impact   | Remediation | Timeline  |
| ----- | ----------- | ---------- | -------- | ----------- | --------- |
| [ID]  | [File:Line] | [Category] | [Impact] | [Fix]       | 1-4 hours |

### Medium Priority Issues 📋 (Duplication/Inconsistencies)

| Issue | Location    | Category   | Impact   | Remediation | Timeline   |
| ----- | ----------- | ---------- | -------- | ----------- | ---------- |
| [ID]  | [File:Line] | [Category] | [Impact] | [Fix]       | 4-16 hours |

### Low Priority Issues 💡 (Code Quality)

| Issue | Location    | Category   | Impact   | Remediation | Timeline  |
| ----- | ----------- | ---------- | -------- | ----------- | --------- |
| [ID]  | [File:Line] | [Category] | [Impact] | [Fix]       | 1-2 hours |

## False Positives Filtered

| Pattern | Files  | Why dismissed |
| ------- | ------ | ------------- |
| [Name]  | [List] | [Explanation] |

## Cross-Audit Deduplication

| Finding | Deferred to            | Reason                          |
| ------- | ---------------------- | ------------------------------- |
| [Item]  | HYGIENE/SPERNAKIT/etc. | [Why companion audit covers it] |

## Recommendations

### Immediate Actions (0-7 days)

1. [Remove deprecated code blocking upgrades]
2. [Fix security-affecting workarounds]
3. [Fix CRITICAL stack violations]

### Short-term Actions (1-4 weeks)

1. [Remove dead code and placeholders]
2. [Consolidate duplicated functionality]
3. [Fix HIGH priority stack violations]

### Long-term Actions (1-3 months)

1. [Address architectural inconsistencies]
2. [Establish tech debt tracking process]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Companion Audits

> **Automated detection**: For tool-driven dead code detection (Knip), code duplication (JSCPD), and dependency analysis, see [HYGIENE.md](./HYGIENE.md). TECHDEBT focuses on manual pattern analysis that automated tools cannot detect.

> **Manual file tracing**: For comprehensive file-by-file import analysis and wiring verification, see [DEAD_CODE.md](./DEAD_CODE.md). TECHDEBT defers bulk dead code detection to DEAD_CODE/HYGIENE.

> **Template drift**: For comprehensive spernakit template alignment analysis, see [SPERNAKIT.md](./SPERNAKIT.md). TECHDEBT provides quick anti-pattern detection; SPERNAKIT provides full template diff analysis.

> **Structural complexity**: For module reorganization, directory restructuring, and structural-complexity concerns, see [REORG.md](./REORG.md). TECHDEBT detects pattern-level debt; defer structural reorganization findings to REORG.

> **Feature reachability**: For detecting fully-built but unwired features ("Cathedral of Dead Code"), see [FEATURE_INTEGRATION.md](./FEATURE_INTEGRATION.md). That audit uses entrypoint reachability traversal rather than pattern detection.

> **Code quality**: For lint compliance, ordering rules, comment quality, and file organization, see [CODE_QUALITY.md](./CODE_QUALITY.md). TECHDEBT covers only type violations and naming within Category 6.

---

**Version**: 2.4
**Last Updated**: 2026-08-30
**Next Review**: 2026-11-30

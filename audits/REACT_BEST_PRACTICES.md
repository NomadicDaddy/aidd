---
title: 'React Best Practices Audit (Vercel)'
last_updated: '2026-07-21'
version: '2.6'
category: 'Frontend'
priority: 'High'
estimated_time: '2-3 hours'
frequency: 'Monthly'
lifecycle: 'active'
---

# React Best Practices Audit

Based on [Vercel's React Best Practices](https://vercel.com/blog/introducing-react-best-practices),
synchronized against
[`vercel-labs/agent-skills@4559f18`](https://github.com/vercel-labs/agent-skills/tree/4559f18a20c1691c744b4395194290db6a0df5e9/skills/react-best-practices).

Comprehensive performance optimization guide covering all 70 upstream rules across 8 categories,
plus explicit aidd/Spernakit adaptations. Rules are prioritized by impact from critical
(eliminating waterfalls, reducing bundle size) to incremental (advanced patterns).

## Executive Summary

**🎯 Critical Priorities**

- **Eliminate async waterfalls**: Each sequential await adds full network latency (2-10× improvement potential)
- **Reduce bundle size**: Directly affects Time to Interactive and Largest Contentful Paint
- **Optimize re-renders**: Minimizes wasted computation and improves UI responsiveness
- **Server-side performance**: Eliminates server-side waterfalls and reduces response times

**📋 Essential Standards (Required)**

- **Waterfall elimination**: Parallelize independent async operations
- **Bundle optimization**: Direct imports, code splitting, lazy loading
- **Server-side patterns**: LRU caching, proper authentication on every endpoint
- **Client-side efficiency**: TanStack Query, deduplication, event listener optimization

**⚡ Performance Impact Levels**

- **CRITICAL**: Waterfalls (2-10× improvement), bundle size (200-800ms import cost), server-side data fetching
- **HIGH**: Server-side performance, client-side data fetching, re-render optimization
- **MEDIUM**: Rendering performance, JavaScript micro-optimizations
- **LOW**: Advanced patterns, minor optimizations

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Pre-Audit Setup

Before beginning the audit, establish a quality baseline and verify the target application is correctly configured:

1. **Run quality checks**: `bun run smoke:qc` must pass to establish a clean baseline.
2. **Verify React Compiler**: Open `frontend/vite.config.ts` and confirm `babel-plugin-react-compiler` is present in the Babel plugins array.
3. **Verify bundle optimization**: Confirm `lucideDirectImportsPlugin` is present in `frontend/vite.config.ts`.
4. **Inspect bundle output**: Run `bun run build:frontend` and review the generated chunks in `frontend/dist/assets/`. Look for unexpectedly large chunks (>300KB) that should be code-split.
5. **Check for manual memoization**: Search `frontend/src` for `useMemo`, `useCallback`, `React.memo`, and `memo(`. In compiler-enabled projects these should be rare (only justified by `'use no memo'` or measurable hot paths).
6. **Review data-fetching patterns**: Search for raw `fetch()` inside `useEffect`; all server state should use TanStack Query (`useQuery`, `useMutation`).

## Spernakit Applicability

This audit is adapted from Vercel's React Best Practices skill, which targets **Next.js** with React Server Components (RSC), Server Actions, and SSR streaming. Spernakit applications use **React 19 + Vite** (client-only SPA) with an **Elysia** backend: no RSC, no SSR, no Server Actions.

### Rules That Do NOT Apply to Spernakit

These rules reference Next.js/RSC-only features and should be **skipped** during audits of spernakit apps:

| Skill Rule ID                          | Rule                                   | Why N/A                                                 |
| -------------------------------------- | -------------------------------------- | ------------------------------------------------------- |
| `async-suspense-boundaries`            | Suspense for RSC streaming             | No SSR/streaming; Suspense only applies with React.lazy |
| `server-auth-actions`                  | Authenticate Server Actions            | No Server Actions; use Elysia guards instead            |
| `server-cache-react`                   | React.cache() deduplication            | RSC-only API; not available in client-side React        |
| `server-dedup-props`                   | Avoid duplicate RSC serialization      | No RSC prop serialization boundary                      |
| `server-serialization`                 | Minimize RSC→client data               | No RSC→client boundary                                  |
| `server-parallel-fetching`             | Parallel RSC component composition     | No async server components                              |
| `server-hoist-static-io`               | Hoist static I/O to module level       | RSC pattern; N/A for client SPA                         |
| `rendering-hydration-suppress-warning` | Suppress expected hydration mismatches | SSR-only; no hydration in client SPA                    |

> **Note**: `server-no-shared-module-state` is **not** N/A for spernakit. Although the source skill frames it for RSC/SSR concurrency, the underlying hazard (module-scope mutation holding per-request data) applies to any long-lived concurrent server process, including Elysia on Bun. See [3.5 Avoid Shared Module State for Request Data](#35-avoid-shared-module-state-for-request-data).

### Spernakit Equivalents

| Vercel Pattern                   | Spernakit Equivalent                                                                                                                          |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `next/dynamic` with `ssr: false` | `React.lazy()` with `.then(m => ({ default: m.Name }))`                                                                                       |
| SWR for data fetching            | TanStack Query (`useQuery`, `useMutation`)                                                                                                    |
| Server Actions with auth         | Elysia route guards (`requireAuth`, `requireRoleFresh`, `workspaceAccess`, `apiKey`)                                                          |
| `React.cache()` per-request      | LRU cache in backend services (cross-request)                                                                                                 |
| `optimizePackageImports`         | `lucideDirectImportsPlugin` in vite.config.ts (auto-transforms barrel imports at build time); direct imports from source paths for other libs |
| `after()` for non-blocking work  | Fire-and-forget promises or `queueMicrotask` in Elysia handlers                                                                               |

### React Compiler Impact

**`babel-plugin-react-compiler`** is enabled in all spernakit apps via `vite.config.ts`. It automatically handles memoization, JSX hoisting, and dependency tracking. The following rules become **informational only** in compiler-enabled projects; the compiler handles these automatically:

| Rule                                        | What Compiler Handles                       |
| ------------------------------------------- | ------------------------------------------- |
| 5.2 (Extract to memo'd components)          | Automatic memoization of component subtrees |
| 5.8 (Hoist default non-primitive props)     | Stable default value references             |
| 5.10 (Avoid useMemo for simple expressions) | Compiler skips memo for trivial expressions |
| 5.14 (Split combined hook computations)     | Automatic fine-grained dependency tracking  |
| 6.3 (Hoist static JSX)                      | Automatic static element hoisting           |

**Audit guidance**: With React Compiler enabled (all spernakit apps), **suppress** these patterns entirely: do not report them, not even as low-priority findings. Only surface a finding when the component carries a `'use no memo'` directive (which opts out of compiler optimization) **or** has a profiled, measurable hot path that the compiler demonstrably failed to handle.

### Rules That Fully Apply

All rules in sections 1 (Waterfalls), 2 (Bundle Size, adapted), 3 (Server-Side, adapted), 4 (Client-Side, adapted), 5 (Re-renders), 6 (Rendering), 7 (JS Performance), and 8 (Advanced) apply to spernakit apps with the noted adaptations above.

## Table of Contents

- [Pre-Audit Setup](#pre-audit-setup)

1. [Eliminating Waterfalls](#1-eliminating-waterfalls) - **CRITICAL**
2. [Bundle Size Optimization](#2-bundle-size-optimization) - **CRITICAL**
3. [Server-Side Performance](#3-server-side-performance) - **HIGH**
4. [Client-Side Data Fetching](#4-client-side-data-fetching) - **HIGH**
5. [Re-render Optimization](#5-re-render-optimization) - **MEDIUM**
6. [Rendering Performance](#6-rendering-performance) - **MEDIUM**
7. [JavaScript Performance](#7-javascript-performance) - **MEDIUM**
8. [Advanced Patterns](#8-advanced-patterns) - **LOW**

- [Deliverables and Success Criteria](#deliverables-and-success-criteria)

---

## 1. Eliminating Waterfalls

**Impact: CRITICAL (2-10× improvement)**

Waterfalls are the #1 performance killer. Each sequential await adds full network latency. Eliminating them yields the largest gains.

### 1.1 Check Cheap Conditions Before Async Flags

**Impact: HIGH** (avoids unnecessary async work when a synchronous guard already fails)

> **Skill rule**: `async-cheap-condition-before-await`

When a branch uses `await` for a flag or remote value and also requires a **cheap synchronous** condition (local props, request metadata, already-loaded state), evaluate the cheap condition **first**. Otherwise you pay for the async call even when the compound condition can never be true.

This is a specialization of [Defer Await Until Needed](#12-defer-await-until-needed) for `flag && cheapCondition` style checks.

❌ **Incorrect** (pays for async even when guard fails):

```typescript
async function updateResource(resourceId: string, userId: string) {
	const permissions = await fetchPermissions(userId);
	const resource = await getResource(resourceId);

	if (!resource) {
		return { error: 'Not found' };
	}

	if (!permissions.canEdit) {
		return { error: 'Forbidden' };
	}

	return await updateResourceData(resource, permissions);
}
```

✅ **Correct** (fetches only when needed):

```typescript
async function updateResource(resourceId: string, userId: string) {
	const resource = await getResource(resourceId);

	if (!resource) {
		return { error: 'Not found' };
	}

	const permissions = await fetchPermissions(userId);

	if (!permissions.canEdit) {
		return { error: 'Forbidden' };
	}

	return await updateResourceData(resource, permissions);
}
```

Keep the original order if `someCondition` is expensive, depends on the flag, or you must run side effects in a fixed order.

### 1.2 Defer Await Until Needed

**Impact: HIGH** (avoids blocking unused code paths)

> **Skill rule**: `async-defer-await`

Move `await` operations into the branches where they're actually used to avoid blocking code paths that don't need them.

❌ **Incorrect** (blocks both branches):

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
	const userData = await fetchUserData(userId);

	if (skipProcessing) {
		return { skipped: true }; // Returns immediately but still waited for userData
	}

	return processUserData(userData); // Only this branch uses userData
}
```

✅ **Correct** (only blocks when needed):

```typescript
async function handleRequest(userId: string, skipProcessing: boolean) {
	if (skipProcessing) {
		return { skipped: true }; // Returns immediately without waiting
	}

	const userData = await fetchUserData(userId); // Fetch only when needed
	return processUserData(userData);
}
```

### 1.3 Dependency-Based Parallelization

**Impact: CRITICAL** (2-10× improvement)

> **Skill rule**: `async-dependencies`

For operations with partial dependencies, use parallelization to maximize concurrency.

❌ **Incorrect** (profile waits for config unnecessarily):

```typescript
const [user, config] = await Promise.all([fetchUser(), fetchConfig()]);
const profile = await fetchProfile(user.id); // Config waited even though not needed for profile
```

✅ **Correct** (config and profile run in parallel, `fetchUser` called once):

```typescript
const userPromise = fetchUser();
const profilePromise = userPromise.then((user) => fetchProfile(user.id));
const [user, config, profile] = await Promise.all([userPromise, fetchConfig(), profilePromise]);
```

Or use libraries like `better-all` for complex dependency chains (not a spernakit dependency; reference only).

### 1.4 Prevent Waterfall Chains in API Routes

**Impact: CRITICAL** (2-10× improvement)

> **Skill rule**: `async-api-routes`

In API routes and Server Actions, start independent operations immediately, even if you don't await them yet.

❌ **Incorrect** (config waits for auth, data waits for both):

```typescript
export async function GET(request: Request) {
	const session = await auth(); // First wait
	const config = await fetchConfig(); // Second wait
	const data = await fetchData(session.user.id); // Third wait
	return Response.json({ data, config });
}
```

✅ **Correct** (auth and config start immediately):

```typescript
export async function GET(request: Request) {
	const sessionPromise = auth(); // Start immediately
	const configPromise = fetchConfig(); // Start immediately
	const session = await sessionPromise;
	const [config, data] = await Promise.all([configPromise, fetchData(session.user.id)]);
	return Response.json({ data, config });
}
```

### 1.5 Promise.all() for Independent Operations

**Impact: CRITICAL** (2-10× improvement)

> **Skill rule**: `async-parallel`

When async operations have no interdependencies, execute them concurrently using `Promise.all()`.

❌ **Incorrect** (sequential execution, 3 round trips):

```typescript
const user = await fetchUser();
const posts = await fetchPosts();
const comments = await fetchComments();
```

✅ **Correct** (parallel execution, 1 round trip):

```typescript
const [user, posts, comments] = await Promise.all([fetchUser(), fetchPosts(), fetchComments()]);
```

### 1.6 Strategic Suspense Boundaries

**Impact: HIGH** (faster initial paint)

> **Skill rule**: `async-suspense-boundaries`

Use Suspense boundaries with `React.lazy()` to show the wrapper UI immediately while heavy components load.

> **Spernakit note**: In RSC apps, Suspense streams server-rendered HTML. In spernakit (client SPA), Suspense works with `React.lazy()` for code-split components and with TanStack Query's suspense mode.

❌ **Incorrect** (entire page blocked by heavy component):

```tsx
import { HeavyChart } from './HeavyChart';

function Dashboard() {
	return (
		<div>
			<Sidebar />
			<Header />
			<HeavyChart /> {/* Blocks entire page render */}
			<Footer />
		</div>
	);
}
```

✅ **Correct** (wrapper shows immediately, chart loads async):

```tsx
import { lazy, Suspense } from 'react';

const HeavyChart = lazy(() => import('./HeavyChart').then((m) => ({ default: m.HeavyChart })));

function Dashboard() {
	return (
		<div>
			<Sidebar />
			<Header />
			<Suspense fallback={<Skeleton />}>
				<HeavyChart /> {/* Loads independently */}
			</Suspense>
			<Footer />
		</div>
	);
}
```

---

### 1.7 Share Promises Across Components with use()

**Impact: HIGH** (eliminates duplicate fetches)

> **Spernakit note**: React 19's `use()` hook is available in client components for unwrapping promises. When multiple sibling components need the same async data, start the promise in the parent and pass it down. All components calling `use(promise)` share the same request.

❌ **Incorrect** (duplicate fetches):

```tsx
function Dashboard() {
	return (
		<div>
			<Header />
			<UserStats />
			<RecentActivity />
		</div>
	);
}

function UserStats() {
	const { data } = useQuery({ queryKey: ['user'], queryFn: getUser });
	// Fetches user
}

function RecentActivity() {
	const { data } = useQuery({ queryKey: ['user'], queryFn: getUser });
	// Fetches user again
}
```

✅ **Correct** (single fetch shared across components):

```tsx
function Dashboard() {
	const userPromise = getUser(); // Start once

	return (
		<div>
			<Header />
			<Suspense fallback={<Skeleton />}>
				<UserStats userPromise={userPromise} />
				<RecentActivity userPromise={userPromise} />
			</Suspense>
		</div>
	);
}

import { use } from 'react';

function UserStats({ userPromise }: { userPromise: Promise<User> }) {
	const user = use(userPromise); // Unwraps shared promise
	return <div>{user.name}</div>;
}

function RecentActivity({ userPromise }: { userPromise: Promise<User> }) {
	const user = use(userPromise); // Reuses the same promise
	return <div>{user.lastActivity}</div>;
}
```

**When NOT to use this pattern**:

- Critical data needed for layout decisions (affects positioning)
- Small, fast queries where Suspense overhead isn't worth it
- When you want to avoid layout shift (loading → content jump)

---

## 2. Bundle Size Optimization

**Impact: CRITICAL**

Reducing initial bundle size improves Time to Interactive and Largest Contentful Paint.

### 2.1 Avoid Barrel File Imports

**Impact: CRITICAL** (200-800ms import cost, slow builds)

Import directly from source files instead of barrel files. Many icon and component libraries can have up to 10,000 re-exports in their entry file.

❌ **Incorrect** (imports entire library):

```tsx
import { Check, X, Menu } from 'lucide-react'; // Loads 1,583 modules, ~2.8s extra in dev
import { Button, TextField } from '@mui/material'; // Loads 2,225 modules, ~4.2s extra in dev
```

✅ **Correct** (imports only what you need):

```tsx
import Check from 'lucide-react/dist/esm/icons/check';
import X from 'lucide-react/dist/esm/icons/x';
import Menu from 'lucide-react/dist/esm/icons/menu'; // Loads only 3 modules (~2KB vs ~1MB)

import Button from '@mui/material/Button';
import TextField from '@mui/material/TextField';
```

> **Note**: Next.js has `optimizePackageImports` to auto-transform barrel imports. Spernakit apps use `lucideDirectImportsPlugin` in `vite.config.ts` to automatically transform lucide-react barrel imports to direct imports at build time. If this plugin is present, barrel import findings for lucide-react are resolved at the build level. For other libraries without a plugin, always use direct imports.

### 2.2 Conditional Module Loading

**Impact: HIGH** (loads large data only when needed)

Load large data or modules only when a feature is activated.

✅ **Correct** (lazy-load animation frames):

```tsx
function AnimationPlayer({
	enabled,
	setEnabled,
}: {
	enabled: boolean;
	setEnabled: React.Dispatch<React.SetStateAction<boolean>>;
}) {
	const [frames, setFrames] = useState<Frame[] | null>(null);

	useEffect(() => {
		if (enabled && !frames) {
			import('./animation-frames.js')
				.then((mod) => setFrames(mod.frames))
				.catch(() => setEnabled(false));
		}
	}, [enabled, frames, setEnabled]);

	if (!frames) return <Skeleton />;
	return <Canvas frames={frames} />;
}
```

### 2.3 Defer Non-Critical Third-Party Libraries

**Impact: MEDIUM** (loads after hydration)

Analytics, logging, and error tracking don't block user interaction. Load them after hydration.

❌ **Incorrect** (blocks initial bundle):

```tsx
import { Analytics } from '@vercel/analytics/react';

export default function RootLayout({ children }) {
	return (
		<html>
			<body>
				{children}
				<Analytics /> {/* Blocks initial render */}
			</body>
		</html>
	);
}
```

✅ **Correct** (loads after initial render):

```tsx
import { lazy, Suspense } from 'react';

const Analytics = lazy(() =>
	import('@vercel/analytics/react').then((m) => ({ default: m.Analytics }))
);

function App() {
	return (
		<>
			{children}
			<Suspense fallback={null}>
				<Analytics /> {/* Loads after initial render */}
			</Suspense>
		</>
	);
}
```

### 2.4 Dynamic Imports for Heavy Components

**Impact: CRITICAL** (directly affects TTI and LCP)

Use `React.lazy()` to lazy-load large components not needed on initial render.

❌ **Incorrect** (Monaco bundles with main chunk ~300KB):

```tsx
import { MonacoEditor } from './monaco-editor';

function CodePanel({ code }: { code: string }) {
	return <MonacoEditor value={code} />;
}
```

✅ **Correct** (Monaco loads on demand):

```tsx
import { lazy, Suspense } from 'react';

const MonacoEditor = lazy(() =>
	import('./monaco-editor').then((m) => ({ default: m.MonacoEditor }))
);

function CodePanel({ code }: { code: string }) {
	return (
		<Suspense fallback={<Skeleton />}>
			<MonacoEditor value={code} />
		</Suspense>
	);
}
```

> **Spernakit note**: Use `React.lazy()` with named export adaptation (`.then(m => ({ default: m.Name }))`), not `next/dynamic`.

> **Common finding**: Recharts (~300KB) is the #1 heavy dependency in spernakit apps. Chart components in widget/dashboard pages should be lazy-loaded with Suspense rather than statically imported. Follow the existing lazy-load pattern used in analytics pages.

### 2.5 Prefer Statically Analyzable Paths

**Impact: HIGH** (avoids accidental broad bundles and file traces)

> **Skill rule**: `bundle-analyzable-paths`

Build tools work best when import and file-system paths are obvious at build time. If you hide the real path inside a variable or compose it too dynamically, the tool either has to include a broad set of possible files, warn that it cannot analyze the import, or widen file tracing to stay safe.

❌ **Incorrect** (the bundler cannot tell what may be imported):

```typescript
const PAGE_MODULES = {
	home: './pages/home',
	settings: './pages/settings',
} as const;

const Page = await import(PAGE_MODULES[pageName]);
```

✅ **Correct** (use an explicit map of allowed modules):

```typescript
const PAGE_MODULES = {
	home: () => import('./pages/home'),
	settings: () => import('./pages/settings'),
} as const;

const Page = await PAGE_MODULES[pageName]();
```

> **Spernakit note**: Vite handles static analysis for `import()` with literal paths. Avoid dynamic path composition in `import()` calls. For route-based code splitting, use explicit `React.lazy()` imports with literal paths.

### 2.6 Preload Based on User Intent

**Impact: MEDIUM** (reduces perceived latency)

> **Skill rule**: `bundle-preload`

Preload heavy bundles before they're needed to reduce perceived latency.

✅ **Correct** (preload on hover/focus):

```tsx
function EditorButton({ onClick }: { onClick: () => void }) {
	const preload = () => {
		void import('./monaco-editor'); // Preload without blocking
	};

	return (
		<button onMouseEnter={preload} onFocus={preload} onClick={onClick}>
			Open Editor
		</button>
	);
}
```

> **Spernakit note**: Several spernakit apps implement route preloading on hover/focus with deduplication via Set. This pattern reduces perceived navigation latency for code-split routes.

---

## 3. Server-Side Performance

**Impact: HIGH**

Optimizing server-side data fetching and caching eliminates waterfalls and reduces response times.

> **Spernakit note**: Most rules in this section originate from Next.js RSC/Server Actions patterns. **3.1 (Endpoint Auth)**, **3.2 (LRU Caching)**, **3.3 (Parallel Nested Data Fetching)**, **3.4 (Fire-and-Forget Non-Blocking Operations)**, and **3.5 (Avoid Shared Module State for Request Data)** directly apply to spernakit's Elysia backend. The remaining RSC-specific rules (3.6-3.10) are retained for reference when auditing Next.js codebases but are marked as N/A for spernakit.

### 3.1 Authenticate Every Backend Endpoint

**Impact: CRITICAL** (prevents unauthorized access to mutations)

Every API endpoint must verify authentication and authorization. In spernakit, this is handled by Elysia guards; never rely solely on frontend route guards.

> **Skill rule**: `server-auth-actions`, adapted from Server Actions to Elysia guards.

❌ **Incorrect** (no guard):

```typescript
app.delete('/api/users/:id', async ({ params }) => {
	await db.delete(users).where(eq(users.id, params.id)); // Anyone can call this!
	return { success: true };
});
```

✅ **Correct** (Elysia guard):

```typescript
app.group('/api/users', (app) =>
	app
		.use(requireAuth)
		.use(requireRoleFresh('ADMIN'))
		.delete('/:id', async ({ params }) => {
			await db.delete(users).where(eq(users.id, params.id));
			return { success: true };
		})
);
```

### 3.2 Cross-Request LRU Caching

**Impact: HIGH** (caches across requests)

> **Skill rule**: `server-cache-lru`

For frequently accessed data shared across requests, use an LRU cache in backend services.

✅ **Correct** (LRU cache implementation):

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, User>({
	max: 1000,
	ttl: 5 * 60 * 1000, // 5 minutes
});

export async function getUser(id: number) {
	const key = String(id);
	const cached = cache.get(key);
	if (cached) return cached;

	const [user] = await db.select().from(users).where(eq(users.id, id));
	if (user) cache.set(key, user);
	return user ?? null;
}
```

### 3.3 Parallel Nested Data Fetching

**Impact: CRITICAL** (eliminates server-side waterfalls)

> **Skill rule**: `server-parallel-nested-fetching`

When fetching nested data in parallel, chain dependent fetches within each item's promise so a slow item doesn't block the rest.

❌ **Incorrect** (a single slow item blocks all nested fetches):

```typescript
const chats = await Promise.all(chatIds.map((id) => getChat(id)));
const chatAuthors = await Promise.all(chats.map((chat) => getUser(chat.authorId)));
```

✅ **Correct** (each item independently chains its own nested fetch):

```typescript
const chatAuthors = await Promise.all(
	chatIds.map((id) => getChat(id).then((chat) => getUser(chat.authorId)))
);
```

> **Spernakit note**: This pattern applies directly to Elysia route handlers and service functions. When batching operations (e.g., fetching dashboard widgets with their data), chain the dependent fetch inside each item's promise rather than awaiting all primary fetches before starting secondary fetches.

### 3.4 Use Fire-and-Forget for Non-Blocking Operations

**Impact: MEDIUM** (faster response times)

> **Skill rule**: `server-after-nonblocking`, adapted from Next.js `after()` to Elysia patterns.

Schedule side effects (logging, analytics, notifications) without blocking the response. In Elysia, return the response immediately and let the side effect run in a fire-and-forget promise. Do not `await` non-critical work that the client doesn't need.

❌ **Incorrect** (blocks response):

```typescript
app.post('/api/orders', async ({ body, user }) => {
	const order = await createOrder(body, user.id);
	await sendConfirmationEmail(order); // Blocks response until email sends
	await logAuditEvent({ action: 'ORDER_CREATED', orderId: order.id }); // Blocks again
	return dataResponse(order);
});
```

✅ **Correct** (response sent immediately):

```typescript
app.post('/api/orders', async ({ body, user }) => {
	const order = await createOrder(body, user.id);

	// Fire-and-forget: do not await
	sendConfirmationEmail(order).catch((err) =>
		logger.error({ err, orderId: order.id }, 'Failed to send confirmation email')
	);
	logAuditEvent({ action: 'ORDER_CREATED', orderId: order.id }).catch((err) =>
		logger.error({ err }, 'Failed to log audit event')
	);

	return dataResponse(order);
});
```

> **Important**: Always attach `.catch()` to fire-and-forget promises to prevent unhandled rejection crashes. Use `logger.error()` for observability.

### 3.5 Avoid Shared Module State for Request Data

**Impact: CRITICAL** (prevents cross-request data leaks)

> **Skill rule**: `server-no-shared-module-state`

> **Spernakit note**: The source skill frames this for RSC/SSR concurrency, but the hazard applies to **any** long-lived concurrent server process, including Elysia on Bun, which runs a single process serving concurrent requests. Mutating module-scope variables to hold request- or user-scoped data leaks one request's data into another. Hold per-request data in the request context, not at module scope. Module-level state is acceptable only for genuinely shared, immutable, or cache-style data (e.g. an LRU cache keyed by id; see 3.2).

❌ **Incorrect** (module-scope variable leaks across concurrent requests):

```typescript
let currentUser: User | null = null; // Shared across ALL requests

app.get('/api/profile', async ({ headers }) => {
	currentUser = await getUserFromToken(headers.authorization); // Overwritten by concurrent requests
	const settings = await getSettings(currentUser.id); // May read a different user's id
	return { user: currentUser, settings };
});
```

✅ **Correct** (request-scoped state, no module mutation):

```typescript
app.get('/api/profile', async ({ headers }) => {
	const user = await getUserFromToken(headers.authorization); // Local to this request
	const settings = await getSettings(user.id);
	return { user, settings };
});
```

> **Spernakit note**: The web backend runs SQLite in a Bun worker and uses request-scoped context. Module-level mutable state holding per-request data would be a real cross-request leak. Use Elysia's `derive`/`resolve` and the request context, never module-scope assignment, for per-request values.

---

### 3.6-3.10 RSC-Only Rules (Next.js Reference)

> **N/A for spernakit**: these rules apply only to Next.js with React Server Components. Retained for reference when auditing Next.js codebases.

| #    | Skill Rule ID              | Rule                              | Summary                                                    |
| ---- | -------------------------- | --------------------------------- | ---------------------------------------------------------- |
| 3.6  | `server-dedup-props`       | Avoid duplicate RSC serialization | RSC deduplicates by reference; transform in client         |
| 3.7  | `server-serialization`     | Minimize RSC→client data          | Only pass fields the client component uses                 |
| 3.8  | `server-parallel-fetching` | Parallel RSC fetching             | Restructure async server components for parallel execution |
| 3.9  | `server-cache-react`       | React.cache() deduplication       | Per-request dedup for auth/DB queries in RSC               |
| 3.10 | `server-hoist-static-io`   | Hoist static I/O                  | Load fonts/logos at module level in RSC                    |

---

## 4. Client-Side Data Fetching

**Impact: HIGH**

Automatic deduplication and efficient data fetching patterns reduce redundant network requests.

### 4.1 Deduplicate Global Event Listeners

**Impact: LOW** (single listener for N components)

Use centralized event listener management to avoid duplicate listeners.

✅ **Correct** (module-level listener deduplication):

```typescript
const keyCallbacks = new Map<string, Set<() => void>>();

function useKeyboardShortcut(key: string, callback: () => void) {
	useEffect(() => {
		if (!keyCallbacks.has(key)) {
			keyCallbacks.set(key, new Set());
		}
		keyCallbacks.get(key)!.add(callback);

		return () => {
			const set = keyCallbacks.get(key);
			if (set) {
				set.delete(callback);
				if (set.size === 0) {
					keyCallbacks.delete(key);
				}
			}
		};
	}, [key, callback]);
}
```

### 4.2 Use Passive Event Listeners for Scrolling Performance

**Impact: MEDIUM** (eliminates scroll delay caused by event listeners)

Add `{ passive: true }` to touch and wheel event listeners to enable immediate scrolling.

❌ **Incorrect**:

```typescript
useEffect(() => {
  const handleWheel = (e: WheelEvent) => console.log(e.deltaY)
  document.addEventListener('wheel', handleWheel)  {/* Blocks scroll */}
  return () => document.removeEventListener('wheel', handleWheel)
}, [])
```

✅ **Correct**:

```typescript
useEffect(() => {
  const handleWheel = (e: WheelEvent) => console.log(e.deltaY)
  document.addEventListener('wheel', handleWheel, { passive: true })  {/* Non-blocking */}
  return () => document.removeEventListener('wheel', handleWheel)
}, [])
```

### 4.3 Use TanStack Query for Automatic Deduplication

**Impact: MEDIUM-HIGH** (automatic deduplication)

> **Skill rule**: `client-swr-dedup`, adapted from SWR to TanStack Query for spernakit.

TanStack Query enables request deduplication, caching, and revalidation across component instances.

❌ **Incorrect** (no deduplication):

```tsx
function UserList() {
	const [users, setUsers] = useState([]);
	useEffect(() => {
		fetch('/api/users')
			.then((r) => r.json())
			.then(setUsers);
	}, []);
}
```

✅ **Correct** (automatic deduplication):

```tsx
import { useQuery } from '@tanstack/react-query';
import { getUsers } from '../api/users';

function UserList() {
	const { data: users } = useQuery({
		queryKey: ['users'],
		queryFn: getUsers, // Multiple instances share the same request
	});
}
```

> **Note**: The Vercel skill recommends SWR. Spernakit uses TanStack Query exclusively; the deduplication principle is identical.

### 4.4 Version and Minimize localStorage Data

**Impact: MEDIUM** (prevents schema conflicts, reduces storage size)

Add version prefix to keys and store only needed fields.

❌ **Incorrect**:

```typescript
localStorage.setItem('userConfig', JSON.stringify(fullUserObject))  {/* No version, stores everything */}
const data = localStorage.getItem('userConfig')
```

✅ **Correct**:

```typescript
const VERSION = 'v2';

function saveConfig(config: { theme: string; language: string }) {
	try {
		localStorage.setItem(`userConfig:${VERSION}`, JSON.stringify(config));
	} catch {
		// Handle quota exceeded, incognito mode, etc.
	}
}

function loadConfig() {
	try {
		const data = localStorage.getItem(`userConfig:${VERSION}`);
		return data ? JSON.parse(data) : null;
	} catch {
		return null;
	}
}
```

⚠️ **Always wrap in try-catch**: `getItem()` and `setItem()` throw in incognito mode or when quota exceeded.

### 4.5 TanStack Query Cache Hygiene

**Impact: MEDIUM-HIGH** (prevents stale UI, redundant refetches, and mutation race conditions)

> **Spernakit-specific** (no source skill rule; extends 4.3 for the TanStack Query stack).

Deduplication (4.3) is only half the story; the cache must also be _invalidated and keyed_ correctly. Audit `useQuery`/`useMutation` usage for:

- **Stable, structured query keys**: Keys must be serializable arrays that include every input the query depends on (`['runs', projectId, { status }]`), not interpolated strings. A key that omits a dependency serves stale data across that dimension; an unstable inline-object key fragments the cache.
- **Targeted invalidation after mutations**: On `onSuccess`, invalidate the **specific** affected keys, not the whole cache. Broad `invalidateQueries()` with no key refetches everything and causes request storms.
- **Optimistic-update rollback**: Optimistic `setQueryData` must capture the previous value and restore it in `onError`, and reconcile in `onSettled`. Missing rollback leaves the UI desynced from the server on failure.
- **Explicit `staleTime` for slow/expensive queries**: The default `staleTime: 0` refetches on every mount/focus. Set a deliberate `staleTime` for data that does not change every second.

❌ **Incorrect** (unkeyed broad invalidation, no rollback):

```tsx
const mutation = useMutation({
	mutationFn: updateRun,
	onSuccess: () => queryClient.invalidateQueries(), // Refetches the ENTIRE cache
});
```

✅ **Correct** (targeted invalidation, optimistic rollback):

```tsx
const mutation = useMutation({
	mutationFn: updateRun,
	onMutate: async (next) => {
		await queryClient.cancelQueries({ queryKey: ['runs', next.projectId] });
		const previous = queryClient.getQueryData(['runs', next.projectId]);
		queryClient.setQueryData(['runs', next.projectId], (old) => applyOptimistic(old, next));
		return { previous };
	},
	onError: (_err, next, ctx) => queryClient.setQueryData(['runs', next.projectId], ctx?.previous), // Rollback
	onSettled: (_data, _err, next) =>
		queryClient.invalidateQueries({ queryKey: ['runs', next.projectId] }), // Targeted reconcile
});
```

---

## 5. Re-render Optimization

**Impact: MEDIUM**

Reducing unnecessary re-renders minimizes wasted computation and improves UI responsiveness.

> **Spernakit note**: All spernakit apps use Zustand for client state. Use selectors to subscribe to specific state slices (`useStore(state => state.field)`) rather than the entire store (`useStore()`), which subscribes to all state changes. React Compiler handles most memoization automatically; see [React Compiler Impact](#react-compiler-impact) for which rules become informational-only.

### 5.1 Defer State Reads to Usage Point

**Impact: MEDIUM** (avoids unnecessary subscriptions)

Don't subscribe to dynamic state if you only read it inside callbacks.

❌ **Incorrect** (subscribes to all searchParams changes):

```tsx
function ShareButton({ chatId }: { chatId: string }) {
	const searchParams = useSearchParams();

	const handleShare = () => {
		const ref = searchParams.get('ref');
		shareChat(chatId, { ref });
	};

	return <button onClick={handleShare}>Share</button>;
}
```

✅ **Correct** (reads on demand, no subscription):

```tsx
function ShareButton({ chatId }: { chatId: string }) {
	const handleShare = () => {
		const params = new URLSearchParams(window.location.search);
		const ref = params.get('ref');
		shareChat(chatId, { ref });
	};

	return <button onClick={handleShare}>Share</button>;
}
```

### 5.2 Extract to Memoized Components

**Impact: MEDIUM** (enables early returns)

Extract expensive work into memoized components to enable early returns before computation.

❌ **Incorrect** (computes avatar even when loading):

```tsx
function Profile({ user, loading }: Props) {
	const avatar = useMemo(() => {
		const id = computeAvatarId(user);
		return <Avatar id={id} />;
	}, [user]);

	if (loading) return <Skeleton />;
	return <div>{avatar}</div>;
}
```

✅ **Correct** (skips computation when loading):

```tsx
const UserAvatar = memo(function UserAvatar({ user }: { user: User }) {
	const id = useMemo(() => computeAvatarId(user), [user]);
	return <Avatar id={id} />;
});

function Profile({ user, loading }: Props) {
	if (loading) return <Skeleton />;
	return (
		<div>
			<UserAvatar user={user} />
		</div>
	);
}
```

> **Note**: If React Compiler is enabled (all spernakit apps), manual memoization is handled automatically. **Suppress** this rule in compiler-enabled projects; only flag if the component uses `'use no memo'` or has a profiled, measurable hot path the compiler failed to optimize.

### 5.3 Narrow Effect Dependencies

**Impact: LOW** (minimizes effect re-runs)

Specify primitive dependencies instead of objects to minimize effect re-runs.

❌ **Incorrect** (re-runs on any user field change):

```tsx
useEffect(() => {
  console.log(user.id)
}, [user])  {/* Re-runs when ANY user field changes */}
```

✅ **Correct** (re-runs only when id changes):

```tsx
useEffect(() => {
  console.log(user.id)
}, [user.id])  {/* Re-runs only when id changes */}
```

### 5.4 Subscribe to Derived State

**Impact: MEDIUM** (reduces re-render frequency)

Subscribe to derived boolean state instead of continuous values to reduce re-render frequency.

❌ **Incorrect** (re-renders on every pixel change):

```tsx
function Sidebar() {
  const width = useWindowWidth()  {/* Updates continuously */}
  const isMobile = width < 768
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

✅ **Correct** (re-renders only when boolean changes):

```tsx
function Sidebar() {
  const isMobile = useMediaQuery('(max-width: 767px)')  {/* Only updates on boolean change */}
  return <nav className={isMobile ? 'mobile' : 'desktop'} />
}
```

### 5.5 Use Functional setState Updates

**Impact: MEDIUM** (prevents stale closures and unnecessary callback recreations)

Use functional update form when updating state based on current state value.

❌ **Incorrect** (requires state as dependency):

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)

  const addItems = useCallback((newItems: Item[]) => {
    setItems([...items, ...newItems])
  }, [items])  {/* Recreated on every items change */}

  return <ItemsEditor items={items} onAdd={addItems} />
}
```

✅ **Correct** (stable callback, no dependencies):

```tsx
function TodoList() {
  const [items, setItems] = useState(initialItems)

  const addItems = useCallback((newItems: Item[]) => {
    setItems(curr => [...curr, ...newItems])  {/* Always uses latest state */}
  }, [])  {/* Stable callback */}

  return <ItemsEditor items={items} onAdd={addItems} />
}
```

### 5.6 Use Lazy State Initialization

**Impact: MEDIUM** (wasted computation on every render)

Pass a function to `useState` for expensive initial values.

❌ **Incorrect** (runs on every render):

```tsx
function UserProfile() {
  const [settings, setSettings] = useState(
    JSON.parse(localStorage.getItem('settings') || '{}')  {/* Parses on every render */}
  )
  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

✅ **Correct** (runs only once):

```tsx
function UserProfile() {
  const [settings, setSettings] = useState(() => {
    const stored = localStorage.getItem('settings')
    return stored ? JSON.parse(stored) : {}  {/* Parses only on initial render */}
  })
  return <SettingsForm settings={settings} onChange={setSettings} />
}
```

### 5.7 Use Transitions for Non-Urgent Updates

**Impact: MEDIUM** (maintains UI responsiveness)

Mark frequent, non-urgent state updates as transitions to maintain UI responsiveness.

❌ **Incorrect** (blocks UI on every scroll):

```tsx
function ScrollTracker() {
	const [scrollY, setScrollY] = useState(0);
	useEffect(() => {
		const handler = () => setScrollY(window.scrollY);
		window.addEventListener('scroll', handler, { passive: true });
		return () => window.removeEventListener('scroll', handler);
	}, []);
}
```

✅ **Correct** (non-blocking updates):

```tsx
import { startTransition } from 'react';

function ScrollTracker() {
	const [scrollY, setScrollY] = useState(0);
	useEffect(() => {
		const handler = () => startTransition(() => setScrollY(window.scrollY));
		window.addEventListener('scroll', handler, { passive: true });
		return () => window.removeEventListener('scroll', handler);
	}, []);
}
```

### 5.8 Hoist Default Non-Primitive Props

**Impact: MEDIUM** (restores memoization by using a constant for default value)

> **Skill rule**: `rerender-memo-with-default-value`

When a memoized component has a default value for a non-primitive optional parameter, calling without that prop breaks memoization (new instance every render).

❌ **Incorrect** (onClick has different value on every render):

```tsx
const UserAvatar = memo(function UserAvatar({ onClick = () => {} }: { onClick?: () => void }) {
	// ...
});

<UserAvatar />; // Memoization broken - new function each render
```

✅ **Correct** (stable default value):

```tsx
const NOOP = () => {};

const UserAvatar = memo(function UserAvatar({ onClick = NOOP }: { onClick?: () => void }) {
	// ...
});

<UserAvatar />; // Memoization works
```

> **Note**: If React Compiler is enabled (all spernakit apps), this is handled automatically. **Suppress** this rule in compiler-enabled projects; only flag if the component uses `'use no memo'` or has a profiled, measurable hot path.

### 5.9 Derive State During Render, Not in Effects

**Impact: MEDIUM** (avoids redundant renders and state drift)

> **Skill rule**: `rerender-derived-state-no-effect`

If a value can be computed from current props/state, derive it during render. Do not store it in state or update it via useEffect.

❌ **Incorrect** (redundant state and effect):

```tsx
function Form() {
	const [firstName, setFirstName] = useState('First');
	const [lastName, setLastName] = useState('Last');
	const [fullName, setFullName] = useState('');

	useEffect(() => {
		setFullName(firstName + ' ' + lastName);
	}, [firstName, lastName]); // Extra render cycle for derived value

	return <p>{fullName}</p>;
}
```

✅ **Correct** (derive during render):

```tsx
function Form() {
	const [firstName, setFirstName] = useState('First');
	const [lastName, setLastName] = useState('Last');
	const fullName = firstName + ' ' + lastName; // Computed inline

	return <p>{fullName}</p>;
}
```

### 5.10 Avoid useMemo for Simple Primitive Expressions

**Impact: LOW-MEDIUM** (removes overhead of useMemo itself)

> **Skill rule**: `rerender-simple-expression-in-memo`

When an expression is simple and returns a primitive (boolean, number, string), `useMemo` overhead exceeds the computation cost.

❌ **Incorrect** (useMemo overhead > expression cost):

```tsx
function Header({ user, notifications }: Props) {
	const isLoading = useMemo(() => {
		return user.isLoading || notifications.isLoading;
	}, [user.isLoading, notifications.isLoading]);

	if (isLoading) return <Skeleton />;
}
```

✅ **Correct** (direct computation):

```tsx
function Header({ user, notifications }: Props) {
	const isLoading = user.isLoading || notifications.isLoading;

	if (isLoading) return <Skeleton />;
}
```

> **Note**: If React Compiler is enabled (all spernakit apps), it skips memoization for trivial expressions automatically. **Suppress** this rule in compiler-enabled projects; only flag if the component uses `'use no memo'` or has a profiled, measurable hot path.

### 5.11 Put Interaction Logic in Event Handlers

**Impact: MEDIUM** (avoids effect re-runs and duplicate side effects)

> **Skill rule**: `rerender-move-effect-to-event`

If a side effect is triggered by a specific user action, run it in the event handler. Don't model actions as state + effect.

❌ **Incorrect** (event modeled as state + effect):

```tsx
function Form() {
	const [submitted, setSubmitted] = useState(false);
	const theme = useContext(ThemeContext);

	useEffect(() => {
		if (submitted) {
			post('/api/register');
			showToast('Registered', theme);
		}
	}, [submitted, theme]); // Re-runs when theme changes too!

	return <button onClick={() => setSubmitted(true)}>Submit</button>;
}
```

✅ **Correct** (do it in the handler):

```tsx
function Form() {
	const theme = useContext(ThemeContext);

	function handleSubmit() {
		post('/api/register');
		showToast('Registered', theme);
	}

	return <button onClick={handleSubmit}>Submit</button>;
}
```

### 5.12 Use Refs for Transient Frequent Values

**Impact: MEDIUM** (avoids unnecessary re-renders on frequent updates)

> **Skill rule**: `rerender-use-ref-transient-values`

When a value changes frequently and you don't need re-renders on every update (mouse position, intervals, transient flags), use `useRef` instead of `useState`.

❌ **Incorrect** (re-renders on every mouse move):

```tsx
function Tracker() {
	const [lastX, setLastX] = useState(0);

	useEffect(() => {
		const onMove = (e: MouseEvent) => setLastX(e.clientX);
		window.addEventListener('mousemove', onMove);
		return () => window.removeEventListener('mousemove', onMove);
	}, []);

	return <div style={{ left: lastX }} />;
}
```

✅ **Correct** (no re-render, direct DOM update):

```tsx
function Tracker() {
	const lastXRef = useRef(0);
	const dotRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const onMove = (e: MouseEvent) => {
			lastXRef.current = e.clientX;
			if (dotRef.current) {
				dotRef.current.style.transform = `translateX(${e.clientX}px)`;
			}
		};
		window.addEventListener('mousemove', onMove);
		return () => window.removeEventListener('mousemove', onMove);
	}, []);

	return <div ref={dotRef} style={{ transform: 'translateX(0px)' }} />;
}
```

### 5.13 Don't Define Components Inside Components

**Impact: HIGH** (prevents remount on every render)

> **Skill rule**: `rerender-no-inline-components`

Defining a component inside another component creates a new component type on every render. React sees a different component each time and fully remounts it, destroying all state and DOM.

**Warning signs**: Input fields lose focus on every keystroke, animations restart unexpectedly, `useEffect` cleanup/setup runs on every parent render, scroll position resets.

❌ **Incorrect** (remounts on every render):

```tsx
function UserProfile({ user, theme }) {
	// Defined inside to access `theme` - BAD
	const Avatar = () => (
		<img src={user.avatarUrl} className={theme === 'dark' ? 'avatar-dark' : 'avatar-light'} />
	);

	const Stats = () => (
		<div>
			<span>{user.followers} followers</span>
			<span>{user.posts} posts</span>
		</div>
	);

	return (
		<div>
			<Avatar />
			<Stats />
		</div>
	);
}
```

✅ **Correct** (pass props instead):

```tsx
function Avatar({ src, theme }: { src: string; theme: string }) {
	return <img src={src} className={theme === 'dark' ? 'avatar-dark' : 'avatar-light'} />;
}

function Stats({ followers, posts }: { followers: number; posts: number }) {
	return (
		<div>
			<span>{followers} followers</span>
			<span>{posts} posts</span>
		</div>
	);
}

function UserProfile({ user, theme }) {
	return (
		<div>
			<Avatar src={user.avatarUrl} theme={theme} />
			<Stats followers={user.followers} posts={user.posts} />
		</div>
	);
}
```

### 5.14 Split Combined Hook Computations

**Impact: MEDIUM** (avoids recomputing independent steps)

> **Skill rule**: `rerender-split-combined-hooks`

When a hook contains multiple independent tasks with different dependencies, split them into separate hooks. A combined hook reruns all tasks when any dependency changes.

❌ **Incorrect** (changing `sortOrder` recomputes filtering):

```tsx
const sortedProducts = useMemo(() => {
	const filtered = products.filter((p) => p.category === category);
	const sorted = filtered.toSorted((a, b) =>
		sortOrder === 'asc' ? a.price - b.price : b.price - a.price
	);
	return sorted;
}, [products, category, sortOrder]);
```

✅ **Correct** (filtering only recomputes when products or category change):

```tsx
const filteredProducts = useMemo(
	() => products.filter((p) => p.category === category),
	[products, category]
);

const sortedProducts = useMemo(
	() =>
		filteredProducts.toSorted((a, b) =>
			sortOrder === 'asc' ? a.price - b.price : b.price - a.price
		),
	[filteredProducts, sortOrder]
);
```

This also applies to `useEffect`: split unrelated side effects into separate hooks:

```tsx
// Instead of one effect with [pathname, pageTitle]
useEffect(() => {
	analytics.trackPageView(pathname);
}, [pathname]);

useEffect(() => {
	document.title = `${pageTitle} | My App`;
}, [pageTitle]);
```

> **Note**: If React Compiler is enabled (all spernakit apps), it automatically optimizes dependency tracking. **Suppress** this rule in compiler-enabled projects; only flag if there is a profiled, measurable performance issue.

### 5.15 Use useDeferredValue for Expensive Derived Renders

**Impact: MEDIUM** (keeps input responsive during heavy computation)

> **Skill rule**: `rerender-use-deferred-value`

When user input triggers expensive computations or renders, use `useDeferredValue` to keep the input responsive. The deferred value lags behind, allowing React to prioritize the input update.

❌ **Incorrect** (input feels laggy while filtering):

```tsx
function Search({ items }: { items: Item[] }) {
	const [query, setQuery] = useState('');
	const filtered = items.filter((item) => fuzzyMatch(item, query));

	return (
		<>
			<input value={query} onChange={(e) => setQuery(e.target.value)} />
			<ResultsList results={filtered} />
		</>
	);
}
```

✅ **Correct** (input stays snappy, results render when ready):

```tsx
function Search({ items }: { items: Item[] }) {
	const [query, setQuery] = useState('');
	const deferredQuery = useDeferredValue(query);
	const filtered = useMemo(
		() => items.filter((item) => fuzzyMatch(item, deferredQuery)),
		[items, deferredQuery]
	);
	const isStale = query !== deferredQuery;

	return (
		<>
			<input value={query} onChange={(e) => setQuery(e.target.value)} />
			<div style={{ opacity: isStale ? 0.7 : 1 }}>
				<ResultsList results={filtered} />
			</div>
		</>
	);
}
```

**When to use**: Filtering/searching large lists, expensive visualizations reacting to input, any derived state that causes noticeable render delays. Always wrap the expensive computation in `useMemo` with the deferred value as dependency.

---

## 6. Rendering Performance

**Impact: MEDIUM**

Optimizing rendering process reduces work browser needs to do.

### 6.1 Animate SVG Wrapper Instead of SVG Element

**Impact: LOW** (enables hardware acceleration)

Many browsers don't have hardware acceleration for CSS3 animations on SVG elements. Wrap SVG in a `<div>`.

❌ **Incorrect** (no hardware acceleration):

```tsx
function LoadingSpinner() {
	return (
		<svg className="animate-spin" width="24" height="24" viewBox="0 0 24 24">
			<circle cx="12" cy="12" r="10" stroke="currentColor" />
		</svg>
	);
}
```

✅ **Correct** (hardware accelerated):

```tsx
function LoadingSpinner() {
	return (
		<div className="animate-spin">
			{' '}
			{/* Animate wrapper instead */}
			<svg width="24" height="24" viewBox="0 0 24 24">
				<circle cx="12" cy="12" r="10" stroke="currentColor" />
			</svg>
		</div>
	);
}
```

### 6.2 CSS content-visibility for Long Lists

**Impact: HIGH** (faster initial render)

Apply `content-visibility: auto` to defer off-screen rendering.

✅ **Correct**:

```css
.message-item {
	content-visibility: auto;
	contain-intrinsic-size: 0 80px;
}
```

For 1000 messages, browser skips layout/paint for ~990 off-screen items (10× faster initial render).

### 6.3 Hoist Static JSX Elements

**Impact: LOW** (avoids re-creation)

Extract static JSX outside components to avoid re-creation.

❌ **Incorrect** (recreates element every render):

```tsx
function Container() {
	return <div>{loading && <div className="h-20 animate-pulse bg-gray-200" />}</div>;
}
```

✅ **Correct** (reuses same element):

```tsx
const loadingSkeleton = <div className="h-20 animate-pulse bg-gray-200" />;

function Container() {
	return <div>{loading && loadingSkeleton}</div>;
}
```

> **Note**: If React Compiler is enabled (all spernakit apps), the compiler automatically hoists static JSX elements. **Suppress** this rule in compiler-enabled projects; only flag if the component uses `'use no memo'`.

### 6.4 Optimize SVG Precision

**Impact: LOW** (reduces file size)

Reduce SVG coordinate precision to decrease file size.

❌ **Incorrect** (excessive precision):

```svg
<path d="M 10.293847 20.847362 L 30.938472 40.192837" />
```

✅ **Correct** (1 decimal place):

```svg
<path d="M 10.3 20.8 L 30.9 40.2" />
```

Automate with SVGO:

```bash
bunx svgo --precision=1 --multipass icon.svg
```

### 6.5 Prevent Theme Flash on Initial Load

**Impact: MEDIUM** (avoids visual flicker)

When rendering content that depends on client-side storage (e.g., theme preference), inject a synchronous inline script that updates the DOM before React renders. This originates from SSR hydration mismatch prevention but applies equally to client SPAs for theme initialization.

❌ **Incorrect** (visual flickering):

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
  const [theme, setTheme] = useState('light')

  useEffect(() => {
    const stored = localStorage.getItem('theme')
    if (stored) setTheme(stored)  {/* Runs after hydration - causes flash */}
  }, [])

  return <div className={theme}>{children}</div>
}
```

✅ **Correct** (no flicker, no hydration mismatch):

```tsx
function ThemeWrapper({ children }: { children: ReactNode }) {
	return (
		<>
			<div id="theme-wrapper">{children}</div>
			<script
				dangerouslySetInnerHTML={{
					__html: `
            (function() {
              try {
                var theme = localStorage.getItem('theme') || 'light';
                var el = document.getElementById('theme-wrapper');
                if (el) el.className = theme;
              } catch (e) {}
            })();
          `,
				}}
			/>
		</>
	);
}
```

### 6.6 Use Activity Component for Show/Hide

**Impact: MEDIUM** (preserves component state)

Use React's `<Activity>` API (formerly `<Offscreen>`) to preserve hidden component state instead of unmounting.

> **Spernakit note**: `<Activity>` is available as a stable export in React 19.2+ (spernakit pins `react` 19.2.7). It takes a `mode="visible" | "hidden"` prop: a `hidden` Activity unmounts its effects but preserves component state and DOM, so reopening it restores the prior state without a remount. CSS `display: none` with state lifted to Zustand remains a valid alternative when you also need the DOM to stay laid out.

❌ **Incorrect** (unmounts and loses state):

```tsx
function Panel({ show }) {
  if (!show) return null  {/* Component unmounts, state lost */}
  return <div>Content</div>
}
```

✅ **Correct** (preserves state):

```tsx
import { Activity } from 'react'; // Stable in React 19.2+

function Panel({ show }) {
	return (
		<Activity mode={show ? 'visible' : 'hidden'}>
			<div>Content</div> {/* State preserved when hidden */}
		</Activity>
	);
}
```

### 6.7 Use Explicit Conditional Rendering

**Impact: MEDIUM** (prevents rendering `0` or `NaN`)

Use ternary operators (`? :`) instead of `&&` for conditional rendering when the condition can be `0`, `NaN`, or other falsy values that React will render as text.

❌ **Incorrect** (renders `"0"` when count is 0):

```tsx
function Badge({ count }: { count: number }) {
	return <div>{count && <span className="badge">{count}</span>}</div>;
}

// When count = 0, renders: <div>0</div>
// When count = 5, renders: <div><span class="badge">5</span></div>
```

✅ **Correct** (renders nothing when count is 0):

```tsx
function Badge({ count }: { count: number }) {
	return <div>{count > 0 ? <span className="badge">{count}</span> : null}</div>;
}

// When count = 0, renders: <div></div>
// When count = 5, renders: <div><span class="badge">5</span></div>
```

### 6.8 Prefer useTransition Over Manual Loading States

**Impact: LOW** (reduces re-renders, improves code clarity)

> **Skill rule**: `rendering-usetransition-loading`

Use `useTransition` instead of manual `useState` for loading states. Provides built-in `isPending` and automatic transition management.

❌ **Incorrect** (manual loading state):

```tsx
function SearchResults() {
	const [results, setResults] = useState([]);
	const [isLoading, setIsLoading] = useState(false);

	const handleSearch = async (value: string) => {
		setIsLoading(true);
		const data = await fetchResults(value);
		setResults(data);
		setIsLoading(false); // Must remember to reset; not resilient to errors
	};

	return (
		<>
			<input onChange={(e) => handleSearch(e.target.value)} />
			{isLoading && <Spinner />}
			<ResultsList results={results} />
		</>
	);
}
```

✅ **Correct** (useTransition with built-in pending):

```tsx
import { useTransition, useState } from 'react';

function SearchResults() {
	const [results, setResults] = useState([]);
	const [isPending, startTransition] = useTransition();

	const handleSearch = (value: string) => {
		startTransition(async () => {
			const data = await fetchResults(value);
			setResults(data);
		});
	};

	return (
		<>
			<input onChange={(e) => handleSearch(e.target.value)} />
			{isPending && <Spinner />}
			<ResultsList results={results} />
		</>
	);
}
```

### 6.9 Use React DOM Resource Hints

**Impact: HIGH** (reduces load time for critical resources)

> **Skill rule**: `rendering-resource-hints`

React DOM provides APIs to hint the browser about resources it will need, starting loading before the client even needs them.

| API             | Use case                                    |
| --------------- | ------------------------------------------- |
| `prefetchDNS`   | Third-party domains you'll connect to later |
| `preconnect`    | APIs or CDNs you'll fetch from immediately  |
| `preload`       | Critical resources needed for current page  |
| `preloadModule` | JS modules for likely next navigation       |
| `preinit`       | Stylesheets/scripts that must execute early |
| `preinitModule` | ES modules that must execute early          |

✅ **Correct** (preconnect to APIs, preload critical resources):

```tsx
import { preconnect, prefetchDNS, preload } from 'react-dom';

function App() {
	prefetchDNS('https://analytics.example.com');
	preconnect('https://api.example.com');
	preload('/fonts/inter.woff2', { as: 'font', type: 'font/woff2', crossOrigin: 'anonymous' });

	return <main>{/* content */}</main>;
}
```

✅ **Correct** (preload modules on hover for code-split routes):

```tsx
import { preloadModule } from 'react-dom';

function Navigation() {
	const preloadDashboard = () => {
		preloadModule('/dashboard.js', { as: 'script' });
	};

	return (
		<a href="/dashboard" onMouseEnter={preloadDashboard}>
			Dashboard
		</a>
	);
}
```

### 6.10 Use defer or async on Script Tags

**Impact: HIGH** (eliminates render-blocking)

> **Skill rule**: `rendering-script-defer-async`

Script tags without `defer` or `async` block HTML parsing while the script downloads and executes. This delays First Contentful Paint and Time to Interactive.

- **`defer`**: Downloads in parallel, executes after HTML parsing completes, maintains execution order
- **`async`**: Downloads in parallel, executes immediately when ready, no guaranteed order

Use `defer` for scripts that depend on DOM or other scripts. Use `async` for independent scripts like analytics.

❌ **Incorrect** (blocks rendering):

```tsx
<head>
	<script src="https://example.com/analytics.js" />
	<script src="/scripts/utils.js" />
</head>
```

✅ **Correct** (non-blocking):

```tsx
<head>
	{/* Independent script - use async */}
	<script src="https://example.com/analytics.js" async />
	{/* DOM-dependent script - use defer */}
	<script src="/scripts/utils.js" defer />
</head>
```

> **Spernakit note**: Vite handles script injection for your app bundle automatically. This rule applies to any third-party scripts loaded via `<script>` tags in `index.html` or injected dynamically.

---

## 7. JavaScript Performance

**Impact: MEDIUM**

JavaScript micro-optimizations can add up in performance-critical code paths.

### 7.1 Avoid Layout Thrashing

**Impact: MEDIUM** (prevents forced synchronous layouts and reduces performance bottlenecks)

Avoid interleaving style writes with layout reads. When you read a layout property (like `offsetWidth`, `getBoundingClientRect()`, or `getComputedStyle()`) between style changes, the browser is forced to trigger a synchronous reflow.

❌ **Incorrect** (interleaved reads and writes force reflows):

```typescript
function layoutThrashing(element: HTMLElement) {
	element.style.width = '100px';
	const width = element.offsetWidth; // Forces reflow
	element.style.height = '200px';
	const height = element.offsetHeight; // Forces another reflow
}
```

✅ **Correct** (batch writes, then read once):

```typescript
function updateElementStyles(element: HTMLElement) {
	// Batch all writes together
	element.style.width = '100px';
	element.style.height = '200px';
	element.style.backgroundColor = 'blue';
	element.style.border = '1px solid black';

	// Read after all writes are done (single reflow)
	const { width, height } = element.getBoundingClientRect();
}
```

✅ **Better** (use CSS classes):

```tsx
function Box({ isHighlighted }: { isHighlighted: boolean }) {
	return <div className={isHighlighted ? 'highlighted-box' : ''}>Content</div>;
}
```

Prefer CSS classes over inline styles when possible. CSS files are cached by the browser, and classes provide better separation of concerns and are easier to maintain.

### 7.2 Build Index Maps for Repeated Lookups

**Impact: HIGH** (O(1) lookup instead of O(n))

Build index maps for repeated lookups in arrays.

❌ **Incorrect** (O(n) lookup per iteration):

```typescript
for (const item of items) {
  const user = users.find(u => u.id === item.userId)  {/* O(n) per item */}
  console.log(user?.name)
}
```

✅ **Correct** (O(1) lookup):

```typescript
const userMap = new Map(users.map(u => [u.id, u]))  {/* O(n) once */}

for (const item of items) {
  const user = userMap.get(item.userId)  {/* O(1) per item */}
  console.log(user?.name)
}
```

### 7.3 Cache Property Access in Loops

**Impact: LOW** (reduces repeated property lookups)

Cache repeated property access in loops.

❌ **Incorrect**:

```typescript
for (let i = 0; i < array.length; i++) {
	for (let j = 0; j < array[i].nested.length; j++) {
		console.log(array[i].nested[j]);
	}
}
```

✅ **Correct**:

```typescript
for (let i = 0; i < array.length; i++) {
  const nested = array[i].nested  {/* Cache once */}
  for (let j = 0; j < nested.length; j++) {
    console.log(nested[j])
  }
}
```

### 7.4 Cache Repeated Function Calls

**Impact: MEDIUM** (avoids redundant computation)

Cache expensive function call results.

❌ **Incorrect**:

```typescript
for (const item of items) {
  const transformed = expensiveTransform(item)  {/* Called on every iteration */}
  process(transformed)
}
```

✅ **Correct**:

```typescript
const transformed = items.map(expensiveTransform)  {/* Called once per item */}

for (const result of transformed) {
  process(result)
}
```

### 7.5 Cache Storage API Calls

**Impact: MEDIUM** (reduces synchronous I/O)

Cache localStorage/sessionStorage reads in hot code paths.

❌ **Incorrect**:

```typescript
function render() {
  const theme = localStorage.getItem('theme')  {/* Synchronous I/O */}
  return <div className={theme}>...</div>
}
```

✅ **Correct**:

```typescript
let cachedTheme: string | null = null

function getTheme() {
  if (cachedTheme === null) {
    cachedTheme = localStorage.getItem('theme') || 'light'  {/* Cache result */}
  }
  return cachedTheme
}

function render() {
  const theme = getTheme()  {/* Uses cache */}
  return <div className={theme}>...</div>
}
```

### 7.6 Combine Multiple Array Iterations

**Impact: HIGH** (reduces iteration overhead)

Combine multiple passes over arrays into a single iteration.

❌ **Incorrect** (3 iterations):

```typescript
const active = items.filter((item) => item.active);
const processed = active.map((item) => processItem(item));
const validated = processed.filter((item) => item.isValid);
```

✅ **Correct** (1 iteration):

```typescript
const result = [];
for (const item of items) {
	if (!item.active) continue;
	const processed = processItem(item);
	if (processed.isValid) {
		result.push(processed);
	}
}
```

### 7.7 Early Length Check for Array Comparisons

**Impact: LOW** (fast-fail optimization)

Check array lengths before comparing contents.

❌ **Incorrect**:

```typescript
function arraysEqual(a: any[], b: any[]) {
  return a.every((item, i) => item === b[i])  {/* Always iterates */}
}
```

✅ **Correct**:

```typescript
function arraysEqual(a: any[], b: any[]) {
  if (a.length !== b.length) return false  {/* Fast fail */}
  return a.every((item, i) => item === b[i])
}
```

### 7.8 Early Return from Functions

**Impact: LOW** (reduces nesting)

Use early returns to reduce nesting and improve readability.

❌ **Incorrect**:

```typescript
function process(data: Data | null) {
	if (data !== null) {
		if (data.isValid) {
			if (data.isAuthorized) {
				// Process data
				return result;
			}
		}
	}
	return null;
}
```

✅ **Correct**:

```typescript
function process(data: Data | null) {
	if (!data) return null;
	if (!data.isValid) return null;
	if (!data.isAuthorized) return null;

	// Process data
	return result;
}
```

### 7.9 Hoist RegExp Creation

**Impact: LOW** (reduces repeated regex compilation)

Create regex patterns outside loops or memoize them.

❌ **Incorrect**:

```typescript
function validateEmails(emails: string[]) {
  return emails.filter(email => {
    const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/  {/* Compiled on every iteration */}
    return regex.test(email)
  })
}
```

✅ **Correct**:

```typescript
function validateEmails(emails: string[]) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/  {/* Compiled once */}
  return emails.filter(email => emailRegex.test(email))
}
```

### 7.10 Use Loop for Min/Max Instead of Sort

**Impact: MEDIUM** (O(n) instead of O(n log n))

Use a loop for min/max instead of sorting entire array.

❌ **Incorrect** (O(n log n)):

```typescript
const min = Math.min(...numbers)  {/* Creates array from spread */}
const max = Math.max(...numbers)
```

✅ **Correct** (O(n)):

```typescript
let min = Infinity;
let max = -Infinity;
for (const num of numbers) {
	if (num < min) min = num;
	if (num > max) max = num;
}
```

### 7.11 Use Set/Map for O(1) Lookups

**Impact: HIGH** (O(1) instead of O(n))

Use Set for membership testing, Map for key-value lookups.

❌ **Incorrect** (O(n) lookup):

```typescript
function hasPermission(user: User, permission: string): boolean {
  return user.permissions.includes(permission)  {/* O(n) per check */}
}
```

✅ **Correct** (O(1) lookup):

```typescript
function hasPermission(user: User, permission: string): boolean {
  const permissions = new Set(user.permissions)  {/* Build once */}
  return permissions.has(permission)  {/* O(1) per check */}
}
```

### 7.12 Use toSorted() Instead of sort() for Immutability

**Impact: LOW** (avoids accidental mutation)

Use `toSorted()` for immutable operations instead of mutating with `sort()`.

❌ **Incorrect** (mutates original):

```typescript
const sorted = items.sort((a, b) => a.id - b.id)  {/* Mutates items */}
```

✅ **Correct** (immutable):

```typescript
const sorted = items.toSorted((a, b) => a.id - b.id)  {/* Returns new sorted array */}
```

### 7.13 Use flatMap to Map and Filter in One Pass

**Impact: LOW-MEDIUM** (eliminates intermediate array)

> **Skill rule**: `js-flatmap-filter`

Chaining `.map().filter(Boolean)` creates an intermediate array and iterates twice. Use `.flatMap()` to transform and filter in a single pass.

❌ **Incorrect** (2 iterations, intermediate array):

```typescript
const userNames = users.map((user) => (user.isActive ? user.name : null)).filter(Boolean);
```

✅ **Correct** (1 iteration, no intermediate array):

```typescript
const userNames = users.flatMap((user) => (user.isActive ? [user.name] : []));
```

**When to use**: Transforming items while filtering some out, conditional mapping where some inputs produce no output, parsing/validating where invalid inputs should be skipped.

### 7.14 Defer Non-Critical Work with requestIdleCallback

**Impact: MEDIUM** (keeps the main thread free during interaction)

> **Skill rule**: `js-request-idle-callback`

Work that is not user-visible (analytics, telemetry flush, prefetch, deferred `localStorage` writes) should not run during a user interaction or the critical render path. Schedule it with `requestIdleCallback`, which runs the callback when the browser is idle, with a `timeout` so it still runs under sustained load. Fall back to `setTimeout` where `requestIdleCallback` is unavailable.

❌ **Incorrect** (blocks the interaction handler):

```typescript
function handleClick() {
	doCriticalWork();
	flushTelemetry(); // Competes with the interaction on the main thread
	writeAnalytics();
}
```

✅ **Correct** (defers non-critical work to idle time):

```typescript
const scheduleIdle =
	typeof requestIdleCallback === 'function'
		? requestIdleCallback
		: (cb: () => void) => setTimeout(cb, 0);

function handleClick() {
	doCriticalWork();
	scheduleIdle(
		() => {
			flushTelemetry();
			writeAnalytics();
		},
		{ timeout: 2000 }
	);
}
```

> **Spernakit note**: aidd and spernakit ship telemetry/analytics that flush from the client. Route that flush, prefetch warming, and non-urgent `localStorage` writes through an idle callback so they don't block clicks, typing, or navigation.

---

## 8. Advanced Patterns

**Impact: LOW**

Advanced optimization patterns for edge cases and specific scenarios.

### 8.1 Do Not Put Effect Events in Dependency Arrays

**Impact: LOW** (prevents ESLint warnings and unnecessary re-runs)

> **Skill rule**: `advanced-effect-event-deps`

React's `useEffectEvent` (stable in React 19.2+) creates event functions that should not be included in effect dependency arrays. Including them causes ESLint warnings and defeats the purpose of the API.

❌ **Incorrect** (effect event in deps):

```tsx
import { useEffect, useEffectEvent } from 'react';

function Chat({ roomId }) {
	const onVisit = useEffectEvent(() => {
		logVisit(roomId);
	});

	useEffect(() => {
		onVisit();
	}, [onVisit]); // ❌ Don't include useEffectEvent results in deps
}
```

✅ **Correct** (omit from deps):

```tsx
import { useEffect, useEffectEvent } from 'react';

function Chat({ roomId }) {
	const onVisit = useEffectEvent(() => {
		logVisit(roomId);
	});

	useEffect(() => {
		onVisit();
	}, []); // ✅ Effect event is not a dependency
}
```

> **Spernakit note**: `useEffectEvent` is stable as of React 19.2 (spernakit pins `react` 19.2.7), so it is the recommended API here. The `useLatest` pattern (see 8.4) remains only as a legacy fallback for codebases on older React.

### 8.2 Initialize App Once, Not Per Mount

**Impact: LOW-MEDIUM** (avoids duplicate init in development)

> **Skill rule**: `advanced-init-once`

Don't put app-wide initialization inside `useEffect([])`: components remount and effects re-run (especially in StrictMode). Use a module-level guard.

❌ **Incorrect** (runs twice in dev, re-runs on remount):

```tsx
function App() {
	useEffect(() => {
		loadFromStorage();
		checkAuthToken();
	}, []);
}
```

✅ **Correct** (once per app load):

```tsx
let didInit = false;

function App() {
	useEffect(() => {
		if (didInit) return;
		didInit = true;
		loadFromStorage();
		checkAuthToken();
	}, []);
}
```

### 8.3 Store Event Handlers in Refs

**Impact: LOW** (stable references without useCallback)

> **Skill rule**: `advanced-event-handler-refs`

Store event handlers in refs when `useCallback` dependency arrays become complex.

✅ **Correct**:

```typescript
function Component({ id, onAction }) {
	const onActionRef = useRef(onAction);
	onActionRef.current = onAction; {/* Always update ref */}

	const handleClick = useCallback(() => {
		onActionRef.current(id); {/* Uses latest handler without dependency */}
	}, [id]);

	return <button onClick={handleClick}>Action</button>;
}
```

### 8.4 useLatest for Stable Callback Refs (Legacy Fallback)

**Impact: LOW** (simplifies ref-based callbacks)

Use the `useLatest` hook pattern to maintain stable references to latest values. This is a **legacy fallback** for codebases on React older than 19.2 where `useEffectEvent` is unavailable. On the current spernakit stack (React 19.2+), prefer `useEffectEvent` (8.5) instead.

✅ **Correct**:

```typescript
function useLatest<T>(value: T) {
	const ref = useRef(value);
	ref.current = value;
	return ref;
}

function Component({ data, onProcess }) {
	const dataRef = useLatest(data);
	const onProcessRef = useLatest(onProcess);

	const handleClick = useCallback(() => {
		onProcessRef.current(dataRef.current);
	}, []); {/* No dependencies, always latest */}

	return <button onClick={handleClick}>Process</button>;
}
```

### 8.5 useEffectEvent for Stable Callback Refs

**Impact: LOW** (modern replacement for useLatest)

> **Skill rule**: `advanced-use-latest`, updated to recommend `useEffectEvent` as primary.

React's `useEffectEvent` provides a stable callback reference that always sees the latest props and state without needing to be in dependency arrays. It is the recommended modern replacement for the `useLatest` pattern.

✅ **Correct**:

```tsx
import { useEffect, useEffectEvent } from 'react';

function Timer({ interval, onTick }) {
	const handleTick = useEffectEvent(() => {
		onTick();
	});

	useEffect(() => {
		const id = setInterval(() => {
			handleTick(); // Always calls latest onTick without dependency churn
		}, interval);
		return () => clearInterval(id);
	}, [interval]); // ✅ Only interval is a dependency
}
```

> **Spernakit note**: `useEffectEvent` is stable as of React 19.2 (spernakit pins `react` 19.2.7), so it is the **primary recommended** API for stable callback refs. Use it instead of the `useLatest` pattern (8.4), which is retained only as a legacy fallback for older React.

---

## Audit Checklist

### Critical Issues 🚨

**Eliminating Waterfalls**

- [ ] **Critical**: No sequential async operations that could be parallel (`Promise.all`, `better-all`)
- [ ] **Critical**: Cheap sync conditions checked before async flags (avoid paying for async when guard fails)
- [ ] **Critical**: Async operations deferred until actually needed (avoid blocking unused code paths)
- [ ] **Critical**: API routes start independent operations immediately (start early, await late)
- [ ] **Critical**: No waterfall chains in data fetching
- [ ] **Critical**: React 19 `use()` used to share promises across sibling components where applicable

**Bundle Size Optimization**

- [ ] **Critical**: Direct imports used instead of barrel files (lucide-react, @mui/material, etc.)
- [ ] **Critical**: Heavy components use `React.lazy()` with Suspense fallbacks
- [ ] **Critical**: Large modules conditionally loaded based on feature activation
- [ ] **Critical**: Import and file paths statically analyzable by bundler (no dynamic path composition)
- [ ] **Critical**: Non-critical third-party libs deferred (analytics, logging)
- [ ] **Critical**: Bundle size analysis performed regularly

**Endpoint Security**

- [ ] **Critical**: All backend endpoints authenticate and authorize (Elysia guards)
- [ ] **Critical**: No reliance solely on frontend route guards for security

### High Priority Issues ⚠️

**Server-Side Performance**

- [ ] **High**: LRU cache used for cross-request deduplication in backend services
- [ ] **High**: Nested data fetches chained per item in `Promise.all` (no blocking on slow items)
- [ ] **High**: Non-blocking side effects use fire-and-forget promises with `.catch()` (logging, analytics, email)

**Client-Side Data Fetching**

- [ ] **High**: TanStack Query used for automatic request deduplication
- [ ] **High**: Query keys are stable, structured arrays including every dependency; mutations invalidate targeted keys (not the whole cache); optimistic updates roll back on error (see 4.5)
- [ ] **High**: localStorage reads wrapped in try-catch
- [ ] **High**: localStorage keys versioned to prevent schema conflicts
- [ ] **High**: Only necessary fields stored in localStorage
- [ ] **High**: Passive event listeners used for scroll/touch events
- [ ] **High**: Global event listeners deduplicated (module-level pattern)

**Re-render Optimization**

- [ ] **High**: No components defined inside other components (causes remount on every render)
- [ ] **High**: State reads deferred to usage point (avoid premature subscriptions)
- [ ] **High**: Functional setState updates used when state depends on previous value
- [ ] **High**: Lazy state initialization used for expensive initial values
- [ ] **High**: Transitions used for non-urgent frequent updates (scroll tracking)
- [ ] **High**: Derived state subscribed to instead of continuous values

**Rendering Performance**

- [ ] **High**: CSS content-visibility applied to long lists
- [ ] **High**: Ternary operators used instead of `&&` for falsy/numeric conditional rendering
- [ ] **High**: React DOM resource hints used for critical resources (preconnect, preload, prefetchDNS)
- [ ] **High**: Script tags use defer or async to avoid render-blocking

### Medium Priority Issues 📋

**Re-render Optimization**

- [ ] **Medium**: Narrow effect dependencies (primitive values instead of objects)
- [ ] **Medium**: Expensive work extracted to memoized components (if no React Compiler)
- [ ] **Medium**: Default non-primitive props hoisted to constants (for memo'd components)
- [ ] **Medium**: Derived state computed during render, not in effects
- [ ] **Medium**: Interaction logic in event handlers, not state + effect
- [ ] **Medium**: Refs used for transient frequent values (mouse position, intervals)
- [ ] **Medium**: Combined hook computations split by independent dependencies
- [ ] **Medium**: useDeferredValue used for expensive renders triggered by user input
- [ ] **Medium**: Static JSX elements hoisted outside components

**Rendering Performance**

- [ ] **Medium**: SVG animations applied to wrapper div for hardware acceleration
- [ ] **Medium**: SVG precision optimized with SVGO
- [ ] **Medium**: Activity component used for show/hide patterns
- [ ] **Medium**: useTransition preferred over manual loading state

**JavaScript Performance**

- [ ] **Medium**: Index maps built for repeated lookups (Set/Map)
- [ ] **Medium**: Multiple array iterations combined into single pass
- [ ] **Medium**: Storage API calls cached in hot code paths
- [ ] **Medium**: Layout thrashing avoided (reads batched before/after writes, CSS classes preferred)
- [ ] **Medium**: Loop used for min/max instead of sort
- [ ] **Medium**: Set/Map used for O(1) lookups
- [ ] **Medium**: Non-critical work (analytics, telemetry flush, prefetch) deferred with requestIdleCallback

### Low Priority Issues 💡

**Re-render Optimization**

- [ ] **Low**: Avoid useMemo for simple primitive expressions

**JavaScript Performance**

- [ ] **Low**: Property access cached in loops
- [ ] **Low**: Repeated function calls cached
- [ ] **Low**: Early length check for array comparisons
- [ ] **Low**: Early returns used to reduce nesting
- [ ] **Low**: RegExp creation hoisted outside loops
- [ ] **Low**: toSorted() used for immutable sorting
- [ ] **Low**: flatMap used for map+filter in one pass

**Advanced Patterns**

- [ ] **Low**: Event handlers stored in refs for stability
- [ ] **Low**: useEffectEvent used for stable callbacks (stable in React 19.2+); useLatest only as a legacy fallback for older React
- [ ] **Low**: useEffectEvent not included in effect dependency arrays
- [ ] **Low**: App-wide initialization guarded against remount (module-level flag)

---

## Report Template

````markdown
# React Best Practices Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Score**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Medium Priority Issues Found**: [Number]
**Low Priority Issues Found**: [Number]

**Performance Impact Summary**:

- Waterfalls eliminated: [Yes/No/Partial]
- Bundle size optimized: [Yes/No/Partial]
- Server-side performance: [Score]/25
- Client-side efficiency: [Score]/25

## Category Breakdown

### 1. Eliminating Waterfalls (CRITICAL)

**Score**: [Score]/25
**Issues Found**: [Number]

| ID   | Issue         | Impact              | Location    | Fix        |
| ---- | ------------- | ------------------- | ----------- | ---------- |
| [ID] | [Description] | [2-10× improvement] | [File:Line] | [Solution] |

### 2. Bundle Size Optimization (CRITICAL)

**Score**: [Score]/25
**Issues Found**: [Number]

| ID   | Issue         | Impact            | Location    | Fix        |
| ---- | ------------- | ----------------- | ----------- | ---------- |
| [ID] | [Description] | [200-800ms saved] | [File:Line] | [Solution] |

### 3. Server-Side Performance (HIGH)

**Score**: [Score]/15
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

### 4. Client-Side Data Fetching (HIGH)

**Score**: [Score]/15
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

### 5. Re-render Optimization (MEDIUM)

**Score**: [Score]/10
**Issues Found**: [Number]

| ID   | Issue         | Impact   | Location    | Fix        |
| ---- | ------------- | -------- | ----------- | ---------- |
| [ID] | [Description] | [Impact] | [File:Line] | [Solution] |

## Detailed Findings

### Critical Issues 🚨

#### Issue #1: [Title]

- **Severity**: Critical (Level 1)
- **Category**: [Waterfalls/Bundle/Security]
- **Impact**: [Performance impact description]
- **Location**: `path/to/file.ts:line`
- **Code**:

    ```typescript
    // Incorrect code
    ```

- **Fix**:

    ```typescript
    // Correct code
    ```

- **Effort Estimate**: [Hours/Days]
- **Dependencies**: [Any blocking factors]

### High Priority Issues ⚠️

[Similar format for high priority issues]

### Medium Priority Issues 📋

[Similar format for medium priority issues]

### Low Priority Issues 💡

[Similar format for low priority issues]

## Recommendations

### Immediate Actions (0-7 days)

1. **[Critical waterfall elimination]**
    - Impact: 2-10× improvement
    - Effort: [Low/Medium/High]
    - Files: [List of affected files]

2. **[Critical bundle size optimization]**
    - Impact: [200-800ms] faster imports
    - Effort: [Low/Medium/High]
    - Files: [List of affected libraries]

### Short-term Actions (1-4 weeks)

1. **[High priority server-side optimization]**
    - Impact: [Description]
    - Effort: [Low/Medium/High]

2. **[High priority client-side optimization]**
    - Impact: [Description]
    - Effort: [Low/Medium/High]

### Long-term Actions (1-3 months)

1. **[Medium priority re-render optimization]**
    - Impact: [Description]
    - Effort: [Low/Medium/High]

2. **[JavaScript performance improvements]**
    - Impact: [Description]
    - Effort: [Low/Medium/High]

## Metrics and KPIs

- **Waterfall Elimination**: [Percentage]% of async operations parallelized
- **Bundle Size**: [Current]KB → [Target]KB (improvement: [Percentage]%)
- **LRU Cache Usage**: [Count] backend services using LRU caching
- **TanStack Query Integration**: [Percentage]% of data fetching using useQuery
- **Re-render Reduction**: [Percentage]% reduction in unnecessary re-renders

## Next Audit Date

Recommended: [Date] (Monthly for active development)

---

**Auditor**: [Name]
**Date**: [Date]
**Tools Used**: [Lighthouse, Bundle Analyzer, etc.]
**React Compiler Enabled**: [Yes/No]
````

## Deliverables and Success Criteria

A successful audit produces the following:

- **Zero critical issues**: No sequential async operations that could be parallelized, no unguarded backend endpoints, no heavy components in the initial bundle.
- **Zero high-priority issues**: All data fetching uses TanStack Query, all event listeners use passive mode where applicable, no components defined inside other components.
- **Score ≥ 90/100**: Based on the category breakdown in the report template.
- **Verified baseline**: `bun run smoke:qc` passes before and after any fixes.
- **Actionable report**: Each finding includes file/line location, severity, and a concrete fix with code example.

## References

- [Vercel React Best Practices Skill](https://github.com/vercel-labs/agent-skills/tree/4559f18a20c1691c744b4395194290db6a0df5e9/skills/react-best-practices): 70 rules, pinned source material
- [Vercel Blog Post](https://vercel.com/blog/introducing-react-best-practices)
- [React Documentation](https://react.dev)
- [TanStack Query Documentation](https://tanstack.com/query/latest)
- [You Might Not Need an Effect](https://react.dev/learn/you-might-not-need-an-effect)

---

**Version**: 2.6
**Last Updated**: 2026-07-21
**Next Review**: 2026-08-21

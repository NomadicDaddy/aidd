---
title: 'React Best Practices Audit (Vercel)'
last_updated: '2026-01-20'
version: '1.0'
category: 'Frontend'
priority: 'High'
estimated_time: '3-4 hours'
frequency: 'Monthly'
lifecycle: 'pre-release'
---

# React Best Practices Audit

Based on [Vercel's React Best Practices](https://vercel.com/blog/introducing-react-best-practices)

Comprehensive performance optimization guide containing 40+ rules across 8 categories, prioritized by impact from critical (eliminating waterfalls, reducing bundle size) to incremental (advanced patterns).

## Executive Summary

**🎯 Critical Priorities**

- **Eliminate async waterfalls**: Each sequential await adds full network latency (2-10× improvement potential)
- **Reduce bundle size**: Directly affects Time to Interactive and Largest Contentful Paint
- **Optimize re-renders**: Minimizes wasted computation and improves UI responsiveness
- **Server-side performance**: Eliminates server-side waterfalls and reduces response times

**📋 Essential Standards (Required)**

- **Waterfall elimination**: Parallelize independent async operations
- **Bundle optimization**: Direct imports, code splitting, lazy loading
- **Server-side patterns**: React.cache(), after(), proper authentication
- **Client-side efficiency**: SWR, deduplication, event listener optimization

**⚡ Performance Impact Levels**

- **CRITICAL**: Waterfalls (2-10× improvement), bundle size (200-800ms import cost), server-side data fetching
- **HIGH**: Server-side performance, client-side data fetching, re-render optimization
- **MEDIUM**: Rendering performance, JavaScript micro-optimizations
- **LOW**: Advanced patterns, minor optimizations

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

## Table of Contents

1. [Eliminating Waterfalls](#1-eliminating-waterfalls) — **CRITICAL**
2. [Bundle Size Optimization](#2-bundle-size-optimization) — **CRITICAL**
3. [Server-Side Performance](#3-server-side-performance) — **HIGH**
4. [Client-Side Data Fetching](#4-client-side-data-fetching) — **HIGH**
5. [Re-render Optimization](#5-re-render-optimization) — **MEDIUM**
6. [Rendering Performance](#6-rendering-performance) — **MEDIUM**
7. [JavaScript Performance](#7-javascript-performance) — **MEDIUM**
8. [Advanced Patterns](#8-advanced-patterns) — **LOW**

---

## 1. Eliminating Waterfalls

**Impact: CRITICAL (2-10× improvement)**

Waterfalls are the #1 performance killer. Each sequential await adds full network latency. Eliminating them yields the largest gains.

### 1.1 Defer Await Until Needed

**Impact: HIGH** (avoids blocking unused code paths)

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

### 1.2 Dependency-Based Parallelization

**Impact: CRITICAL** (2-10× improvement)

For operations with partial dependencies, use parallelization to maximize concurrency.

❌ **Incorrect** (profile waits for config unnecessarily):

```typescript
const [user, config] = await Promise.all([fetchUser(), fetchConfig()]);
const profile = await fetchProfile(user.id); // Config waited even though not needed for profile
```

✅ **Correct** (config and profile run in parallel):

```typescript
const [user, config, profile] = await Promise.all([
	fetchUser(),
	fetchConfig(),
	(await fetchUser()).then((user) => fetchProfile(user.id)),
]);
```

Or use libraries like `better-all` for complex dependency chains.

### 1.3 Prevent Waterfall Chains in API Routes

**Impact: CRITICAL** (2-10× improvement)

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

### 1.4 Promise.all() for Independent Operations

**Impact: CRITICAL** (2-10× improvement)

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

### 1.5 Strategic Suspense Boundaries

**Impact: HIGH** (faster initial paint)

Instead of awaiting data in async components before returning JSX, use Suspense boundaries to show the wrapper UI faster while data loads.

❌ **Incorrect** (wrapper blocked by data fetching):

```tsx
async function Page() {
	const data = await fetchData(); // Blocks entire page

	return (
		<div>
			<div>Sidebar</div>
			<div>Header</div>
			<div>
				<DataDisplay data={data} />
			</div>
			<div>Footer</div>
		</div>
	);
}
```

✅ **Correct** (wrapper shows immediately, data streams in):

```tsx
function Page() {
	return (
		<div>
			<div>Sidebar</div>
			<div>Header</div>
			<Suspense fallback={<Skeleton />}>
				<DataDisplay /> // Only this component waits
			</Suspense>
			<div>Footer</div>
		</div>
	);
}

async function DataDisplay() {
	const data = await fetchData();
	return <div>{data.content}</div>;
}
```

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

**Alternative: Next.js 13.5+ optimizePackageImports**

```javascript
// next.config.js
module.exports = {
	experimental: {
		optimizePackageImports: ['lucide-react', '@mui/material'],
	},
};
// Then you can use barrel imports - automatically transformed at build time
```

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
		if (enabled && !frames && typeof window !== 'undefined') {
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

✅ **Correct** (loads after hydration):

```tsx
import dynamic from 'next/dynamic';

const Analytics = dynamic(() => import('@vercel/analytics/react').then((m) => m.Analytics), {
	ssr: false,
});

export default function RootLayout({ children }) {
	return (
		<html>
			<body>
				{children}
				<Analytics /> {/* Loads after hydration */}
			</body>
		</html>
	);
}
```

### 2.4 Dynamic Imports for Heavy Components

**Impact: CRITICAL** (directly affects TTI and LCP)

Use `next/dynamic` to lazy-load large components not needed on initial render.

❌ **Incorrect** (Monaco bundles with main chunk ~300KB):

```tsx
import { MonacoEditor } from './monaco-editor';

function CodePanel({ code }: { code: string }) {
	return <MonacoEditor value={code} />;
}
```

✅ **Correct** (Monaco loads on demand):

```tsx
import dynamic from 'next/dynamic';

const MonacoEditor = dynamic(() => import('./monaco-editor').then((m) => m.MonacoEditor), {
	ssr: false,
});

function CodePanel({ code }: { code: string }) {
	return <MonacoEditor value={code} />;
}
```

### 2.5 Preload Based on User Intent

**Impact: MEDIUM** (reduces perceived latency)

Preload heavy bundles before they're needed to reduce perceived latency.

✅ **Correct** (preload on hover/focus):

```tsx
function EditorButton({ onClick }: { onClick: () => void }) {
	const preload = () => {
		if (typeof window !== 'undefined') {
			void import('./monaco-editor'); // Preload without blocking
		}
	};

	return (
		<button onMouseEnter={preload} onFocus={preload} onClick={onClick}>
			Open Editor
		</button>
	);
}
```

---

## 3. Server-Side Performance

**Impact: HIGH**

Optimizing server-side rendering and data fetching eliminates server-side waterfalls and reduces response times.

### 3.1 Authenticate Server Actions Like API Routes

**Impact: CRITICAL** (prevents unauthorized access to server mutations)

Server Actions (functions with `"use server"`) are exposed as public endpoints. Always verify authentication and authorization **inside** each Server Action.

❌ **Incorrect** (no authentication check):

```typescript
'use server';

export async function deleteUser(userId: string) {
	await db.user.delete({ where: { id: userId } }); // Anyone can call this!
	return { success: true };
}
```

✅ **Correct** (authentication inside the action):

```typescript
'use server';

import { verifySession } from '@/lib/auth';

export async function deleteUser(userId: string) {
	const session = await verifySession();

	if (!session) {
		throw new Error('Unauthorized');
	}

	if (session.user.role !== 'admin' && session.user.id !== userId) {
		throw new Error('Cannot delete other users');
	}

	await db.user.delete({ where: { id: userId } });
	return { success: true };
}
```

### 3.2 Avoid Duplicate Serialization in RSC Props

**Impact: LOW** (reduces network payload by avoiding duplicate serialization)

RSC→client serialization deduplicates by object reference, not value. Do transformations in client, not server.

❌ **Incorrect** (duplicates array):

```tsx
<ClientList
  usernames={usernames}
  usernamesOrdered={usernames.toSorted()} />  {/* Sends 6 strings (2 arrays × 3 items) */}
```

✅ **Correct** (sends 3 strings):

```tsx
<ClientList usernames={usernames} />  {/* Send once */}

// Client: transform there
'use client'
const sorted = useMemo(() => [...usernames].sort(), [usernames])
```

### 3.3 Cross-Request LRU Caching

**Impact: HIGH** (caches across requests)

`React.cache()` only works within one request. For data shared across sequential requests, use an LRU cache.

✅ **Correct** (LRU cache implementation):

```typescript
import { LRUCache } from 'lru-cache';

const cache = new LRUCache<string, any>({
	max: 1000,
	ttl: 5 * 60 * 1000, // 5 minutes
});

export async function getUser(id: string) {
	const cached = cache.get(id);
	if (cached) return cached;

	const user = await db.user.findUnique({ where: { id } });
	cache.set(id, user);
	return user;
}
```

### 3.4 Minimize Serialization at RSC Boundaries

**Impact: HIGH** (reduces data transfer size)

Only pass fields that the client actually uses. Serialized data directly impacts page weight.

❌ **Incorrect** (serializes all 50 fields):

```tsx
async function Page() {
	const user = await fetchUser(); // 50 fields
	return <Profile user={user} />; // Only uses 1 field
}

('use client');
function Profile({ user }: { user: User }) {
	return <div>{user.name}</div>;
}
```

✅ **Correct** (serializes only 1 field):

```tsx
async function Page() {
	const user = await fetchUser();
	return <Profile name={user.name} />;
}

('use client');
function Profile({ name }: { name: string }) {
	return <div>{name}</div>;
}
```

### 3.5 Parallel Data Fetching with Component Composition

**Impact: CRITICAL** (eliminates server-side waterfalls)

React Server Components execute sequentially within a tree. Restructure with composition to parallelize data fetching.

❌ **Incorrect** (Sidebar waits for Page's fetch to complete):

```tsx
export default async function Page() {
	const header = await fetchHeader();
	return (
		<div>
			<div>{header}</div>
			<Sidebar /> {/* Sidebar's fetch waits for header */}
		</div>
	);
}

async function Sidebar() {
	const items = await fetchSidebarItems();
	return <nav>{items.map(renderItem)}</nav>;
}
```

✅ **Correct** (both fetch simultaneously):

```tsx
async function Header() {
	const data = await fetchHeader();
	return <div>{data}</div>;
}

async function Sidebar() {
	const items = await fetchSidebarItems();
	return <nav>{items.map(renderItem)}</nav>;
}

export default function Page() {
	return (
		<div>
			<Header /> {/* Runs in parallel */}
			<Sidebar /> {/* Runs in parallel */}
		</div>
	);
}
```

### 3.6 Per-Request Deduplication with React.cache()

**Impact: MEDIUM** (deduplicates within request)

Use `React.cache()` for server-side request deduplication. Authentication and database queries benefit most.

✅ **Correct** (React.cache usage):

```typescript
import { cache } from 'react';

export const getCurrentUser = cache(async () => {
	const session = await auth();
	if (!session?.user?.id) return null;
	return await db.user.findUnique({
		where: { id: session.user.id },
	});
});
```

⚠️ **Important**: `React.cache()` uses shallow equality. Avoid inline objects as arguments:

```typescript
// ❌ Incorrect - always cache miss (new object each call)
getUser({ uid: 1 });
getUser({ uid: 1 });

// ✅ Correct - cache hit (same reference)
const params = { uid: 1 };
getUser(params);
getUser(params);
```

### 3.7 Use after() for Non-Blocking Operations

**Impact: MEDIUM** (faster response times)

Use Next.js's `after()` to schedule work that should execute after a response is sent.

❌ **Incorrect** (blocks response):

```tsx
export async function POST(request: Request) {
  await updateDatabase(request)
  await logUserAction(request)  {/* Blocks response */}
  return Response.json({ status: 'success' })
}
```

✅ **Correct** (non-blocking):

```tsx
import { after } from 'next/server';

export async function POST(request: Request) {
	await updateDatabase(request);

	// Log after response is sent
	after(async () => {
		await logUserAction(request);
	});

	return Response.json({ status: 'success' });
}
```

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

### 4.3 Use SWR for Automatic Deduplication

**Impact: MEDIUM-HIGH** (automatic deduplication)

SWR enables request deduplication, caching, and revalidation across component instances.

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
import useSWR from 'swr'

function UserList() {
  const { data: users } = useSWR('/api/users', fetcher)  {/* Multiple instances share request */}
}
```

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

---

## 5. Re-render Optimization

**Impact: MEDIUM**

Reducing unnecessary re-renders minimizes wasted computation and improves UI responsiveness.

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

> **Note**: If React Compiler is enabled, manual memoization is not necessary.

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

> **Note**: If React Compiler is enabled, compiler automatically hoists static JSX elements.

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
npx svgo --precision=1 --multipass icon.svg
```

### 6.5 Prevent Hydration Mismatch Without Flickering

**Impact: MEDIUM** (avoids visual flicker and hydration errors)

When rendering content that depends on client-side storage, inject a synchronous script that updates DOM before React hydrates.

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

Use a library like `react-activity` or Suspense to preserve hidden component state.

❌ **Incorrect** (unmounts and loses state):

```tsx
function Panel({ show }) {
  if (!show) return null  {/* Component unmounts, state lost */}
  return <div>Content</div>
}
```

✅ **Correct** (preserves state):

```tsx
import { Activity } from 'react-activity';

function Panel({ show }) {
	return (
		<Activity active={show}>
			<div>Content</div> {/* State preserved when hidden */}
		</Activity>
	);
}
```

### 6.7 Use Explicit Conditional Rendering

**Impact: MEDIUM** (avoids false-positive re-renders)

Use explicit conditionals instead of inline ternaries for complex components.

❌ **Incorrect** (causes re-renders):

```tsx
function Page({ data }) {
	return <div>{data ? <ComplexComponent data={data} /> : null}</div>;
}
```

✅ **Correct** (early return):

```tsx
function Page({ data }) {
	if (!data) return <div>No data</div>;

	return (
		<div>
			<ComplexComponent data={data} />
		</div>
	);
}
```

---

## 7. JavaScript Performance

**Impact: MEDIUM**

JavaScript micro-optimizations can add up in performance-critical code paths.

### 7.1 Batch DOM CSS Changes

**Impact: MEDIUM** (reduces reflows)

Batch DOM modifications to minimize layout reflows.

❌ **Incorrect** (multiple reflows):

```typescript
element.style.width = '100px';
element.style.height = '100px';
element.style.backgroundColor = 'red';
```

✅ **Correct** (single reflow):

```typescript
Object.assign(element.style, {
	width: '100px',
	height: '100px',
	backgroundColor: 'red',
});
```

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

---

## 8. Advanced Patterns

**Impact: LOW**

Advanced optimization patterns for edge cases and specific scenarios.

### 8.1 Store Event Handlers in Refs

**Impact: LOW** (stable references without useCallback)

Store event handlers in refs when useCallback dependency arrays become complex.

✅ **Correct**:

```typescript
function Component({ id, onAction }) {
  const onActionRef = useRef(onAction)
  onActionRef.current = onAction  {/* Always update ref */}

  const handleClick = useCallback(() => {
    onActionRef.current(id)  {/* Uses latest handler without dependency */}
  }, [id])

  return <button onClick={handleClick}>Action</button>
}
```

### 8.2 useLatest for Stable Callback Refs

**Impact: LOW** (simplifies ref-based callbacks)

Use `useLatest` hook pattern to maintain stable references to latest values.

✅ **Correct**:

```typescript
function useLatest<T>(value: T) {
  const ref = useRef(value)
  ref.current = value
  return ref
}

function Component({ data, onProcess }) {
  const dataRef = useLatest(data)
  const onProcessRef = useLatest(onProcess)

  const handleClick = useCallback(() => {
    onProcessRef.current(dataRef.current)
  }, [])  {/* No dependencies, always latest */}

  return <button onClick={handleClick}>Process</button>
}
```

---

## Audit Checklist

### Critical Issues 🚨

**Eliminating Waterfalls**

- [ ] **Critical**: No sequential async operations that could be parallel (Promise.all, better-all)
- [ ] **Critical**: Async operations deferred until actually needed (avoid blocking unused code paths)
- [ ] **Critical**: API routes and Server Actions start independent operations immediately
- [ ] **Critical**: No waterfall chains in server-side data fetching
- [ ] **Critical**: Suspense boundaries used strategically for faster initial paint

**Bundle Size Optimization**

- [ ] **Critical**: Direct imports used instead of barrel files (lucide-react, @mui/material, etc.)
- [ ] **Critical**: Heavy components use dynamic imports with next/dynamic
- [ ] **Critical**: Large modules conditionally loaded based on feature activation
- [ ] **Critical**: Next.js optimizePackageImports configured for affected libraries
- [ ] **Critical**: Bundle size analysis performed regularly

**Server-Side Security**

- [ ] **Critical**: All Server Actions authenticate and authorize inside the function
- [ ] **Critical**: No reliance solely on middleware or layout guards for Server Actions

### High Priority Issues ⚠️

**Server-Side Performance**

- [ ] **High**: React.cache() used for request deduplication (auth, DB queries)
- [ ] **High**: Parallel data fetching with component composition (eliminate RSC waterfalls)
- [ ] **High**: RSC props minimized to only fields client uses
- [ ] **High**: LRU cache used for cross-request deduplication
- [ ] **High**: after() used for non-blocking operations (analytics, logging)

**Client-Side Data Fetching**

- [ ] **High**: SWR used for automatic request deduplication
- [ ] **High**: localStorage reads wrapped in try-catch
- [ ] **High**: localStorage keys versioned to prevent schema conflicts
- [ ] **High**: Only necessary fields stored in localStorage
- [ ] **High**: Passive event listeners used for scroll/touch events
- [ ] **High**: Global event listeners deduplicated (useSWRSubscription or module-level)

**Re-render Optimization**

- [ ] **High**: State reads deferred to usage point (avoid premature subscriptions)
- [ ] **High**: Functional setState updates used when state depends on previous value
- [ ] **High**: Lazy state initialization used for expensive initial values
- [ ] **High**: Transitions used for non-urgent frequent updates (scroll tracking)
- [ ] **High**: Derived state subscribed to instead of continuous values

**Rendering Performance**

- [ ] **High**: CSS content-visibility applied to long lists
- [ ] **High**: Hydration mismatches prevented with inline scripts for localStorage
- [ ] **High**: Explicit conditional rendering instead of inline ternaries

### Medium Priority Issues 📋

**Re-render Optimization**

- [ ] **Medium**: Narrow effect dependencies (primitive values instead of objects)
- [ ] **Medium**: Expensive work extracted to memoized components (if no React Compiler)
- [ ] **Medium**: Static JSX elements hoisted outside components

**Rendering Performance**

- [ ] **Medium**: SVG animations applied to wrapper div for hardware acceleration
- [ ] **Medium**: SVG precision optimized with SVGO
- [ ] **Medium**: Activity component used for show/hide patterns

**JavaScript Performance**

- [ ] **Medium**: Index maps built for repeated lookups (Set/Map)
- [ ] **Medium**: Multiple array iterations combined into single pass
- [ ] **Medium**: Storage API calls cached in hot code paths
- [ ] **Medium**: DOM CSS changes batched to reduce reflows
- [ ] **Medium**: Loop used for min/max instead of sort
- [ ] **Medium**: Set/Map used for O(1) lookups

### Low Priority Issues 💡

**JavaScript Performance**

- [ ] **Low**: Property access cached in loops
- [ ] **Low**: Repeated function calls cached
- [ ] **Low**: Early length check for array comparisons
- [ ] **Low**: Early returns used to reduce nesting
- [ ] **Low**: RegExp creation hoisted outside loops
- [ ] **Low**: toSorted() used for immutable sorting

**Advanced Patterns**

- [ ] **Low**: Event handlers stored in refs for stability
- [ ] **Low**: useLatest pattern used for stable callback refs

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
````

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
- **React.cache() Usage**: [Count] functions cached
- **SWR Integration**: [Percentage]% of data fetching using SWR
- **Re-render Reduction**: [Percentage]% reduction in unnecessary re-renders

## Next Audit Date

Recommended: [Date] (Monthly for active development)

---

**Auditor**: [Name]
**Date**: [Date]
**Tools Used**: [Lighthouse, Bundle Analyzer, etc.]
**React Compiler Enabled**: [Yes/No]

```

## References

- [Vercel React Best Practices](https://vercel.com/blog/introducing-react-best-practices)
- [Vercel React Best Practices AGENTS.md](https://raw.githubusercontent.com/vercel-labs/agent-skills/main/skills/react-best-practices/AGENTS.md)
- [React Documentation](https://react.dev)
- [Next.js Documentation](https://nextjs.org/docs)
- [SWR Documentation](https://swr.vercel.app)

---

**Version**: 1.0
**Last Updated**: 2026-01-20
**Next Review**: 2026-02-20
```

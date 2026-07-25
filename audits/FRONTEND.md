---
title: 'Frontend Development, Performance, and UI Audit'
last_updated: '2026-06-28'
version: '2.3'
category: 'Frontend'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Monthly'
lifecycle: 'pre-release'
---

# Frontend Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

**🎯 Critical Frontend Priorities**

- **React 19+ Patterns**: Modern React patterns, hooks, Actions, and component design
- **Tailwind CSS v4**: CSS-first configuration with `@theme` blocks, utility optimization
- **Core Web Vitals**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 (INP replaced FID March 2024)
- **Bundle Optimization**: JavaScript <170KB gzipped (critical path), CSS <50KB gzipped
- **Performance**: Frontend operations optimized for user experience

**📋 Essential Standards (Required)**

- **Component Design**: Proper React patterns, state management, lifecycle
- **CSS Organization**: Tailwind v4 patterns, utility ordering, responsive design
- **Performance Metrics**: Meet Core Web Vitals thresholds
- **Accessibility**: WCAG AA compliance, semantic HTML, focus management
- **Bundle Size**: Optimized bundles with code splitting and lazy loading

**⚡ Performance Requirements**

> **Detailed Metrics**: See [PERFORMANCE.md](./PERFORMANCE.md) for comprehensive thresholds, Lighthouse scoring weights, and optimization strategies.

- **Core Web Vitals**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1
- **Bundle Targets**: JavaScript <170KB gzipped (critical path), CSS <50KB gzipped

## Table of Contents

1. [Scope and Boundaries](#scope-and-boundaries)
2. [Pre-Audit Setup](#pre-audit-setup)
3. [React 19+ Best Practices](#react-19-best-practices)
4. [Tailwind CSS v4 Standards](#tailwind-css-v4-standards)
5. [Performance Optimization](#performance-optimization)
6. [Accessibility](#accessibility)
7. [Verification](#verification)
8. [Audit Checklist](#audit-checklist)
9. [Report Template](#report-template)
10. [Deliverables and Success Criteria](#deliverables-and-success-criteria)

## Scope and Boundaries

This audit owns **React patterns, client/server state management, performance, bundle optimization, and accessibility correctness** (semantic structure, focus, keyboard operability, ARIA). It defers **visual semantics, copy, layout polish, and design-system conformance** to [WEB_DESIGN_GUIDELINES.md](./WEB_DESIGN_GUIDELINES.md). When a finding is primarily about visual presentation or design-token usage, file it under WEB_DESIGN_GUIDELINES to avoid double-reporting; file it here when it is about React/state/perf/bundle/a11y behavior.

> **Spernakit applicability**: Spernakit verifies the frontend with `crawltest` (end-to-end route discovery, content assertions, interaction testing) and `smoke:qc` (typecheck, lint, build, format check). The stack intentionally has **no unit-test framework** (vitest/jest/@testing-library); their absence is by design, not a finding.

## Pre-Audit Setup

### Required Artifact Files

Consult these before forming findings; they anchor frontend findings to project-declared behavior rather than generic best-practice opinion:

- `/.aidd/spec.md`: product source of truth. Frontend behavior that contradicts the spec (e.g. wrong navigation flow, missing required state) is a high-priority finding.
- `/.aidd/screen-map.md`: declared screen/route catalog. Use this to verify route coverage and to flag pages that exist in code but are absent from the map (or vice versa).
- `/.aidd/assertions.md`: UX, accessibility, and security invariants relevant to the frontend. Every "frontend defect" finding should be checked against assertions before being filed.

### Required Tools and Verification

```bash
# Verify versions (check frontend/package.json or use bun pm ls)
grep -E '"react"|"react-dom"|"tailwindcss"|"typescript"' frontend/package.json
# Expected (Spernakit v3.11): React 19.2.x, Tailwind 4.3.x, TypeScript 6.x

# Bundle analysis — rollup-plugin-visualizer is already a frontend devDependency
bun run --cwd frontend build:analyze   # ANALYZE=true vite build, emits the visualizer report

# Field Core Web Vitals are instrumented via the web-vitals package (already a dependency).
# Lab metrics, if needed, can be captured with a one-off: bunx lighthouse http://localhost:3330 --view
```

### Environment Preparation

1. **React DevTools**: Install React DevTools 5.0+ for React 19 debugging
2. **Lighthouse**: Use Chrome DevTools Lighthouse, or a one-off `bunx lighthouse` run (no persistent install needed)
3. **Bundle Analyzer**: Use the existing `rollup-plugin-visualizer` via `bun run --cwd frontend build:analyze`
4. **Performance Monitoring**: Field Core Web Vitals are tracked via the `web-vitals` package already wired into the frontend

### Verification Commands

```bash
# Check React Compiler status (enabled by default in the Spernakit template)
grep -r "react-compiler" frontend/package.json frontend/vite.config.ts

# Verify Tailwind v4 configuration
grep -r "@theme" frontend/src/**/*.css

# Analyze bundle size (rollup-plugin-visualizer report)
bun run --cwd frontend build:analyze

# Run Lighthouse audit (frontend dev server binds to port 3330)
bunx lighthouse http://localhost:3330 --view
```

## React 19+ Best Practices

### React Compiler Integration

> **Important**: In the Spernakit stack, React Compiler is **enabled by default** via `babel-plugin-react-compiler` (1.0.0) in the frontend build: automatic memoization, no manual `React.memo` needed (see STACK.md). Treat "compiler enabled" as the expected baseline; flag a project only if the compiler has been removed or disabled without justification. See [react.dev/learn/react-compiler](https://react.dev/learn/react-compiler) for background.

**Trust the compiler by default**: Let it optimize automatically. Flag manual memoization only
when `React.memo`, `useMemo`, or `useCallback` is used without either profiling evidence or a
documented referential-stability/effect-dependency reason.

✅ **Good: Trust React Compiler (the default)**:

```jsx
function ProductList({ products }) {
	// React Compiler optimizes this automatically
	return products.map((product) => <ProductCard key={product.id} product={product} />);
}
```

❌ **Bad: Manual Memoization (redundant with the compiler enabled)**:

```jsx
// ❌ Unnecessary when React Compiler is enabled
const ProductList = memo(({ products }) => {
	return useMemo(
		() => products.map((product) => <ProductCard key={product.id} product={product} />),
		[products],
	);
});
```

**When Manual Optimization (`useMemo`, `useCallback`, `memo`) Is Still Acceptable**:

- Profiling demonstrates a specific hot path the compiler does not cover
- A rare case the compiler cannot statically optimize, justified with a comment
- Referential stability is required for an effect dependency, third-party component boundary, or
  subscription identity, and the reason is documented near the usage

Bare manual memoization without one of those justifications is a finding, since the compiler
already handles the common cases.

### Server State with TanStack Query

**MANDATORY: Use TanStack Query for server state management**

TanStack Query is the primary pattern for data fetching, caching, and mutations in Spernakit.

✅ **Good: TanStack Query for data fetching and mutations**:

```jsx
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

function PostList() {
	const { data: posts, isLoading } = useQuery({
		queryKey: ['posts'],
		queryFn: () => postsApi.list(),
	});

	const queryClient = useQueryClient();
	const createPost = useMutation({
		mutationFn: (data) => postsApi.create(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['posts'] });
		},
	});

	if (isLoading) return <PostListSkeleton />;

	return (
		<div>
			{posts?.map((post) => (
				<PostCard key={post.id} post={post} />
			))}
		</div>
	);
}
```

❌ **Bad: Manual fetch + useState for server data**:

```jsx
// ❌ No caching, no loading states, no error handling, no invalidation
function PostList() {
	const [posts, setPosts] = useState([]);
	const [loading, setLoading] = useState(true);

	useEffect(() => {
		fetch('/api/v1/posts')
			.then((r) => r.json())
			.then((data) => setPosts(data))
			.finally(() => setLoading(false));
	}, []);
}
```

### Client State with Zustand

**MANDATORY: Use Zustand for global client state (NOT React Context)**

✅ **Good: Zustand store with persist**:

```typescript
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ThemeStore {
	mode: 'light' | 'dark' | 'system';
	setMode: (mode: 'light' | 'dark' | 'system') => void;
}

const useThemeStore = create<ThemeStore>()(
	persist(
		(set) => ({
			mode: 'system',
			setMode: (mode) => set({ mode }),
		}),
		{ name: 'theme-storage' },
	),
);
```

❌ **Bad: React Context for state management**:

```jsx
// ❌ React Context causes unnecessary re-renders and is not the Spernakit pattern
const ThemeContext = createContext();
function ThemeProvider({ children }) {
	const [mode, setMode] = useState('system');
	return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}
```

### shadcn/ui Component Patterns

**MANDATORY: Use shadcn/ui for UI components**

- Install components via CLI: `bunx shadcn@latest add button`
- Components live in `frontend/src/components/ui/` (direct imports, no barrel file)
- Shared application components go in `frontend/src/components/shared/`
- Layout components go in `frontend/src/components/layout/`
- Toast notifications use `sonner` via shadcn/ui (NOT react-hot-toast)

✅ **Good: shadcn/ui with proper imports**:

```jsx
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';

function DeleteButton({ onDelete }) {
	return (
		<Dialog>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Confirm Delete</DialogTitle>
				</DialogHeader>
				<Button
					variant="destructive"
					onClick={() => {
						onDelete();
						toast.success('Item deleted');
					}}>
					Delete
				</Button>
			</DialogContent>
		</Dialog>
	);
}
```

### Actions and Form Handling

**Use Actions for simple forms; TanStack Query mutations for forms requiring cache invalidation**

✅ **Good: Using Actions with useActionState** (simple forms without cache needs):

```jsx
import { useActionState } from 'react';

function ContactForm() {
	const [state, submitAction, isPending] = useActionState(async (prevState, formData) => {
		try {
			await submitContact(formData);
			return { success: true, message: 'Submitted!' };
		} catch (error) {
			return { success: false, error: error.message };
		}
	}, null);

	return (
		<form action={submitAction}>
			<input name="email" type="email" required />
			<button type="submit" disabled={isPending}>
				{isPending ? 'Submitting...' : 'Submit'}
			</button>
			{state?.error && <p className="text-red-600">{state.error}</p>}
			{state?.success && <p className="text-green-600">{state.message}</p>}
		</form>
	);
}
```

✅ **Good: TanStack Query mutation** (forms requiring cache invalidation):

```jsx
function CreatePostForm() {
	const queryClient = useQueryClient();
	const { mutate, isPending } = useMutation({
		mutationFn: (data) => postsApi.create(data),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: ['posts'] });
			toast.success('Post created');
		},
		onError: (err) => toast.error(err.message),
	});

	return (
		<form
			onSubmit={(e) => {
				e.preventDefault();
				const data = Object.fromEntries(new FormData(e.currentTarget));
				mutate(data);
			}}>
			<input name="title" required />
			<Button type="submit" disabled={isPending}>
				{isPending ? 'Creating...' : 'Create'}
			</Button>
		</form>
	);
}
```

❌ **Bad: Manual fetch + useState for form submission**:

```jsx
function ContactForm() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	// ❌ No cache invalidation, no retry, no optimistic updates
	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		try {
			await fetch('/api/v1/contacts', { method: 'POST', body: new FormData(e.target) });
		} catch (err) {
			setError(err.message);
		} finally {
			setLoading(false);
		}
	};

	return <form onSubmit={handleSubmit}>{/* Manual state management */}</form>;
}
```

### useOptimistic Hook Usage

**Use for optimistic UI updates**

✅ **Good: Optimistic Updates**:

```jsx
import { useOptimistic } from 'react';

function TodoList({ todos, addTodo }) {
	const [optimisticTodos, addOptimisticTodo] = useOptimistic(todos, (state, newTodo) => [
		...state,
		{ ...newTodo, pending: true },
	]);

	const handleAdd = async (formData) => {
		const text = formData.get('text');
		addOptimisticTodo({ id: crypto.randomUUID(), text });
		await addTodo(formData);
	};

	return (
		<div>
			<form action={handleAdd}>
				<input name="text" required />
				<button type="submit">Add</button>
			</form>
			<ul>
				{optimisticTodos.map((todo) => (
					<li key={todo.id} className={todo.pending ? 'opacity-50' : ''}>
						{todo.text}
					</li>
				))}
			</ul>
		</div>
	);
}
```

### Common React Anti-Patterns

**CRITICAL: Avoid these patterns**

❌ **Bad: Hooks in Conditionals**:

```jsx
// ❌ NEVER do this
if (condition) {
	const [state, setState] = useState(0);
}
```

✅ **Good: Hooks at Top Level**:

```jsx
function Component({ condition }) {
	const [state, setState] = useState(0);
	if (!condition) return null;
	return <div>{state}</div>;
}
```

❌ **Bad: Missing Dependencies**:

```jsx
// ❌ Missing 'userId' dependency
useEffect(() => {
	fetchUser(userId);
}, []);
```

✅ **Good: Complete Dependencies**:

```jsx
useEffect(() => {
	fetchUser(userId);
}, [userId]);
```

### Error Boundaries and Suspense Fallbacks

**Wrap route/page components in error boundaries; provide Suspense fallbacks for lazy routes**

Page-level routes must be resilient to render-time errors and code-split loading. Pair an error boundary around route content with a Suspense fallback for any `lazy()`-loaded page, and let TanStack Query handle data-fetch errors with retry strategies (React Query error boundaries with retry, per STACK.md).

✅ **Good: Route wrapped in error boundary + Suspense**:

```jsx
<ErrorBoundary fallback={<RouteErrorState />}>
	<Suspense fallback={<PageSkeleton />}>
		<LazyPage />
	</Suspense>
</ErrorBoundary>
```

❌ **Bad: Lazy route with no boundary or fallback**: a thrown render error blanks the whole app, and the code-split chunk shows nothing while loading.

## Tailwind CSS v4 Standards

### CSS-First Configuration Migration

**MANDATORY: Migrate to CSS-first configuration**

✅ **Good: CSS-First Configuration**:

```css
/* styles/tailwind.css */
@import 'tailwindcss';

@theme {
	--color-primary: #3b82f6;
	--color-secondary: #6b7280;
	--font-family-brand: 'Inter', sans-serif;
	--spacing-section: 6rem;
}

@layer utilities {
	.text-balance {
		text-wrap: balance;
	}
}
```

### Utility Class Organization

**MANDATORY: Follow consistent ordering**

✅ **Good: Organized Classes**:

```jsx
<div className="flex w-full max-w-4xl flex-col items-center gap-4 rounded-lg bg-white p-6 text-lg font-semibold text-gray-900 shadow-md md:flex-row md:p-8">
	Content
</div>
```

### Modal UX Standards

Frontend modals must follow these behavior rules:

- Close on **escape key** or **off-click** by default.
- Close on **explicit close button** click, if present.
- Do **not** close automatically when there is unsaved information without explicit user confirmation.

## Performance Optimization

### Core Web Vitals Targets

> **Comprehensive Guide**: See [PERFORMANCE.md](./PERFORMANCE.md) for detailed thresholds, optimization decision trees, and performance budgets.

**MANDATORY**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1

### Bundle Optimization

✅ **Good: Code Splitting**:

```jsx
const HeavyComponent = lazy(() => import('./HeavyComponent'));

function App() {
	return (
		<Suspense fallback={<Loading />}>
			<HeavyComponent />
		</Suspense>
	);
}
```

### Image Optimization

✅ **Good: Responsive Images**:

```jsx
<img
	src="/image.jpg"
	srcSet="/image-320w.jpg 320w, /image-640w.jpg 640w"
	sizes="(max-width: 640px) 100vw, 640px"
	loading="lazy"
	alt="Description"
/>
```

### Layout Shift and Loading States

**Reserve space for async content and virtualize large lists to protect CLS and INP**

- **Skeleton loaders**: Render skeletons (or fixed-size placeholders) for async views so incoming content does not push layout, which directly protects CLS (STACK.md: "Skeleton loaders — prevent layout shift during data loading"). Spernakit ships shared skeletons under `frontend/src/components/shared/skeletons/`.
- **Virtualization**: Use `@tanstack/react-virtual` for large lists/tables (10,000+ rows) to keep DOM size and INP in check rather than rendering every row.
- **Route preloading**: Preload lazy route chunks on hover/focus so navigation does not stall on a cold chunk fetch (STACK.md: "route preloading on hover/focus").

## Accessibility

> **Boundary**: This section covers accessibility **correctness/behavior**. Visual contrast tokens and design-system semantics are owned by [WEB_DESIGN_GUIDELINES.md](./WEB_DESIGN_GUIDELINES.md).

**MANDATORY: WCAG AA correctness**

- **Semantic HTML**: Use landmark and semantic elements (`<nav>`, `<main>`, `<button>`, headings in order) instead of `div`/`span` with click handlers.
- **Focus management**: Visible focus indicators on all interactive elements; move focus into dialogs/popovers on open and restore it on close (Radix handles this for shadcn/ui primitives; verify custom wrappers preserve it).
- **Keyboard operability**: Every interaction reachable and operable by keyboard; ties into the global `useKeyboardShortcuts` system. No mouse-only affordances.
- **Labelled controls**: All inputs have associated `<label>`s or `aria-label`; icon-only buttons have accessible names.
- **ARIA on interactive wrappers**: Custom components built on Radix expose correct `aria-*` roles/states; do not strip ARIA when restyling.
- **Color contrast**: Text and essential UI meet WCAG AA contrast (defer token-level enforcement to WEB_DESIGN_GUIDELINES).
- **Reduced motion**: Honor `prefers-reduced-motion` for animations and transitions.

## Verification

Frontend health is verified through two canonical commands, not a unit-test suite:

- **`bun run smoke:qc`**, the mandatory quality gate: typecheck, lint, production build, and Prettier format check (plus drift/config/schema/feature-integration checks). Must pass before any commit.
- **`bun run crawltest`**: end-to-end route discovery, content assertions, and interaction testing against the running app; the primary way frontend behavior is verified.

There is **no vitest/jest/@testing-library** in the stack; absence of unit tests is by design and must not be filed as a finding. Use `bun run --cwd frontend build:analyze` (rollup-plugin-visualizer) for bundle inspection and the `web-vitals` instrumentation for field Core Web Vitals.

## Audit Checklist

### **Critical Frontend Checks** 🚨

#### React 19+ and State Management

- [ ] **High**: React Compiler enabled (template default); no manual memoization without profiling evidence or documented referential-stability/effect-dependency justification
- [ ] **Critical**: TanStack Query used for all server state (data fetching, mutations, cache)
- [ ] **Critical**: Zustand used for global client state (NOT React Context for state)
- [ ] **Critical**: shadcn/ui used for UI components (NOT custom CSS components)
- [ ] **High**: Actions (useActionState) or TanStack Query mutations used for form submissions
- [ ] **Critical**: No hooks in conditionals
- [ ] **Critical**: All useEffect dependencies complete
- [ ] **Critical**: No legacy class components
- [ ] **High**: Route/page components wrapped in error boundaries; lazy routes have Suspense fallbacks

#### Tailwind CSS v4

- [ ] **Critical**: CSS-first configuration with @theme
- [ ] **Critical**: Consistent utility class ordering
- [ ] **Critical**: No legacy tailwind.config.js
- [ ] **Critical**: Modern utilities used (text-balance, @container)

#### Performance

- [ ] **Critical**: LCP ≤2.5s
- [ ] **Critical**: INP ≤200ms
- [ ] **Critical**: CLS ≤0.1
- [ ] **Critical**: JavaScript bundle <170KB gzipped critical path
- [ ] **Critical**: CSS bundle <50KB gzipped

### **High Priority Checks** ⚠️

- [ ] **High**: Code splitting implemented
- [ ] **High**: Images optimized and lazy loaded
- [ ] **High**: Skeleton loaders (or fixed-size placeholders) on async views to protect CLS
- [ ] **High**: Large lists/tables virtualized via `@tanstack/react-virtual` (10,000+ rows)
- [ ] **Medium**: Lazy route chunks preloaded on hover/focus
- [ ] **Medium**: Avoid deep prop drilling (3+ levels) of cross-cutting state; prefer Zustand for global state and TanStack Query for server state. Local 1-2 level prop passing is expected and not a finding.
- [ ] **High**: Components follow single responsibility

#### Accessibility (WCAG AA correctness)

- [ ] **High**: Semantic HTML and landmark elements used (not div/span with click handlers)
- [ ] **High**: Visible focus indicators; focus moved into and restored from dialogs/popovers
- [ ] **High**: All interactions keyboard-operable (no mouse-only affordances)
- [ ] **High**: All controls labelled (label / aria-label); icon-only buttons have accessible names
- [ ] **Medium**: Custom Radix-based wrappers expose correct `aria-*` roles/states
- [ ] **Medium**: `prefers-reduced-motion` honored for animations

## Report Template

```markdown
# Frontend Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Frontend Score**: [Score]/100
**React Score**: [Score]/25
**Tailwind CSS Score**: [Score]/25
**Performance Score**: [Score]/25
**Accessibility Score**: [Score]/25

**Critical Issues**: [Number]
**High Priority Issues**: [Number]

## React 19+ Assessment

- **React Compiler**: [Enabled/Disabled] (enabled by default in the Spernakit template)
- **Actions Usage**: [Percentage]% of forms using useActionState
- **Hook Compliance**: [Percentage]% (no hooks in conditionals)
- **Legacy Patterns**: [Number] found (class components, manual form handling)

## Tailwind CSS v4 Assessment

- **CSS-First Config**: [Yes/No]
- **Modern Utilities**: [Percentage]%
- **Class Organization**: [Score]/10

## Performance Metrics

### Core Web Vitals

- **LCP**: [X.X]s (Target: ≤2.5s)
- **INP**: [XXX]ms (Target: ≤200ms)
- **CLS**: [0.XX] (Target: ≤0.1)

### Bundle Sizes

- **JavaScript**: [XXX]KB gzipped critical path (Target: <170KB)
- **CSS**: [XX]KB gzipped (Target: <50KB)

## Detailed Findings

### Critical Issues 🚨

| Issue | Category         | Location    | Impact   | Remediation | Timeline |
| ----- | ---------------- | ----------- | -------- | ----------- | -------- |
| [ID]  | [React/CSS/Perf] | [File:Line] | [Impact] | [Fix]       | [Days]   |

## Recommendations

### Immediate (0-7 days)

1. [Critical performance issues]
2. [React anti-patterns]
3. [Accessibility violations]

### Short-term (1-4 weeks)

1. [Tailwind CSS migration]
2. [Bundle optimization]
3. [Code splitting]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 1 month]
```

## Deliverables and Success Criteria

A completed frontend audit produces:

- **Scored report** following the template above (overall /100, with React, Tailwind, Performance, and Accessibility each /25).
- **Prioritized findings** with severity per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md), each anchored to a file:line and a concrete remediation.
- **Remediation timeline** grouping findings into Immediate (0-7 days) and Short-term (1-4 weeks) buckets.
- **Verification evidence**: confirmation that `bun run smoke:qc` passes and `bun run crawltest` runs clean against the audited build.

**Success criteria**: zero unaddressed Critical/High findings, Core Web Vitals within targets (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1), bundle budgets met (JS <170KB gzipped critical path, CSS <50KB gzipped), and accessibility correctness checks passing.

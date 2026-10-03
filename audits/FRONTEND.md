---
title: 'Frontend Development, Performance, and UI Audit'
last_updated: '2026-10-03'
version: '3.0'
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

**What this audit checks, for any target with a user interface**

- **Accessibility correctness**: semantic structure, focus, keyboard operability, labelled controls
- **Interaction behaviour**: dialogs, loading, error and empty states, feedback on every action
- **Loading performance**: Core Web Vitals where they can be measured, bundle and asset weight
- **Stack conformance**: the conventions of the stack the target ACTUALLY uses, established in
  Step 0. A convention of a stack the target does not use is not a finding at any severity.

**⚡ Performance thresholds**

> **Detailed Metrics**: See [PERFORMANCE.md](./PERFORMANCE.md) for thresholds and how they are measured, and [LIGHTHOUSE.md](./LIGHTHOUSE.md) for parsing a lab report.

- **Core Web Vitals**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 (INP replaced FID March 2024)
- **Bundle Targets**: JavaScript <170KB gzipped (critical path), CSS <50KB gzipped

## Table of Contents

1. [Scope and Boundaries](#scope-and-boundaries)
2. [Step 0: Establish the target's stack](#step-0-establish-the-targets-stack)
3. [Pre-Audit Setup](#pre-audit-setup)
4. [React 19+ Best Practices](#react-19-best-practices)
5. [Tailwind CSS v4 Standards](#tailwind-css-v4-standards)
6. [Styling without a utility framework](#styling-without-a-utility-framework)
7. [Modal UX Standards](#modal-ux-standards)
8. [Performance Optimization](#performance-optimization)
9. [Interaction behaviour in DOM-scripted interfaces](#interaction-behaviour-in-dom-scripted-interfaces)
10. [Accessibility](#accessibility)
11. [Verification](#verification)
12. [Audit Checklist](#audit-checklist)
13. [Report Template](#report-template)
14. [Deliverables and Success Criteria](#deliverables-and-success-criteria)

## Scope and Boundaries

This audit owns **interaction behaviour, client/server state management, performance, bundle optimization, accessibility correctness** (semantic structure, focus, keyboard operability, ARIA), **and the conventions of whichever UI stack the target uses**. It defers **visual semantics, copy, layout polish, and design-system conformance** to [WEB_DESIGN_GUIDELINES.md](./WEB_DESIGN_GUIDELINES.md). When a finding is primarily about visual presentation or design-token usage, file it under WEB_DESIGN_GUIDELINES to avoid double-reporting; file it here when it is about behaviour, state, performance, bundle weight or accessibility correctness.

> **Spernakit applicability** (targets with `spernakit_version` in the root manifest): Spernakit verifies the frontend with `crawltest` (end-to-end route discovery, content assertions, interaction testing) and `smoke:qc` (typecheck, lint, build, format check). The stack intentionally has **no unit-test framework** (vitest/jest/@testing-library); their absence is by design, not a finding.

## Step 0: Establish the target's stack

Do this before reading any other section. Every stack-specific section below opens with the
condition under which it applies, and that condition is answered here.

1. **Find the UI source.** Do not assume `frontend/src`. Read the project manifest and the build
   configuration and record the directory or directories that hold the interface. Examples seen
   in this fleet: `frontend/src/**/*.tsx` (a Vite React app), `src/**/*.astro` with `src/styles`
   and `src/scripts` (an Astro site), `src/desktop/*.ts` with `index.html` and plain `.css` (an
   Electron renderer written against the DOM).
2. **Record what is installed**, from the manifest that owns the UI, not from memory:

    | Question                               | How to answer it                                 | Sections it turns on             |
    | -------------------------------------- | ------------------------------------------------ | -------------------------------- |
    | Is `react` a dependency?               | manifest                                         | React 19+ Best Practices         |
    | Is the React Compiler compiling?       | build output, see "React Compiler" below         | compiler-dependent rules only    |
    | Is `@tanstack/react-query` installed?  | manifest                                         | Server State with TanStack Query |
    | Is `zustand` installed?                | manifest                                         | Client State with Zustand        |
    | Is there a `components/ui` shadcn set  | directory listing, `components.json`             | shadcn/ui Component Patterns     |
    | Is `tailwindcss` v4 installed AND used | manifest, plus an `@import 'tailwindcss'` in CSS | Tailwind CSS v4 Standards        |
    | Is there a served URL to measure?      | dev/preview script, or a deployed address        | measured Core Web Vitals         |
    | Does the target derive from Spernakit  | `spernakit_version` in the root manifest         | every "Spernakit" note           |

3. **Write the answers at the top of the report**, under "Stack established". A section that Step
   0 turned off is recorded as **Not applicable: the target does not use X** and contributes
   nothing to the score, in either direction.
4. **A search that matched zero files is a wrong path until proven otherwise.** Before recording
   "no findings" from any scan in this audit, confirm the scan's path and glob match at least one
   file of the target's UI source. A clean result from a directory that does not exist is the
   most common false pass this audit produces.

Why this step exists: this audit was written against one stack. Run as written against an Astro
site or a DOM-scripted desktop renderer, it reported Critical findings for not using TanStack
Query, Zustand and shadcn in projects that had no reason to, and scored half the report against
libraries that were not installed.

## Pre-Audit Setup

### Required Artifact Files

Consult these before forming findings; they anchor frontend findings to project-declared behavior rather than generic best-practice opinion:

- `/.aidd/spec.md`: product source of truth. Frontend behavior that contradicts the spec (e.g. wrong navigation flow, missing required state) is a high-priority finding.
- `/.aidd/screen-map.md`: declared screen/route catalog. Use this to verify route coverage and to flag pages that exist in code but are absent from the map (or vice versa).
- `/.aidd/assertions.md`: UX, accessibility, and security invariants relevant to the frontend. Every "frontend defect" finding should be checked against assertions before being filed.

### Required Tools and Verification

Run these against the UI source and manifest recorded in Step 0. `<ui-manifest>` is the `package.json` that owns the interface and `<ui-dir>` its directory; neither is assumed to be `frontend/`.

```bash
# Installed versions: read them, do not assume them
grep -E '"react"|"react-dom"|"tailwindcss"|"typescript"|"astro"|"electron"' <ui-manifest>

# Bundle analysis, where the project defines it (Spernakit and aidd: rollup-plugin-visualizer)
bun run --cwd <ui-dir> build:analyze

# Tailwind v4 CSS-first configuration, only when Step 0 found Tailwind in use
grep -rn "@theme" <ui-source> --include=*.css
```

Lab Core Web Vitals come from a Lighthouse report parsed under [LIGHTHOUSE.md](./LIGHTHOUSE.md), against the address the target actually serves (read the port from its configuration; do not assume one). Field metrics come from `web-vitals` where the project wires it. A target with no served URL (a `file://` desktop renderer) has no measurable Core Web Vitals: record **not measured**.

## React 19+ Best Practices

### React Compiler Integration

> **Applies when**: `react` is a dependency AND the compiler is configured.
>
> **Verify that it is compiling before relying on it.** A configured compiler and a working one
> are different things: a plugin option that the installed plugin version ignores leaves the
> configuration in place and compiles nothing, and every source-level check still passes. Build
> the frontend and search the emitted JavaScript for the compiler's cache sentinel:
>
> ```bash
> grep -l "react.memo_cache_sentinel" <build-output>/assets/*.js | wc -l
> ```
>
> - A non-zero count: the compiler is compiling. Apply the guidance below.
> - Zero, with the compiler configured: file **High: React Compiler is configured but not
>   compiling**, and do NOT apply any rule in this audit, or in REACT_BEST_PRACTICES.md, that
>   suppresses a finding on the grounds that the compiler handles it. Manual memoization in such
>   a project is doing real work.
> - Not configured: record it as absent. That is a finding only if the project's own standard
>   requires it.
>
> Grepping `package.json` or `vite.config.ts` for `react-compiler` is not verification. It finds
> the configuration, which is the thing that can be present and inert.

**Trust a compiler that is verified compiling**: let it optimize automatically. Flag manual memoization only
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

> **Applies when** `@tanstack/react-query` is installed. In a React project without it, hand-rolled fetching is a Medium finding only where it demonstrably lacks caching, cancellation or error handling that the screen needs; the absence of the library is not itself a finding.

Where it is installed, TanStack Query is the pattern for data fetching, caching, and mutations.

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

> **Applies when** `zustand` is installed. React Context for low-frequency values (theme, locale, current user) is not a finding in any project.

Where it is installed, global client state goes through Zustand rather than React Context.

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
// ❌ React Context for frequently changing state re-renders every consumer
const ThemeContext = createContext();
function ThemeProvider({ children }) {
	const [mode, setMode] = useState('system');
	return <ThemeContext.Provider value={{ mode, setMode }}>{children}</ThemeContext.Provider>;
}
```

### shadcn/ui Component Patterns

> **Applies when** the project has a shadcn component set (`components.json`, a `components/ui` directory). The rule is that where a shadcn primitive exists for the control, it is used. A custom component for something shadcn has no primitive for is not a finding.

- Install components via CLI: `bunx shadcn@latest add button`
- Components live in the UI source's `components/ui/` (direct imports, no barrel file)
- Spernakit-derived targets: shared application components in `components/shared/`, layout components in `components/layout/`
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

> **Applies when** `react` is a dependency.

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

> **Applies when** `react` is a dependency.

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

> **Applies when** `react` is a dependency.

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

> **Applies when** `react` is a dependency.

**Wrap route/page components in error boundaries; provide Suspense fallbacks for lazy routes**

Page-level routes must be resilient to render-time errors and code-split loading. Pair an error boundary around route content with a Suspense fallback for any `lazy()`-loaded page, and, where TanStack Query is installed, let it handle data-fetch errors with retry strategies.

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

> **Applies when** Tailwind v4 is installed and imported by the project's CSS. A project styled with hand-written CSS and custom properties is audited under [Styling without a utility framework](#styling-without-a-utility-framework) instead.

### CSS-First Configuration Migration

**CSS-first configuration is the v4 standard**

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

Not audited here. The Prettier Tailwind plugin enforces class order, so a passing `format:check` is the evidence. Do not re-audit ordering by eye and do not file it as a finding.

## Styling without a utility framework

Applies when the target's interface is styled with hand-written CSS.

- **Tokens, not literals.** Colours, type steps and spacing that repeat are custom properties
  defined once. A hex value or a pixel size that appears in three or more rules with the same
  meaning is a Medium finding; cite each occurrence.
- **One owner per shared rule.** A declaration that exists to serve one container does not live
  in a rule shared by many. (`align-self` on a shared chip class, added for one flex row, will
  misplace the chip in every flex column.) Medium.
- **No constant that silently depends on another element's size.** A hard-coded offset that must
  equal the height of something else (a sticky header, a tab strip) is a finding unless it is
  derived (`calc()` from shared custom properties) or a gate measures it. Medium; High where it
  has already regressed.
- **State selectors are complete.** Every interactive element has `:hover`, `:focus-visible` and
  `:active` treatments that differ from rest and from each other where they mean different
  things; "current" and "hovered" must not render identically.
- **`prefers-reduced-motion` and `color-scheme`** are honoured where the project animates or
  themes.

## Modal UX Standards

Applies to every target. Modals must follow these behavior rules:

- Close on **escape key** or **off-click** by default.
- Close on **explicit close button** click, if present.
- Do **not** close automatically when there is unsaved information without explicit user confirmation.

## Performance Optimization

### Core Web Vitals Targets

> **Comprehensive Guide**: See [PERFORMANCE.md](./PERFORMANCE.md) for detailed thresholds, optimization decision trees, and performance budgets.

**Thresholds**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1.

These are measured values. This audit reads source, and a threshold cannot be ticked from source: the only valid entries are a number taken from a parsed Lighthouse or crawler artifact (see [LIGHTHOUSE.md](./LIGHTHOUSE.md)) or **not measured**.

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

- **Skeleton loaders**: Render skeletons (or fixed-size placeholders) for async views so incoming content does not push layout, which directly protects CLS (STACK.md: "Skeleton loaders — prevent layout shift during data loading"). Spernakit-derived targets ship shared skeletons under `frontend/src/components/shared/skeletons/`.
- **Virtualization**: Large lists/tables (10,000+ rows) are virtualized to keep DOM size and INP in check rather than rendering every row. Use the virtualizer the target already has (Spernakit ships `@tanstack/react-virtual` behind its data-table primitive); a missing library is not the finding, an unvirtualized 10,000-row render is.
- **Route preloading**: Preload lazy route chunks on hover/focus so navigation does not stall on a cold chunk fetch (STACK.md: "route preloading on hover/focus").

## Interaction behaviour in DOM-scripted interfaces

Applies when the interface is driven by hand-written DOM code rather than a component framework
(an Electron renderer, Astro islands, plain scripts).

- **Every state the user causes is acknowledged on screen.** A click that starts work shows that
  it started; a failure names the operation that failed and carries the underlying reason.
- **Errors that persist can be dismissed**, and a second error after a dismissal is still shown.
- **Asynchronous redraws preserve what the user chose.** A list or control group that is rebuilt
  when data arrives must restore selection, focus and scroll position. Read each function that
  replaces children and trace what was selected before it ran. High where a choice is lost.
- **Controls are not usable before the state they act on is loaded.** A control that is on screen
  while the form behind it is still being reset must be disabled or inert until the load settles,
  or its effect is silently wiped. High.
- **Event listeners are added once.** A setup function that can run more than once must not
  attach duplicate listeners. Medium.
- **No `innerHTML` with interpolated data.** Use `textContent` and node construction. This is a
  security finding as well as a correctness one; cross-file it under SECURITY.md.
- **Native dialogs**: `showModal()` for modal work, Escape and outside-click closing guarded by
  the same unsaved-changes check as the close button, focus returned to the opener on close.

Testing note for auditors who drive the interface: a scripted `element.click()` ignores `inert`
and `disabled`-by-ancestor. To check that a control is protected, send real input, and include a
step where the same input must succeed.

## Accessibility

> **Boundary**: This section covers accessibility **correctness/behavior**. Visual contrast tokens and design-system semantics are owned by [WEB_DESIGN_GUIDELINES.md](./WEB_DESIGN_GUIDELINES.md).

**MANDATORY: WCAG AA correctness**

- **Semantic HTML**: Use landmark and semantic elements (`<nav>`, `<main>`, `<button>`, headings in order) instead of `div`/`span` with click handlers.
- **Focus management**: Visible focus indicators on all interactive elements; move focus into dialogs/popovers on open and restore it on close (Radix handles this for shadcn/ui primitives; verify custom wrappers and hand-written dialogs preserve it).
- **Keyboard operability**: Every interaction reachable and operable by keyboard. No mouse-only affordances. (Spernakit-derived targets: ties into the global `useKeyboardShortcuts` system.)
- **Labelled controls**: All inputs have associated `<label>`s or `aria-label`; icon-only buttons have accessible names.
- **ARIA on interactive wrappers**: Custom components expose correct `aria-*` roles/states, whether built on Radix or by hand; do not strip ARIA when restyling.
- **Color contrast**: Text and essential UI meet WCAG AA contrast (defer token-level enforcement to WEB_DESIGN_GUIDELINES).
- **Reduced motion**: Honor `prefers-reduced-motion` for animations and transitions.

## Verification

Frontend health is verified through the project's own gates, not a unit-test suite:

- **The project's quality gate.** `bun run smoke:qc` where it exists; otherwise the project's
  equivalent typecheck, lint, build and format checks. Record which command was run.
- **End-to-end behaviour, where the project has it.** `bun run crawltest` in projects that carry
  it. A project without crawltest is not asked for crawltest evidence; record what was used
  instead (a build-output gate, a link check, a scripted window probe).

Spernakit and derived apps have no vitest/jest/@testing-library by design. Whether another
project should have unit tests is TESTING.md's question, not this audit's.

## Audit Checklist

### **Critical Frontend Checks** 🚨

#### Every target

- [ ] **High**: Semantic HTML and landmarks (no `div`/`span` click targets)
- [ ] **High**: Visible focus on every interactive element; focus moved into and restored from dialogs
- [ ] **High**: Every interaction operable by keyboard
- [ ] **High**: Every control labelled; icon-only buttons have an accessible name
- [ ] **High**: Each user-caused state change is acknowledged on screen; failures say what failed
- [ ] **Medium**: `prefers-reduced-motion` honoured
- [ ] **Critical where measured**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1. Record **not measured** when no
      Lighthouse or crawler artifact was parsed. A value read from source is not a measurement.
- [ ] **High where measured**: critical-path JavaScript <170KB gzipped, CSS <50KB gzipped

#### Only when Step 0 turned the section on

- [ ] **High** (React + compiler verified compiling): no manual memoization without profiling
      evidence or a documented referential-stability reason
- [ ] **High** (React, compiler configured): the compiler is actually compiling (cache sentinel
      present in the build output)
- [ ] **Critical** (React): no hooks in conditionals; effect dependencies complete
- [ ] **High** (React): route components wrapped in error boundaries; lazy routes have fallbacks
- [ ] **High** (TanStack Query installed): server state goes through it
- [ ] **High** (Zustand installed): global client state goes through it
- [ ] **High** (shadcn set present): shadcn primitives used where one exists for the control
- [ ] **High** (Tailwind v4 used): CSS-first configuration with `@theme`; no legacy
      `tailwind.config.js`
- [ ] **Not audited here** (Tailwind): utility class ordering. The prettier Tailwind plugin
      enforces it; a passing `format:check` is the evidence.
- [ ] **Medium** (hand-written CSS): repeated values are tokens; no constant that must equal
      another element's size
- [ ] **High** (DOM-scripted): asynchronous redraws preserve selection, focus and scroll
- [ ] **High** (DOM-scripted): no control usable before the state it acts on has loaded

### **High Priority Checks** ⚠️

- [ ] **High**: Code splitting implemented
- [ ] **High**: Images optimized and lazy loaded
- [ ] **High**: Skeleton loaders (or fixed-size placeholders) on async views to protect CLS
- [ ] **High**: Large lists/tables (10,000+ rows) virtualized
- [ ] **Medium**: Lazy route chunks preloaded on hover/focus
- [ ] **Medium** (React): Avoid deep prop drilling (3+ levels) of cross-cutting state; prefer the project's store for global state and its query layer for server state. Local 1-2 level prop passing is expected and not a finding.
- [ ] **High**: Components follow single responsibility

#### Accessibility (WCAG AA correctness)

The four High accessibility lines are in "Every target" above.

- [ ] **Medium**: Custom wrappers expose correct `aria-*` roles/states

## Report Template

```markdown
# Frontend Audit Report - YYYY-MM-DD

## Executive Summary

## Stack established (Step 0)

- UI source: [paths]
- React: [version / not used] · Compiler: [compiling / configured but not compiling / absent]
- Server state: [TanStack Query / other / n/a] · Client state: [Zustand / other / n/a]
- Component set: [shadcn / custom / n/a] · Styling: [Tailwind v4 / hand-written CSS]
- Measurable URL: [address / none]

**Overall Frontend Score**: [Score]/100, over the sections that applied
**Sections applied**: [list] · **Not applicable**: [list, each with the reason]
**Accessibility and interaction**: [Score]
**Stack conformance**: [Score, or "n/a"]
**Performance**: [Score, or "not measured"]

**Critical Issues**: [Number]
**High Priority Issues**: [Number]

## Stack conformance (applied sections only)

- **React** (if used): hook compliance, legacy patterns found, forms using Actions or mutations
- **Tailwind v4** (if used): CSS-first config [Yes/No]
- **Hand-written CSS** (if used): repeated literals, size-coupled constants
- **DOM-scripted behaviour** (if used): redraws that lose state, controls live before load

## Performance Metrics

### Core Web Vitals

- **LCP**: [X.X]s or not measured (Target: ≤2.5s)
- **INP**: [XXX]ms or not measured (Target: ≤200ms)
- **CLS**: [0.XX] or not measured (Target: ≤0.1)
- **Source of the numbers**: [artifact path, or "none parsed"]

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

1. [Stack conformance]
2. [Bundle optimization]
3. [Code splitting]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 1 month]
```

A section that did not apply is never scored as full marks. The overall score is computed over
applied sections only, and the report says which they were.

## Deliverables and Success Criteria

A completed frontend audit produces:

- **Scored report** following the template above, opening with "Stack established" and scored over applied sections only.
- **Prioritized findings** with severity per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md), each anchored to a file:line and a concrete remediation.
- **Remediation timeline** grouping findings into Immediate (0-7 days) and Short-term (1-4 weeks) buckets.
- **Verification evidence**: the project's own gate (`bun run smoke:qc` where it exists) passes, plus `bun run crawltest` only in projects that carry it. Name the command that was run.

**Success criteria**: zero unaddressed Critical/High findings, Core Web Vitals within targets where measured (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1), bundle budgets met (JS <170KB gzipped critical path, CSS <50KB gzipped), and accessibility correctness checks passing.

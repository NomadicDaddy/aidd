---
title: 'Frontend Development, Performance, and UI Audit'
last_updated: '2025-01-13'
version: '2.0'
category: 'Frontend'
priority: 'High'
estimated_time: '2-3 hours'
frequency: 'Monthly'
lifecycle: 'pre-release'
---

# Frontend Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

## Executive Summary

**🎯 Critical Frontend Priorities**

- **React 19+ Patterns**: Modern React patterns, hooks, Actions, and component design
- **Tailwind CSS v4**: CSS-first configuration with `@theme` blocks, utility optimization
- **Core Web Vitals**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 (INP replaced FID March 2024)
- **Bundle Optimization**: JavaScript <170KB (critical path), CSS <50KB (gzipped)
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
- **Bundle Targets**: JavaScript <170KB (critical path), CSS <50KB (gzipped)

## Table of Contents

1. [Pre-Audit Setup](#pre-audit-setup)
2. [React 19+ Best Practices](#react-19-best-practices)
3. [Tailwind CSS v4 Standards](#tailwind-css-v4-standards)
4. [Performance Optimization](#performance-optimization)
5. [Core Web Vitals Assessment](#core-web-vitals-assessment)
6. [Audit Checklist](#audit-checklist)
7. [Report Template](#report-template)

## Pre-Audit Setup

### Required Tools and Verification

```bash
# Verify versions (check package.json or use bun pm ls)
cat package.json | grep -E '"react"|"react-dom"|"tailwindcss"|"typescript"'
# Ensure: React 19.0.0+, Tailwind 4.0.0+, TypeScript 5.0+

# Performance analysis tools
bun install -D @lighthouse-ci/cli
bun install -D webpack-bundle-analyzer
bun install -D vite-plugin-bundle-analyzer

# Testing tools
bun install -D @testing-library/react @testing-library/jest-dom
bun install -D vitest @vitest/ui
```

### Environment Preparation

1. **React DevTools**: Install React DevTools 5.0+ for React 19 debugging
2. **Lighthouse**: Use Chrome DevTools Lighthouse or Lighthouse CI
3. **Bundle Analyzer**: Configure bundle analysis in build tools
4. **Performance Monitoring**: Set up Core Web Vitals tracking

### Verification Commands

```bash
# Check React Compiler status
grep -r "react-compiler" package.json tsconfig.json vite.config.ts

# Verify Tailwind v4 configuration
grep -r "@theme" src/**/*.css

# Analyze bundle size
bun run build && bun run analyze

# Run Lighthouse audit
npx lighthouse http://localhost:3000 --view
```

## React 19+ Best Practices

### React Compiler Integration

> **Important**: React Compiler is an opt-in tool that requires explicit setup. It's not automatically enabled in React 19. See [react.dev/learn/react-compiler](https://react.dev/learn/react-compiler) for installation instructions.

**Setup Requirements**:

```bash
# Install React Compiler (requires babel-plugin-react-compiler)
bun install -D babel-plugin-react-compiler eslint-plugin-react-compiler
```

**When React Compiler IS enabled**: Let it optimize automatically

✅ **Good: Trust React Compiler (when enabled)**:

```jsx
function ProductList({ products }) {
	// React Compiler optimizes this automatically when enabled
	return products.map((product) => <ProductCard key={product.id} product={product} />);
}
```

❌ **Bad: Manual Memoization (when compiler is enabled)**:

```jsx
// ❌ Unnecessary when React Compiler is enabled
const ProductList = memo(({ products }) => {
	return useMemo(
		() => products.map((product) => <ProductCard key={product.id} product={product} />),
		[products]
	);
});
```

**When to Use Manual Optimization (useMemo, useCallback, memo)**:

- React Compiler is NOT enabled in the project
- Profiling shows specific performance issues that compiler doesn't address
- Complex calculations that benefit from explicit memoization

### Actions and Form Handling

**MANDATORY: Use Actions for form submissions**

✅ **Good: Using Actions with useActionState**:

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

❌ **Bad: Manual Form Handling**:

```jsx
function ContactForm() {
	const [loading, setLoading] = useState(false);
	const [error, setError] = useState(null);

	const handleSubmit = async (e) => {
		e.preventDefault();
		setLoading(true);
		try {
			const formData = new FormData(e.target);
			await submitContact(formData);
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

## Audit Checklist

### **Critical Frontend Checks** 🚨

#### React 19+

- [ ] **High**: React Compiler configured (if opting in) - requires explicit setup
- [ ] **Critical**: Actions used for form submissions (useActionState)
- [ ] **Critical**: No hooks in conditionals
- [ ] **Critical**: All useEffect dependencies complete
- [ ] **Critical**: No legacy class components

#### Tailwind CSS v4

- [ ] **Critical**: CSS-first configuration with @theme
- [ ] **Critical**: Consistent utility class ordering
- [ ] **Critical**: No legacy tailwind.config.js
- [ ] **Critical**: Modern utilities used (text-balance, @container)

#### Performance

- [ ] **Critical**: LCP ≤2.5s
- [ ] **Critical**: INP ≤200ms
- [ ] **Critical**: CLS ≤0.1
- [ ] **Critical**: JavaScript bundle <170KB
- [ ] **Critical**: CSS bundle <50KB

### **High Priority Checks** ⚠️

- [ ] **High**: Code splitting implemented
- [ ] **High**: Images optimized and lazy loaded
- [ ] **High**: No prop drilling (use Context)
- [ ] **High**: Components follow single responsibility
- [ ] **High**: Accessibility standards met (WCAG AA)

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

- **React Compiler**: [Enabled/Disabled/Not Configured] (opt-in feature)
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

- **JavaScript**: [XXX]KB (Target: <170KB)
- **CSS**: [XX]KB (Target: <50KB)

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

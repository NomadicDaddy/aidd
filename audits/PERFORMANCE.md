---
title: 'Performance Optimization Audit Framework'
last_updated: '2026-07-20'
version: '2.3'
category: 'Core Technology'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
prerequisites: 'Performance concepts, Core Web Vitals, Lighthouse knowledge, Spernakit stack familiarity (Vite 8, React 19, Elysia, Drizzle, Bun)'
lifecycle: 'pre-release'
---

# Unified Performance Audit Framework

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Overview](#overview)
3. [Audit Scope](#audit-scope)
4. [Performance Targets](#performance-targets)
5. [Pre-Audit Setup](#pre-audit-setup)
6. [Methodology](#methodology)
7. [Evaluation Framework](#evaluation-framework)
8. [Performance Monitoring](#performance-monitoring)
9. [Performance Optimization Decision Trees](#performance-optimization-decision-trees)
10. [Optimization Strategies](#optimization-strategies)
11. [Audit Checklist](#audit-checklist)
12. [Common Performance Anti-Patterns](#common-performance-anti-patterns)
13. [Integration with Specialized Audits](#integration-with-specialized-audits)
14. [Performance Budget Guidelines](#performance-budget-guidelines)
15. [Report Template](#report-template)
16. [Deliverables](#deliverables)

## Executive Summary

**Critical Performance Targets**

- **Core Web Vitals**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 **at p75** (INP replaced FID in March 2024)
- **Backend routes**: <100ms p50 / <300ms p95 on warm DB
- **Bundle budget**: Critical-path JS ≤170KB gzipped, CSS ≤50KB gzipped — **and** the three structural invariants below, which a size budget cannot see
- **Database**: Drizzle queries with indexed predicates, `limit()` by default, no in-memory filtering

**Essential Optimization Areas**

- **Frontend**: React 19 + React Compiler automatic memoization, Vite 8 code splitting, route-level lazy loading, `@tanstack/react-virtual` for large lists
- **Backend**: Elysia handler execution, Drizzle indexed queries, Bun runtime tuning
- **CSS**: Tailwind CSS v4 content-aware purging, critical CSS, layout-shift prevention
- **Infrastructure**: Gzip + Brotli compression and cache headers verified **by request against the target's actual static origin** (which may not be nginx), Docker container warm-up

**Performance Monitoring Requirements**

- **Real-time metrics**: Core Web Vitals via `web-vitals` package (LCP, INP, CLS, FCP, TTFB); attached to `logs/crawltest.json`
- **Backend metrics**: `system_metrics` table populated by `metricsService`
- **Bundle analysis**: `bun run --cwd frontend build:analyze` (rollup-plugin-visualizer) + `bun run verify-compression` + `bun run check:critical-path` for the structural invariants a size figure cannot express
- **Regression detection**: `crawltest` records per-route web vitals in `logs/crawltest.json`; compare across branches

**Optimization Strategies**

- **Code splitting**: Route-based via `React.lazy()` with named-export adapter, plus dynamic `import()` for heavy components
- **Caching**: TanStack Query `staleTime` tuning, browser cache headers, Drizzle-level memoization for hot keys
- **Image optimization**: WebP/AVIF via `bun run optimize-images` (sharp), `loading="lazy"`, explicit `width`/`height`
- **Database optimization**: Drizzle index creation in schema files (`idx_{table}_{columns}`), parameterized queries, pagination

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): validate every instrument before reading its output (Phase 0), read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.
> **Scope boundary**: This audit owns **how fast the application runs**. What it ships and how those bytes are served — chunk graph, artifact contents, compression, cache headers, asset weight — belongs to [BUILD_OUTPUT.md](./BUILD_OUTPUT.md). Phase 4 below delegates there rather than duplicating it.

## Overview

This unified framework consolidates performance-related auditing across all technology layers of a Spernakit v3 application: frontend React/Vite optimization, backend Elysia/Bun efficiency, Drizzle/SQLite query performance, Tailwind CSS v4 bundle hygiene, and nginx/Docker infrastructure.

**Stack reference** (see `<spernakit-root>/docs/template/STACK.md`, pinned as of spernakit v3.11.0 LTS, 2026-06-27):

- React 19.2 + Vite 8 + Tailwind CSS v4 + TanStack Query 5 + Zustand 5
- React Compiler (`babel-plugin-react-compiler` at stable `1.0.0` GA) enabled by default; manual `React.memo` / `useMemo` / `useCallback` are settled anti-patterns unless profiling proves need
- Elysia 1.4 + Bun 1.3.14 + Drizzle ORM 0.45 + SQLite (or PostgreSQL)
- `web-vitals` 5.3 wired into crawltest for LCP/INP/CLS/FCP/TTFB collection in `logs/crawltest.json`

## Audit Scope

### Frontend Performance

- React Compiler memoization verification (no manual `memo`/`useMemo`/`useCallback` without justification)
- Bundle size analysis via `rollup-plugin-visualizer`
- Route-based code splitting (`React.lazy` with named-export adapter pattern)
- Image optimization (WebP/AVIF output of `bun run optimize-images`)
- TanStack Query `staleTime` / `gcTime` tuning
- TanStack Query `refetchInterval` / polling cadence (prefer WebSocket invalidation over aggressive polling)
- Zustand store subscription granularity (avoid whole-store selectors)
- `useTransition` / `useDeferredValue` for expensive derived UI
- `useContainerWidth` for Recharts (never `ResponsiveContainer`: known infinite-render bug with React 19 + StrictMode + React Compiler)

### Backend Performance

- Elysia route handler execution times (p50 <100ms, p95 <300ms)
- Drizzle query performance and index usage (`db.query.*.findMany({ with, limit })`)
- Connection/prepared-statement reuse
- Bun runtime cost (avoid sync I/O in hot paths)
- Request-scoped logging cost (pino structured logs, no JSON.stringify in hot path)
- WebSocket broadcast fan-out cost

### CSS & UI Performance

- Tailwind CSS v4 `@theme` tokens vs arbitrary values
- Critical CSS and above-the-fold inlining
- Font loading (`@fontsource-variable/inter`, `font-display: swap`)
- Layout shift prevention (reserved image dimensions, skeleton loaders)
- Animation cost (`transform`/`opacity` only, no layout-triggering properties)

### Infrastructure Performance

- Vite 8 build time and chunk strategy (structural invariants via `check:critical-path`; artifact detail in [BUILD_OUTPUT.md](./BUILD_OUTPUT.md))
- Compression and minification **as served**, measured against whichever process is the static origin — not assumed to be nginx
- Docker container cold-start time
- CDN / static-asset caching headers, including whether a security-headers default suppresses them
- Brotli + Gzip dual-encoding

## Performance Targets

### Critical Thresholds (Current Core Web Vitals rubric)

- **Largest Contentful Paint (LCP)**: ≤ 2.5s (Core Web Vital)
- **Interaction to Next Paint (INP)**: ≤ 200ms (Core Web Vital; replaced FID March 2024)
- **Cumulative Layout Shift (CLS)**: ≤ 0.1 (Core Web Vital)
- **First Contentful Paint (FCP)**: ≤ 1.8s (Lighthouse metric, 10% weight)
- **Total Blocking Time (TBT)**: ≤ 200ms (Lighthouse metric, 30% weight; updated threshold per Lighthouse 12)
- **Speed Index (SI)**: ≤ 3.4s (Lighthouse metric, 10% weight)
- **Time to First Byte (TTFB)**: ≤ 800ms (Core Web Vitals supplemental)
- **Backend route execution (p95)**: ≤ 300ms
- **Database queries**: indexed, paginated (default `limit(50)`)

### Critical Path: Operational Definition

"Critical path" must not be reduced to the size of the main JavaScript chunk. That reading misses a
framework runtime placed behind serialized browser round trips even when the byte budget passes.

**The critical path is: the entry module, every chunk the entry HTML declares as `modulepreload`, and every render-blocking stylesheet — measured in the encoding the origin actually serves.** Lazy and prefetched chunks are excluded by definition. Anything the browser must fetch before first render is in; anything it discovers later is out.

Measure it against the built artifact, never against a bundler summary line.

### Structural Invariants (a size budget cannot see these)

A byte budget is blind to how bytes are distributed. Moving the framework runtime between chunks changes the total by **zero** while adding a round trip to every page load. Three assertions catch what the budget cannot; all three are required, and none implies the others:

1. **Runtime placement** — the framework runtime lives in a chunk the entry HTML preloads, so it is never discovered late.
2. **No waterfall** — the entry chunk never _statically_ imports a chunk that is not preloaded. That combination is a serialized round trip by definition: the browser cannot know it needs the chunk until it has fetched and parsed the entry.
3. **Declared groups emitted** — every chunk group the build config declares appears in the output. A modern bundler may accept a legacy config shape, apply it partially, and warn about nothing.

**Every target MUST ship a gate asserting all three, wired into a smoke mode or CI job.** The template's `scripts/check-critical-path.ts` is the reference implementation (three assertions plus a `--update-budget` regeneration path). Its absence in a target is a **High** finding; so is its presence in `package.json` with no gate invoking it — see Phase 0 below, and note that this catalog's own `verify-minification` sat uninvoked for months while being cited as a control.

Assertion detail and the artifact-level procedure live in [BUILD_OUTPUT.md](./BUILD_OUTPUT.md) Phase 3.

### Optimization Priorities

1. **Critical**: Core Web Vitals compliance (LCP, INP, CLS)
2. **High**: Bundle-size reduction, backend p95, Drizzle index coverage
3. **Medium**: Build-time optimization, caching strategy, image pipeline
4. **Low**: Micro-optimizations, advanced monitoring dashboards

## Pre-Audit Setup

### Phase 0 first: the commands below are not guaranteed to exist here

Every script named in this section is a **template** script. A derived application, or any target with a different topology, may not have it — and on at least one target none of them existed while this audit still returned a score seven runs in a row. Before running anything, apply [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) Phase 0 to each instrument you intend to use:

1. **Present** — read the target's `package.json`; confirm the script exists here.
2. **Wired** — confirm a smoke mode or CI job invokes it. A script nothing calls has never run.
3. **Faithful** — confirm it measures what it claims: which build, which server, which statistic. A flag that names a mode is not proof the mode took effect; read the code that consumes the flag.

Record an instrument record per instrument. **A missing or broken instrument is a High finding, not a reason to narrow scope**, and a report with zero verified instruments is `SKIPPED / data-unavailable` with no score — enforced at report-write time.

Before beginning the audit, collect baseline artifacts:

```bash
# Run the production build and capture bundle stats
bun run build
bun run --cwd frontend build:analyze   # opens rollup-plugin-visualizer report

# Verify compression is enabled end-to-end
bun run verify-compression
bun run verify-minification

# Assert the *shape* of the critical path, not only its size (required gate)
bun run check:critical-path

# Run crawltest to collect per-route web vitals
bun run crawltest
bun run crawltest:analyze

# Optional: profile backend CPU/heap under load
bun run profile:cpu
bun run profile:heap
```

Inputs required for the audit:

- `frontend/dist/` build output + `stats.html` from rollup visualizer
- `logs/crawltest.json` report (per-route web vitals, console errors)
- `backend/src/db/schema/` for index audit
- `config/{slug}.json` for rate-limit, cache, and backup settings

## Methodology

### Phase 1: Baseline Measurement

1. Capture Core Web Vitals via crawltest, then **verify which build produced them before reading a single number**. Dev-mode measurements are inflated by HMR/React DevTools, so a dev crawl cannot be reported as a production result. Two specific traps, both of which have already produced false findings in this catalog:
    - **A `--mode` flag is a label, not a guarantee.** Confirm the harness actually resolved a different URL and that the served build is the one claimed — ask the running application what it is serving rather than trusting the flag. A mode flag that the URL resolver ignores measures whatever happened to be listening.
    - **Console-harvested vitals may be dev-only.** Where the instrumentation emits console lines under a dev guard, a production build yields **zero** samples and the crawl silently reports nothing rather than failing. Read the emitting module before attributing numbers to a build.

    Record the resolved build in the instrument record. Where the harness cannot prove which build it measured, the vitals are unusable: raise the instrument finding and do not report the numbers.

2. **Aggregate at p75, never the mean.** Core Web Vitals thresholds are defined at the 75th percentile; averaging hides exactly the tail those thresholds exist to catch, so a page that is fast on most loads and slow on the worst quarter averages out to a passing score. Any dashboard, card, or report surfacing a vitals figure must state its statistic — an unlabelled figure is an unverified instrument. Note also that `reportAllChanges` is appropriate only for CLS and INP; where it is set, those two are worst-intermediate values rather than the Core Web Vitals definitions, and must be labelled as such.
3. Record bundle sizes from `build:analyze`. Parse `frontend/dist/stats.html` (or the rollup-plugin-visualizer JSON output) for the top-N chunk sizes (gzip and brotli variants) and compare each against the documented budget (critical-path JS ≤170KB gzipped, total ≤300KB, CSS ≤50KB). Where a prior snapshot exists, diff per-chunk sizes across branches so the finding is a quantitative delta, not a presence/absence judgement. **A passing size budget is not a passing critical path** — run the structural invariants (`check:critical-path`) alongside it, since the regression they exist to catch is byte-neutral.
4. Run backend route benchmark to capture p50/p95 distribution.
5. If Lighthouse lab metrics or bundle-stats artifacts are unavailable at execution time, fall back to the workflow in [LIGHTHOUSE.md](./LIGHTHOUSE.md) and record the gap explicitly rather than scoring on qualitative "React Compiler + lazy active" evidence alone. Where a target has deliberately removed lab measurement, check for an ADR recording that decision before raising it again as a gap.
6. Do not emit a numeric `Overall Performance Score` unless at least one real measurement artifact was parsed (`logs/crawltest.json`, Lighthouse JSON, bundle analysis output, route benchmark output, or backend metrics). If no measurement artifact is available, mark the report `SKIPPED / data-unavailable` and do not include score-like `N/A`, issue counts, or remediation recommendations.

    This rule is now **mechanically enforced**: a score in a `PERFORMANCE` report that is not backed by at least one instrument record with `verified: true` is stripped at report-write time and replaced with `SKIPPED / data-unavailable`, and the run summary carries a warning. It was previously prose only, and a report was published stating "no artifacts present" directly above a score of 84/100. Emit the instrument records; do not rely on the enforcement to decide the outcome for you.

### Phase 2: Frontend Audit

1. Grep for `React.memo(`, `useMemo(`, `useCallback(`; escalate only **bare** usages. Treat as a PASS any occurrence carrying a co-located justification comment (profiling-backed) OR a documented referential-stability / effect-dependency reason (e.g., stabilizing a value used in an effect dependency array, or memoizing props passed to an expensive third-party component). React Compiler obviates most usage, so escalate the unjustified remainder rather than every match.
2. Grep for `ResponsiveContainer` (recharts); flag any occurrence (replace with `useContainerWidth`).
3. Grep for `<Cell>` inside recharts `<Bar>` / `<Pie>`; flag (deprecated in recharts v3, causes infinite setState loops; use `fill` in data points).
4. Inspect route files in `frontend/src/routes.tsx`; confirm every non-critical page uses `React.lazy()` with named-export adapter.
5. Check `frontend/src/api/*` for N+1 TanStack Query patterns (multiple queries in a loop vs one batched query).
6. Grep for `refetchInterval`; flag any polling cadence < 5s without a justifying comment, and flag any polling loop where server-pushed invalidation is the Spernakit-native pattern (`wsStore` WebSocket events + `queryClient.invalidateQueries`). Unbounded or aggressive polling is a real recurring cost (client wakeups, backend fan-out, mobile battery).

### Phase 3: Backend Audit

1. List all Drizzle schema index definitions; cross-reference with `where()` predicates in services/routes; flag any unindexed filter column.
2. Grep for `.findMany(` without `.limit(`; flag.
3. Grep for JS-side `.filter()` on Drizzle result arrays that could be pushed into the query; flag.
4. Inspect Elysia route bodies >30 lines; confirm handler extraction per DEVELOPMENT.md.
5. Review `metricsService` data for slow-query offenders.

### Phase 4: Infrastructure Audit — Topology First

**Establish who serves the bytes before checking anything about them.** Never assume an
nginx-fronted layout or the presence of template scripts. A target may serve its own static
directory, and a missing instrument must fail loudly instead of silently skipping compression,
caching, and content-type verification.

1. **Identify the static origin.** Read the release `Dockerfile`, compose file, or process manager config and determine which holds: a reverse proxy serving a copied build, the application binary serving its own static directory, or a CDN in front of either. Cite the `file:line` that establishes it. If no single origin is identifiable, that is a **High** finding — an unknown origin has an unknown policy.
2. **Audit that origin's enforcing handler**, not the template's. Where the application serves its own assets, the static-file handler in the server module _is_ the enforcing implementation; read it and cite it per Rule 1. A `gzip on;` directive in a config file the target does not use is not evidence of anything.
3. **Measure by request, never by config.** Issue real requests and record the `Content-Encoding`, `Content-Type`, `Cache-Control`, and transferred size actually returned. Where `verify-compression` / `verify-minification` exist and are wired, they are supporting evidence; where they do not, the requests are the measurement and the missing gate is a finding.
4. Watch specifically for a blanket `no-store` from a security-headers layer applying to content-hashed assets. It means nothing is ever cached, and it reads as a security default rather than a performance defect — cite the handler line that does or does not exempt static assets.
5. Inspect `config/{slug}.json` caching/rate-limit settings where present.

Full artifact-and-wire procedure, including the repeat-visit check and the header policy table, is in [BUILD_OUTPUT.md](./BUILD_OUTPUT.md) Phase 1 and Phase 4. Run that audit for the detail; this phase exists to ensure a performance report never scores a delivery layer it did not measure.

### Phase 5: Classify & Report

Classify each finding per `SEVERITY_CLASSIFICATION.md` and emit `feature.json` entries in `.aidd/features/` for remediation.

## Evaluation Framework

### Frontend Assessment

#### React Performance (React Compiler-aware)

```tsx
// Good: let React Compiler optimize automatically — no manual memoization
export function OrderList({ items }: { items: Order[] }) {
	return (
		<ul>
			{items.map((item) => (
				<OrderRow key={item.id} order={item} />
			))}
		</ul>
	);
}

// Bad: manual memoization when the compiler can handle it
export const OrderList = React.memo(({ items }: { items: Order[] }) => {
	const rendered = useMemo(
		() => items.map((item) => <OrderRow key={item.id} order={item} />),
		[items]
	);
	return <ul>{rendered}</ul>;
});
```

#### React 19 Concurrent Features

```tsx
// Good: defer expensive derived UI, keep input snappy
import { useDeferredValue, useMemo } from 'react';

export function FilteredTable({ query, rows }: Props) {
	const deferredQuery = useDeferredValue(query);
	const filtered = useMemo(
		() => rows.filter((r) => r.name.includes(deferredQuery)),
		[rows, deferredQuery]
	);
	return <Table rows={filtered} />;
}

// Good: mark non-urgent state updates as transitions
import { useTransition } from 'react';

const [isPending, startTransition] = useTransition();
const handleTabChange = (tab: string) => {
	startTransition(() => setActiveTab(tab));
};
```

#### Bundle Optimization (Vite 8 + Named Exports)

```typescript
// Bad: import entire namespace
import * as dateFns from 'date-fns';

// Good: tree-shakeable named import
import { formatDistanceToNow } from 'date-fns';

// Good: route-level code split with named-export adapter (Spernakit pattern)
const UsersPage = lazy(() =>
	import('@/pages/users/UsersPage').then((m) => ({ default: m.UsersPage }))
);
```

#### Recharts v3 Pitfalls (React 19 + React Compiler)

```tsx
// Bad: ResponsiveContainer + React Compiler => infinite render loop
<ResponsiveContainer width="100%" height={300}>
	<BarChart data={data}>...</BarChart>
</ResponsiveContainer>;

// Good: useContainerWidth hook (Spernakit pattern)
const { ref, width } = useContainerWidth();
<div ref={ref}>
	<BarChart width={width} height={300} data={data}>
		...
	</BarChart>
</div>;

// Bad: <Cell /> per data point (deprecated recharts v3, infinite setState)
<Bar dataKey="value">
	{data.map((d) => (
		<Cell key={d.id} fill={d.color} />
	))}
</Bar>;

// Good: fill on the data point itself (recharts v3 reads per-bar fill)
<Bar dataKey="value" />; // data: [{ name, value, fill }]
```

### Backend Assessment

#### Drizzle Query Optimization

```typescript
// Good: indexed, filtered, and limited at the database
import { and, desc, eq } from 'drizzle-orm';

export async function listRecentOrders(workspaceId: string, status?: OrderStatus) {
	return db
		.select()
		.from(orders)
		.where(
			status
				? and(eq(orders.workspaceId, workspaceId), eq(orders.status, status))
				: eq(orders.workspaceId, workspaceId)
		)
		.orderBy(desc(orders.createdAt))
		.limit(50);
}

// Bad: fetch-all-then-filter (N-to-memory anti-pattern)
export async function listRecentOrders(workspaceId: string, status?: OrderStatus) {
	const all = await db.select().from(orders); // loads entire table
	return all
		.filter((o) => o.workspaceId === workspaceId && (!status || o.status === status))
		.slice(0, 50);
}
```

#### Drizzle Schema Indexing

```typescript
// Good: compound index on frequent filter + sort
import { index, sqliteTable } from 'drizzle-orm/sqlite-core';

export const orders = sqliteTable('orders', {/* ... */}, (t) => ({
	workspaceCreatedIdx: index('idx_orders_workspace_created').on(t.workspaceId, t.createdAt),
	statusIdx: index('idx_orders_status').on(t.status),
}));
```

- **CRITICAL**: Never filter in application code what can be filtered in the database
- **REQUIRED**: Every `where()` predicate column must be indexed (compound for multi-column)
- **REQUIRED**: Default `limit(50)` on any list endpoint
- **RECOMMENDED**: Batch loads with `inArray()` to avoid N+1 when joining related entities

### CSS Performance Assessment

#### Tailwind CSS v4 Optimization

```css
/* Good: design tokens via @theme (compiled once, reused everywhere) */
@theme {
	--color-primary: oklch(62% 0.2 250);
	--spacing-gutter: clamp(1rem, 5vw, 2rem);
}

/* Good: critical, above-the-fold utility composition */
.hero {
	@apply flex min-h-screen items-center justify-center;
}

/* Bad: arbitrary values everywhere (breaks token discipline, bloats CSS) */
.component {
	height: calc(100vh - 73px); /* use spacing scale instead */
	color: #ff6b6b; /* use a design token */
}
```

## Performance Monitoring

### web-vitals Integration (Frontend)

```typescript
import { onCLS, onFCP, onINP, onLCP, onTTFB } from 'web-vitals';

onLCP((metric) => logger.info('LCP', metric));
onINP((metric) => logger.info('INP', metric));
onCLS((metric) => logger.info('CLS', metric), { reportAllChanges: true });
onFCP((metric) => logger.info('FCP', metric));
onTTFB((metric) => logger.info('TTFB', metric));
```

- `reportAllChanges: true` is appropriate **only** for CLS and INP; using it on LCP/FCP inflates ratings under the crawltest interaction model. Where it is set, CLS and INP are worst-intermediate values rather than the Core Web Vitals definitions — label them as such wherever they surface.
- **Aggregate at p75 in the store, not in the client.** Whatever consumes these samples — a dashboard card, an audit report, a trend table — must report the 75th percentile, because that is where the thresholds above are defined. Computing it in SQL with a window function keeps an unbounded row set out of memory and works on both SQLite and PostgreSQL. A mean passes a page that is fast on most loads and slow on the worst quarter, which is precisely the case the thresholds exist to catch.
- Verify the emission guard before trusting a sample count: instrumentation that only logs under a dev flag yields **zero** samples from a production build, and a zero-sample crawl reports nothing rather than failing.

### Backend Metrics Collection (Elysia + pino)

```typescript
import { logger } from '@/utils/logger';
import { metricsService } from '@/services/metrics';

interface SlowCallMetric {
	route: string;
	durationMs: number;
	metadata?: Record<string, unknown>;
}

async function recordSlowCall({ route, durationMs, metadata }: SlowCallMetric) {
	if (durationMs > 100) {
		logger.warn({ route, durationMs, ...metadata }, 'slow-route');
		await metricsService.recordRoutePerf({ route, durationMs, metadata });
	}
}
```

### Key Performance Indicators

- Route execution p50/p95/p99 distribution (from `system_metrics` table)
- Drizzle query performance (via pino query timing hook)
- Bundle size trends (`stats.html` snapshots per release)
- Core Web Vitals per route (from crawltest `web-vitals` capture)
- Lighthouse Performance Score (Lighthouse 12 algorithm)
- Vite build time per workspace
- WebSocket broadcast latency

### Lighthouse Performance Scoring (Lighthouse 12 algorithm)

**Current metric weights:**

- **Total Blocking Time (TBT)**: 30%
- **Largest Contentful Paint (LCP)**: 25% (Core Web Vital)
- **Cumulative Layout Shift (CLS)**: 25% (Core Web Vital)
- **First Contentful Paint (FCP)**: 10%
- **Speed Index (SI)**: 10%

**Score ranges:**

- **90-100 (Green)**: Good performance
- **50-89 (Orange)**: Needs improvement
- **0-49 (Red)**: Poor performance

**Note**: INP is a Core Web Vital but not part of the Lighthouse Performance score calculation. Measure INP independently via field data (`web-vitals`) or Chrome UX Report.

For detailed Lighthouse report processing workflows, see [LIGHTHOUSE.md](./LIGHTHOUSE.md).

## Performance Optimization Decision Trees

### When to Optimize: Decision Framework

```
Performance issue detected?
├── YES: Core Web Vitals failing (LCP >2.5s, INP >200ms, CLS >0.1)
│   ├── CRITICAL: immediate optimization required
│   └── Impact: user experience severely degraded
├── YES: Lighthouse score <90
│   ├── HIGH: optimization recommended within 2 weeks
│   └── Impact: SEO and user experience affected
├── YES: Bundle size >170KB gzipped (critical path)
│   ├── HIGH: code splitting and tree-shaking needed
│   └── Impact: slow initial load
├── YES: Backend route p95 >300ms
│   ├── MEDIUM: Drizzle query / index review needed
│   └── Impact: poor responsiveness
└── NO: metrics within targets
    └── LOW: monitor and maintain
```

### Optimization Priority Matrix

| Metric          | Critical (Red) | Needs Improvement (Orange) | Good (Green) | Action Required            |
| --------------- | -------------- | -------------------------- | ------------ | -------------------------- |
| **LCP**         | >4.0s          | 2.5s - 4.0s                | ≤2.5s        | Immediate / High / Monitor |
| **INP**         | >500ms         | 200ms - 500ms              | ≤200ms       | Immediate / High / Monitor |
| **CLS**         | >0.25          | 0.1 - 0.25                 | ≤0.1         | Immediate / High / Monitor |
| **Bundle Size** | >300KB         | 170KB - 300KB              | ≤170KB       | Immediate / High / Monitor |
| **Route p95**   | >500ms         | 300ms - 500ms              | ≤300ms       | High / Medium / Monitor    |

### When NOT to Optimize

Do not optimize if:

1. **Metrics are already good** (Green in matrix above)
2. **Premature optimization scenarios**: self-hosted small-team apps (the Spernakit target) rarely benefit from aggressive tuning below the green thresholds
3. **Micro-optimizations with minimal impact**: shaving 10-20ms when already under 100ms
4. **Technical debt would increase**: optimizations that significantly complicate code or require architectural changes the team cannot maintain

### Optimization Strategy Decision Tree

```
Performance problem identified
├── Frontend issue?
│   ├── Large bundle (>170KB gzipped critical path)
│   │   ├── Route-based React.lazy splitting (first)
│   │   ├── Tree shaking: remove `import *` patterns
│   │   └── Dynamic import() for heavy components (editors, charts)
│   ├── Slow LCP (>2.5s)
│   │   ├── Image optimization (WebP/AVIF, explicit dimensions)
│   │   ├── Critical CSS inline (above-the-fold)
│   │   └── Preload hero image / fonts
│   └── Layout shifts (CLS >0.1)
│       ├── Reserve space: width/height on images, skeleton loaders
│       ├── Font loading: font-display: swap
│       └── Avoid inserting content above the fold
├── Backend issue?
│   ├── Slow Drizzle query (>100ms)
│   │   ├── Add index on filter + sort columns (compound)
│   │   ├── Add .limit() and pagination
│   │   └── Batch with inArray() for N+1
│   ├── Hot-path serialization cost
│   │   ├── Avoid JSON.stringify on large objects in logs (pino handles serializers)
│   │   └── Use Elysia TypeBox response shapes for fast encoding
│   └── Handler complexity
│       ├── Extract >30-line handlers as named functions (co-located)
│       ├── Offload heavy work to schedulerService / async jobs
│       └── Cache expensive computations (lru-cache for bounded keys)
└── Infrastructure issue?
    ├── Verify gzip + brotli via `bun run verify-compression`
    ├── nginx cache headers for static assets
    └── Vite build: inspect chunk splits via rollup-plugin-visualizer
```

## Optimization Strategies

### Frontend Optimizations

1. **Route-based code splitting** with `React.lazy()` + named-export adapter
2. **TanStack Query**: set appropriate `staleTime` / `gcTime` to avoid refetch thrash; prefer WebSocket-driven `invalidateQueries` (`wsStore`) over `refetchInterval` polling for live data
3. **Zustand**: use selector functions (`useStore((s) => s.value)`), not whole-store access
4. **`useTransition` / `useDeferredValue`** for expensive UI derived from frequently changing inputs
5. **Image optimization** via `bun run optimize-images`: WebP + responsive sources
6. **`@tanstack/react-virtual`** for lists >100 items (Spernakit virtualizes the data tables)

### Backend Optimizations

1. **Drizzle indexing**: every `where()` column indexed, compound where combined
2. **Pagination**: default `limit(50)` on list endpoints, cursor-based for infinite scroll
3. **Batch operations**: `inArray()` to dedupe related lookups
4. **`lru-cache`** for bounded hot-key memoization (already a backend dependency)
5. **Async processing**: heavy work routed through `schedulerService`
6. **pino serializers**: avoid recomputing log payloads in hot paths

### CSS Optimizations

1. **Tailwind v4 design tokens** via `@theme` instead of arbitrary values
2. **Critical CSS**: Vite extracts per-route; verify via `verify-minification`
3. **Font subsetting**: `@fontsource-variable/*` packages with `font-display: swap`
4. **Brotli + gzip** dual-encoding via nginx
5. **Container queries**: prefer over media queries for component-scoped responsiveness

## Audit Checklist

### Performance Thresholds & Optimization Triggers

**IMMEDIATE ACTION REQUIRED (Critical)**

- LCP >4.0s or INP >500ms or CLS >0.25
- Bundle size >300KB gzipped (critical path)
- Backend route p95 >500ms
- Lighthouse Performance Score <50
- Drizzle queries filtering in application code
- Any unindexed `where()` predicate on a large table

**HIGH PRIORITY (Within 2 weeks)**

- LCP 2.5s-4.0s or INP 200ms-500ms or CLS 0.1-0.25
- Bundle size 170KB-300KB gzipped (critical path)
- Backend route p95 300ms-500ms
- Lighthouse Performance Score 50-89
- Manual `React.memo` / `useMemo` / `useCallback` without a profiling-backed comment
- `ResponsiveContainer` or `<Cell>` in recharts v3 code

**MEDIUM PRIORITY (Within 1 month)**

- Bundle size approaching 170KB gzipped
- Backend route p95 200ms-300ms
- Lighthouse Performance Score 90-94
- Suboptimal / missing compound indexes

**GOOD PERFORMANCE (Monitor only)**

- LCP ≤2.5s, INP ≤200ms, CLS ≤0.1
- Bundle size ≤170KB gzipped critical path
- Backend route p95 ≤200ms
- Lighthouse Performance Score ≥95

### Instrument Validation (Phase 0 — complete before anything below)

- [ ] Every instrument named in this framework confirmed present in **this** target
- [ ] Every instrument confirmed invoked by a smoke mode or CI job, not merely present as a script
- [ ] Every reported number labelled with its build, its server, and its statistic
- [ ] Crawl-derived vitals traced to the build that actually served them
- [ ] A High finding raised for each instrument that failed, rather than the scope narrowed around it
- [ ] Score withheld entirely if no instrument verified

### Critical Performance Issues

- [ ] Core Web Vitals within thresholds at **p75** (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1)
- [ ] Backend routes execute p95 ≤300ms
- [ ] Drizzle queries use indexed predicates (no in-memory `.filter()`)
- [ ] Bundle sizes within budget (JS ≤170KB gzipped critical path, as defined operationally)
- [ ] Framework runtime in a preloaded chunk
- [ ] Entry chunk statically imports nothing outside the preload set
- [ ] Every declared chunk group present in the emitted output
- [ ] `check:critical-path` (or equivalent) exists **and** is wired into a gate
- [ ] Static origin identified; compression and cache headers measured by request against it
- [ ] Critical rendering path optimized (above-the-fold, no render blockers)
- [ ] Lighthouse Performance Score ≥95, or an ADR recording why lab measurement is absent

### High Priority Optimizations

- [ ] Route-based code splitting implemented via `React.lazy()`
- [ ] Image optimization pipeline (`bun run optimize-images`)
- [ ] No `ResponsiveContainer` or `<Cell>` in recharts v3 code
- [ ] No manual `React.memo` / `useMemo` / `useCallback` without profiling justification
- [ ] TanStack Query `staleTime` tuned per endpoint
- [ ] No aggressive `refetchInterval` polling (<5s) where WebSocket invalidation applies
- [ ] Performance monitoring (web-vitals + backend metrics)
- [ ] Bundle budget enforced in CI (`build:analyze` regression threshold; per-chunk gzip/brotli sizes from `stats.html` compared against budget across branches)

### Medium Priority Improvements

- [ ] Vite build time optimization (measure cold vs warm)
- [ ] Compound indexes for multi-column filter + sort
- [ ] Zustand selectors (not whole-store access)
- [ ] `useTransition` / `useDeferredValue` for expensive derived UI
- [ ] nginx caching headers validated
- [ ] Virtual scrolling for lists >100 items

### Low Priority Enhancements

- [ ] Advanced compression (e.g., Zstandard) experimentation
- [ ] CPU / heap profiling dashboards (`profile:cpu` / `profile:heap`)
- [ ] Long-term performance trend analysis
- [ ] A/B testing for performance hypotheses

## Common Performance Anti-Patterns

### React Anti-Patterns (React 19 + React Compiler)

```tsx
// Bad: manual memoization competes with React Compiler, often achieves nothing
export const Component = React.memo(({ items }: Props) => {
	const processed = useMemo(() => items.map(normalize), [items]);
	const handleClick = useCallback(() => doThing(), []);
	return <List items={processed} onClick={handleClick} />;
});

// Good: trust the compiler; measure before adding memoization
export function Component({ items }: Props) {
	const processed = items.map(normalize);
	return <List items={processed} onClick={() => doThing()} />;
}
```

### Drizzle / Database Anti-Patterns

```typescript
// Bad: N+1 queries
async function getOrdersWithCustomers() {
	const orders = await db.select().from(ordersTable).limit(20);
	for (const order of orders) {
		order.customer = await db
			.select()
			.from(customersTable)
			.where(eq(customersTable.id, order.customerId))
			.limit(1);
	}
	return orders;
}

// Good: batched lookup with inArray()
import { inArray } from 'drizzle-orm';

async function getOrdersWithCustomers() {
	const orders = await db.select().from(ordersTable).limit(20);
	const customerIds = [...new Set(orders.map((o) => o.customerId))];
	const customers = await db
		.select()
		.from(customersTable)
		.where(inArray(customersTable.id, customerIds));
	const byId = new Map(customers.map((c) => [c.id, c]));
	return orders.map((o) => ({ ...o, customer: byId.get(o.customerId) }));
}
```

### Zustand Subscription Anti-Pattern

```tsx
// Bad: whole-store selector re-renders every component on any state change
const store = useAuthStore();

// Good: granular selector — re-renders only when `user` changes
const user = useAuthStore((s) => s.user);
```

## Integration with Specialized Audits

This unified framework coordinates with specialized audits:

- **[BUILD_OUTPUT.md](./BUILD_OUTPUT.md)**: What ships and how it is served — chunk graph, artifact contents, compression, cache headers, asset weight. This audit owns runtime speed; that one owns the bytes. Phase 4 above delegates there.
- **[LIGHTHOUSE.md](./LIGHTHOUSE.md)**: Lighthouse JSON report processing and stakeholder communication (this audit is the code-level counterpart)
- **[REACT_BEST_PRACTICES.md](./REACT_BEST_PRACTICES.md)**: Broader React pattern hygiene (composition, state shape)
- **[FRONTEND.md](./FRONTEND.md)**: Frontend architecture beyond performance
- **[DATABASE.md](./DATABASE.md)**: Drizzle schema and query optimization in depth
- **[COMPLICATION.md](./COMPLICATION.md)**: Identifies premature optimization and over-engineering
- **[SPERNAKIT.md](./SPERNAKIT.md)**: Full Spernakit stack conformance

## Performance Budget Guidelines

### Structural Budgets (assert before reading any size)

- **Runtime placement**: framework runtime in a preloaded chunk
- **No waterfall**: entry chunk statically imports nothing outside the preload set
- **Declared groups emitted**: every configured chunk group present in the output
- **Gate wired**: a check asserting all three runs in a smoke mode or CI job

These are pass/fail, not thresholds, and they are the budgets a byte count cannot express. See [Structural Invariants](#structural-invariants-a-size-budget-cannot-see-these).

### Bundle Size Budgets

- **Critical-path JavaScript**: ≤ 170KB (gzipped), where "critical path" is [defined operationally above](#critical-path-operational-definition) — entry + modulepreloads + blocking CSS, not the main chunk alone
- **Total JavaScript**: ≤ 300KB (gzipped)
- **CSS**: ≤ 50KB (gzipped)
- **Images per page**: ≤ 1MB (WebP/AVIF preferred)
- **Total page weight**: ≤ 2MB
- **Third-party scripts**: avoid; Spernakit is self-hosted and should ship zero unless explicitly justified

### Runtime Performance Budgets

- **Time to Interactive (TTI)**: ≤ 3s (Lighthouse target)
- **Long tasks**: no task >50ms on the main thread
- **Memory baseline**: ≤ 100MB (mobile-first)
- **Frame rate**: ≥ 60fps for animations (`transform`/`opacity` only)

### Network Performance Budgets

- **API response time (p95)**: ≤ 300ms (backend routes)
- **Drizzle query time (p95)**: ≤ 50ms (warm SQLite)
- **Compression ratio**: ≥ 70% (gzip/brotli on text assets)
- **DNS lookup**: ≤ 20ms

## Report Template

```markdown
# Performance Audit Report - YYYY-MM-DD

## Instrument Validation (Phase 0)

| name | kind | target | evidence | measured | verified |
| ---- | ---- | ------ | -------- | -------- | -------- |

- Instruments verified: [count] of [count]
- Findings raised for failed instruments: [ids, or none required]
- Static origin: [nginx | application binary | CDN] — cited at [file:line]
- Score permitted: [yes / no - SKIPPED / data-unavailable]

## Executive Summary

**Status**: [MEASURED | PARTIAL | SKIPPED / data-unavailable]
**Overall Performance Score**: [Score]/100

If status is `SKIPPED / data-unavailable`, stop here after listing attempted artifact acquisition steps.
Do not include scores, issue counts, or recommendations.

**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Measurement Coverage**: [Artifacts parsed; do not claim coverage when no artifacts were available]

### Key Findings

- [Summary of major findings]

## Detailed Findings

### Critical Issues

| Issue | Description   | Impact   | Remediation | Timeline |
| ----- | ------------- | -------- | ----------- | -------- |
| [ID]  | [Description] | [Impact] | [Fix]       | [Days]   |

### High Priority Issues

| Issue | Description   | Impact   | Remediation | Timeline |
| ----- | ------------- | -------- | ----------- | -------- |
| [ID]  | [Description] | [Impact] | [Fix]       | [Days]   |

### Medium Priority Issues

| Issue | Description   | Impact   | Remediation | Timeline |
| ----- | ------------- | -------- | ----------- | -------- |
| [ID]  | [Description] | [Impact] | [Fix]       | [Days]   |

## Recommendations

### Immediate Actions (0-7 days)

1. [Critical fixes]

### Short-term Actions (1-4 weeks)

1. [Important improvements]

### Long-term Actions (1-3 months)

1. [Strategic enhancements]

## Metrics and KPIs

- **Core Web Vitals**: LCP: [X]s, INP: [X]ms, CLS: [X] (targets ≤2.5s, ≤200ms, ≤0.1)
- **Lighthouse Score**: [X]/100 (target ≥90)
- **Bundle Size (gzipped)**: [X]KB (target ≤170KB critical path, ≤300KB total)
- **Backend route p95**: [X]ms (target ≤300ms)

If no measurement artifact was parsed, omit this metrics section and list only attempted artifact acquisition steps.

## Next Audit Date

Recommended: [Date] (Quarterly cadence)
```

## Deliverables

- Performance audit report in `.aidd/audit-reports/PERFORMANCE-YYYY-MM-DD.md` following the Report Template above, including the Phase 0 instrument-validation table.
- One High `feature.json` per instrument that failed Phase 0 (absent, unwired, or measuring something other than what it claims).
- One `feature.json` file per distinct finding in `.aidd/features/`, severity mapped per [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md).
- Updated bundle stats snapshot (`frontend/dist/stats.html`) attached or referenced.
- Updated crawltest web-vitals report (`logs/crawltest.json`) referenced for comparison.

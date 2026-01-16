---
title: 'Performance Optimization Audit Framework'
last_updated: '2025-01-13'
version: '1.0'
category: 'Core Technology'
priority: 'High'
estimated_time: '1-2 hours'
prerequisites: 'Performance concepts, Core Web Vitals, Lighthouse knowledge'
---

# Unified Performance Audit Framework

## Executive Summary

**🎯 Critical Performance Targets**

- **Core Web Vitals**: LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 (updated March 2024: INP replaced FID)
- **Backend functions**: <100ms execution time, <500 records per query
- **Bundle optimization**: JavaScript <170KB (critical path), CSS <50KB (gzipped)
- **Database performance**: Proper indexing, optimized queries

**📋 Essential Optimization Areas**

- **Frontend**: React 19+ component optimization, code splitting, lazy loading
- **Backend**: Query optimization, efficient database operations
- **CSS**: Tailwind CSS v4 bundle optimization, critical CSS extraction
- **Infrastructure**: Build optimization, CDN utilization, caching strategies

**⚡ Performance Monitoring Requirements**

- **Real-time metrics**: Core Web Vitals tracking (LCP, INP, CLS) and alerting
- **Database monitoring**: Query execution times and index usage
- **Bundle analysis**: Regular bundle size monitoring with performance budgets
- **User experience**: Performance impact on conversion and engagement

**🔧 Optimization Strategies**

- **Code splitting**: Route-based and component-based splitting
- **Caching**: Multi-layer caching (browser, CDN, database)
- **Image optimization**: WebP/AVIF formats, responsive images, lazy loading
- **Database optimization**: Strategic indexing, query batching, result limiting

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

## Overview

This unified framework consolidates performance-related auditing across all technology layers: frontend optimization, backend efficiency, database queries, CSS performance, and infrastructure optimization.

## Audit Scope

### **Frontend Performance**

- React component optimization and rendering efficiency
- Bundle size analysis and code splitting opportunities
- Client-side caching and state management
- Image optimization and lazy loading
- JavaScript execution performance

### **Backend Performance**

- API function execution times (<100ms target)
- Query optimization and index usage
- Database operation efficiency
- API response times and throughput
- Server-side caching strategies

### **CSS & UI Performance**

- Tailwind CSS bundle optimization
- Critical CSS identification
- Animation performance
- Layout shift prevention
- Responsive design efficiency

### **Infrastructure Performance**

- Build time optimization
- Deployment efficiency
- CDN utilization
- Caching strategies
- Resource compression

## Performance Targets

### **Critical Thresholds (Updated 2024-2025)**

- **Largest Contentful Paint (LCP)**: ≤ 2.5s (Core Web Vital)
- **Interaction to Next Paint (INP)**: ≤ 200ms (Core Web Vital, replaced FID March 2024)
- **Cumulative Layout Shift (CLS)**: ≤ 0.1 (Core Web Vital)
- **First Contentful Paint (FCP)**: ≤ 1.8s (Lighthouse metric, 10% weight)
- **Total Blocking Time (TBT)**: ≤ 300ms (Lighthouse metric, 30% weight)
- **Speed Index (SI)**: ≤ 3.4s (Lighthouse metric, 10% weight)
- **API function execution**: ≤ 100ms
- **Database queries**: ≤ few hundred records

### **Optimization Priorities**

1. **Critical**: Core Web Vitals compliance (LCP, INP, CLS)
2. **High**: Bundle size reduction and performance budgets
3. **Medium**: Build time optimization and caching strategies
4. **Low**: Micro-optimizations and advanced monitoring

## Evaluation Framework

### **Frontend Assessment**

#### React Performance

```jsx
// ✅ Good: Let React 19+ Compiler optimize automatically
function OptimizedComponent({ items }) {
	return items.map((item) => <Item key={item.id} data={item} />);
}

// ❌ Bad: Manual memoization when compiler can handle it
const OverOptimized = memo(({ items }) => {
	return useMemo(() => items.map((item) => <Item key={item.id} data={item} />), [items]);
});
```

#### Bundle Optimization

```javascript
// ❌ Bad: Importing entire libraries
import * as _ from 'lodash';

// ✅ Good: Code splitting and lazy loading
const LazyComponent = lazy(() => import('./HeavyComponent'));

// ✅ Good: Tree shaking optimization
export { specificFunction } from './utilities';
```

### **Backend Assessment**

#### Query Optimization

```typescript
// ✅ Good: Efficient indexed queries with limits
async function getPostsOptimized(categoryId?: string) {
	if (categoryId) {
		return await db.posts.findMany({
			where: { categoryId, isPublished: true },
			take: 20,
			orderBy: { createdAt: 'desc' },
		});
	}
	return await db.posts.findMany({
		where: { isPublished: true },
		take: 20,
		orderBy: { createdAt: 'desc' },
	});
}

// ❌ Bad: Fetching all records then filtering in memory
async function getPostsInefficient(categoryId?: string) {
	const allPosts = await db.posts.findMany(); // Gets ALL posts (anti-pattern)
	return allPosts.filter(
		(post) => post.isPublished && (!categoryId || post.categoryId === categoryId)
	);
}
```

#### Database Performance

- **CRITICAL**: Never filter in application code what can be filtered in database
- **REQUIRED**: Use indexes for all filtered/sorted columns
- **REQUIRED**: Limit result sets appropriately
- **RECOMMENDED**: Batch operations for efficiency

### **CSS Performance Assessment**

#### Tailwind Optimization

```css
/* ✅ Good: Optimized CSS with custom properties */
@theme {
	--color-primary: #3b82f6;
	--spacing-gutter: clamp(1rem, 5vw, 2rem);
}

/* ✅ Good: Critical CSS optimization */
@layer base {
	.hero {
		@apply flex min-h-screen items-center justify-center;
	}
}

/* ❌ Bad: Arbitrary values everywhere */
.component {
	height: calc(100vh - 73px); /* Should use spacing scale */
	color: #ff6b6b; /* Should use design tokens */
}
```

## Performance Monitoring

### **Metrics Collection**

```typescript
import { logger } from '@/lib/logger';

interface PerformanceMetric {
	functionName: string;
	durationMs: number;
	metadata?: Record<string, unknown>;
}

async function logSlowOperation({ functionName, durationMs, metadata }: PerformanceMetric) {
	if (durationMs > 100) {
		// Log slow operations for monitoring
		logger.warn(`Slow function: ${functionName} took ${durationMs}ms`, metadata);

		// Store in performance_logs table for historical analysis
		await db.performanceLogs.create({
			functionName,
			durationMs,
			metadata: metadata ?? {},
			timestamp: new Date(),
		});
	}
}

// Usage in API functions
async function getItemsByUser(userId: string) {
	const startTime = Date.now();

	const result = await db.items.findMany({
		where: { userId },
		take: 100,
	});

	const duration = Date.now() - startTime;
	if (duration > 100) {
		logger.warn(`getItemsByUser took ${duration}ms for user ${userId}`);
	}

	return result;
}
```

### **Key Performance Indicators**

- Function execution time distribution
- Database query performance
- Bundle size trends and performance budget compliance
- Core Web Vitals scores (LCP, INP, CLS)
- Lighthouse Performance Score (v10+ algorithm)
- Build time metrics and optimization opportunities
- Error rates and performance correlation

### **Lighthouse Performance Scoring (v10+ Algorithm)**

**Current Metric Weights (2024-2025):**

- **Total Blocking Time (TBT)**: 30% (highest impact)
- **Largest Contentful Paint (LCP)**: 25% (Core Web Vital)
- **Cumulative Layout Shift (CLS)**: 25% (Core Web Vital)
- **First Contentful Paint (FCP)**: 10% (loading indicator)
- **Speed Index (SI)**: 10% (visual completeness)

**Score Ranges:**

- **90-100 (Green)**: Good performance
- **50-89 (Orange)**: Needs improvement
- **0-49 (Red)**: Poor performance

**Note**: INP is a Core Web Vital but not included in Lighthouse Performance Score calculation.

## Performance Optimization Decision Trees

### **🎯 When to Optimize - Decision Framework**

```
Performance Issue Detected?
├── YES: Core Web Vitals failing (LCP >2.5s, INP >200ms, CLS >0.1)
│   ├── CRITICAL: Immediate optimization required
│   └── Impact: User experience severely degraded
├── YES: Lighthouse Score <90
│   ├── HIGH: Optimization recommended within 2 weeks
│   └── Impact: SEO and user experience affected
├── YES: Bundle size >170KB (critical path)
│   ├── HIGH: Code splitting and optimization needed
│   └── Impact: Slow initial load times
├── YES: Function execution >100ms
│   ├── MEDIUM: Database query optimization needed
│   └── Impact: Poor responsiveness
└── NO: Metrics within targets
    └── LOW: Monitor and maintain current performance
```

### **📊 Optimization Priority Matrix**

| Metric            | Critical (Red) | Needs Improvement (Orange) | Good (Green) | Action Required            |
| ----------------- | -------------- | -------------------------- | ------------ | -------------------------- |
| **LCP**           | >4.0s          | 2.5s - 4.0s                | ≤2.5s        | Immediate / High / Monitor |
| **INP**           | >500ms         | 200ms - 500ms              | ≤200ms       | Immediate / High / Monitor |
| **CLS**           | >0.25          | 0.1 - 0.25                 | ≤0.1         | Immediate / High / Monitor |
| **Bundle Size**   | >300KB         | 170KB - 300KB              | ≤170KB       | Immediate / High / Monitor |
| **Function Time** | >200ms         | 100ms - 200ms              | ≤100ms       | High / Medium / Monitor    |

### **🚫 When NOT to Optimize**

**Don't optimize if:**

1. **Metrics are already good** (Green zone in matrix above)
    - LCP ≤2.5s, INP ≤200ms, CLS ≤0.1
    - Bundle size ≤170KB critical path
    - Functions execute in <100ms

2. **Premature optimization scenarios:**
    - Application is still in early development
    - User base is <1000 active users
    - No performance complaints from users
    - Development velocity would be significantly impacted

3. **Micro-optimizations with minimal impact:**
    - Optimizing non-critical code paths
    - Shaving off 10-20ms when already under 100ms
    - Complex optimizations for <5% performance gain

4. **Technical debt would increase:**
    - Optimization makes code significantly more complex
    - Would require major architectural changes
    - Team lacks expertise to maintain optimized code

### **⚡ Optimization Strategy Decision Tree**

```
Performance Problem Identified
├── Frontend Issue?
│   ├── Large Bundle Size (>170KB)
│   │   ├── Code Splitting → Route-based splitting first
│   │   ├── Tree Shaking → Remove unused imports
│   │   └── Lazy Loading → Non-critical components
│   ├── Slow Rendering (LCP >2.5s)
│   │   ├── Image Optimization → WebP/AVIF, lazy loading
│   │   ├── Critical CSS → Inline above-the-fold styles
│   │   └── Resource Hints → Preload critical resources
│   └── Layout Shifts (CLS >0.1)
│       ├── Reserve Space → Set dimensions for images/ads
│       ├── Font Loading → Use font-display: swap
│       └── Dynamic Content → Avoid inserting above fold
├── Backend Issue?
│   ├── Slow Queries (>100ms)
│   │   ├── Add Indexes → For filtered fields
│   │   ├── Limit Results → Use .take() or .paginate()
│   │   └── Optimize Logic → Reduce computational complexity
│   ├── Database Performance
│   │   ├── Query Optimization → Remove .filter() usage
│   │   ├── Index Strategy → Compound indexes for multi-field queries
│   │   └── Batch Operations → Reduce round trips
│   └── Function Complexity
│       ├── Split Functions → Break into smaller operations
│       ├── Background Jobs → Heavy processing to async workers
│       └── Caching → Cache expensive computations
└── Infrastructure Issue?
    ├── CDN Configuration → Optimize caching headers
    ├── Compression → Enable gzip/brotli
    └── Build Optimization → Webpack/Vite configuration
```

## Optimization Strategies

### **Frontend Optimizations**

1. **Code Splitting**: Break large bundles into smaller chunks
2. **Lazy Loading**: Load components and resources on demand
3. **Image Optimization**: Use modern formats and appropriate sizing
4. **Caching**: Implement appropriate browser and application caching
5. **Tree Shaking**: Remove unused code from bundles

### **Backend Optimizations**

1. **Query Optimization**: Use indexes and limit result sets
2. **Batch Operations**: Reduce database round trips
3. **Caching**: Cache expensive computations
4. **Connection Pooling**: Optimize database connections
5. **Async Processing**: Use background jobs for heavy tasks

### **CSS Optimizations**

1. **Critical CSS**: Inline above-the-fold styles
2. **Bundle Splitting**: Separate critical from non-critical CSS
3. **Unused CSS Removal**: Purge unused styles
4. **Compression**: Minify and compress CSS
5. **Modern Features**: Use container queries and modern CSS

## Performance Checklist

### **Performance Thresholds & Optimization Triggers**

**🚨 IMMEDIATE ACTION REQUIRED (Critical)**

- LCP >4.0s or INP >500ms or CLS >0.25
- Bundle size >300KB (critical path)
- Function execution >200ms
- Lighthouse Performance Score <50
- Database queries filtering in application code

**⚠️ HIGH PRIORITY (Within 2 weeks)**

- LCP 2.5s-4.0s or INP 200ms-500ms or CLS 0.1-0.25
- Bundle size 170KB-300KB (critical path)
- Function execution 100ms-200ms
- Lighthouse Performance Score 50-89
- Missing return type annotations on functions

**📋 MEDIUM PRIORITY (Within 1 month)**

- Bundle size approaching 170KB
- Function execution 80ms-100ms
- Lighthouse Performance Score 90-94
- Suboptimal indexing strategies

**✅ GOOD PERFORMANCE (Monitor only)**

- LCP ≤2.5s, INP ≤200ms, CLS ≤0.1
- Bundle size ≤170KB (critical path)
- Function execution ≤80ms
- Lighthouse Performance Score ≥95

### **Critical Performance Issues**

- [ ] Core Web Vitals within acceptable thresholds (LCP ≤2.5s, INP ≤200ms, CLS ≤0.1)
- [ ] Backend functions execute in <100ms
- [ ] Database queries use proper indexing (no in-memory filtering)
- [ ] Bundle sizes within performance budgets (JS ≤170KB critical path)
- [ ] Critical rendering path optimized
- [ ] Lighthouse Performance Score ≥95

### **High Priority Optimizations**

- [ ] Code splitting implemented for large components
- [ ] Image optimization and lazy loading (WebP/AVIF formats)
- [ ] Unused code elimination and tree shaking
- [ ] Caching strategies implemented (browser, CDN, application)
- [ ] Performance monitoring in place (Core Web Vitals tracking)
- [ ] Performance budgets established and enforced

### **Medium Priority Improvements**

- [ ] Build time optimization
- [ ] Advanced caching strategies
- [ ] Performance budgets established
- [ ] Automated performance testing
- [ ] Progressive enhancement implemented

### **Low Priority Enhancements**

- [ ] Micro-optimizations
- [ ] Advanced compression techniques
- [ ] Performance profiling tools
- [ ] A/B testing for performance
- [ ] Advanced monitoring dashboards

## Common Performance Anti-Patterns

### **React Anti-Patterns**

```jsx
// ❌ Bad: Unnecessary re-renders
function Component({ items }) {
	const processedItems = items.map((item) => ({ ...item, processed: true }));
	return <List items={processedItems} />;
}

// ✅ Good: Memoized processing (when React Compiler can't optimize)
function Component({ items }) {
	const processedItems = useMemo(
		() => items.map((item) => ({ ...item, processed: true })),
		[items]
	);
	return <List items={processedItems} />;
}
```

### **Database Anti-Patterns**

```typescript
// ❌ Bad: N+1 queries
async function getPostsWithAuthors() {
	const posts = await db.posts.findMany({ take: 20 });

	for (const post of posts) {
		post.author = await db.users.findById(post.authorId); // N+1 problem
	}

	return posts;
}

// ✅ Good: Batch fetching
async function getPostsWithAuthorsOptimized() {
	const posts = await db.posts.findMany({ take: 20 });
	const authorIds = [...new Set(posts.map((p) => p.authorId))];
	const authors = await db.users.findMany({
		where: { id: { in: authorIds } },
	});
	const authorsMap = new Map(authors.map((a) => [a.id, a]));

	return posts.map((post) => ({
		...post,
		author: authorsMap.get(post.authorId),
	}));
}
```

## Integration with Specialized Audits

This unified framework coordinates with specialized audits:

- **LIGHTHOUSE.md**: Provides detailed web performance metrics
- **REACT.md**: Covers React-specific performance patterns
- **DATABASE.md**: Details database query optimization
- **TAILWIND.md**: Focuses on CSS performance
- **COMPLICATION.md**: Identifies premature optimizations

## Performance Budget Guidelines

### **Bundle Size Budgets (2024-2025 Standards)**

- **Critical path JavaScript**: ≤ 170KB (compressed/gzipped)
- **Total JavaScript**: ≤ 250KB (compressed/gzipped)
- **CSS**: ≤ 50KB (compressed/gzipped)
- **Images (per page)**: ≤ 1MB (with modern formats: WebP/AVIF)
- **Total page weight**: ≤ 2MB (including all assets)
- **Third-party scripts**: ≤ 100KB (external dependencies)

### **Runtime Performance Budgets**

- **Time to Interactive (TTI)**: ≤ 3s (Lighthouse target)
- **Main thread blocking**: ≤ 50ms chunks (avoid long tasks)
- **Memory usage**: ≤ 100MB baseline (mobile-first)
- **CPU usage**: ≤ 50% average (sustained performance)
- **Frame rate**: ≥ 60fps (smooth animations)

### **Network Performance Budgets**

- **API response time**: ≤ 200ms (backend services)
- **Database query time**: ≤ 50ms (database operations)
- **CDN cache hit rate**: ≥ 90% (static assets)
- **Compression ratio**: ≥ 70% (gzip/brotli)
- **DNS lookup**: ≤ 20ms (domain resolution)

## Reporting Integration

See `AUDIT_REPORT_TEMPLATE.md` for standardized reporting format including:

- Performance metrics summary
- Optimization recommendations
- Priority-based action plans
- Performance trend analysis
- Compliance with performance budgets

## Report Template

```markdown
# Performance Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Performance Score**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Performance Coverage**: [Percentage]%

### Key Findings

- [Summary of major findings]

## Detailed Findings

### Critical Issues 🚨

| Issue | Description   | Impact   | Remediation | Timeline |
| ----- | ------------- | -------- | ----------- | -------- |
| [ID]  | [Description] | [Impact] | [Fix]       | [Days]   |

### High Priority Issues ⚠️

| Issue | Description   | Impact   | Remediation | Timeline |
| ----- | ------------- | -------- | ----------- | -------- |
| [ID]  | [Description] | [Impact] | [Fix]       | [Days]   |

### Medium Priority Issues 📋

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

- **Core Web Vitals**: LCP: [X]s, INP: [X]ms, CLS: [X] (Targets: ≤2.5s, ≤200ms, ≤0.1)
- **Lighthouse Score**: [X]/100 (Target: ≥90)
- **Bundle Size**: [X]KB (Target: ≤170KB critical path, ≤250KB total)
- **Backend Function Performance**: [X]% under 100ms (Target: 95%)

## Next Audit Date

Recommended: [Date] (Monthly for active development)
```

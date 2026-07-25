---
title: 'Convex Database and Backend Patterns Audit Framework'
last_updated: '2026-06-28'
version: '1.4'
min_convex: '1.28'
category: 'Core Technology'
priority: 'Critical'
estimated_time: '1-2 hours'
prerequisites: 'Convex knowledge, TypeScript familiarity, database concepts'
lifecycle: 'specialized'
frequency: 'Quarterly'
applies_to: 'Applications using Convex as BaaS (astrid.chat, keystrike, and any future [react+convex] apps)'
---

# Convex Database and Backend Patterns Audit Framework

> **Severity scale**: P1 = Critical (must fix before next deploy) • P2 = High (fix within the next sprint) • P3 = Medium (fix opportunistically) • P4 = Low (nice to have).
>
> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Applicability Gate (Convex Apps Only)

**Run this check FIRST. If this is not a Convex app, stop and emit a single N/A report.**

This audit targets `[react+convex]` applications (astrid.chat, keystrike, and future Convex apps). It deliberately does NOT apply to the Spernakit v3 stack (Elysia + Drizzle + SQLite + Bun). For Convex apps, `npm`, `vitest`, `convex-test`, and Zod-in-frontend are the correct, current tooling; do NOT "correct" them to Bun/crawltest/smoke:qc.

```bash
# Confirm Convex usage before auditing
rg '"convex"' package.json    # convex must be a dependency
ls convex/                     # a convex/ directory must exist
ls convex/schema.ts            # a schema must exist
```

If `convex` is absent from `package.json`, or there is no `convex/` directory, or no `convex/schema.ts`: this project is **Not Applicable**. Emit a single N/A report ("not a Convex app") and stop; do not run the rest of this checklist.

## Relationship to Other Audits

CONVEX owns Convex-**specific** anti-patterns and patterns:

- `.filter()` on database queries (use `.withIndex()`)
- mutation → internal-action workflows; never call actions from the browser
- scheduler / `api.*` vs `internal.*` misuse
- Convex Components, crons, and HTTP-action patterns
- Convex schema indexing, generated `Doc/Id/*Ctx` types, `@convex-dev/eslint-plugin`

Generic concerns are **co-owned** with other audits and frequently already tracked there: return types and type safety (CODE_QUALITY), pagination and indexing fundamentals (DATABASE), authentication and authorization (SECURITY), and module boundaries (ARCHITECTURE). Before filing a finding, cross-reference existing features in those audits; prefer linking to the owning audit over duplicating a finding here. The astrid.chat history confirms this audit can surface **0 new issues** when the others already cover the same violations; that is expected, not a gap.

## Quick Reference - Mandatory Rules

**🚨 CRITICAL - ZERO TOLERANCE VIOLATIONS**

| Rule                   | ✅ Do This                                                                                  | ❌ Never Do This                                           |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Database Filtering** | `ctx.db.query('posts').withIndex('by_status', q => q.eq('published', true))`                | `ctx.db.query('posts').collect().filter(p => p.published)` |
| **Return Validators**  | `returns: v.array(v.object({ _id: v.id('posts') }))`                                        | `// No return validator`                                   |
| **Authentication**     | `const user = await ctx.auth.getUserIdentity(); if (!user) throw new Error('Unauthorized')` | `// No auth check for sensitive ops`                       |
| **Actions**            | `mutation → internal action` pattern                                                        | `useAction(api.myAction)` directly from browser            |
| **Query Limits**       | `.take(100)` or `.paginate({ numItems: 50 })`                                               | `.collect()` without limits                                |
| **TypeScript Version** | `current stable (5.9.x in use)`                                                             | `below current stable (low-priority upgrade nudge)`        |
| **ESLint**             | `@convex-dev/eslint-plugin` with ESLint 9 flat config                                       | `No ESLint or outdated rules`                              |

## Executive Summary

**Mandatory Rules (100% Compliance Required)**

1. **NEVER use `.filter()` on database queries** - Always use `.withIndex()` for filtering
2. **Return type validators REQUIRED on all PUBLIC functions** (queries/mutations/actions); strongly recommended on internal helpers, even for simple functions
3. **Authentication required** for all sensitive operations using `ctx.auth.getUserIdentity()`
4. **Query performance target**: <100ms execution time is an observability target (verify via the Convex dashboard Functions tab); keep record sets bounded; a few hundred is the healthy default, exact N is workload-dependent
5. **Actions are restricted**: Never call actions directly from browser; use mutation → internal action pattern
6. **TypeScript requirement**: Use current stable TypeScript (5.9.x in use); below-current is a low-priority upgrade nudge, not a hard failure (historical Convex floor was 5.0.3)
7. **ESLint enforcement**: Must use `@convex-dev/eslint-plugin` with ESLint 9 flat config

**Required Patterns (Must Follow)**

- **Schema**: Use `v.object()` with explicit field definitions, no generic typing
- **Functions**: New function syntax (`{ args, returns, handler }`) with mandatory argument AND return validators
- **Queries**: Real-time subscriptions preferred over manual polling
- **Mutations**: Atomic operations with proper error handling
- **Indexes**: Purpose-built indexes, avoid redundant single-field indexes
- **TypeScript**: Use validators for types, `WithoutSystemFields`, and generated `Doc/Id/*Ctx` types
- **ESLint**: Enforce rules with `@convex-dev/eslint-plugin` including `no-old-registered-function-syntax` and `require-argument-validators`
- **Components**: Prefer first-party Convex Components over hand-rolled primitives (rate limiting, aggregation, dynamic crons, migrations)
- **Scheduled work**: Use built-in `cronJobs()` in `convex/crons.ts` for static schedules; `@convex-dev/crons` for dynamic ones; always target `internal.*`
- **Environment**: Set secrets via `npx convex env set` (per-deployment); `convex.json` is for build/runtime config only

**Performance Standards (Enforced)**

- **Database queries**: Use appropriate indexes, limit results, avoid sequential operations
- **Function design**: Keep functions light and fast, use helper functions for complex logic
- **Real-time updates**: Use Convex's reactive nature for optimal user experience

**Security Requirements (Non-Negotiable)**

- **Input validation**: All user inputs validated with Convex validators
- **Authorization**: Resource-level access control beyond authentication
- **Data sanitization**: Prevent injection attacks and data leakage

## Quick Reference - Common Patterns

### **Database Operations**

```typescript
// ✅ CORRECT: Indexed query with limits
export const getPublishedPosts = query({
	args: { categoryId: v.optional(v.id('categories')) },
	returns: v.array(v.object({ _id: v.id('posts'), title: v.string() })),
	handler: async (ctx, args) => {
		if (args.categoryId) {
			return await ctx.db
				.query('posts')
				.withIndex('by_category_published', (q) =>
					q.eq('categoryId', args.categoryId).eq('isPublished', true),
				)
				.take(20);
		}
		return await ctx.db
			.query('posts')
			.withIndex('by_published', (q) => q.eq('isPublished', true))
			.take(20);
	},
});

// ❌ WRONG: Using .filter() and no limits
export const getBadPosts = query({
	// Missing return validator!
	handler: async (ctx) => {
		const allPosts = await ctx.db.query('posts').collect(); // Gets ALL posts
		return allPosts.filter((post) => post.isPublished); // NEVER use .filter()
	},
});
```

### **Authentication Pattern**

```typescript
// ✅ CORRECT: Proper authentication check
export const createPost = mutation({
	args: { title: v.string(), content: v.string() },
	returns: v.object({ _id: v.id('posts') }),
	handler: async (ctx, args) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) throw new Error('Unauthorized');

		return await ctx.db.insert('posts', {
			title: args.title,
			content: args.content,
			authorId: user.subject,
			isPublished: false,
		});
	},
});
```

### **Action Pattern (Mutation → Internal Action)**

```typescript
// ✅ CORRECT: Mutation calls internal action
export const processPayment = mutation({
	args: { amount: v.number(), paymentMethodId: v.string() },
	returns: v.object({ success: v.boolean(), transactionId: v.optional(v.string()) }),
	handler: async (ctx, args) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) throw new Error('Unauthorized');

		// Schedule internal action
		await ctx.scheduler.runAfter(0, internal.payments.processPaymentAction, {
			userId: user.subject,
			amount: args.amount,
			paymentMethodId: args.paymentMethodId,
		});

		return { success: true };
	},
});

// Internal action (not called directly from browser)
export const processPaymentAction = internalAction({
	args: { userId: v.string(), amount: v.number(), paymentMethodId: v.string() },
	returns: v.object({ transactionId: v.string() }),
	handler: async (ctx, args) => {
		// External API calls, heavy processing, etc.
	},
});
```

> **Note**: All examples follow the canonical rules in [Mandatory Database Patterns](#mandatory-database-patterns): new function syntax (`{ args, returns, handler }`) with mandatory argument + return validators, `.withIndex()` never `.filter()`, and bounded result sets. This project intentionally enforces stricter standards than the public docs (return validators on all public functions; never `.filter()` in DB queries).
> References: <https://docs.convex.dev/understanding/best-practices/> • <https://docs.convex.dev/understanding/best-practices/typescript> • <https://docs.convex.dev/understanding/zen>

## Table of Contents

### **🚨 Mandatory Rules (Must Read)**

1. [Applicability Gate (Convex Apps Only)](#applicability-gate-convex-apps-only)
2. [Relationship to Other Audits](#relationship-to-other-audits)
3. [Quick Reference - Mandatory Rules](#quick-reference---mandatory-rules-️)
4. [Quick Reference - Common Patterns](#quick-reference---common-patterns)
5. [Mandatory Database Patterns](#mandatory-database-patterns)
6. [Required Security Patterns](#required-security-patterns)
7. [Performance Requirements](#performance-requirements)

### **Best Practices (Recommended)**

8. [The Zen of Convex](#the-zen-of-convex)
9. [Schema Design Best Practices](#schema-design-best-practices)
10. [TypeScript-Specific Recommendations](#typescript-specific-recommendations)
11. [Query and Mutation Patterns](#query-and-mutation-patterns)
12. [ESLint Configuration and Enforcement](#eslint-configuration-and-enforcement)
13. [TypeScript Requirements](#typescript-requirements)
14. [Performance Optimization](#performance-optimization)
15. [Security Considerations](#security-considerations)
16. [File Storage and Upload Patterns](#file-storage-and-upload-patterns)
17. [Error Handling Patterns](#error-handling-patterns)
18. [Testing Strategy](#testing-strategy)
19. [Data Migration and Schema Evolution](#data-migration-and-schema-evolution)
20. [Environment and Deployment](#environment-and-deployment)
21. [Scalability and Performance Considerations](#scalability-and-performance-considerations)
22. [Convex Components](#convex-components)
23. [Cron Jobs (Scheduled Recurring Work)](#cron-jobs-scheduled-recurring-work)
24. [HTTP Actions (Webhooks and REST Endpoints)](#http-actions-webhooks-and-rest-endpoints)
25. [Auth Patterns (Clerk + Convex)](#auth-patterns-clerk--convex)

### **⚠️ Anti-Patterns (Avoid These)**

26. [Common Anti-Patterns to Avoid](#common-anti-patterns-to-avoid)

### **Audit Reporting**

27. [Audit Checklist](#audit-checklist)
28. [Report Template](#report-template)

> Alignment with official Convex guidance (highlights we enforce):
>
> - Use queries for nearly every app read; keep client state simple (Convex Zen)
> - Keep queries/mutations light & fast (<100ms; few hundred records) (Convex Zen)
> - Actions: use sparingly; do not call actions directly from the browser; prefer mutation → internal action workflows that record progress (Best Practices + Zen)
> - Only schedule and `ctx.run*` internal functions; never reference `api.*` in Convex server code (Best Practices)
> - Use helper TS functions; keep public functions thin; avoid sequential `ctx.runQuery/ctx.runMutation` from actions when a single internal function suffices (Best Practices)
> - Avoid redundant indexes; be mindful that single-field indexes sort by that field then `_creationTime` (Best Practices)
> - TypeScript: TS ≥ 5.0.3; use validators for types, `WithoutSystemFields`, and generated `Doc/Id/*Ctx` (TypeScript page)
> - ESLint: Use @convex-dev/eslint-plugin with ESLint 9 flat config; enforce no-old-registered-function-syntax and require-argument-validators rules
> - File Storage: Use `_storage` system table for metadata; deprecated `ctx.storage.getMetadata` should not be used
> - Components: Prefer first-party Convex Components (`@convex-dev/rate-limiter`, `@convex-dev/aggregate`, `@convex-dev/crons`, `@convex-dev/migrations`, etc.) over hand-rolled equivalents for non-trivial use cases
> - Environment: Set secrets per deployment via `npx convex env set`; NEVER in `convex.json` (no such field)
> - Auth (Clerk): Resolve `identity.subject` → Convex `users._id` via a `by_clerk_id` index; sync via Clerk webhook into an `internal` mutation

## Pre-flight Checklist

### Pre-Migration Validation

Run these commands before `npx convex dev` to catch common issues. Use `rg` (ripgrep) for cross-platform compatibility; `grep -r` behaves differently on Windows/macOS/Linux shells.

```bash
# Check for direct action calls from mutations (should schedule an internal action instead)
rg "ctx\.runAction" convex/ -t ts

# Check for .filter() on database queries (forbidden - use .withIndex())
rg "\.filter\(" convex/ -t ts

# Check for .collect() without an upstream .take() or .paginate() (unbounded reads)
rg "\.collect\(\)" convex/ -t ts

# Check scheduler usage in mutations (good pattern - mutation -> internal action)
rg "ctx\.scheduler\.runAfter" convex/ -t ts

# Check for exports missing a returns validator
# HIGH FALSE-POSITIVE — manual triage required; do NOT file findings straight from grep counts
# (the regex misses multi-line bodies and flags functions whose `returns:` sits outside the match window)
rg -U "export const \w+ = (?:mutation|query|action|internalMutation|internalQuery|internalAction)\(\{(?:[^}]|\n)*?\}\)" convex/ -t ts --multiline | rg -v "returns:"
```

### Common Migration Errors & Solutions

| Error Type                       | Symptom                                       | Solution                                                             |
| -------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- |
| **Internal API Reference Error** | `internal.auth.storeUser is not a function`   | Add filename to path: `internal.auth.auth.storeUser`                 |
| **Action Context Error**         | `ctx.runAction is not a function` in mutation | Use `ctx.scheduler.runAfter(0, ...)` instead                         |
| **Type Annotation Error**        | `implicit any type`                           | Add explicit `returns:` validator                                    |
| **Null/Undefined Error**         | `possibly undefined`                          | Use non-null assertion `!` after check                               |
| **Query Filtering Error**        | `filter is not a function` on query           | Use `.withIndex()` or collect then filter                            |
| **Export Type Error**            | Function not in internal API                  | Use `internalMutation`/`internalQuery` instead of `mutation`/`query` |

### Quick Validation Commands

```bash
# Verify internal API structure (files that export internal functions)
rg -l "export const \w+ = internal(Mutation|Query|Action)" convex/ -t ts

# Verify scheduler call targets - should only schedule internal.* (never api.*)
rg "scheduler\.(runAfter|runAt)" convex/ -t ts -A 1 | rg "api\."
# (any matches above are bugs - Convex server code must reference internal.* for scheduling)

# Find functions missing return validators
# HIGH FALSE-POSITIVE — manual triage required; do NOT file findings straight from grep counts
rg -U "^export const \w+ = (mutation|query|action|internalMutation|internalQuery|internalAction)\(" convex/ -t ts -A 6 | rg -B 1 "handler:" | rg -v "returns:"
```

## Mandatory Database Patterns

### **🚨 CRITICAL: Database Query Rules**

**Rule 1: NEVER use `.filter()` on database queries**

```typescript
// ❌ WRONG: Using .filter() - NEVER DO THIS
export const getBadPosts = query({
	handler: async (ctx) => {
		const posts = await ctx.db.query('posts').collect();
		return posts.filter((post) => post.isPublished); // VIOLATION!
	},
});

// ✅ CORRECT: Use .withIndex() for filtering
export const getGoodPosts = query({
	returns: v.array(v.object({ _id: v.id('posts') })),
	handler: async (ctx) => {
		return await ctx.db
			.query('posts')
			.withIndex('by_published', (q) => q.eq('isPublished', true))
			.take(50);
	},
});
```

**Rule 2: Return validators REQUIRED on all PUBLIC functions** (strongly recommended on internal helpers)

```typescript
// ❌ WRONG: No return validator
export const badFunction = query({
	args: { id: v.id('posts') },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

// ✅ CORRECT: Always include return validator
export const goodFunction = query({
	args: { id: v.id('posts') },
	returns: v.union(v.object({ _id: v.id('posts') }), v.null()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});
```

**Rule 3: Always limit query results**

```typescript
// ❌ WRONG: No limits - can return thousands of records
export const getAllPosts = query({
	returns: v.array(v.object({ _id: v.id('posts') })),
	handler: async (ctx) => {
		return await ctx.db.query('posts').collect(); // DANGEROUS!
	},
});

// ✅ CORRECT: Use .take() or .paginate()
import { paginationOptsValidator } from 'convex/server';

export const getRecentPosts = query({
	args: { paginationOpts: paginationOptsValidator },
	returns: v.object({
		page: v.array(v.object({ _id: v.id('posts') })),
		isDone: v.boolean(),
		continueCursor: v.string(),
	}),
	handler: async (ctx, args) => {
		return await ctx.db
			.query('posts')
			.withIndex('by_creation_time')
			.order('desc')
			.paginate(args.paginationOpts);
	},
});
```

**React side**: consume a paginated query with `usePaginatedQuery` from `convex/react`; it manages the cursor and exposes `results`, `status`, and `loadMore`:

```tsx
import { usePaginatedQuery } from 'convex/react';

import { api } from '../convex/_generated/api';

function PostFeed() {
	const { results, status, loadMore } = usePaginatedQuery(
		api.posts.getRecentPosts,
		{},
		{ initialNumItems: 20 },
	);
	return (
		<>
			{results.map((p) => (
				<Post key={p._id} post={p} />
			))}
			{status === 'CanLoadMore' && <button onClick={() => loadMore(20)}>Load more</button>}
		</>
	);
}
```

## Required Security Patterns

### **Authentication Requirements**

**Every sensitive operation MUST check authentication:**

```typescript
// ✅ CORRECT: Always check authentication for sensitive operations
export const createPost = mutation({
	args: { title: v.string(), content: v.string() },
	returns: v.object({ _id: v.id('posts') }),
	handler: async (ctx, args) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) {
			throw new Error('Unauthorized: Must be logged in to create posts');
		}

		return await ctx.db.insert('posts', {
			title: args.title,
			content: args.content,
			authorId: user.subject,
			createdAt: Date.now(),
		});
	},
});

// ✅ CORRECT: Authorization beyond authentication
export const deletePost = mutation({
	args: { postId: v.id('posts') },
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) throw new Error('Unauthorized');

		const post = await ctx.db.get(args.postId);
		if (!post) throw new Error('Post not found');

		// Check if user owns the post or is admin
		if (post.authorId !== user.subject && !user.roles?.includes('admin')) {
			throw new Error("Forbidden: Cannot delete others' posts");
		}

		await ctx.db.delete(args.postId);
		return { success: true };
	},
});
```

## Performance Requirements

### **Execution Time Targets**

- **Functions**: <100ms execution time is an **observability target**, verified via the Convex dashboard Functions tab, NOT a static code-review pass/fail. The code-review proxies below are what an auditor checks statically.
- **Queries**: a few hundred records is the healthy default; bounded `.take(N)` / `.paginate()` is mandatory, but the exact `N` is workload-dependent.
- **Indexes**: Required for all filtering operations

### **Optimization Checklist (static code-review proxies)**

- [ ] All queries use appropriate indexes
- [ ] Result sets are bounded with `.take()` or `.paginate()` (record count is workload-dependent)
- [ ] No use of `.filter()` on database queries
- [ ] Heavy operations moved to internal actions
- [ ] Slow-function target (<100ms) tracked via the Convex dashboard Functions tab, not statically asserted

## The Zen of Convex

Convex is designed around a set of core principles that guide its architecture and usage patterns. Understanding these philosophical approaches will help you build applications that use Convex's strengths effectively.

### Core Principles

1. **Real-time by Default**
    - Design your application with real-time updates as the primary interaction model
    - Embrace subscriptions as the standard way to fetch data that changes over time
    - Avoid manual polling when real-time subscriptions can provide better user experience

2. **Simplicity Over Complexity**
    - Prefer straightforward solutions that use Convex's built-in capabilities
    - Avoid over-engineering solutions when Convex provides simple primitives
    - Focus on business logic rather than infrastructure concerns

3. **Reactive Data Flow**
    - Structure your application to react to data changes rather than imperative updates
    - Use subscriptions to automatically update UI when underlying data changes
    - Design components to be reactive to data changes rather than managing state manually

4. **Consistency and Reliability**
    - Use Convex's transaction guarantees for critical operations
    - Design for eventual consistency where appropriate, but use transactions when strong consistency is needed
    - Build resilient systems that handle failures gracefully

### Philosophical Approaches

- **Server-first**: business logic lives in Convex functions (the single source of truth); keep client-side logic minimal.
- **Design for evolution**: schemas should grow via backward-compatible changes + versioned migrations.

## Schema Design Best Practices

### Table Structure & Indexing

Proper schema design is fundamental to building efficient Convex applications. Follow these guidelines to create performant and maintainable data models.

#### Indexing Strategy

```typescript
// ✅ Good: Comprehensive indexing strategy
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

export default defineSchema({
	users: defineTable({
		clerkId: v.string(),
		email: v.string(),
		name: v.string(),
		createdAt: v.number(),
		lastSeen: v.number(),
	})
		.index('by_clerk_id', ['clerkId'])
		.index('by_email', ['email'])
		.index('by_last_seen', ['lastSeen']),

	posts: defineTable({
		title: v.string(),
		content: v.string(),
		authorId: v.id('users'),
		categoryId: v.id('categories'),
		tags: v.array(v.string()),
		publishedAt: v.optional(v.number()),
		isPublished: v.boolean(),
	})
		.index('by_author', ['authorId'])
		.index('by_category', ['categoryId'])
		.index('by_published', ['isPublished'])
		.index('by_published_date', ['isPublished', 'publishedAt'])
		.index('by_tags', ['tags']),
});
```

#### Indexing Best Practices

1. **Index for Common Queries**
    - Create indexes for fields frequently used in query filters
    - Include indexes for foreign key relationships
    - Consider compound indexes for queries that filter on multiple fields

2. **Order Index Fields Strategically**
    - Place fields with higher cardinality (more unique values) first in compound indexes
    - Order fields based on query patterns - most frequently filtered fields first

3. **Avoid Over-Indexing**
    - Each index adds overhead to write operations
    - Only create indexes that will be used by actual queries
    - Monitor query performance to identify missing indexes

#### Schema Evolution

```typescript
// ✅ Good: Backward-compatible schema changes
export const migratePostSchema = internalMutation({
	args: { batchSize: v.optional(v.number()) },
	returns: v.object({ processed: v.number(), completed: v.boolean() }),
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 50;

		const posts = await ctx.db
			.query('posts')
			.withIndex('by_schema_version', (q) => q.eq('schemaVersion', 1)) // avoid .filter(); target legacy version via index
			.take(batchSize);

		for (const post of posts) {
			await ctx.db.patch(post._id, {
				schemaVersion: 2,
				// Add new fields with sensible defaults
				viewCount: 0,
				lastModified: post.createdAt,
				status: post.isPublished ? 'published' : 'draft',
				// Keep existing fields intact
			});
		}

		return {
			processed: posts.length,
			completed: posts.length < batchSize,
		};
	},
});
```

### Data Validation & Types

Robust validation ensures data integrity and prevents errors throughout your application.

#### Comprehensive Validation

```typescript
// ✅ Good: Comprehensive validation
import { v } from 'convex/values';
import { ConvexError } from 'convex/values';

export const createPost = mutation({
	args: {
		title: v.string(),
		content: v.string(),
		categoryId: v.id('categories'),
		tags: v.optional(v.array(v.string())),
		scheduledAt: v.optional(v.number()),
	},
	returns: v.id('posts'),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) {
			throw new Error('Not authenticated');
		}

		// Get user from database to verify they exist
		const user = await ctx.db
			.query('users')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
			.unique();

		if (!user) {
			throw new Error('User not found');
		}

		// Validate title length
		if (args.title.length < 3 || args.title.length > 100) {
			throw new ConvexError({
				code: 'VALIDATION_ERROR',
				message: 'Title must be between 3 and 100 characters',
			});
		}

		// Validate content
		if (args.content.length < 10) {
			throw new ConvexError({
				code: 'VALIDATION_ERROR',
				message: 'Content must be at least 10 characters',
			});
		}

		// Validate category exists
		const category = await ctx.db.get(args.categoryId);
		if (!category) {
			throw new ConvexError({
				code: 'RESOURCE_NOT_FOUND',
				message: 'Category not found',
			});
		}

		// Validate tags
		if (args.tags && args.tags.length > 10) {
			throw new ConvexError({
				code: 'VALIDATION_ERROR',
				message: 'Maximum 10 tags allowed',
			});
		}

		return await ctx.db.insert('posts', {
			...args,
			authorId: user._id,
			createdAt: Date.now(),
			isPublished: false,
		});
	},
});
```

#### Validation Best Practices

1. **CRITICAL: Return Validators REQUIRED on PUBLIC Functions**
    - ❌ FORBIDDEN: public functions without `returns:` property
    - ✅ REQUIRED: `returns: v.object({ success: v.boolean() })`
    - ✅ REQUIRED: `returns: v.null()` for functions that return nothing
    - Mandatory on all PUBLIC queries/mutations/actions; strongly recommended on internal helpers

2. **Use Convex validators on every argument**: `v.*` validators in `args:` give both runtime checks and inferred types; add business-rule checks (lengths, relationships) in the handler with `ConvexError` for structured, code-tagged responses. (Generic input-validation concerns are co-owned with SECURITY.)

## TypeScript-Specific Recommendations

TypeScript integration is one of Convex's strongest features. Follow these guidelines to maximize type safety and developer productivity.

### Type-Safe Schema Definition

```typescript
// ✅ Good: Type-safe schema with explicit types
import { defineSchema, defineTable } from 'convex/server';
import { v } from 'convex/values';

// Define explicit types for your data models
type User = {
	clerkId: string;
	email: string;
	name: string;
	createdAt: number;
	lastSeen: number;
};

type Post = {
	title: string;
	content: string;
	authorId: Id<'users'>;
	categoryId: Id<'categories'>;
	tags: string[];
	publishedAt?: number;
	isPublished: boolean;
};

export default defineSchema({
	users: defineTable({
		clerkId: v.string(),
		email: v.string(),
		name: v.string(),
		createdAt: v.number(),
		lastSeen: v.number(),
	})
		.index('by_clerk_id', ['clerkId'])
		.index('by_email', ['email']),

	posts: defineTable({
		title: v.string(),
		content: v.string(),
		authorId: v.id('users'),
		categoryId: v.id('categories'),
		tags: v.array(v.string()),
		publishedAt: v.optional(v.number()),
		isPublished: v.boolean(),
	})
		.index('by_author', ['authorId'])
		.index('by_category', ['categoryId'])
		.index('by_published', ['isPublished'])
		.index('by_category_published', ['categoryId', 'isPublished']),
});
```

### Type-Safe Function Arguments

```typescript
// ✅ Good: Type-safe function arguments with explicit interfaces
import { v } from 'convex/values';

import { mutation, query } from './_generated/server';

// Define interfaces for function arguments
interface CreatePostArgs {
	title: string;
	content: string;
	categoryId: Id<'categories'>;
	tags?: string[];
	scheduledAt?: number;
}

interface GetPostsArgs {
	categoryId?: Id<'categories'>;
	limit?: number;
	cursor?: string;
}

export const createPost = mutation({
	args: {
		title: v.string(),
		content: v.string(),
		categoryId: v.id('categories'),
		tags: v.optional(v.array(v.string())),
		scheduledAt: v.optional(v.number()),
	},
	returns: v.id('posts'),
	handler: async (ctx, args) => {
		// Implementation with full type safety
		// ...
	},
});

// (For a full paginated `getPosts` query, see Efficient Query Patterns below.)
```

### TypeScript Best Practices

1. **Use Generated Types**
    - Use the `Doc<>`/`Id<>` types Convex generates for your database tables
    - Import types from `./_generated/api` for function references
    - Enable strict mode in your TypeScript configuration

(Generic type-utility/documentation practices are co-owned with CODE_QUALITY.)

```typescript
// ✅ Good: Custom type utilities
import { Id } from './_generated/dataModel';

// Utility type for database entities with timestamps
type WithTimestamps<T> = T & {
	_creationTime: number;
	_id: Id<T extends { _id: infer U } ? U : never>;
};

// Type for paginated results
interface PaginatedResults<T> {
	results: T[];
	nextCursor: string | null;
	hasMore: boolean;
}

// Type guard for user objects
function isUser(obj: unknown): obj is User {
	if (typeof obj !== 'object' || obj === null) return false;
	const o = obj as Record<string, unknown>;
	return (
		typeof o.clerkId === 'string' && typeof o.email === 'string' && typeof o.name === 'string'
	);
}
```

## Query and Mutation Patterns

Efficient query and mutation patterns are essential for building responsive Convex applications.

### Efficient Query Patterns

```typescript
// ✅ Good: Proper pagination and filtering
export const getPosts = query({
	args: {
		categoryId: v.optional(v.id('categories')),
		limit: v.optional(v.number()),
		cursor: v.optional(v.string()),
	},
	returns: v.object({
		posts: v.array(v.object({ _id: v.id('posts'), isPublished: v.boolean() })),
		nextCursor: v.union(v.string(), v.null()),
	}),
	handler: async (ctx, args) => {
		const limit = Math.min(args.limit ?? 10, 100); // Cap at 100

		let query = ctx.db.query('posts');

		if (args.categoryId) {
			query = query.withIndex('by_category_published', (q) =>
				q.eq('categoryId', args.categoryId).eq('isPublished', true),
			);
		} else {
			query = query.withIndex('by_published', (q) => q.eq('isPublished', true));
		}

		if (args.cursor) {
			query = query.after(args.cursor);
		}

		const posts = await query.take(limit);

		return {
			posts,
			nextCursor: posts.length === limit ? posts[posts.length - 1]._id : null,
		};
	},
});
```

#### Query Best Practices

1. **Never `.filter()` on database queries**: see the canonical rule in [Mandatory Database Patterns](#mandatory-database-patterns); create indexes for all filtering needs.

2. **Use Indexes Effectively**
    - Always use indexes for filtering and ordering
    - Avoid full table scans with `collect()` on large datasets
    - Use compound indexes for multi-field filtering

3. **Implement Pagination**
    - Never fetch all records at once
    - Use cursor-based pagination for large datasets
    - Limit the number of records returned per request

4. **Filter with Indexes**
    - Apply filters using indexes with `.withIndex()`
    - Create specific indexes for common query patterns
    - If you must filter in code, only do so on small, bounded result sets or after narrowing via indexes and pagination; never fetch unbounded sets

### Mutation Design Patterns

```typescript
// ✅ Good: Atomic operations with proper error handling
export const transferOwnership = mutation({
	args: {
		postId: v.id('posts'),
		newOwnerId: v.id('users'),
	},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		// Get current post
		const post = await ctx.db.get(args.postId);
		if (!post) {
			throw new ConvexError({
				code: 'RESOURCE_NOT_FOUND',
				message: 'Post not found',
			});
		}

		// Check ownership
		const currentUser = await ctx.db
			.query('users')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
			.unique();

		if (!currentUser || post.authorId !== currentUser._id) {
			throw new ConvexError({
				code: 'UNAUTHORIZED',
				message: 'Only the author can transfer ownership',
			});
		}

		// Verify new owner exists
		const newOwner = await ctx.db.get(args.newOwnerId);
		if (!newOwner) {
			throw new ConvexError({
				code: 'RESOURCE_NOT_FOUND',
				message: 'New owner not found',
			});
		}

		// Atomic update
		await ctx.db.patch(args.postId, {
			authorId: args.newOwnerId,
			transferredAt: Date.now(),
			previousAuthorId: post.authorId,
		});

		// Log the transfer
		await ctx.db.insert('ownership_transfers', {
			postId: args.postId,
			fromUserId: post.authorId,
			toUserId: args.newOwnerId,
			transferredAt: Date.now(),
		});

		return { success: true };
	},
});
```

#### Mutation Best Practices

- **Mutations are already transactional**: every Convex mutation runs as a single atomic transaction; a thrown error rolls back all writes. You do not need (and cannot manually open) a transaction. Validate inputs and authorization _before_ the first write so an early `throw` aborts cleanly. (Generic validate-before-acting / meaningful-return-value concerns are co-owned with CODE_QUALITY.)

### Actions & Scheduling (workflow)

```typescript
import { v } from 'convex/values';

import { internal, internalAction, mutation } from './_generated/server';

// Public mutation: enqueue work and schedule an internal action (do NOT call actions from the browser)
export const requestScrape = mutation({
	args: { url: v.string() },
	returns: v.object({ queued: v.boolean() }),
	handler: async (ctx, { url }) => {
		const jobId = await ctx.db.insert('scrapeJobs', {
			url,
			status: 'queued',
			createdAt: Date.now(),
		});
		await ctx.scheduler.runAfter(0, internal.scrape.runScrape, { jobId });
		return { queued: true };
	},
});

// Internal action: performs the heavy work and records progress via internal queries/mutations
export const runScrape = internalAction({
	args: { jobId: v.id('scrapeJobs') },
	returns: v.null(),
	handler: async (ctx, { jobId }) => {
		const job = await ctx.runQuery(internal.scrape.getJob, { jobId });
		// ... perform Node-only or long-running work here ...
		await ctx.runMutation(internal.scrape.completeJob, { jobId, result: 'ok' });
		return null;
	},
});
```

- Never call actions directly from the browser.
- Keep public API thin; schedule internal work and record progress.
- Prefer a single internal function to encapsulate multi-step logic instead of chaining many ctx.run\* calls from actions.

### Real-time Subscription Patterns

```typescript
// ✅ Good: Efficient real-time queries
export const getLiveNotifications = query({
	args: { userId: v.id('users') },
	returns: v.array(v.object({ _id: v.id('notifications'), isRead: v.boolean() })),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		// Get current user
		const currentUser = await ctx.db
			.query('users')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
			.unique();

		// Only return user's own notifications
		if (!currentUser || args.userId !== currentUser._id) {
			throw new ConvexError({
				code: 'UNAUTHORIZED',
				message: 'Unauthorized',
			});
		}

		return await ctx.db
			.query('notifications')
			.withIndex('by_user_unread', (q) => q.eq('userId', args.userId).eq('isRead', false))
			.order('desc')
			.take(50);
	},
});
```

#### Subscription Best Practices

- **Subscription queries are just `query` functions**: every reactive subscription re-runs the query on each relevant write, so the same rules apply with extra weight: index the query, bound the result (`.take()`), enforce authorization inside the handler, and avoid expensive per-invocation computation. The `useQuery`/`usePaginatedQuery` React hooks manage subscription lifecycle automatically; no manual unsubscribe needed.

## ESLint Configuration and Enforcement

### **Required ESLint Setup**

All Convex projects MUST use `@convex-dev/eslint-plugin` with ESLint 9 flat config:

```bash
# Install ESLint plugin
npm i @convex-dev/eslint-plugin --save-dev
```

```javascript
// eslint.config.js (ESLint 9 flat config) — primary form used by astrid.chat / keystrike
import convexEslint from '@convex-dev/eslint-plugin';
import tseslint from 'typescript-eslint';

export default tseslint.config(
	// Other configurations...
	{
		files: ['convex/**/*.ts'],
		plugins: { '@convex-dev': convexEslint },
		rules: {
			'@convex-dev/no-old-registered-function-syntax': 'error',
			'@convex-dev/require-argument-validators': 'error',
		},
	},
);
```

```javascript
// Alternative: spread the plugin's recommended preset directly
import convexPlugin from '@convex-dev/eslint-plugin';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	// Other configurations...
	convexPlugin.configs.recommended,
]);
```

### **Enforced Rules**

**Actually configured** in both astrid.chat and keystrike (audit against these):

1. **`no-old-registered-function-syntax`** - Requires new function syntax
2. **`require-argument-validators`** - All functions must have argument validators

**Additional available rules** (real plugin rules, NOT currently in either app's config; recommend, don't flag as missing):

- **`explicit-table-ids`** - Table IDs must be explicit
- **`import-wrong-runtime`** - Prevents importing functions from the wrong runtime

### **Next.js Integration**

For Next.js projects, add the convex directory to ESLint dirs:

```typescript
// next.config.ts
const nextConfig: NextConfig = {
	eslint: {
		dirs: ['pages', 'app', 'components', 'lib', 'src', 'convex'],
	},
};
```

## TypeScript Requirements

### **Version Requirement**

- **TypeScript**: current stable (5.9.x in use across astrid.chat / keystrike). `5.0.3` is the historical Convex floor; treat anything below current stable as a low-priority upgrade nudge, not a hard failure.
- **SDK currency**: `convex` ≥ 1.28 (astrid.chat on 1.28, keystrike on 1.29); `convex-test` 0.0.x (0.0.38-0.0.40). `convex-test` is pre-1.0; pin it and expect API churn on upgrade.
- **Configuration**: Use `tsconfig.json` in the Convex folder for typechecking settings

### **Type Safety Best Practices**

```typescript
// ✅ Good: Full type safety with generated types
import { Doc, Id } from './_generated/dataModel';
import { mutation } from './_generated/server';

export const createPost = mutation({
	args: {
		title: v.string(),
		content: v.string(),
		categoryId: v.id('categories'),
	},
	returns: v.id('posts'),
	handler: async (ctx, args): Promise<Id<'posts'>> => {
		// Full type inference from schema
		return await ctx.db.insert('posts', {
			...args,
			isPublished: false,
			createdAt: Date.now(),
		});
	},
});
```

### **Generated Type Utilities**

- **`Doc<"tableName">`** - Type for documents in a table
- **`Id<"tableName">`** - Type for document IDs
- **`WithoutSystemFields<T>`** - Type without \_id and \_creationTime
- **`TableNames`** - Union of all table names

## Performance Optimization

> **Note**: For comprehensive performance analysis across all technology layers, refer to `PERFORMANCE.md` which provides unified performance auditing guidelines.

Performance optimization is critical for building responsive Convex applications that scale well.

> Aim for queries and mutations to operate on ≤ a few hundred records and complete in <100ms to keep the sync engine snappy (per The Zen of Convex).

### Query Optimization

```typescript
// ✅ Good: Optimized compound queries
export const getPostsWithAuthor = query({
	args: { categoryId: v.optional(v.id('categories')) },
	returns: v.array(
		v.object({
			_id: v.id('posts'),
			title: v.string(),
			content: v.string(),
			authorId: v.id('users'),
			categoryId: v.id('categories'),
			tags: v.array(v.string()),
			publishedAt: v.optional(v.number()),
			isPublished: v.boolean(),
			_creationTime: v.number(),
			author: v.optional(v.object({ _id: v.id('users') })),
		}),
	),
	handler: async (ctx, args) => {
		let posts;

		if (args.categoryId) {
			posts = await ctx.db
				.query('posts')
				.withIndex('by_category_published', (q) =>
					q.eq('categoryId', args.categoryId).eq('isPublished', true),
				)
				.take(20);
		} else {
			posts = await ctx.db
				.query('posts')
				.withIndex('by_published', (q) => q.eq('isPublished', true))
				.take(20);
		}

		// Batch fetch authors
		const authorIds = [...new Set(posts.map((p) => p.authorId))];
		const authors = await Promise.all(authorIds.map((id) => ctx.db.get(id)));
		const authorsMap = new Map(authors.filter(Boolean).map((a) => [a._id, a]));

		return posts.map((post) => ({
			...post,
			author: authorsMap.get(post.authorId),
		}));
	},
});
```

#### Query Optimization Best Practices

- **Avoid N+1 reads**: Convex has no SQL joins, so batch related lookups with `Promise.all(ids.map(id => ctx.db.get(id)))` and build a `Map` for O(1) joins rather than awaiting `ctx.db.get` in a loop (as shown above). (Generic data-transfer/denormalization concerns are co-owned with DATABASE.)

### Caching and Aggregation

For counts/sums/stats over a growing table (likes, comments, shares), do **not** hand-roll a "scan up to N rows then cache the result on the parent doc" pattern; it scales poorly and the cache-freshness logic is error-prone. Use **`@convex-dev/aggregate`**, which maintains incrementally-updated counts/sums in O(log n) via a balanced-tree component, or denormalize a counter that mutations increment/decrement transactionally.

```typescript
// ✅ Good: incremental counts via @convex-dev/aggregate (mounted in convex.config.ts)
import { components } from './_generated/api';
import { TableAggregate } from '@convex-dev/aggregate';

const likesByPost = new TableAggregate<{
	Key: Id<'posts'>;
	DataModel: DataModel;
	TableName: 'likes';
}>(components.likesByPost, { sortKey: (doc) => doc.postId });

export const getLikeCount = query({
	args: { postId: v.id('posts') },
	returns: v.number(),
	handler: (ctx, args) => likesByPost.count(ctx, { bounds: { prefix: [args.postId] } }),
});
```

Only fall back to a bounded `.take(N)` scan + cached field when the table is small and bounded by construction; flag any read-time scan over an unbounded, growing table.

### Performance Monitoring

```typescript
// ✅ Good: Timing wrapper inside a handler (Convex V8 runtime does NOT expose
// process.memoryUsage; use Date.now for duration only, and rely on the Convex
// dashboard's Functions tab for built-in timing / memory telemetry).
import type { QueryCtx } from './_generated/server';

async function timed<T>(name: string, fn: () => Promise<T>): Promise<T> {
	const startTime = Date.now();
	try {
		const result = await fn();
		const duration = Date.now() - startTime;
		if (duration > 100) {
			console.warn(`Slow function: ${name} took ${duration}ms`);
		}
		return result;
	} catch (error) {
		const duration = Date.now() - startTime;
		console.error(`Function ${name} failed`, {
			duration,
			error: error instanceof Error ? error.message : String(error),
		});
		throw error;
	}
}

// Usage example
export const getPostsWithMetrics = query({
	args: {},
	returns: v.array(v.object({ _id: v.id('posts'), isPublished: v.boolean() })),
	handler: async (ctx: QueryCtx) =>
		timed('getPostsWithMetrics', async () =>
			ctx.db
				.query('posts')
				.withIndex('by_published', (q) => q.eq('isPublished', true))
				.order('desc')
				.take(20),
		),
});
```

> **Observability**: Prefer the Convex dashboard's built-in Functions metrics (execution time, bandwidth, error rate) over hand-rolled instrumentation. Wrap only when you need custom alerts that the dashboard doesn't surface.

#### Monitoring Best Practices

- **Use the Convex dashboard Functions tab** for execution time, bandwidth, and error-rate metrics rather than hand-rolling instrumentation (the V8 runtime exposes no `process.memoryUsage`). Reserve custom `timed()` wrappers for alerts the dashboard doesn't surface.

## Security Considerations

Security is paramount when building applications with Convex. Follow these guidelines to ensure your application is secure.

### Authentication & Authorization

See the canonical ownership + admin authorization example in [Required Security Patterns](#required-security-patterns) (`deletePost`). When the identity must be mapped to a Convex `users` row, resolve it via `.withIndex('by_clerk_id', q => q.eq('clerkId', identity.subject)).unique()` and compare against `user._id` (as shown in `transferOwnership` and `createComment`).

#### Authentication Best Practices

- **`ctx.auth.getUserIdentity()` in every sensitive function**; treat `null` as unauthenticated. Authorization (ownership/role checks) is separate from authentication and must run after resolving the Convex `users` row. (Generic authn/authz policy is co-owned with SECURITY; link there rather than duplicating findings.)

### Input Validation

```typescript
// ✅ Good: Comprehensive input validation
export const createComment = mutation({
	args: {
		postId: v.id('posts'),
		content: v.string(),
		parentId: v.optional(v.id('comments')),
	},
	returns: v.id('comments'),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		// Validate content length
		if (args.content.length < 1 || args.content.length > 1000) {
			throw new ConvexError({
				code: 'VALIDATION_ERROR',
				message: 'Comment must be between 1 and 1000 characters',
			});
		}

		// Sanitize content to prevent XSS.
		// NOTE: naive angle-bracket escaping is NOT sufficient for HTML/Markdown content.
		// For HTML-in-browser rendering, sanitize on the client with DOMPurify / rehype-sanitize
		// at render time. Server-side, prefer storing content as plain text or structured JSON
		// and enforce a max length + allowed charset here.
		const sanitizedContent = args.content.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '');

		// Get user
		const user = await ctx.db
			.query('users')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
			.unique();

		if (!user) throw new Error('User not found');

		// Verify post exists
		const post = await ctx.db.get(args.postId);
		if (!post) {
			throw new ConvexError({
				code: 'RESOURCE_NOT_FOUND',
				message: 'Post not found',
			});
		}

		// If replying to a comment, verify it exists
		if (args.parentId) {
			const parentComment = await ctx.db.get(args.parentId);
			if (!parentComment) {
				throw new ConvexError({
					code: 'RESOURCE_NOT_FOUND',
					message: 'Parent comment not found',
				});
			}
		}

		return await ctx.db.insert('comments', {
			postId: args.postId,
			content: sanitizedContent,
			authorId: user._id,
			parentId: args.parentId,
			createdAt: Date.now(),
		});
	},
});
```

#### Input Validation Best Practices

- **`v.*` argument validators are necessary but not sufficient**: they enforce shape/type at the boundary; add business-rule and length checks in the handler. Naive angle-bracket escaping is NOT XSS-safe (see the `createComment` note above); sanitize HTML at render time on the client. (Generic input-validation / content-security policy is co-owned with SECURITY.)

### Webhook Security

```typescript
// ✅ Good: Secure webhook handling
import { Webhook } from 'svix';

export const clerkWebhook = httpAction(async (ctx, request) => {
	const webhookSecret = process.env.CLERK_WEBHOOK_SECRET;
	if (!webhookSecret) {
		throw new Error('Missing CLERK_WEBHOOK_SECRET');
	}

	// Verify webhook signature
	const svix_id = request.headers.get('svix-id');
	const svix_timestamp = request.headers.get('svix-timestamp');
	const svix_signature = request.headers.get('svix-signature');

	if (!svix_id || !svix_timestamp || !svix_signature) {
		return new Response('Missing webhook headers', { status: 400 });
	}

	const body = await request.text();

	// Verify signature using Svix
	const wh = new Webhook(webhookSecret);
	let evt;

	try {
		evt = wh.verify(body, {
			'svix-id': svix_id,
			'svix-timestamp': svix_timestamp,
			'svix-signature': svix_signature,
		});
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return new Response('Invalid signature', { status: 400 });
	}

	// Process webhook event
	await ctx.runMutation(internal.users.handleClerkWebhook, { event: evt });

	return new Response('OK', { status: 200 });
});
```

#### Webhook Security Best Practices

1. **Verify Webhook Signatures**
    - Always verify webhook signatures to ensure authenticity
    - Use secure secrets for webhook verification
    - Handle signature verification failures gracefully

2. **Validate Webhook Payloads**
    - Validate the structure of webhook payloads
    - Handle unexpected payload formats gracefully
    - Log webhook events for auditing

3. **Implement Idempotency**
    - Design webhook handlers to be idempotent
    - Handle duplicate webhook events
    - Track processed webhook events to prevent replay attacks

## File Storage and Upload Patterns

File handling is a common requirement for many applications. Follow these guidelines to implement secure and efficient file storage with Convex.

### File Upload Best Practices

```typescript
// ✅ Good: Secure file upload
export const generateUploadUrl = mutation({
	args: {
		fileType: v.string(),
		fileName: v.string(),
		fileSize: v.number(),
	},
	returns: v.string(),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const user = await ctx.db
			.query('users')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
			.unique();

		if (!user) throw new Error('User not found');

		// Validate file size (e.g., 10MB limit)
		if (args.fileSize > 10 * 1024 * 1024) {
			throw new ConvexError({
				code: 'VALIDATION_ERROR',
				message: 'File too large',
			});
		}

		// Validate file type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
		if (!allowedTypes.includes(args.fileType)) {
			throw new ConvexError({
				code: 'VALIDATION_ERROR',
				message: 'Invalid file type',
			});
		}

		const uploadUrl = await ctx.storage.generateUploadUrl();

		// Store file metadata for later reference
		await ctx.db.insert('file_uploads', {
			userId: user._id,
			fileName: args.fileName,
			fileType: args.fileType,
			fileSize: args.fileSize,
			uploadedAt: Date.now(),
			status: 'pending',
		});

		return uploadUrl;
	},
});
```

#### File Upload Best Practices

- **Use `ctx.storage.generateUploadUrl()`** (auth-checked) and persist a metadata row linking the returned storage id to the owning user; validate type/size before issuing the URL. The deprecated `ctx.storage.getMetadata` should not be used; read from the `_storage` system table instead. (Generic upload-validation hardening is co-owned with SECURITY.)

### File Access Control

```typescript
// ✅ Good: Controlled file access
export const getFileUrl = query({
	args: { fileId: v.id('_storage') },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const user = await ctx.db
			.query('users')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
			.unique();

		if (!user) throw new Error('User not found');

		// Check if user has access to this file
		const fileRecord = await ctx.db
			.query('files')
			.withIndex('by_storage_id', (q) => q.eq('storageId', args.fileId))
			.unique();

		if (!fileRecord) {
			throw new ConvexError({
				code: 'RESOURCE_NOT_FOUND',
				message: 'File not found',
			});
		}

		if (fileRecord.ownerId !== user._id && !fileRecord.isPublic) {
			throw new ConvexError({
				code: 'UNAUTHORIZED',
				message: 'Unauthorized',
			});
		}

		return await ctx.storage.getUrl(args.fileId);
	},
});
```

#### File Access Best Practices

- **Gate `ctx.storage.getUrl()` behind an ownership/visibility check** (as shown above); a Convex storage URL is otherwise an unauthenticated link. Resolve the file's metadata row and confirm `ownerId === user._id` (or `isPublic`) before returning the URL.

## Error Handling Patterns

Robust error handling is essential for building reliable applications. Follow these guidelines to implement effective error handling in your Convex functions.

### Comprehensive Error Handling

```typescript
// ✅ Good: Comprehensive error handling
export const processPayment = mutation({
	args: {
		amount: v.number(),
		paymentMethodId: v.string(),
		orderId: v.id('orders'),
	},
	returns: v.object({
		success: v.boolean(),
		paymentId: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		try {
			const user = await ctx.db
				.query('users')
				.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
				.unique();

			if (!user) throw new Error('User not found');

			// Validate order exists and belongs to user
			const order = await ctx.db.get(args.orderId);
			if (!order) {
				throw new ConvexError({
					code: 'ORDER_NOT_FOUND',
					message: 'Order not found',
					orderId: args.orderId,
				});
			}

			if (order.userId !== user._id) {
				throw new ConvexError({
					code: 'UNAUTHORIZED',
					message: 'Not authorized to process this order',
				});
			}

			// Process payment logic here...
			// ... payment processing code ...

			return { success: true, paymentId: 'payment_123' };
		} catch (error) {
			// Log error for monitoring
			console.error('Payment processing failed:', {
				userId: identity?.subject,
				orderId: args.orderId,
				error: error instanceof Error ? error.message : String(error),
				timestamp: Date.now(),
			});

			// Re-throw with appropriate error type
			if (error instanceof ConvexError) {
				throw error;
			}

			throw new ConvexError({
				code: 'PAYMENT_PROCESSING_ERROR',
				message: 'Payment processing failed',
			});
		}
	},
});
```

#### Error Handling Best Practices

- **Throw `ConvexError({ code, message })` for client-facing failures**: only `ConvexError` payloads survive serialization to the client; a plain `Error` reaches the browser as a generic message. Use a code field for programmatic handling and never leak internals into the message. (Generic logging/observability is co-owned with CODE_QUALITY.)

### Error Recovery Strategies

```typescript
// ✅ Good: Error recovery with retries
export const processWithRetry = internalAction({
	args: {
		taskId: v.id('tasks'),
		attempt: v.optional(v.number()),
	},
	returns: v.union(
		v.object({ success: v.literal(true) }),
		v.object({ retryScheduled: v.boolean(), nextAttempt: v.number() }),
		v.object({ success: v.literal(false), error: v.string() }),
	),
	handler: async (ctx, args) => {
		const attempt = args.attempt ?? 1;
		const maxAttempts = 3;

		const task = await ctx.runQuery(internal.tasks.getTask, {
			taskId: args.taskId,
		});
		if (!task) {
			throw new Error('Task not found');
		}

		try {
			// Attempt to process the task
			const result = await processTask(task);

			// Mark task as completed
			await ctx.runMutation(internal.tasks.completeTask, {
				taskId: args.taskId,
				result,
			});

			return { success: true };
		} catch (error) {
			console.error(`Task processing failed (attempt ${attempt}):`, error);

			if (attempt < maxAttempts) {
				// Schedule retry with exponential backoff
				const delayMs = Math.pow(2, attempt) * 1000;
				await ctx.scheduler.runAfter(delayMs, internal.tasks.processWithRetry, {
					taskId: args.taskId,
					attempt: attempt + 1,
				});

				return { retryScheduled: true, nextAttempt: attempt + 1 };
			} else {
				// Mark task as failed after max attempts
				const message = error instanceof Error ? error.message : String(error);
				await ctx.runMutation(internal.tasks.failTask, {
					taskId: args.taskId,
					error: message,
				});

				return { success: false, error: message };
			}
		}
	},
});
```

#### Error Recovery Best Practices

- **Retry via `ctx.scheduler.runAfter(delay, …)` from an internal action**, passing an incrementing `attempt` arg with exponential backoff and a max-attempts cap (as shown above); do NOT busy-loop or `setTimeout` inside a single function; each attempt is its own scheduled invocation with a fresh time budget.

## Testing Strategy

A comprehensive testing strategy is essential for maintaining the quality and reliability of your Convex application. Follow these guidelines to implement effective testing practices.

### Test Utilities and Fixtures

```typescript
// ✅ Good: Test utilities with fixtures
// convex/testUtils.ts
export const createTestUser = async (ctx: any, overrides = {}) => {
	return await ctx.db.insert('users', {
		clerkId: `test_user_${Date.now()}`,
		email: 'test@example.com',
		name: 'Test User',
		createdAt: Date.now(),
		lastSeen: Date.now(),
		...overrides,
	});
};

export const createTestPost = async (ctx: any, authorId: Id<'users'>, overrides = {}) => {
	return await ctx.db.insert('posts', {
		title: 'Test Post',
		content: 'This is a test post content',
		authorId,
		isPublished: false,
		createdAt: Date.now(),
		...overrides,
	});
};

export const createTestCategory = async (ctx: any, overrides = {}) => {
	return await ctx.db.insert('categories', {
		name: 'Test Category',
		slug: 'test-category',
		createdAt: Date.now(),
		...overrides,
	});
};
```

#### Test Utilities Best Practices

- **`convexTest(schema)` gives a fresh in-memory DB per test**: no manual cleanup needed; build small seed helpers that take `ctx` and return ids. Mock auth by assigning `ctx.auth.getUserIdentity = () => Promise.resolve({ subject: '…' })` inside `t.run(...)`.

### Unit Testing Functions

```typescript
// ✅ Good: Comprehensive function testing
// convex/posts.test.ts
import { convexTest } from 'convex-test';

import { api } from './_generated/api';
import schema from './schema';
import { createTestCategory, createTestPost, createTestUser } from './testUtils';

describe('posts functions', () => {
	it('creates post with valid data', async () => {
		const t = convexTest(schema);

		const [userId, categoryId] = await t.run(async (ctx) => {
			const userId = await createTestUser(ctx, {
				name: 'John Doe',
				email: 'john@example.com',
			});
			const categoryId = await createTestCategory(ctx, {
				name: 'Technology',
			});
			return [userId, categoryId];
		});

		const postId = await t.run(async (ctx) => {
			// Mock authentication
			ctx.auth.getUserIdentity = () =>
				Promise.resolve({
					subject: 'test_user_123',
					email: 'john@example.com',
				});

			return await ctx.runMutation(api.posts.createPost, {
				title: 'Test Post',
				content: 'This is a test post with sufficient content',
				categoryId,
			});
		});

		expect(postId).toBeDefined();

		const post = await t.run(async (ctx) => {
			return await ctx.db.get(postId);
		});

		expect(post.title).toBe('Test Post');
		expect(post.authorId).toBe(userId);
		expect(post.isPublished).toBe(false);
	});

	it('rejects invalid post data', async () => {
		const t = convexTest(schema);

		await t.run(async (ctx) => {
			const categoryId = await createTestCategory(ctx);

			// Mock authentication
			ctx.auth.getUserIdentity = () =>
				Promise.resolve({
					subject: 'test_user_123',
					email: 'test@example.com',
				});

			await expect(
				ctx.runMutation(api.posts.createPost, {
					title: 'A', // Too short
					content: 'Test',
					categoryId,
				}),
			).rejects.toThrow('Title must be between 3 and 100 characters');
		});
	});

	it('handles authentication properly', async () => {
		const t = convexTest(schema);

		await t.run(async (ctx) => {
			const categoryId = await createTestCategory(ctx);

			// No authentication
			ctx.auth.getUserIdentity = () => Promise.resolve(null);

			await expect(
				ctx.runMutation(api.posts.createPost, {
					title: 'Test Post',
					content: 'This is a test post',
					categoryId,
				}),
			).rejects.toThrow('Not authenticated');
		});
	});
});
```

#### Unit Testing Best Practices

- **Assert the auth/authz rejections explicitly**: drive `ctx.runMutation` with no identity and with a non-owner identity and assert it `.rejects.toThrow(...)`; these negative paths are the ones the validators and `ctx.auth` checks exist to enforce. (Generic test-coverage practice is co-owned with the testing audits.)

### Integration Testing

```typescript
// ✅ Good: End-to-end workflow testing
describe('post workflow', () => {
	it('completes full post lifecycle', async () => {
		const t = convexTest(schema);

		// Setup test data
		const [userId, categoryId] = await t.run(async (ctx) => {
			const userId = await createTestUser(ctx, {
				clerkId: 'test_user_123',
			});
			const categoryId = await createTestCategory(ctx);
			return [userId, categoryId];
		});

		// Mock authentication for all operations
		const mockAuth = () =>
			Promise.resolve({
				subject: 'test_user_123',
				email: 'test@example.com',
			});

		// Create post
		const postId = await t.run(async (ctx) => {
			ctx.auth.getUserIdentity = mockAuth;
			return await ctx.runMutation(api.posts.createPost, {
				title: 'Integration Test Post',
				content: 'This is an integration test post',
				categoryId,
			});
		});

		// Publish post
		await t.run(async (ctx) => {
			ctx.auth.getUserIdentity = mockAuth;
			return await ctx.runMutation(api.posts.publishPost, { postId });
		});

		// Verify post is published
		const publishedPosts = await t.run(async (ctx) => {
			return await ctx.runQuery(api.posts.getPublishedPosts, {});
		});

		expect(publishedPosts.posts).toHaveLength(1);
		expect(publishedPosts.posts[0]._id).toBe(postId);
		expect(publishedPosts.posts[0].isPublished).toBe(true);

		// Test post stats
		const stats = await t.run(async (ctx) => {
			return await ctx.runQuery(api.posts.getPostStats, { postId });
		});

		expect(stats).toEqual({
			likes: 0,
			comments: 0,
			shares: 0,
		});
	});
});
```

#### Integration Testing Best Practices

- **Drive whole workflows through `t.run(...)` blocks** that chain `ctx.runMutation`/`ctx.runQuery` on the real generated `api.*`, re-applying the auth mock per step; this exercises the same function graph (including scheduled internal work) the deployed app runs.

## Data Migration and Schema Evolution

As your application evolves, you'll need to update your data models and migrate existing data. Follow these guidelines to manage schema changes effectively.

### Safe Migration Patterns

```typescript
// ✅ Good: Safe migration patterns
export const migrateUserSettings = internalMutation({
	args: { batchSize: v.optional(v.number()) },
	returns: v.object({
		completed: v.boolean(),
		processed: v.number(),
		remaining: v.optional(v.number()),
	}),
	handler: async (ctx, args) => {
		const batchSize = args.batchSize ?? 100;

		// Get users that need migration - use index instead of filter
		const users = await ctx.db
			.query('users')
			.withIndex('by_migration_version', (q) => q.eq('migrationVersion', undefined))
			.take(batchSize);

		if (users.length === 0) {
			return { completed: true, processed: 0 };
		}

		let processed = 0;

		for (const user of users) {
			try {
				await ctx.db.patch(user._id, {
					migrationVersion: 2,
					settings: {
						// Migrate old settings format
						emailNotifications: user.emailNotifications ?? true,
						theme: user.theme ?? 'light',
						language: user.language ?? 'en',
						// Add new settings with defaults
						pushNotifications: true,
						marketingEmails: false,
					},
					// Remove old fields
					emailNotifications: undefined,
					theme: undefined,
					language: undefined,
				});
				processed++;
			} catch (error) {
				console.error(`Failed to migrate user ${user._id}:`, error);
				// Continue with other users
			}
		}

		return {
			completed: users.length < batchSize,
			processed,
			remaining: users.length - processed,
		};
	},
});
```

#### Migration Best Practices

- **Migrate in batched `internalMutation`s keyed off an index** (e.g. `by_migration_version`, not `.filter()`), patching forward-compatible fields and returning a `{ completed, processed }` cursor so an orchestrator can drive it to completion. For anything non-trivial, prefer the **`@convex-dev/migrations`** component over hand-rolling the loop.

### Migration Orchestration

```typescript
// ✅ Good: Migration orchestration
export const runMigrations = internalAction({
	args: {},
	returns: v.null(),
	handler: async (ctx) => {
		const migrations = [
			{ name: 'migrateUserSettings', version: 1 },
			{ name: 'migratePostSchema', version: 2 },
		];

		for (const migration of migrations) {
			console.log(`Running migration: ${migration.name}`);

			let completed = false;
			let totalProcessed = 0;

			while (!completed) {
				const result = await ctx.runMutation(internal.migrations[migration.name], {
					batchSize: 100,
				});

				totalProcessed += result.processed;
				completed = result.completed;

				console.log(
					`Migration ${migration.name}: processed ${result.processed}, total: ${totalProcessed}`,
				);

				// Add delay between batches to avoid overwhelming the system
				if (!completed) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}

			console.log(
				`Migration ${migration.name} completed. Total processed: ${totalProcessed}`,
			);
		}

		return null;
	},
});
```

#### Migration Orchestration Best Practices

- **Drive batches from an `internalAction`** that loops `ctx.runMutation` until `completed`, sequencing dependent migrations in order. Keep each mutation within the per-function time budget; the action paces the run.

## Environment and Deployment

Effective environment and deployment practices ensure smooth development workflows and reliable production deployments.

### Configuration Management

```jsonc
// ✅ convex.json - build/runtime config only (NO env vars here)
{
	"functions": "convex/",
	"node": {
		"externalPackages": ["svix", "bcrypt"],
	},
	"generateCommonJSApi": false,
}
```

> **⚠️ Common mistake**: `convex.json` does NOT support an `environment` block. Environment variables are managed **per-deployment** via the Convex dashboard or the CLI:
>
> ```bash
> # Set secrets per deployment (dev/preview/prod)
> npx convex env set CLERK_WEBHOOK_SECRET "whsec_..."
> npx convex env set CLERK_JWT_ISSUER_DOMAIN "https://clerk.your-app.com"
> npx convex env list
> npx convex env remove STRIPE_SECRET_KEY
> ```
>
> Secrets are scoped to the deployment (dev, preview, prod) and never leave the Convex backend. Do NOT commit a `.env` file expecting Convex server functions to read it; only the frontend (Vite/Next) loads `.env` files; Convex server code reads from the deployment env set via the CLI/dashboard above.

#### Configuration Best Practices

- **Set Convex server secrets per deployment** via `npx convex env set` (or the dashboard), NOT in `convex.json` (no `environment` field exists) and NOT in a `.env` file (only the frontend bundler reads `.env`). Validate required vars at startup (see Environment Validation). Generic secret-hygiene (rotation, never committing secrets) is co-owned with SECRET_HANDLING_RETENTION.

### Deployment Best Practices

```bash
# ✅ Good: Deploy with a frontend build hook (Convex will run the cmd after server deploy)
npx convex deploy --cmd "npm run build"

# ✅ Good: Deploy to a specific deployment (prod) - Convex decides dev vs prod via CONVEX_DEPLOY_KEY
npx convex deploy --prod

# ✅ Good: Preview deployments (per-branch, auto-created on Vercel/Netlify)
npx convex deploy --preview-create "feature-branch-name"

# ✅ Good: Pre-deployment checks (run locally before pushing)
# NOTE: npm / vitest / convex-test are INTENTIONAL for the [react+convex] stack —
# do NOT "correct" these to Bun / crawltest / smoke:qc (those are Spernakit-only).
npx tsc -p convex           # typecheck Convex functions
npm run lint                # ESLint with @convex-dev/eslint-plugin
npm run test                # convex-test + vitest
npx convex deploy --prod
```

> **Preview deployments**: Convex supports per-branch preview deployments when wired to Vercel/Netlify via `CONVEX_DEPLOY_KEY`. Each preview gets its own isolated database and env vars. See <https://docs.convex.dev/production/hosting/preview-deployments>.

#### Deployment Best Practices

- **`npx convex deploy --cmd "npm run build"`** runs the server deploy then the frontend build against the freshly-generated `_generated/` types; gate it behind `tsc -p convex`, `npm run lint`, and `npm run test` (as above). Use per-branch preview deployments (`CONVEX_DEPLOY_KEY`) for isolated staging. Generic CI/CD/rollback practice is co-owned with the deployment audits.

### Environment Validation

```typescript
// ✅ Good: Environment validation
export const validateEnvironment = internalQuery({
	args: {},
	returns: v.object({
		status: v.string(),
		timestamp: v.number(),
	}),
	handler: async (ctx) => {
		const requiredEnvVars = [
			'CLERK_WEBHOOK_SECRET',
			'STRIPE_SECRET_KEY',
			'EMAIL_SERVICE_API_KEY',
		];

		const missing = requiredEnvVars.filter((envVar) => !process.env[envVar]);

		if (missing.length > 0) {
			throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
		}

		return { status: 'ok', timestamp: Date.now() };
	},
});
```

#### Environment Validation Best Practices

- **Fail fast on missing `process.env.*`** in an internal function (as above), since Convex server code reads only deployment-set env vars; a missing secret otherwise surfaces as a runtime error deep in a webhook. Generic health-check/runbook practice is co-owned with the ops audits.

## Scalability and Performance Considerations

As your application grows, scalability and performance become increasingly important. Follow these guidelines to ensure your Convex application can handle growth.

### Function Timeout Handling

```typescript
// ✅ Good: Timeout-aware operations
export const processLargeDataset = internalMutation({
	args: { batchId: v.string(), startIndex: v.optional(v.number()) },
	returns: v.object({
		processed: v.number(),
		completed: v.boolean(),
		nextIndex: v.optional(v.number()),
	}),
	handler: async (ctx, args) => {
		const startTime = Date.now();
		const TIMEOUT_BUFFER = 5000; // 5 second buffer
		const MAX_EXECUTION_TIME = 60000 - TIMEOUT_BUFFER; // 55 seconds

		const startIndex = args.startIndex ?? 0;
		let processed = 0;

		// Use index instead of filter for better performance
		const items = await ctx.db
			.query('large_dataset')
			.withIndex('by_batch_and_index', (q) =>
				q.eq('batchId', args.batchId).gte('index', startIndex),
			)
			.take(1000);

		for (const item of items) {
			// Check if we're approaching timeout
			if (Date.now() - startTime > MAX_EXECUTION_TIME) {
				// Schedule continuation
				await ctx.scheduler.runAfter(0, internal.processing.processLargeDataset, {
					batchId: args.batchId,
					startIndex: startIndex + processed,
				});
				return {
					processed,
					completed: false,
					nextIndex: startIndex + processed,
				};
			}

			// Process item
			await ctx.db.patch(item._id, {
				processed: true,
				processedAt: Date.now(),
			});

			processed++;
		}

		return { processed, completed: processed === items.length };
	},
});
```

#### Timeout Handling Best Practices

- **Self-reschedule before the time limit**: track elapsed `Date.now()` against a budget and, when approaching it, persist a cursor and `ctx.scheduler.runAfter(0, internal.x.continue, { nextIndex })` (as above) rather than trying to finish a large job in one invocation. Each continuation gets a fresh budget.

### Memory Usage Optimization

```typescript
// ✅ Good: Memory-efficient processing
export const generateReport = query({
	args: {
		reportType: v.string(),
		dateRange: v.object({ start: v.number(), end: v.number() }),
	},
	returns: v.object({ totalUsers: v.number(), totalPosts: v.number(), totalRevenue: v.number() }),
	handler: async (ctx, args) => {
		// Process data in chunks to avoid memory issues
		const CHUNK_SIZE = 100;
		let cursor = null;
		const aggregatedData = {
			totalUsers: 0,
			totalPosts: 0,
			totalRevenue: 0,
		};

		do {
			let query = ctx.db
				.query('analytics_events')
				.withIndex('by_timestamp', (q) =>
					q.and(
						q.gte(q.field('timestamp'), args.dateRange.start),
						q.lte(q.field('timestamp'), args.dateRange.end),
					),
				);

			if (cursor) {
				query = query.after(cursor);
			}

			const chunk = await query.take(CHUNK_SIZE);

			// Process chunk
			for (const event of chunk) {
				switch (event.type) {
					case 'user_signup':
						aggregatedData.totalUsers++;
						break;
					case 'post_created':
						aggregatedData.totalPosts++;
						break;
					case 'payment_completed':
						aggregatedData.totalRevenue += event.amount;
						break;
				}
			}

			cursor = chunk.length === CHUNK_SIZE ? chunk[chunk.length - 1]._id : null;
		} while (cursor);

		return aggregatedData;
	},
});
```

#### Memory Optimization Best Practices

- **Page through large scans with a cursor + `.take(CHUNK_SIZE)`** (as above) instead of `.collect()`, accumulating only the aggregate; never hold an unbounded result set in memory. The V8 runtime exposes no `process.memoryUsage`, so rely on the dashboard for memory telemetry.

### Rate Limiting Patterns

```typescript
// ✅ Good: Rate limiting implementation
export const sendMessage = mutation({
	args: { content: v.string(), channelId: v.id('channels') },
	returns: v.id('messages'),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const user = await ctx.db
			.query('users')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
			.unique();

		if (!user) throw new Error('User not found');

		// Rate limiting check
		const recentMessages = await ctx.db
			.query('messages')
			.withIndex('by_user_time', (q) =>
				q.eq('userId', user._id).gte('createdAt', Date.now() - 60000),
			) // Last minute
			.order('desc')
			.take(10);

		if (recentMessages.length >= 10) {
			throw new ConvexError({
				code: 'RATE_LIMIT_EXCEEDED',
				message: 'Rate limit exceeded. Please wait before sending another message.',
			});
		}

		return await ctx.db.insert('messages', {
			content: args.content,
			channelId: args.channelId,
			userId: user._id,
			createdAt: Date.now(),
		});
	},
});
```

#### Rate Limiting Best Practices

- **Prefer `@convex-dev/rate-limiter`** over the hand-rolled "count recent rows in an index window" pattern above for anything non-trivial; it provides token-bucket/fixed-window primitives with sharding. Throw `ConvexError({ code: 'RATE_LIMIT_EXCEEDED' })` so the client can surface a reset hint.

## Convex Components

Convex Components (stable since v1.17 (current SDK ^1.28+); verify the installed `convex` SDK version before auditing) are reusable, isolated modules that extend your backend; think of them as private mini-backends with their own tables, functions, and schedulers that your app mounts at a path. Both astrid.chat (`@convex-dev/persistent-text-streaming`) and keystrike already consume or can consume first-party components.

### Mounting a Component

```typescript
// convex/convex.config.ts
import persistentTextStreaming from '@convex-dev/persistent-text-streaming/convex.config';
import { defineApp } from 'convex/server';

const app = defineApp();
app.use(persistentTextStreaming);

export default app;
```

### Calling Component APIs

```typescript
// convex/ai/streaming.ts
import { PersistentTextStreaming, StreamIdValidator } from '@convex-dev/persistent-text-streaming';
import type { StreamId } from '@convex-dev/persistent-text-streaming';

import { components } from './_generated/api';

const streaming = new PersistentTextStreaming(components.persistentTextStreaming);

export const createStream = mutation({
	args: {},
	returns: StreamIdValidator,
	handler: async (ctx) => {
		const user = await ctx.auth.getUserIdentity();
		if (!user) throw new Error('Unauthorized');
		return await streaming.createStream(ctx);
	},
});
```

### Persistent Text Streaming (server + client)

`@convex-dev/persistent-text-streaming` (used by astrid.chat) streams an LLM response chunk-by-chunk to the browser **and** persists the accumulated text, so a late joiner or a refresh replays the full body from the DB instead of losing it. Two pieces:

```typescript
// convex/http.ts — stream chunks over HTTP via an httpAction, persisting as you go
import { httpRouter } from 'convex/server';

const http = httpRouter();
http.route({
	path: '/chat-stream',
	method: 'POST',
	handler: httpAction(async (ctx, request) => {
		const { streamId } = await request.json();
		// streaming.stream() writes each chunk to the persistent store AND to the Response body
		return await streaming.stream(
			ctx,
			request,
			streamId as StreamId,
			async (ctx, _req, _id, append) => {
				for await (const chunk of callYourLLM()) await append(chunk);
			},
		);
	}),
});
export default http;
```

```tsx
// React client — useStream replays persisted text, then live-tails new chunks
import { useStream } from '@convex-dev/persistent-text-streaming/react';

import { api } from '../convex/_generated/api';

function StreamedMessage({ streamId }: { streamId: string }) {
	const { text, status } = useStream(
		api.chat.getStreamBody, // a query that returns the persisted body for `streamId`
		new URL(`${import.meta.env.VITE_CONVEX_SITE_URL}/chat-stream`),
		/* driven= */ true,
		streamId,
	);
	return <div data-status={status}>{text}</div>;
}
```

Auth note: the httpAction is publicly addressable; verify `ctx.auth.getUserIdentity()` (or a stream-ownership check) before streaming, exactly as with any HTTP action.

### Component Best Practices

1. **Pin Component Versions**: components version independently from the `convex` SDK. Treat them like any other dependency: pin in `package.json`, review changelogs on upgrade.
2. **Mount Once in `convex.config.ts`**: the `defineApp()` graph is the single source of truth; component names there become the keys on `components.*` in generated API.
3. **Do Not Reach Into Component Tables**: components own their schema. Access them only via their public function API; the component's internal `_generated` paths are not stable.
4. **Check Auth at Your Boundary**: components trust the caller; enforce `ctx.auth.getUserIdentity()` in your own public mutation/query before delegating to the component.
5. **Known-good first-party components**: `@convex-dev/rate-limiter` (rate limiting primitives), `@convex-dev/aggregate` (efficient counts/sums), `@convex-dev/crons` (dynamic cron schedules), `@convex-dev/action-cache`, `@convex-dev/persistent-text-streaming`, `@convex-dev/migrations`. Prefer these over hand-rolling equivalents (rate-limiter in particular supersedes the manual pattern in the Rate Limiting Patterns section above for non-trivial use).

## Cron Jobs (Scheduled Recurring Work)

Convex's built-in `cronJobs()` registers deterministic recurring work. Define crons in `convex/crons.ts` and export as default.

```typescript
// convex/crons.ts
import { cronJobs } from 'convex/server';

import { internal } from './_generated/api';

const crons = cronJobs();

crons.interval(
	'expire stale sessions',
	{ minutes: 5 },
	internal.sessionManager.expireStaleSessions,
	{},
);

crons.daily(
	'aggregate daily stats',
	{ hourUTC: 2, minuteUTC: 0 },
	internal.analytics.aggregateDailyStats,
	{},
);

export default crons;
```

### Cron Best Practices

1. **Only Schedule Internal Functions**: never reference `api.*` from `crons.ts`; use `internal.*` so the cron target can't be called from the browser.
2. **Idempotent Handlers**: a cron may overlap with a previous still-running invocation if it runs long. Design handlers to be safely re-entrant (e.g., use a `status` field with CAS-style patches).
3. **Keep Each Run Bounded**: crons are mutations/actions under the same time limits as any other function. For large backfills, have the cron enqueue batch work via `ctx.scheduler.runAfter(0, ...)` instead of doing it inline.
4. **Prefer `@convex-dev/crons` for Dynamic Schedules**: the built-in `cronJobs()` is static (known at deploy time). If schedules must change at runtime (per-user digests, customer-configured reports), use the Crons component.

## HTTP Actions (Webhooks and REST Endpoints)

HTTP actions expose raw HTTP handlers at `/api/...` on your Convex deployment. Used for webhooks (Clerk, Stripe, Svix), OAuth callbacks, and third-party integrations that need a URL.

```typescript
// convex/http.ts
import { httpRouter } from 'convex/server';

import { clerkWebhook } from './clerkWebhook';

const http = httpRouter();

http.route({
	path: '/clerk-webhook',
	method: 'POST',
	handler: clerkWebhook,
});

export default http;
```

### HTTP Action Best Practices

1. **Verify Signatures Before Any Work**: see the Webhook Security section for the Svix pattern. Return `401/400` before touching `ctx.runMutation`.
2. **Delegate to Internal Mutations**: the HTTP handler should parse, verify, and call `ctx.runMutation(internal.x.y, ...)`. Keep business logic in mutations where it's testable with `convex-test`.
3. **Return Minimal Responses**: webhook providers usually only check status codes; avoid leaking internal state in error bodies.
4. **Rate-Limit External Endpoints**: HTTP actions are publicly addressable. For anything that isn't signature-verified, add IP- or token-based rate limiting (use `@convex-dev/rate-limiter`).
5. **CORS for Browser-Called Endpoints**: if you intentionally call an HTTP action from the browser, set `Access-Control-Allow-Origin` explicitly per-deployment; never `*` for authenticated endpoints.

## Auth Patterns (Clerk + Convex)

> **Convex Auth is a first-class alternative.** `@convex-dev/auth` runs authentication entirely inside Convex (password, OAuth, magic-link, OTP) with no third-party identity provider, exposing `useAuthActions()` on the client and `getAuthUserId(ctx)` on the server. An app built on Convex Auth (look for `convexAuth(...)` in `convex/auth.ts` and an `authTables` spread in the schema) is **correctly wired** and must NOT be flagged as "missing Clerk integration." The rest of this section assumes Clerk because both current apps (astrid.chat, keystrike) use it; apply it only when Clerk is actually the provider.

Both astrid.chat and keystrike use Clerk as the identity provider. The canonical wire-up:

```typescript
// convex/auth.config.ts
export default {
	providers: [
		{
			domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
			applicationID: 'convex',
		},
	],
};
```

```typescript
// App root (React)
import { ClerkProvider, useAuth } from '@clerk/clerk-react';
import { ConvexProviderWithClerk } from 'convex/react-clerk';
import { ConvexReactClient } from 'convex/react';

const convex = new ConvexReactClient(import.meta.env.VITE_CONVEX_URL);

export function App() {
	return (
		<ClerkProvider publishableKey={import.meta.env.VITE_CLERK_PUBLISHABLE_KEY}>
			<ConvexProviderWithClerk client={convex} useAuth={useAuth}>
				{/* routes */}
			</ConvexProviderWithClerk>
		</ClerkProvider>
	);
}
```

### Clerk Integration Best Practices

1. **`identity.subject` is the Clerk user ID**: it is NOT your Convex `users._id`. Always resolve the Convex user via `.withIndex('by_clerk_id', q => q.eq('clerkId', identity.subject)).unique()` in mutations that act on owned rows.
2. **Sync Users via Webhook**: use a Clerk webhook → `internal.users.upsertFromClerk` mutation to keep your `users` table in sync. Do NOT lazily create users inside read queries (queries must be idempotent / no writes).
3. **Environment**: Set `CLERK_JWT_ISSUER_DOMAIN` (for Convex) and `CLERK_WEBHOOK_SECRET` (for Svix verification) via `npx convex env set`. Frontend needs `VITE_CLERK_PUBLISHABLE_KEY` in `.env.local` (frontend-only; never read by Convex server code).
4. **Handle Token Expiry Gracefully**: `ctx.auth.getUserIdentity()` returns `null` when the JWT has expired; return a consistent `null`/`Unauthorized` shape so the client can trigger a re-sign.

## Common Anti-Patterns to Avoid

Understanding common anti-patterns is as important as following best practices. This section highlights patterns to avoid in your Convex applications.

### Database Design Issues

1. **Missing Indexes for Common Queries**
    - Always create indexes for fields used in query filters
    - Monitor query performance to identify missing indexes
    - Use compound indexes for multi-field filtering

2. **Inappropriate Data Types**
    - Use the most appropriate data type for each field
    - Avoid using strings for numeric or date values
    - Consider future needs when choosing data types

3. **Circular References in Schema**
    - Avoid circular dependencies between tables
    - Design relationships to be unidirectional when possible
    - Consider denormalization for frequently accessed data

### Query Performance Issues

1. **N+1 Query Problems**
    - Batch fetch related entities instead of fetching them one by one
    - Use `Promise.all` for parallel data fetching
    - Create maps for efficient lookups of related data

2. **Fetching Unnecessary Data**
    - Only fetch fields that are actually needed
    - Use pagination to limit the number of records
    - Consider denormalization for frequently accessed data

3. **Missing Pagination**
    - Never fetch all records at once
    - Use cursor-based pagination for large datasets
    - Limit the number of records returned per request

### Security Vulnerabilities

1. **Missing Authentication Checks**
    - Always verify user identity in mutations
    - Implement proper authentication flows
    - Handle unauthenticated users gracefully

2. **Insufficient Authorization**
    - Verify users have permission to perform actions
    - Check resource ownership before modifications
    - Implement role-based access control when needed

3. **Data Leakage in Queries**
    - Filter data based on user permissions
    - Avoid returning sensitive information in queries
    - Implement proper access controls

### Architecture Problems

1. **Monolithic Functions**
    - Break large functions into smaller, focused functions
    - Separate concerns between different functions
    - Create reusable utility functions

2. **Tight Coupling Between Components**
    - Design components to be loosely coupled
    - Use well-defined interfaces between components
    - Avoid direct dependencies between unrelated functions

3. **Missing Error Handling**
    - Implement comprehensive error handling
    - Provide meaningful error messages
    - Log errors for debugging and monitoring

### Real-time Performance Issues

1. **Inefficient Subscription Queries**
    - Optimize queries used in subscriptions
    - Limit the amount of data returned by subscriptions
    - Use indexes for subscription queries

2. **Excessive Real-time Subscriptions**
    - Only subscribe to data that is actually needed
    - Unsubscribe from data when it's no longer needed
    - Consider batching updates for rapidly changing data

3. **Client-Side Filtering**
    - Filter data on the server, not the client
    - Use Convex's query filtering capabilities
    - Avoid fetching unnecessary data

### Data Consistency Issues

1. **Non-Atomic Operations**
    - Use transactions for related operations
    - Design mutations to complete fully or not at all
    - Handle errors appropriately to avoid partial updates

2. **Eventual Consistency Handling**
    - Design for eventual consistency where appropriate
    - Provide feedback to users about operation status
    - Implement conflict resolution strategies

3. **Missing Data Validation**
    - Validate all inputs in mutations
    - Enforce business rules at the data layer
    - Use Convex's built-in validators for basic type checking

By following these best practices and avoiding common anti-patterns, you'll be well on your way to building robust, scalable, and maintainable applications with Convex.

## Audit Checklist

### Critical Checks 🚨

- [ ] Zero `.filter()` usage on database queries (use `.withIndex()`)
- [ ] All functions have `returns:` validators (100% coverage)
- [ ] Authentication checks on all sensitive operations
- [ ] No direct action calls from browser (`useAction(api.*)` forbidden)
- [ ] `@convex-dev/eslint-plugin` configured (`no-old-registered-function-syntax` + `require-argument-validators`); TypeScript at current stable

### High Priority Checks ⚠️

- [ ] Query results bounded with `.take()` or `.paginate()` (exact N is workload-dependent)
- [ ] Function execution time <100ms, verified via Convex dashboard, not statically asserted
- [ ] Proper authorization beyond authentication
- [ ] Schema uses explicit `v.object()` field definitions
- [ ] Indexes purpose-built for query patterns

### Medium Priority Checks 📋

- [ ] Real-time subscriptions preferred over manual polling
- [ ] Atomic operations in mutations with proper error handling
- [ ] Helper functions used for complex logic
- [ ] File uploads use proper storage patterns
- [ ] Environment configuration properly managed

### Low Priority Checks 💡

- [ ] Testing strategy implemented (unit, integration, E2E)
- [ ] Data migration patterns documented
- [ ] Performance monitoring in place
- [ ] Scalability considerations documented
- [ ] Code organization follows project conventions

## Report Template

```markdown
# Convex Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Convex Score**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Convex Coverage**: [Percentage]%

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

- **Function Validator Coverage**: [X]% (Target: 100%)
- **Database Query Optimization**: [X]% using .withIndex() (Target: 100%)
- **Security Implementation**: [X]% functions with auth checks (Target: 100%)
- **Performance Compliance**: [X]% functions under 100ms (Target: 95%)

## Next Audit Date

Recommended: [Date] (Quarterly - see frontmatter `frequency`. Monthly if active Convex development or recent component/SDK upgrade.)
```

---
title: 'Convex Database and Backend Patterns Audit Framework'
last_updated: '2025-12-16'
version: '1.1'
category: 'Core Technology'
priority: 'Critical'
estimated_time: '1-2 hours'
prerequisites: 'Convex knowledge, TypeScript familiarity, database concepts'
---

# Convex Best Practices Guide

## Quick Reference - Mandatory Rules ⚠️

**🚨 CRITICAL - ZERO TOLERANCE VIOLATIONS**

| Rule                   | ✅ Do This                                                                                  | ❌ Never Do This                                           |
| ---------------------- | ------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| **Database Filtering** | `ctx.db.query('posts').withIndex('by_status', q => q.eq('published', true))`                | `ctx.db.query('posts').collect().filter(p => p.published)` |
| **Return Validators**  | `returns: v.array(v.object({ _id: v.id('posts') }))`                                        | `// No return validator`                                   |
| **Authentication**     | `const user = await ctx.auth.getUserIdentity(); if (!user) throw new Error('Unauthorized')` | `// No auth check for sensitive ops`                       |
| **Actions**            | `mutation → internal action` pattern                                                        | `useAction(api.myAction)` directly from browser            |
| **Query Limits**       | `.take(100)` or `.paginate({ numItems: 50 })`                                               | `.collect()` without limits                                |
| **TypeScript Version** | `TypeScript ≥ 5.0.3`                                                                        | `TypeScript < 5.0.3`                                       |
| **ESLint**             | `@convex-dev/eslint-plugin` with ESLint 9 flat config                                       | `No ESLint or outdated rules`                              |

## Executive Summary

**🎯 Mandatory Rules (100% Compliance Required)**

1. **NEVER use `.filter()` on database queries** - Always use `.withIndex()` for filtering
2. **ALL functions MUST have return type validators** - No exceptions, even for simple functions
3. **Authentication required** for all sensitive operations using `ctx.auth.getUserIdentity()`
4. **Query performance target**: <100ms execution time, <500 records per query
5. **Actions are restricted**: Never call actions directly from browser; use mutation → internal action pattern
6. **TypeScript requirement**: Must use TypeScript ≥ 5.0.3 for all Convex projects
7. **ESLint enforcement**: Must use `@convex-dev/eslint-plugin` with ESLint 9 flat config

**📋 Required Patterns (Must Follow)**

- **Schema**: Use `v.object()` with explicit field definitions, no generic typing
- **Functions**: Standard syntax without explicit argument typing in handlers
- **Queries**: Real-time subscriptions preferred over manual polling
- **Mutations**: Atomic operations with proper error handling
- **Indexes**: Purpose-built indexes, avoid redundant single-field indexes
- **TypeScript**: Leverage validators for types, `WithoutSystemFields`, and generated `Doc/Id/*Ctx` types
- **ESLint**: Enforce rules with `@convex-dev/eslint-plugin` including `no-old-registered-function-syntax` and `require-argument-validators`

**⚡ Performance Standards (Enforced)**

- **Database queries**: Use appropriate indexes, limit results, avoid sequential operations
- **Function design**: Keep functions light and fast, use helper functions for complex logic
- **Real-time updates**: Leverage Convex's reactive nature for optimal user experience

**🔒 Security Requirements (Non-Negotiable)**

- **Input validation**: All user inputs validated with Convex validators
- **Authorization**: Resource-level access control beyond authentication
- **Data sanitization**: Prevent injection attacks and data leakage

## Quick Reference - Common Patterns 📚

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
					q.eq('categoryId', args.categoryId).eq('isPublished', true)
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

> **Note**: All examples follow the mandatory patterns including:
>
> - NEVER using `.filter()` on database queries (use `.withIndex()` instead)
> - ALL functions MUST have return type validators
> - Standard function syntax without explicit argument typing
> - Simplified schema definitions without generic typing
>   This project intentionally enforces stricter standards than the public docs where useful (e.g., mandatory return validators on ALL functions, never using `.filter()` in database queries). These stricter rules are required for this codebase.
>   References: <https://docs.convex.dev/understanding/best-practices/> • <https://docs.convex.dev/understanding/best-practices/typescript> • <https://docs.convex.dev/understanding/zen>

## Table of Contents

### **🚨 Mandatory Rules (Must Read)**

1. [Quick Reference - Mandatory Rules](#quick-reference---mandatory-rules-️)
2. [Quick Reference - Common Patterns](#quick-reference---common-patterns-)
3. [Mandatory Database Patterns](#mandatory-database-patterns)
4. [Required Security Patterns](#required-security-patterns)
5. [Performance Requirements](#performance-requirements)

### **📋 Best Practices (Recommended)**

6. [The Zen of Convex](#the-zen-of-convex)
7. [Schema Design Best Practices](#schema-design-best-practices)
8. [TypeScript-Specific Recommendations](#typescript-specific-recommendations)
9. [Query and Mutation Patterns](#query-and-mutation-patterns)
10. [File Storage and Upload Patterns](#file-storage-and-upload-patterns)
11. [Error Handling Patterns](#error-handling-patterns)
12. [Testing Strategy](#testing-strategy)
13. [Data Migration and Schema Evolution](#data-migration-and-schema-evolution)
14. [Environment and Deployment](#environment-and-deployment)
15. [Report Template](#report-template)
16. [Scalability and Performance Considerations](#scalability-and-performance-considerations)

### **⚠️ Anti-Patterns (Avoid These)**

16. [Common Anti-Patterns to Avoid](#common-anti-patterns-to-avoid)

> Alignment with official Convex guidance (highlights we enforce):
>
> - Use queries for nearly every app read; keep client state simple (Convex Zen)
> - Keep queries/mutations light & fast (<100ms; few hundred records) (Convex Zen)
> - Actions: use sparingly; do not call actions directly from the browser; prefer mutation → internal action workflows that record progress (Best Practices + Zen)
> - Only schedule and `ctx.run*` internal functions; never reference `api.*` in Convex server code (Best Practices)
> - Use helper TS functions; keep public functions thin; avoid sequential `ctx.runQuery/ctx.runMutation` from actions when a single internal function suffices (Best Practices)
> - Avoid redundant indexes; be mindful that single-field indexes sort by that field then `_creationTime` (Best Practices)
> - TypeScript: TS ≥ 5.0.3; leverage validators for types, `WithoutSystemFields`, and generated `Doc/Id/*Ctx` (TypeScript page)
> - ESLint: Use @convex-dev/eslint-plugin with ESLint 9 flat config; enforce no-old-function-syntax and require-argument-validators rules
> - File Storage: Use `_storage` system table for metadata; deprecated `ctx.storage.getMetadata` should not be used

## Pre-flight Checklist

### Pre-Migration Validation

Run these commands before `bunx convex dev` to catch common issues:

```bash
# Check for incorrect internal API paths (missing filename)
grep -r "internal\.[^.]*\.[^.]*(" convex/ --include="*.ts" | grep -v "internal\.[^.]*\.[^.]*\.[^.]*("

# Check for direct action calls from mutations
grep -r "ctx\.runAction" convex/ --include="*.ts"

# Check for missing return validators
grep -r "export const.*= {" convex/ --include="*.ts" -A 3 | grep -B 3 -A 3 -v "returns:"

# Check for .filter() on queries
grep -r "\.filter(" convex/ --include="*.ts"

# Check for scheduler usage in mutations (good pattern)
grep -r "ctx\.scheduler\.runAfter" convex/ --include="*.ts"
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
# Verify internal API structure
find convex/ -name "*.ts" -exec grep -l "export const.*internalMutation\|export const.*internalQuery" {} \; | head -5

# Check for proper scheduler usage
grep -r "scheduler\.runAfter" convex/ --include="*.ts" | grep -E "(internal\.|api\.)" | head -5

# Validate return type coverage
for f in convex/**/*.ts; do echo "=== $f ==="; grep -A 5 "export const.*=" "$f" | grep -E "(returns:|handler:)"; done
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

**Rule 2: ALL functions MUST have return validators**

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

## Required Security Patterns

### **🔒 Authentication Requirements**

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

### **⚡ Execution Time Targets**

- **Functions**: <100ms execution time
- **Queries**: <500 records per query
- **Indexes**: Required for all filtering operations

### **🎯 Optimization Checklist**

- [ ] All queries use appropriate indexes
- [ ] Result sets are limited with `.take()` or `.paginate()`
- [ ] No use of `.filter()` on database queries
- [ ] Functions complete in <100ms
- [ ] Heavy operations moved to internal actions

## The Zen of Convex

Convex is designed around a set of core principles that guide its architecture and usage patterns. Understanding these philosophical approaches will help you build applications that leverage Convex's strengths effectively.

### Core Principles

1. **Real-time by Default**
    - Design your application with real-time updates as the primary interaction model
    - Embrace subscriptions as the standard way to fetch data that changes over time
    - Avoid manual polling when real-time subscriptions can provide better user experience

2. **Simplicity Over Complexity**
    - Prefer straightforward solutions that leverage Convex's built-in capabilities
    - Avoid over-engineering solutions when Convex provides simple primitives
    - Focus on business logic rather than infrastructure concerns

3. **Reactive Data Flow**
    - Structure your application to react to data changes rather than imperative updates
    - Use subscriptions to automatically update UI when underlying data changes
    - Design components to be reactive to data changes rather than managing state manually

4. **Consistency and Reliability**
    - Leverage Convex's transaction guarantees for critical operations
    - Design for eventual consistency where appropriate, but use transactions when strong consistency is needed
    - Build resilient systems that handle failures gracefully

### Philosophical Approaches

1. **Embrace the Server-First Model**
    - Place business logic in server functions rather than client code
    - Use Convex as the single source of truth for your application state
    - Minimize client-side business logic to reduce complexity and improve security

2. **Design for Evolution**
    - Build schemas that can evolve over time without breaking existing functionality
    - Use versioning strategies for data models and APIs
    - Plan for migrations as part of your development process

3. **Optimize for Developer Experience**
    - Leverage TypeScript for type safety across your entire application
    - Use Convex's development tools to streamline your workflow
    - Write code that is easy to understand and maintain

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

1. **CRITICAL: ALL Functions MUST Have Return Validators**
    - ❌ FORBIDDEN: Functions without `returns:` property
    - ✅ REQUIRED: `returns: v.object({ success: v.boolean() })`
    - ✅ REQUIRED: `returns: v.null()` for functions that return nothing
    - This is mandatory for ALL queries, mutations, and actions

2. **Validate All Inputs**
    - Never trust client-provided data
    - Validate all arguments in mutations and queries
    - Use Convex's built-in validators for basic type checking

3. **Provide Clear Error Messages**
    - Use `ConvexError` for structured error responses
    - Include error codes for programmatic handling
    - Make error messages user-friendly when appropriate

4. **Validate Business Rules**
    - Check for business logic constraints beyond type validation
    - Verify relationships between entities
    - Enforce application-specific rules

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
		// Implementation with full type safety
		// ...
	},
});
```

### TypeScript Best Practices

1. **Leverage Generated Types**
    - Use the types generated by Convex for your database tables
    - Import types from `./_generated/api` for function references
    - Enable strict mode in your TypeScript configuration

2. **Create Custom Type Utilities**
    - Build utility types for common patterns
    - Use generics for reusable function patterns
    - Create type guards for runtime type checking

3. **Document Complex Types**
    - Use JSDoc comments to explain complex types
    - Provide examples for non-obvious type usage
    - Document the shape of data returned by queries

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
	return (
		obj &&
		typeof obj.clerkId === 'string' &&
		typeof obj.email === 'string' &&
		typeof obj.name === 'string'
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
				q.eq('categoryId', args.categoryId).eq('isPublished', true)
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

1. **CRITICAL: Never Use .filter() on Database Queries**
    - ❌ FORBIDDEN: `query.filter((q) => q.eq(q.field('isPublished'), true))`
    - ✅ REQUIRED: `query.withIndex('by_published', (q) => q.eq('isPublished', true))`
    - Create indexes for all filtering needs
    - This is a mandatory rule with zero exceptions

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

1. **Ensure Atomicity**
    - Design mutations to complete fully or not at all
    - Handle errors appropriately to avoid partial updates
    - Use transactions when multiple operations must succeed together

2. **Validate Before Acting**
    - Validate all inputs before making any changes
    - Check permissions and authorization before modifying data
    - Verify referenced entities exist

3. **Provide Meaningful Return Values**
    - Return useful information about the operation's result
    - Include the ID of created or modified entities
    - Return status information for client-side handling

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

1. **Optimize for Real-time Performance**
    - Use indexes to make subscription queries efficient
    - Limit the amount of data returned by subscriptions
    - Avoid expensive computations in subscription queries

2. **Filter Subscriptions Appropriately**
    - Only subscribe to data that the user needs to see
    - Implement proper authorization in subscription queries
    - Avoid subscribing to large datasets when possible

3. **Handle Subscription Lifecycle**
    - Clean up subscriptions when components unmount
    - Handle subscription errors gracefully
    - Consider loading states for initial data fetches

## ESLint Configuration and Enforcement

### **🔧 Required ESLint Setup**

All Convex projects MUST use `@convex-dev/eslint-plugin` with ESLint 9 flat config:

```bash
# Install ESLint plugin
npm i @convex-dev/eslint-plugin --save-dev
```

```javascript
// eslint.config.js (ESLint 9 flat config)
import convexPlugin from '@convex-dev/eslint-plugin';
import { defineConfig } from 'eslint/config';

export default defineConfig([
	// Other configurations...
	convexPlugin.configs.recommended,
]);
```

### **Enforced Rules**

The plugin enforces critical rules:

1. **`no-old-registered-function-syntax`** - Requires new function syntax
2. **`require-argument-validators`** - All functions must have argument validators
3. **`explicit-table-ids`** - Table IDs must be explicit
4. **`import-wrong-runtime`** - Prevents importing functions from wrong runtime

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

### **⚙️ Version Requirement**

- **Minimum**: TypeScript ≥ 5.0.3
- **Recommended**: Latest stable version
- **Configuration**: Use `tsconfig.json` in Convex folder for typechecking settings

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
		})
	),
	handler: async (ctx, args) => {
		let posts;

		if (args.categoryId) {
			posts = await ctx.db
				.query('posts')
				.withIndex('by_category_published', (q) =>
					q.eq('categoryId', args.categoryId).eq('isPublished', true)
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

1. **Avoid N+1 Queries**
    - Batch fetch related entities instead of fetching them one by one
    - Use `Promise.all` for parallel data fetching
    - Create maps for efficient lookups of related data

2. **Limit Data Transfer**
    - Only fetch fields that are actually needed
    - Use pagination to limit the number of records
    - Consider denormalization for frequently accessed data

3. **Optimize Filter Conditions**
    - Place the most selective filters first
    - Use indexes for all filter conditions
    - Avoid expensive computations in filter functions

### Caching Strategies

```typescript
// ✅ Good: Computed fields for expensive operations
export const getPostStats = query({
	args: { postId: v.id('posts') },
	returns: v.object({
		likes: v.number(),
		comments: v.number(),
		shares: v.number(),
	}),
	handler: async (ctx, args) => {
		const post = await ctx.db.get(args.postId);
		if (!post) {
			throw new ConvexError({
				code: 'RESOURCE_NOT_FOUND',
				message: 'Post not found',
			});
		}

		// Use cached stats if available and recent
		if (post.statsCalculatedAt && Date.now() - post.statsCalculatedAt < 3600000) {
			// 1 hour
			return {
				likes: post.cachedLikes,
				comments: post.cachedComments,
				shares: post.cachedShares,
			};
		}

		// Calculate fresh stats - use take() instead of collect() for performance
		const [likes, comments, shares] = await Promise.all([
			ctx.db
				.query('likes')
				.withIndex('by_post', (q) => q.eq('postId', args.postId))
				.take(1000), // Limit to prevent performance issues
			ctx.db
				.query('comments')
				.withIndex('by_post', (q) => q.eq('postId', args.postId))
				.take(1000),
			ctx.db
				.query('shares')
				.withIndex('by_post', (q) => q.eq('postId', args.postId))
				.take(1000),
		]);

		// Cache the results
		await ctx.db.patch(args.postId, {
			cachedLikes: likes.length,
			cachedComments: comments.length,
			cachedShares: shares.length,
			statsCalculatedAt: Date.now(),
		});

		// NOTE: For frequently-accessed or large aggregations, prefer denormalizing counts into
		// separate tables or precomputed aggregates rather than scanning large sets at read time.

		return {
			likes: likes.length,
			comments: comments.length,
			shares: shares.length,
		};
	},
});
```

#### Caching Best Practices

1. **Cache Expensive Computations**
    - Store results of expensive operations in the database
    - Include timestamps to determine cache freshness
    - Implement cache invalidation strategies

2. **Use Appropriate Cache Durations**
    - Balance freshness with performance
    - Use shorter durations for rapidly changing data
    - Use longer durations for stable data

3. **Implement Cache Invalidation**
    - Update cached data when underlying data changes
    - Consider background refresh for stale caches
    - Provide mechanisms to manually refresh caches when needed

### Performance Monitoring

```typescript
// ✅ Good: Performance monitoring utilities
export const withMetrics = <T extends FunctionReference<'query' | 'mutation'>>(
	fn: T,
	name: string
) => {
	return async (ctx: any, args: any) => {
		const startTime = Date.now();
		const startMemory = process.memoryUsage().heapUsed;

		try {
			const result = await fn(ctx, args);

			const duration = Date.now() - startTime;
			const memoryDelta = process.memoryUsage().heapUsed - startMemory;

			// Log metrics
			console.log(`Function ${name} completed`, {
				duration,
				memoryDelta,
				success: true,
				timestamp: Date.now(),
			});

			// Log slow queries
			if (duration > 1000) {
				console.warn(`Slow function: ${name} took ${duration}ms`);
			}

			return result;
		} catch (error) {
			const duration = Date.now() - startTime;

			console.error(`Function ${name} failed`, {
				duration,
				error: error.message,
				timestamp: Date.now(),
			});

			throw error;
		}
	};
};

// Usage example
export const getPostsWithMetrics = query(
	withMetrics(
		{
			handler: async (ctx) => {
				return await ctx.db
					.query('posts')
					.withIndex('by_published', (q) => q.eq('isPublished', true))
					.order('desc')
					.take(20);
			},
		},
		'getPostsWithMetrics'
	)
);
```

#### Monitoring Best Practices

1. **Track Key Metrics**
    - Monitor function execution times
    - Track memory usage patterns
    - Log error rates and types

2. **Set Up Alerts**
    - Alert on performance degradation
    - Monitor for unusual error patterns
    - Track resource utilization

3. **Analyze Performance Trends**
    - Identify slow functions over time
    - Correlate performance with deployment changes
    - Monitor performance under load

## Security Considerations

Security is paramount when building applications with Convex. Follow these guidelines to ensure your application is secure.

### Authentication & Authorization

```typescript
// ✅ Good: Proper security implementation
export const deletePost = mutation({
	args: { postId: v.id('posts') },
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx, args) => {
		const identity = await ctx.auth.getUserIdentity();
		if (!identity) throw new Error('Not authenticated');

		const user = await ctx.db
			.query('users')
			.withIndex('by_clerk_id', (q) => q.eq('clerkId', identity.subject))
			.unique();

		if (!user) throw new Error('User not found');

		const post = await ctx.db.get(args.postId);
		if (!post) {
			throw new ConvexError({
				code: 'RESOURCE_NOT_FOUND',
				message: 'Post not found',
			});
		}

		if (post.authorId !== user._id) {
			throw new ConvexError({
				code: 'UNAUTHORIZED',
				message: 'Only the author can delete this post',
			});
		}

		await ctx.db.delete(args.postId);
		return { success: true };
	},
});
```

#### Authentication Best Practices

1. **Verify Identity in All Mutations**
    - Always check for a valid user identity
    - Handle unauthenticated users gracefully
    - Use appropriate authentication providers

2. **Implement Authorization Checks**
    - Verify users have permission to perform actions
    - Check resource ownership before modifications
    - Implement role-based access control when needed

3. **Use Secure Authentication Methods**
    - Leverage Convex's built-in authentication integrations
    - Store authentication tokens securely
    - Implement proper session management

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

		// Sanitize content to prevent XSS
		const sanitizedContent = args.content.replace(/</g, '&lt;').replace(/>/g, '&gt;');

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

1. **Validate All Inputs**
    - Never trust client-provided data
    - Validate types, formats, and ranges
    - Sanitize inputs to prevent injection attacks

2. **Use Convex Validators**
    - Leverage built-in validators for basic type checking
    - Create custom validators for complex validation rules
    - Provide clear error messages for validation failures

3. **Implement Content Security**
    - Sanitize user-generated content to prevent XSS
    - Validate file uploads for malicious content
    - Implement rate limiting to prevent abuse

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

1. **Validate File Properties**
    - Validate file types to prevent malicious uploads
    - Limit file sizes to prevent abuse
    - Sanitize file names to prevent path traversal attacks

2. **Track File Metadata**
    - Store file metadata in your database
    - Track upload status and ownership
    - Maintain audit trails for file operations

3. **Generate Secure Upload URLs**
    - Use Convex's built-in upload URL generation
    - Set appropriate expiration times for upload URLs
    - Associate upload URLs with user sessions

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

1. **Implement Access Controls**
    - Verify user permissions before providing file URLs
    - Support both public and private file access
    - Consider time-limited access URLs for sensitive files

2. **Track File Access**
    - Log file access for auditing
    - Monitor for unusual access patterns
    - Implement rate limiting for file downloads

3. **Optimize File Delivery**
    - Use appropriate content types for file responses
    - Implement caching headers where appropriate
    - Consider CDN integration for frequently accessed files

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
				error: error.message,
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

1. **Use Structured Errors**
    - Use `ConvexError` for structured error responses
    - Include error codes for programmatic handling
    - Provide context-specific error messages

2. **Implement Error Logging**
    - Log errors with sufficient context for debugging
    - Include relevant identifiers in error logs
    - Monitor error rates and patterns

3. **Handle Errors Gracefully**
    - Design functions to fail gracefully when possible
    - Provide fallback behavior for non-critical errors
    - Communicate errors clearly to users

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
		v.object({ success: v.literal(false), error: v.string() })
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
				await ctx.runMutation(internal.tasks.failTask, {
					taskId: args.taskId,
					error: error.message,
				});

				return { success: false, error: error.message };
			}
		}
	},
});
```

#### Error Recovery Best Practices

1. **Implement Retry Logic**
    - Retry transient failures with exponential backoff
    - Limit the number of retry attempts
    - Track retry attempts for monitoring

2. **Design for Failure**
    - Identify critical and non-critical operations
    - Implement graceful degradation for non-critical failures
    - Provide fallback mechanisms when possible

3. **Communicate Failure States**
    - Update UI to reflect operation status
    - Provide clear feedback to users
    - Offer options for recovery when appropriate

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

1. **Create Reusable Test Fixtures**
    - Build utilities for creating test data
    - Support overrides for customizing test data
    - Ensure fixtures create realistic test data

2. **Isolate Test Data**
    - Create fresh data for each test
    - Avoid dependencies between tests
    - Clean up test data after tests run

3. **Mock External Dependencies**
    - Mock authentication for tests
    - Mock external API calls
    - Use test-specific configurations

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
				})
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
				})
			).rejects.toThrow('Not authenticated');
		});
	});
});
```

#### Unit Testing Best Practices

1. **Test Function Behavior**
    - Test both success and failure cases
    - Verify function outputs match expectations
    - Test edge cases and boundary conditions

2. **Mock Dependencies**
    - Mock authentication for testing
    - Mock database operations when needed
    - Isolate functions from external dependencies

3. **Validate Business Logic**
    - Test that business rules are enforced
    - Verify error handling works correctly
    - Test authorization and permission checks

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

1. **Test Workflows**
    - Test complete user workflows
    - Verify interactions between functions
    - Test real-time subscription behavior

2. **Use Realistic Data**
    - Use realistic test data scenarios
    - Test with data volumes similar to production
    - Include edge cases in integration tests

3. **Test Performance**
    - Measure performance of critical workflows
    - Identify bottlenecks in complex operations
    - Test behavior under load

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

1. **Design Backward-Compatible Changes**
    - Add new fields with sensible defaults
    - Keep existing fields intact during transitions
    - Use version flags to track migration status

2. **Process Data in Batches**
    - Migrate data in manageable batches
    - Handle failures gracefully within batches
    - Track migration progress

3. **Test Migrations Thoroughly**
    - Test migrations with production-like data
    - Verify data integrity after migration
    - Have rollback strategies ready

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
					`Migration ${migration.name}: processed ${result.processed}, total: ${totalProcessed}`
				);

				// Add delay between batches to avoid overwhelming the system
				if (!completed) {
					await new Promise((resolve) => setTimeout(resolve, 1000));
				}
			}

			console.log(
				`Migration ${migration.name} completed. Total processed: ${totalProcessed}`
			);
		}

		return null;
	},
});
```

#### Migration Orchestration Best Practices

1. **Sequence Migrations Appropriately**
    - Order migrations by dependencies
    - Run migrations during maintenance windows
    - Communicate migration schedules to users

2. **Monitor Migration Progress**
    - Track migration completion status
    - Monitor system performance during migrations
    - Alert on migration failures

3. **Document Schema Changes**
    - Maintain a changelog for schema evolution
    - Document data model decisions
    - Communicate changes to the development team

## Environment and Deployment

Effective environment and deployment practices ensure smooth development workflows and reliable production deployments.

### Configuration Management

```javascript
// ✅ Good: Environment-specific configuration
// convex.json
{
  "functions": "convex/",
  "node": {
    "externalPackages": ["node-fetch", "bcrypt", "svix"]
  },
  "generateCommonJSApi": false,
  "environment": {
    "development": {
      "CLERK_WEBHOOK_SECRET": "development_secret",
      "STRIPE_SECRET_KEY": "sk_test_...",
      "EMAIL_SERVICE_API_KEY": "test_key"
    },
    "staging": {
      "CLERK_WEBHOOK_SECRET": "staging_secret",
      "STRIPE_SECRET_KEY": "sk_test_...",
      "EMAIL_SERVICE_API_KEY": "staging_key"
    },
    "production": {
      "CLERK_WEBHOOK_SECRET": "production_secret",
      "STRIPE_SECRET_KEY": "sk_live_...",
      "EMAIL_SERVICE_API_KEY": "production_key"
    }
  }
}
```

#### Configuration Best Practices

1. **Use Environment-Specific Settings**
    - Maintain separate configurations for each environment
    - Store sensitive data in environment variables
    - Use configuration validation

2. **Secure Sensitive Data**
    - Never commit secrets to version control
    - Use secure secret management
    - Rotate secrets regularly

3. **Document Configuration Requirements**
    - Document all required environment variables
    - Provide example configurations
    - Include setup instructions for new developers

### Deployment Best Practices

```bash
# ✅ Good: Automated deployment with validation
npx convex deploy --cmd "bun run build && bun run test"

# ✅ Good: Environment-specific deployments
npx convex deploy --prod
npx convex deploy --env staging

# ✅ Good: Pre-deployment checks
npx convex dev --until-success
bun run test
bun run lint
npx convex deploy --prod
```

#### Deployment Best Practices

1. **Automate Deployments**
    - Use CI/CD pipelines for deployments
    - Run tests before deployment
    - Implement deployment checks

2. **Use Environment Promotion**
    - Deploy to staging before production
    - Test in staging environments
    - Use feature flags for gradual rollouts

3. **Monitor Deployments**
    - Track deployment success rates
    - Monitor system health after deployment
    - Implement rollback procedures

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

1. **Validate Environment at Startup**
    - Check for required environment variables
    - Validate configuration values
    - Fail fast on configuration errors

2. **Implement Health Checks**
    - Create health check endpoints
    - Monitor system dependencies
    - Alert on health check failures

3. **Document Environment Setup**
    - Provide setup instructions for each environment
    - Document environment-specific configurations
    - Include troubleshooting guides

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
				q.eq('batchId', args.batchId).gte('index', startIndex)
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

1. **Respect Function Time Limits**
    - Design functions to complete within time limits
    - Break long-running operations into smaller chunks
    - Use scheduling for continued processing

2. **Implement Progress Tracking**
    - Track progress of long-running operations
    - Provide status updates to users
    - Allow for resuming interrupted operations

3. **Optimize for Speed**
    - Profile slow functions
    - Optimize database queries
    - Minimize computational complexity

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
						q.lte(q.field('timestamp'), args.dateRange.end)
					)
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

1. **Process Data in Chunks**
    - Avoid loading large datasets into memory
    - Process data incrementally
    - Release memory as soon as possible

2. **Optimize Data Structures**
    - Use efficient data structures for processing
    - Avoid unnecessary data duplication
    - Clean up temporary data

3. **Monitor Memory Usage**
    - Track memory usage patterns
    - Identify memory leaks
    - Set memory usage alerts

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
				q.eq('userId', user._id).gte('createdAt', Date.now() - 60000)
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

1. **Implement Appropriate Limits**
    - Set reasonable limits based on usage patterns
    - Consider different limits for different operations
    - Adjust limits based on user tiers

2. **Provide Clear Feedback**
    - Inform users when limits are reached
    - Indicate when limits will reset
    - Suggest alternatives when limits are reached

3. **Monitor Rate Limiting**
    - Track rate limit violations
    - Identify potential abuse patterns
    - Adjust limits based on monitoring data

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
- [ ] TypeScript ≥5.0.3 and `@convex-dev/eslint-plugin` configured

### High Priority Checks ⚠️

- [ ] Query results limited with `.take()` or `.paginate()`
- [ ] Function execution time <100ms target
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

Recommended: [Date] (Monthly for active development)
```

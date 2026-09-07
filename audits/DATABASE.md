---
title: 'Database Design and Migration Audit Framework'
last_updated: '2026-06-28'
version: '2.2'
category: 'Core Architecture'
priority: 'High'
estimated_time: '30-60 min'
frequency: 'Quarterly'
lifecycle: 'pre-release'
---

# Database Design and Migration Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

**Critical Database Standards**

- **Schema Evolution**: Safe, backward-compatible migrations with rollback procedures
- **Data Integrity**: Comprehensive validation during migrations and schema changes
- **Performance Impact**: Migration performance analysis and optimization strategies
- **Version Control**: Schema versioning and compatibility management
- **Database Location**: Database files ONLY in `data/` at project root (NEVER `backend/data/`)

**Essential Migration Patterns**

- **Incremental Changes**: Small, atomic migrations over large schema overhauls
- **Backward Compatibility**: Maintain compatibility during transition periods
- **Data Validation**: Integrity checks before and after migrations
- **Rollback Procedures**: Safe rollback strategies for failed migrations
- **Performance Monitoring**: Track migration impact on system performance

**Schema Design Standards**

- **ORM**: Drizzle ORM with `sqliteTable()` or `pgTable()` definitions
- **Naming**: snake_case columns in database, camelCase in Drizzle schema
- **Tables**: Plural snake_case (users, audit_logs, workspace_members)
- **Indexes**: `idx_{table}_{columns}` format
- **Foreign Keys**: `fk_{table}_{column}_{target}` format, declared via `foreignKey({...}).onDelete(...)` in the constraints array (never inline `.references()`)
- **Migration Safety**: Non-destructive changes with data preservation

**Data Safety Requirements**

- **Backup Procedures**: For production/multi-user deployments, ensure a pre-migration DB file snapshot exists. Formal backup/recovery-window procedures are N/A for single-user local tools (a SQLite file is trivially copyable).
- **Validation Checks**: Data integrity validation throughout migration process
- **Testing Protocols**: Testing in development before production deployment
- **Monitoring**: Real-time monitoring during migration execution (scaling guidance; N/A for small single-team apps)

## Table of Contents

### Setup

1. [Pre-Audit Setup](#pre-audit-setup)

### Critical Migration Standards

2. [Database Location Rules](#database-location-rules)
3. [Migration Safety Procedures](#migration-safety-procedures)
4. [Schema Versioning and Compatibility](#schema-versioning-and-compatibility)
5. [Data Integrity Validation](#data-integrity-validation)
6. [Performance Impact Assessment](#performance-impact-assessment)

### Best Practices

7. [Schema Design Patterns](#schema-design-patterns)
8. [Migration Planning and Execution](#migration-planning-and-execution)
9. [Rollback Strategies](#rollback-strategies)

### spernakit-web Variant

10. [Worker / Single-Writer Concurrency Model](#worker--single-writer-concurrency-model)
11. [Hand-Written SQL Migration Registry Integrity](#hand-written-sql-migration-registry-integrity)

### Common Anti-Patterns

12. [Migration Anti-Patterns to Avoid](#migration-anti-patterns-to-avoid)

### Spernakit Reference

13. [Spernakit Applicability](#spernakit-applicability)
14. [Audit Checklist](#audit-checklist)
15. [Success Criteria](#success-criteria)
16. [Feature.json Generation](#featurejson-generation)
17. [Report Template](#report-template)
18. [Deliverables](#deliverables)

## Pre-Audit Setup

### Detection: Which Migration Profile?

Before auditing, determine which Spernakit database profile the target uses. The two profiles have materially different migration tooling; applying the wrong profile's rules produces false findings.

```bash
# 1. Locate the database file (must be data/ at root, never backend/data/)
ls data/*.db

# 2. Does the full-stack dual-dialect config key exist?
grep -r "config.database.dialect" backend/src config/ 2>/dev/null

# 3. Does the drizzle-kit auto-migration runner exist? (full-stack profile)
ls backend/src/db/autoMigrate.ts backend/src/db/autoSeed.ts 2>/dev/null

# 4. Does the hand-written SQL migration registry exist? (spernakit-web variant)
ls backend/src/db/migrations/registry.ts backend/src/db/migrate.ts 2>/dev/null
ls backend/src/db/migrations/*.sql 2>/dev/null
```

- **Full-stack Spernakit profile**: `config.database.dialect` present, `autoMigrate.ts` / `autoSeed.ts` present, `db:generate` / `db:migrate` script suite available.
- **spernakit-web variant** (e.g., aidd itself): no `config.database.dialect`, no `autoMigrate.ts` / `autoSeed.ts`, no `db:*` script suite; instead hand-written `db/migrations/*.sql` + `db/migrations/registry.ts` applied by a custom `db/migrate.ts` runner against a `schema_migrations` ledger, with SQLite running in a Bun worker (single-writer model).

## Database Location Rules

### CRITICAL: data/ Directory Rule

**Database files MUST reside in `data/` at the project root. NEVER in `backend/data/`.**

```
project-root/
├── data/                    # ✅ CORRECT: Database files here
│   ├── myapp.db             # SQLite database
│   └── myapp.db-wal         # SQLite WAL file
├── backend/
│   ├── src/
│   │   └── db/
│   │       └── schema/      # ✅ Schema definitions (code, not data)
│   └── data/                # ❌ NEVER: No database files here
└── config/
    └── myapp.json           # Database URL: "file:./data/myapp.db"
```

**Config reference**: The `config.database.url` setting must point to `data/` at root:

```json
{
	"database": {
		"allowDbPush": false,
		"url": "file:./data/myapp.db"
	}
}
```

> `dialect` (`sqlite` | `postgres`) is a **full-stack Spernakit profile** key only; the spernakit-web variant has no `config.database.dialect` block.

## Migration Safety Procedures

### CRITICAL: Pre-Migration Safety Checklist

**Mandatory Steps (100% Compliance Required)**:

> **Variant note (spernakit-web / worker single-writer)**: The inline Drizzle examples below are scoped to the **full-stack Spernakit profile**. In the worker-backed variant (SQLite in a Bun worker), all writes are serialized through the worker/command layer; batched migration writes MUST be expressed as DB worker commands in `db/commands.ts`. Do NOT call `db.transaction()` or per-row `db.update()` directly from request context; that violates the single-writer model. See [Worker / Single-Writer Concurrency Model](#worker--single-writer-concurrency-model).

```typescript
// ✅ CORRECT: Safe migration pattern with Drizzle ORM (full-stack profile)
import { db } from '../db';
import { users } from '../db/schema/users';
import { eq, isNull, sql } from 'drizzle-orm';

interface MigrationResult {
	completed: boolean;
	errors: string[];
	processed: number;
}

async function migrateUserSchema(batchSize = 50, dryRun = false): Promise<MigrationResult> {
	// 1. Validate current schema state
	const schemaVersion = await db
		.select()
		.from(settings)
		.where(eq(settings.key, 'schema_version'))
		.get();

	if (!schemaVersion || schemaVersion.value !== '1.0') {
		throw new Error('Invalid schema version for migration');
	}

	// 2. Get batch of records to migrate
	const batch = await db.select().from(users).where(eq(users.migrated, false)).limit(batchSize);

	if (batch.length === 0) {
		return { completed: true, errors: [], processed: 0 };
	}

	const errors: string[] = [];
	let processed = 0;

	// 3. Process each record with validation
	for (const user of batch) {
		try {
			if (!user.email || !user.name) {
				errors.push(`Invalid user data: ${user.id}`);
				continue;
			}

			if (dryRun) {
				processed++;
				continue;
			}

			await db
				.update(users)
				.set({
					displayName: user.name,
					email: user.email.toLowerCase(),
					migrated: true,
					migratedAt: new Date(),
					migrationVersion: '2.0',
				})
				.where(eq(users.id, user.id));

			processed++;
		} catch (error) {
			errors.push(`Migration failed for ${user.id}: ${(error as Error).message}`);
		}
	}

	return { completed: batch.length < batchSize, errors, processed };
}
```

### Rollback Procedures

**Every migration MUST have a corresponding rollback function**:

```typescript
// ✅ CORRECT: Rollback function with Drizzle
interface RollbackResult {
	completed: boolean;
	processed: number;
}

async function rollbackUserSchema(batchSize = 50): Promise<RollbackResult> {
	const batch = await db
		.select()
		.from(users)
		.where(eq(users.migrationVersion, '2.0'))
		.limit(batchSize);

	for (const user of batch) {
		await db
			.update(users)
			.set({
				displayName: null,
				migrated: false,
				migratedAt: null,
				migrationVersion: '1.0',
				name: user.displayName,
			})
			.where(eq(users.id, user.id));
	}

	return { completed: batch.length < batchSize, processed: batch.length };
}
```

## Schema Versioning and Compatibility

### Version Management Strategy

Spernakit ships **two distinct migration profiles**. Detect which one applies (see [Pre-Audit Setup](#pre-audit-setup)) before auditing; they share no tooling.

**Profile A - Full-stack Spernakit (drizzle-kit)**:

- **Development**: Use `bun run db:generate` to generate migration SQL from schema changes
- **Production**: Use transaction-wrapped migrations via `bun run db:migrate`
- **SQLite auto-migration**: SQLite databases auto-apply pending migrations on startup (`autoMigrate.ts`)
- **Auto-seed**: Empty databases auto-seed when the users table is empty (`autoSeed.ts`)

```bash
# Migration workflow commands (full-stack profile)
bun run db:generate          # Generate migration SQL from schema changes
bun run db:migrate           # Apply pending migrations (transaction-wrapped)
bun run db:migrate:status    # Show migration status
bun run db:migrate:baseline  # Mark migrations as applied (for existing dbs)
```

**Profile B - spernakit-web variant (hand-written SQL registry)**:

- Schema IS still defined with Drizzle (`sqliteTable()` in `db/schema/*`), but migrations are **NOT** generated by drizzle-kit.
- Migrations are **hand-written SQL files** in `db/migrations/*.sql`, registered in `db/migrations/registry.ts`, and applied by a custom runner `db/migrate.ts` against a custom `schema_migrations(version, applied_at)` ledger.
- There is **NO** `db:generate` / `db:migrate` / `db:migrate:status` / `db:migrate:baseline` / `db:push` / `db:seed` script suite, **NO** `config.database.dialect`, and **NO** `autoMigrate.ts` / `autoSeed.ts`.
- Auditing a Profile B app against Profile A's commands yields false "missing migration tooling" findings; do not flag the absence of `db:*` scripts here. See [Hand-Written SQL Migration Registry Integrity](#hand-written-sql-migration-registry-integrity).

### Schema Version Tracking

```typescript
// ✅ CORRECT: Drizzle schema with version tracking
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const metadata = sqliteTable('metadata', {
	id: text('id').primaryKey(),
	key: text('key').notNull().unique(),
	updatedAt: integer('updated_at', { mode: 'timestamp' })
		.notNull()
		.$defaultFn(() => new Date()),
	value: text('value').notNull(),
});

const users = sqliteTable(
	'users',
	{
		id: text('id').primaryKey(),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		displayName: text('display_name'), // v2.0 field (optional for migration)
		email: text('email').notNull().unique(),
		migrated: integer('migrated', { mode: 'boolean' }).notNull().default(false),
		migrationVersion: text('migration_version'),
		name: text('name').notNull(), // v1.0 field
	},
	(table) => [
		index('idx_users_email').on(table.email),
		index('idx_users_migrated').on(table.migrated),
		index('idx_users_migration_version').on(table.migrationVersion),
	],
);
```

### Backward Compatibility Patterns

```typescript
// ✅ CORRECT: Backward compatible field access with Drizzle
interface UserResponse {
	displayName: string;
	email: string;
	id: string;
}

async function getUser(userId: string): Promise<UserResponse | null> {
	const user = await db.select().from(users).where(eq(users.id, userId)).get();

	if (!user) return null;

	return {
		displayName: user.displayName || user.name || 'Unknown User',
		email: user.email,
		id: user.id,
	};
}
```

## Data Integrity Validation

### Validation Procedures

**Pre-Migration Validation**:

```typescript
import { count, sql } from 'drizzle-orm';

interface ValidationResult {
	issues: string[];
	valid: boolean;
}

async function validatePreMigration(): Promise<ValidationResult> {
	const issues: string[] = [];

	// Check for required fields
	const usersWithoutEmail = await db
		.select({ count: count() })
		.from(users)
		.where(isNull(users.email))
		.get();

	if (usersWithoutEmail && usersWithoutEmail.count > 0) {
		issues.push(`${usersWithoutEmail.count} users missing email`);
	}

	// Check for duplicate emails using raw SQL
	const duplicates = await db.all<{ cnt: number; email: string }>(
		sql`SELECT email, COUNT(*) as cnt FROM users GROUP BY email HAVING cnt > 1`,
	);

	if (duplicates.length > 0) {
		issues.push(`${duplicates.length} duplicate email addresses found`);
	}

	return { issues, valid: issues.length === 0 };
}
```

## Performance Impact Assessment

> **Scope note**: Sampled migration-timing instrumentation and time-windowed performance monitoring are **scaling guidance** for large/multi-user deployments. They are **N/A for small single-team apps**, where the migration workload is too small for timing instrumentation to surface a real defect — this audit has never produced a performance finding against such a target. Treat the associated checklist items as optional, not required, for self-hosted single-user tools.

### Migration Performance Monitoring

```typescript
interface PerformanceMetrics {
	estimatedDuration: number;
	recordCount: number;
	startTime: number;
}

async function monitorMigrationPerformance(migrationName: string): Promise<PerformanceMetrics> {
	const startTime = Date.now();

	// Sample migration performance
	const sampleSize = 10;
	const sampleStart = Date.now();

	const sampleUsers = await db
		.select()
		.from(users)
		.where(eq(users.migrated, false))
		.limit(sampleSize);

	for (const user of sampleUsers) {
		await new Promise((resolve) => setTimeout(resolve, 1));
	}

	const sampleDuration = Date.now() - sampleStart;
	const avgTimePerRecord = sampleDuration / sampleSize;

	const totalResult = await db
		.select({ count: count() })
		.from(users)
		.where(eq(users.migrated, false))
		.get();

	const totalRecords = totalResult?.count ?? 0;
	const estimatedDuration = avgTimePerRecord * totalRecords;

	console.log(`Migration ${migrationName} performance:`, {
		avgTimePerRecord,
		estimatedDuration,
		totalRecords,
	});

	return { estimatedDuration, recordCount: totalRecords, startTime };
}
```

### Performance Optimization Strategies

1. **Batch Processing**: Process records in small batches (50-100 records)
2. **Index Optimization**: Ensure proper indexes for migration queries
3. **Parallel Processing**: Use multiple migration functions for independent data
4. **Progress Tracking**: Monitor and report migration progress
5. **Resource Management**: Limit concurrent migrations to prevent overload

## Schema Design Patterns

### Schema Design Best Practices

```typescript
// ✅ CORRECT: Well-designed Drizzle schema
import { foreignKey, index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

const users = sqliteTable(
	'users',
	{
		id: text('id').primaryKey(),
		// Core fields
		avatar: text('avatar'),
		createdAt: integer('created_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		displayName: text('display_name'),
		email: text('email').notNull().unique(),
		preferences: text('preferences', { mode: 'json' }),
		// Soft delete fields (core entities)
		deletedAt: integer('deleted_at', { mode: 'timestamp' }),
		deletedBy: text('deleted_by'),
		isDeleted: integer('is_deleted', { mode: 'boolean' }).notNull().default(false),
		// Migration tracking
		lastMigrated: integer('last_migrated', { mode: 'timestamp' }),
		schemaVersion: text('schema_version'),
	},
	(table) => [
		index('idx_users_email').on(table.email),
		index('idx_users_created_at').on(table.createdAt),
		index('idx_users_schema_version').on(table.schemaVersion),
	],
);

// Separate table for complex relationships
const userProfiles = sqliteTable(
	'user_profiles',
	{
		id: text('id').primaryKey(),
		bio: text('bio'),
		location: text('location'),
		updatedAt: integer('updated_at', { mode: 'timestamp' })
			.notNull()
			.$defaultFn(() => new Date()),
		userId: text('user_id').notNull().unique(),
		website: text('website'),
	},
	(table) => [
		index('idx_user_profiles_user_id').on(table.userId),
		// ✅ CORRECT: named, column-qualified FK via foreignKey({...}) — never inline .references()
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_user_profiles_user_id_users',
		}).onDelete('cascade'),
	],
);
```

### Relationship Query Patterns

```typescript
// ✅ CORRECT: Efficient relationship queries with Drizzle
interface UserWithProfile {
	profile?: {
		bio: string | null;
		location: string | null;
	};
	user: {
		displayName: string | null;
		email: string;
		id: string;
	};
}

async function getUserWithProfile(userId: string): Promise<UserWithProfile | null> {
	const result = await db
		.select({
			profile: {
				bio: userProfiles.bio,
				location: userProfiles.location,
			},
			user: {
				displayName: users.displayName,
				email: users.email,
				id: users.id,
			},
		})
		.from(users)
		.leftJoin(userProfiles, eq(users.id, userProfiles.userId))
		.where(eq(users.id, userId))
		.get();

	if (!result) return null;

	return {
		profile: result.profile.bio !== null ? result.profile : undefined,
		user: result.user,
	};
}
```

### Database Naming Conventions

| Element      | Convention                             | Example                                    |
| ------------ | -------------------------------------- | ------------------------------------------ |
| Column names | snake_case in DB, camelCase in Drizzle | `created_at` / `createdAt`                 |
| Table names  | Plural snake_case                      | `users`, `audit_logs`, `workspace_members` |
| Indexes      | `idx_{table}_{columns}`                | `idx_users_email`                          |
| Foreign keys | `fk_{table}_{column}_{target}`         | `fk_audit_logs_user_id_users`              |

> Foreign keys MUST be declared via `foreignKey({ columns, foreignColumns, name }).onDelete(...)` in the constraints array, never inline `.references()` (which produces anonymous constraints). The column-qualified name disambiguates multiple FKs pointing at the same target (e.g., `created_by`, `updated_by`, `deleted_by` all referencing `users`).

### CHECK Constraints (Standard)

CHECK constraints are a first-class data-integrity standard, not an optional nicety. Enforce domain invariants at the database layer so invalid rows cannot exist regardless of which code path writes them.

- **Status / enum columns**: constrain to the allowed set (e.g., `CHECK (status IN ('pending','running','completed','failed'))`).
- **JSON-validity guards**: for columns holding JSON (e.g., a `settings.value` blob), guard with `CHECK (json_valid(value))` so malformed JSON cannot be persisted.
- **Numeric / ordinal bounds**: constrain ordinals and counters where a negative or zero value is meaningless (e.g., `CHECK (display_order >= 0)`).

```typescript
import { check, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { sql } from 'drizzle-orm';

const runs = sqliteTable(
	'runs',
	{
		id: text('id').primaryKey(),
		status: text('status').notNull(),
		settings: text('settings', { mode: 'json' }),
	},
	(table) => [
		check('ck_runs_status', sql`${table.status} IN ('pending','running','completed','failed')`),
		check(
			'ck_runs_settings_json',
			sql`${table.settings} IS NULL OR json_valid(${table.settings})`,
		),
	],
);
```

> Flag status/enum and JSON columns that lack a backing CHECK constraint, including status enums and `settings.value` JSON validity.

> **Cross-reference**: [SCHEMA_CONSTRAINTS.md](./SCHEMA_CONSTRAINTS.md) also covers value-domain CHECK constraints (enum-like text columns and `json_valid()` guards) under its constraint-correctness scope. The two audits overlap intentionally here; no scope move.

## Migration Planning and Execution

### Migration Execution Checklist

**Phase 1: Planning (Required)**

- [ ] Document current schema state
- [ ] Design target schema with backward compatibility
- [ ] Create migration and rollback functions
- [ ] Estimate migration time and resource requirements (scaling concern; optional for small single-team apps)
- [ ] Plan maintenance window if needed (production/multi-user only)
- [ ] Verify database is in `data/` at project root (not `backend/data/`)

**Phase 2: Testing (Required)**

- [ ] Test migration on development data
- [ ] Validate data integrity after migration
- [ ] Test rollback procedures
- [ ] Performance test with production-sized datasets
- [ ] Test application functionality with new schema

**Phase 3: Execution (Required)**

- [ ] Create pre-migration DB file snapshot (required for production/multi-user; N/A for single-user local tools)
- [ ] Execute pre-migration validation
- [ ] Run migration in batches with monitoring
- [ ] Validate data integrity post-migration
- [ ] Update application code if needed
- [ ] Document migration completion

**Phase 4: Monitoring (Required)**

- [ ] Monitor application performance post-migration
- [ ] Track error rates and user feedback
- [ ] Verify all features work with new schema
- [ ] Clean up old schema fields after validation period

## Rollback Strategies

### Rollback Decision Matrix

> **Scope note**: The time-windowed matrix below (`<5 minutes`, maintenance windows) is **enterprise-scale guidance** — the windows only bind where a rollback's duration is itself an outage. For small single-team apps that constraint does not apply, and this audit has never produced a rollback-timing finding against one. Treat the time windows as illustrative, not enforced.

| Scenario                    | Rollback Strategy                   | Risk Level | Time Window |
| --------------------------- | ----------------------------------- | ---------- | ----------- |
| **Data Corruption**         | Immediate rollback + restore backup | CRITICAL   | <5 minutes  |
| **Performance Degradation** | Gradual rollback with monitoring    | HIGH       | <30 minutes |
| **Feature Regression**      | Rollback + hotfix deployment        | MEDIUM     | <2 hours    |
| **Minor Issues**            | Forward fix or scheduled rollback   | LOW        | <24 hours   |

### Emergency Rollback Procedures

```typescript
// ✅ CORRECT: Emergency rollback with validation using Drizzle
interface EmergencyRollbackResult {
	affectedRecords: number;
	message: string;
	success: boolean;
}

async function emergencyRollback(
	migrationId: string,
	reason: string,
	validateOnly = false,
): Promise<EmergencyRollbackResult> {
	console.error(`Emergency rollback initiated: ${reason}`);

	const migrationStatus = await db
		.select()
		.from(migrations)
		.where(eq(migrations.migrationId, migrationId))
		.get();

	if (!migrationStatus || migrationStatus.status !== 'completed') {
		return {
			affectedRecords: 0,
			message: 'Migration not found or not in rollback-able state',
			success: false,
		};
	}

	if (validateOnly) {
		const result = await db
			.select({ count: count() })
			.from(users)
			.where(eq(users.migrationVersion, migrationStatus.targetVersion))
			.get();

		return {
			affectedRecords: result?.count ?? 0,
			message: `Rollback validation successful. ${result?.count ?? 0} records would be affected.`,
			success: true,
		};
	}

	// Execute rollback in batches
	let processedCount = 0;
	const batchSize = 50;

	while (true) {
		const batch = await db
			.select()
			.from(users)
			.where(eq(users.migrationVersion, migrationStatus.targetVersion))
			.limit(batchSize);

		if (batch.length === 0) break;

		for (const record of batch) {
			await db
				.update(users)
				.set({
					migrationVersion: migrationStatus.sourceVersion,
				})
				.where(eq(users.id, record.id));
			processedCount++;
		}
	}

	// Update migration status
	await db
		.update(migrations)
		.set({
			rollbackReason: reason,
			rolledBackAt: new Date(),
			status: 'rolled_back',
		})
		.where(eq(migrations.id, migrationStatus.id));

	return {
		affectedRecords: processedCount,
		message: `Rollback completed successfully. ${processedCount} records restored.`,
		success: true,
	};
}
```

## Worker / Single-Writer Concurrency Model

> **Applies to**: spernakit-web variant (SQLite in a Bun worker). Skip for the full-stack profile.

In the spernakit-web variant, SQLite runs inside a Bun worker behind a writer lock (`db/worker/`, `db/writerLock.ts`, `db/retry.ts`). This single-writer serialization is the dominant correctness concern for the variant. Audit the following:

- [ ] **All writes serialized through the worker/command layer**: every mutation is a command defined in `db/commands.ts`; no direct writes from request handlers.
- [ ] **No `db.transaction()` in request handlers**: ad-hoc transactions in request context are banned; transactions are expressed as queued worker commands.
- [ ] **Busy-timeout + retry on `SQLITE_BUSY`**: the worker sets a busy timeout and retries on contention (`db/retry.ts`) rather than failing the request.
- [ ] **WAL checkpoint behavior**: WAL mode is enabled and checkpointing is bounded so the `-wal` file does not grow unbounded.
- [ ] **No second writer connection**: only the worker holds a writable handle; request-side connections are read-only or routed through the worker.

## Hand-Written SQL Migration Registry Integrity

> **Applies to**: spernakit-web variant (`db/migrations/registry.ts`). Skip for the full-stack profile.

The variant's migration model is a hand-written, append-only SQL registry applied by a custom runner. Audit the following:

- [ ] **Append-only, monotonic versions**: migration version strings are ordered and never reused or reordered; new migrations append only.
- [ ] **Static `{ type: 'file' }` imports**: `.sql` files are imported in `registry.ts` with `{ type: 'file' }` so `bun build --compile` embeds them. Dynamic `readFileSync` silently breaks compiled binaries and MUST be flagged.
- [ ] **`schema_migrations` ledger present**: a `schema_migrations(version, applied_at)` table tracks applied migrations; the runner consults it for idempotency.
- [ ] **FK-disable/restore correctness around rebuilds**: table-rebuild migrations toggle foreign-key enforcement OFF then restore it; verify the toggle is balanced and scoped.
- [ ] **Integrity re-check after apply**: the runner re-validates integrity after applying (e.g., `assertNoForeignKeyViolations`) so a rebuild cannot leave dangling references.

## Migration Anti-Patterns to Avoid

### NEVER DO: Destructive Migrations

```typescript
// ❌ BAD: Destructive migration without backup
async function badMigration(): Promise<void> {
	const allUsers = await db.select().from(users);
	for (const user of allUsers) {
		// NEVER: Drop fields without archiving
		await db.update(users).set({ oldField: null }).where(eq(users.id, user.id));
	}
}

// ✅ GOOD: Safe field removal with archiving
async function safeFieldRemoval(): Promise<void> {
	const usersWithOldField = await db
		.select()
		.from(users)
		.where(sql`${users.oldField} IS NOT NULL`);

	for (const user of usersWithOldField) {
		// Archive old data before removal
		await db.insert(archivedUserData).values({
			archivedAt: new Date(),
			fieldName: 'oldField',
			userId: user.id,
			value: user.oldField,
		});

		await db.update(users).set({ oldField: null }).where(eq(users.id, user.id));
	}
}
```

### NEVER DO: Large Batch Migrations

```typescript
// ❌ BAD: Process all records at once
async function badBatchMigration(): Promise<void> {
	const allUsers = await db.select().from(users); // Could be thousands!
	for (const user of allUsers) {
		await db.update(users).set({/* changes */}).where(eq(users.id, user.id));
	}
}

// ✅ GOOD: Small batch processing
async function goodBatchMigration(
	batchSize = 50,
): Promise<{ hasMore: boolean; processed: number }> {
	const batch = await db.select().from(users).where(eq(users.migrated, false)).limit(batchSize);

	for (const user of batch) {
		await db.update(users).set({/* changes */}).where(eq(users.id, user.id));
	}

	return { hasMore: batch.length === batchSize, processed: batch.length };
}
```

### NEVER DO: Database in Wrong Location

```typescript
import { Database } from 'bun:sqlite';
import { drizzle } from 'drizzle-orm/bun-sqlite';

// ❌ BAD: Database in backend/data/
const db = drizzle(new Database('backend/data/myapp.db'));

// ✅ GOOD: Database in data/ at project root
const db = drizzle(new Database('data/myapp.db'));
// Or via config: config.database.url = "file:./data/myapp.db"
```

## Spernakit Applicability

> Spernakit has two database profiles. The SQLite/dual-dialect notes below describe the **full-stack Spernakit profile**. The **spernakit-web variant** (e.g., aidd itself) diverges materially; see its dedicated subsection. Detect the profile via [Pre-Audit Setup](#pre-audit-setup) before applying any rule.

### Full-Stack Profile: SQLite-Specific Considerations

- **Auto-migration**: SQLite databases auto-apply pending migrations on startup via `autoMigrate.ts`
- **Auto-seed**: Empty databases auto-seed when the users table is empty via `autoSeed.ts`
- **WAL mode**: SQLite uses WAL (Write-Ahead Logging) for better concurrent read performance
- **Manual operations**: `db:migrate`, `db:seed` only needed for PostgreSQL or explicit control

### Spernakit-Web Variant

The spernakit-web variant (project type `[typescript+spernakit-web]`, e.g., aidd) keeps Drizzle for schema definition but diverges from the full-stack profile in every other database respect:

- **Schema**: defined with Drizzle (`sqliteTable()` in `db/schema/*`); ORM stance unchanged.
- **Migrations**: hand-written SQL files in `db/migrations/*.sql`, registered in `db/migrations/registry.ts`, applied by a custom `db/migrate.ts` runner against a `schema_migrations(version, applied_at)` ledger. NOT generated by drizzle-kit.
- **No `db:*` script suite**: no `db:generate` / `db:migrate` / `db:migrate:status` / `db:migrate:baseline` / `db:push` / `db:seed`.
- **No dual-dialect**: no `config.database.dialect`; SQLite only.
- **No auto-migration/auto-seed runners**: no `autoMigrate.ts` / `autoSeed.ts`.
- **Worker single-writer model**: SQLite runs in a Bun worker; transactions MUST be commands in `db/commands.ts`, never `db.transaction()` from request context. See [Worker / Single-Writer Concurrency Model](#worker--single-writer-concurrency-model) and [Hand-Written SQL Migration Registry Integrity](#hand-written-sql-migration-registry-integrity).
- **Database location**: confirmed at `data/aidd-panel.db` (root `data/`), consistent with the location rule.

Do NOT flag a spernakit-web app for "missing migration tooling," "missing `autoMigrate.ts`," or "missing `config.database.dialect`"; those belong only to the full-stack profile.

### Dual-Dialect Support (Full-Stack Profile)

Spernakit supports both SQLite and PostgreSQL via `config.database.dialect`:

- Use `sqliteTable()` for SQLite-specific schemas
- Use `pgTable()` for PostgreSQL-specific schemas
- Shared schema patterns work across both dialects
- Test migrations against both dialects when supporting dual deployment

### Drizzle vs Prisma

Spernakit uses **Drizzle ORM** (NOT Prisma) because:

- No codegen step: schema changes are immediate
- Direct SQL access when needed via `sql` tagged template
- Type-safe queries without a generated client
- Better SQLite support and lighter runtime

## Audit Checklist

### Critical Checks

- [ ] Database files are in `data/` at project root (NEVER `backend/data/`)
- [ ] No destructive migrations without backup procedures
- [ ] All migrations have rollback capability
- [ ] Pre-migration validation passes
- [ ] No data corruption or loss during migration
- [ ] Schema uses Drizzle ORM patterns (not Prisma)

### High Priority Checks

- [ ] Schema changes are backward compatible
- [ ] Migration uses batch processing (50 records per batch)
- [ ] Data integrity validation passes post-migration
- [ ] Database naming conventions followed (snake_case columns, plural tables)
- [ ] Foreign keys named `fk_{table}_{column}_{target}` and declared via `foreignKey({...})` (never inline `.references()`)
- [ ] Status/enum and JSON columns backed by CHECK constraints

### spernakit-web Variant Checks (when applicable)

- [ ] All writes serialized through the worker/command layer (no `db.transaction()` in request handlers)
- [ ] Busy-timeout + retry on `SQLITE_BUSY` present
- [ ] Migration registry is append-only with monotonic versions and static `{ type: 'file' }` imports
- [ ] `schema_migrations` ledger present; integrity re-checked after apply
- [ ] No false flags for missing `db:*` scripts / `autoMigrate.ts` / `config.database.dialect`

### Medium Priority Checks

- [ ] Migration documentation complete
- [ ] Testing performed in development environment
- [ ] Monitoring active during migration execution
- [ ] Old fields archived before removal

### Low Priority Checks

- [ ] Migration metrics logged for future reference
- [ ] Schema version history maintained
- [ ] Cleanup schedule established for deprecated fields
- [ ] Performance impact assessed (scaling concern; optional for small single-team apps)

## Success Criteria

### Quality Gates

1. **Pre-Migration**: All validation checks pass
2. **During Migration**: Real-time monitoring shows healthy metrics
3. **Post-Migration**: Data integrity validation passes
4. **Application Testing**: All features work with new schema
5. **Performance Validation**: No significant performance regression

## Feature.json Generation

### Output Format

For each finding requiring code changes, generate a feature.json in `.aidd/features/audit-database-{timestamp}-{slug}/`:

```json
{
	"auditFinding": {
		"evidence": "backend/src/db/migrations/0007_add_runs_table.sql:12",
		"issue": "missing_rollback_procedure",
		"risk": "irreversible_destructive_migration",
		"table": "runs"
	},
	"auditSeverity": "high",
	"auditSource": "DATABASE",
	"category": "Backend",
	"createdAt": "2026-06-28T00:00:00.000Z",
	"description": "AUDIT FINDING [High]: The migration that drops the legacy `runs.legacy_state` column has no corresponding rollback path and archives no data before removal...",
	"id": "audit-database-{timestamp}-{slug}",
	"priority": 2,
	"spec": "1. Add an archiving step that copies legacy_state into archived_run_data before removal\n2. Provide a rollback migration that restores the column from the archive...",
	"status": "backlog",
	"title": "Add Rollback and Archiving to runs Migration",
	"updatedAt": "2026-06-28T00:00:00.000Z"
}
```

**NOTE: The `id` field MUST start with `audit-` and match the directory name.**

### Severity Mapping

| Issue Type                                            | Severity | Priority |
| ----------------------------------------------------- | -------- | -------- |
| Destructive migration without backup/archiving        | Critical | 1        |
| Database file in `backend/data/` (wrong location)     | Critical | 1        |
| Migration missing rollback capability                 | High     | 2        |
| Status/enum or JSON column lacking a CHECK constraint | High     | 2        |
| `db.transaction()` in request context (single-writer) | High     | 2        |
| Non-batched / unbounded migration write               | Medium   | 3        |
| Missing migration documentation                       | Low      | 4        |

### Template Escalation

When escalating to template (spernakit), use this ID format:

```
spernakit-{YYYYMMDD}-{slug}
```

Include `spernakit_version` field with current template version.

## Report Template

```markdown
# Database Migration Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Migration Health**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Data Integrity Status**: [PASS/FAIL]

### Migration Status Overview

- **Schema Version**: [Current] -> [Target]
- **ORM**: Drizzle (sqliteTable/pgTable)
- **Database Location**: data/ at project root [PASS/FAIL]
- **Records Migrated**: [Number]
- **Migration Duration**: [Time]
- **Rollback Capability**: [Yes/No]

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

## Schema Analysis

### Current Schema State

- **Tables**: [List]
- **Indexes**: [Count]
- **Relationships**: [Summary]
- **Database Dialect**: [SQLite/PostgreSQL]

### Migration Validation

| Check                    | Status      | Notes     |
| ------------------------ | ----------- | --------- |
| Pre-migration validation | [PASS/FAIL] | [Details] |
| Data integrity           | [PASS/FAIL] | [Details] |
| Performance impact       | [PASS/FAIL] | [Details] |
| Rollback tested          | [PASS/FAIL] | [Details] |
| Database in data/        | [PASS/FAIL] | [Details] |

## Recommendations

### Immediate Actions (0-7 days)

1. [Critical fixes]

### Short-term Actions (1-4 weeks)

1. [Important improvements]

### Long-term Actions (1-3 months)

1. [Strategic enhancements]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Deliverables

### Required Outputs

- **Database Migration Audit Report**: Comprehensive analysis of schema, migration safety, and data integrity
- **Feature.json files** for each finding in `.aidd/features/audit-database-{timestamp}-{slug}/`
- **Remediation summary**: Prioritized list of fixes (immediate / short-term / long-term) with rollback and migration plans

### Success Criteria

- **Database files** confirmed in `data/` at project root (never `backend/data/`)
- **All migrations** have rollback capability and pass pre/post integrity validation
- **Status/enum and JSON columns** backed by CHECK constraints
- **All findings** have a remediation spec

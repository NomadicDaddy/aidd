---
title: 'Data Architecture, Single Source of Truth, and Scheduled Tasks Audit'
last_updated: '2026-06-28'
version: '2.4'
category: 'Core Architecture'
priority: 'Critical'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
consolidates: 'TRUTH.md, SCHEDULED_TASKS.md'
---

# Data Architecture Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.
>
> **Related Audits**: See [DATABASE.md](./DATABASE.md) for detailed migration procedures, rollback strategies, and schema versioning, and [SCHEMA_CONSTRAINTS.md](./SCHEMA_CONSTRAINTS.md) for constraint, index, and foreign-key invariants (both are Critical Core-Architecture peers). This audit focuses on Single Source of Truth and scheduled task patterns.

## Executive Summary

**🎯 Critical Data Architecture Priorities**

- **Single Source of Truth (SSOT)**: One authoritative place for each data category with clear ownership
- **Authority Boundaries**: Clear separation between Environment (build-time), User (runtime/local), and System (database) authorities
- **Database Integrity**: Safe migrations, proper indexing, and data validation
- **Scheduled Tasks**: Eliminate client-side polling, use backend scheduled tasks and real-time subscriptions
- **Runtime Alignment**: Runtime behavior perfectly matches authority design

**📋 Essential Standards (Required)**

- **Configuration Tiers**: Clear separation between build-time, runtime, and database configuration
- **Data Model Authority**: Single authoritative source for all business data
- **Schema Safety**: Non-destructive migrations with proper validation and rollback procedures
- **Query Performance**: All database operations use proper indexes and bounded queries
- **Real-time Updates**: Use backend's reactive capabilities instead of polling

**⚡ Architecture Requirements**

- **Authority Clarity**: Every domain has a single, clearly documented authority
- **Consistency**: 100% of consumers read from designated authority
- **No Duplication**: Zero duplicate registries or parallel interfaces
- **Schema Quality**: All queries use proper indexes, no in-memory filtering
- **Scheduled Tasks**: Proper background job patterns, no browser-initiated heavy operations

## Table of Contents

1. [Pre-Audit Setup](#pre-audit-setup)
2. [Single Source of Truth Assessment](#single-source-of-truth-assessment)
3. [Database Design and Migration Safety](#database-design-and-migration-safety)
4. [Scheduled Tasks and Polling Elimination](#scheduled-tasks-and-polling-elimination)
5. [Spernakit Applicability](#spernakit-applicability)
6. [Audit Checklist](#audit-checklist)
7. [Feature.json Generation](#featurejson-generation)
8. [Report Template](#report-template)
9. [Deliverables](#deliverables)

## Pre-Audit Setup

### Required Tools and Access

- Access to codebase: `backend/src/**`, `frontend/src/**`, configuration files, database schema
- Database schema: Drizzle schema files in `backend/src/db/schema/`
- Backend routes: Elysia route handlers in `backend/src/routes/`
- Build/quality gates: `bun run smoke:qc` (typecheck + lint + build + format + dep versions)
- Version control: Git for history and dependency analysis

### Verification Commands

```bash
# Full quality baseline
bun run smoke:qc

# Build validation
bun run build

# Lint validation
bun run lint

# Type check validation
bun run typecheck

# SQLite / PostgreSQL schema parity
bun run check:schema-parity
```

> **Note**: The search commands below are illustrative pseudo-commands. The canonical aidd/Spernakit environment is Windows/PowerShell, where POSIX `grep` is unavailable; prefer `rg` (ripgrep) and adapt globs to your shell. `rg` equivalents are shown inline.

```bash
# Search for polling patterns
# rg: rg -t ts -t tsx "setInterval|setTimeout" frontend/src backend/src
grep -r "setInterval\|setTimeout" --include="*.ts" --include="*.tsx" frontend/src/ backend/src/

# Search for authority conflicts
# rg: rg -t ts "DEFAULT_|FALLBACK_" backend/src frontend/src
grep -r "DEFAULT_\|FALLBACK_" --include="*.ts" backend/src/ frontend/src/

# Search for in-memory filtering patterns
# rg: rg -t ts "\.all\(\)" backend/src | rg -v "count\(\)|sum\(\)|avg\(\)"
grep -r "\.all()" --include="*.ts" backend/src/ | grep -v "count()\|sum()\|avg()"
```

## Single Source of Truth Assessment

### Authority Inventory

**Step 1: Enumerate Authorities by Domain**

Create an authority map for each data domain:

| Domain        | Authority   | Files/Tables                                        | Consumers                                  |
| ------------- | ----------- | --------------------------------------------------- | ------------------------------------------ |
| AI Providers  | Database    | `backend/src/routes/ai-providers.ts`, `aiProviders` | `frontend/src/hooks/useProviders.ts`       |
| Feature Flags | JSON Config | `config/{slug}.json`, `bunfig.toml`                 | `backend/src/config/`, `import.meta.env`   |
| User Quotas   | Database    | `backend/src/routes/quotas.ts`, `userQuotas` table  | `frontend/src/components/QuotaDisplay.tsx` |

### Authority Boundaries

**Configuration Tiers**:

1. **JSON Config (Build-time)**: `config/{slug}.json` and `bunfig.toml` (no .env files)
2. **User (Runtime/Local)**: User preferences, local settings (Zustand persisted stores)
3. **System (Database)**: Business data, application state (Drizzle ORM + SQLite/PostgreSQL)

**Configuration Boundary Rules** (from DEVELOPMENT.md):

- If a SYSOP needs to change it without restarting the server → database (`settings` table)
- If it requires a restart to take effect (ports, keys, DB path) → `config/{slug}.json`
- Never store the same setting in both places; pick one source of truth
- New runtime-editable settings go in the database via `settingsService`
- New static infrastructure settings go in `config/configSchemas/` with a Zod schema

✅ **Good Example: Clear Authority**:

```typescript
import { eq } from 'drizzle-orm';
import { users } from './db/schema/users';

// Build-time flags (JSON config authority — config/{slug}.json)
export const BUILD_FEATURES = {
	EXPERIMENTAL_UI: import.meta.env.DEV,
	DEBUG_MODE: import.meta.env.DEV,
} as const;

// Runtime flags (Database authority)
interface RuntimeFeatures {
	betaFeatures: boolean;
	advancedMode: boolean;
}

async function getRuntimeFeatures(userId: string): Promise<RuntimeFeatures> {
	const [user] = await db.select().from(users).where(eq(users.id, userId));

	return {
		betaFeatures: user?.tier === 'pro',
		advancedMode: user?.preferences?.advancedMode ?? false,
	};
}
```

❌ **Bad Example: Mixed Authorities**:

```typescript
// ❌ Mixing build-time and runtime authorities
const features = {
	...BUILD_FEATURES,
	...(await getRuntimeFeatures(userId)), // Mixing authorities!
};

// ❌ Hardcoded fallback creates dual authority
const FALLBACK_PROVIDERS = {
	openai: { models: ['gpt-4', 'gpt-3.5-turbo'] },
};
const providers = (await getProviders()) || FALLBACK_PROVIDERS; // Dual authority!
```

### Detecting Duplication and Conflicts

**Search Patterns** (canonical aidd/Spernakit environment is Windows/PowerShell, where POSIX `grep` is unavailable; prefer `rg` and adapt globs to your shell):

```bash
# Find duplicate constants (see Pre-Audit Setup for the authority-conflict variant)
# rg: rg -t ts "DEFAULT_|FALLBACK_" backend/src frontend/src
grep -r "DEFAULT_" backend/src/ frontend/src/ --include="*.ts"
grep -r "FALLBACK_" backend/src/ frontend/src/ --include="*.ts"

# Find parallel interfaces
# rg: rg -t ts "interface.*Provider|type.*Config" backend/src frontend/src
grep -r "interface.*Provider" backend/src/ frontend/src/ --include="*.ts"
grep -r "type.*Config" backend/src/ frontend/src/ --include="*.ts"

# Identify shadow configs (no .env files allowed — JSON config only)
# rg: rg -t ts "process\.env\." backend/src frontend/src | rg -v "NODE_ENV"
grep -r "process\.env\." backend/src/ frontend/src/ --include="*.ts" | grep -v "NODE_ENV"

# Enumerate cross-boundary types that should live in shared/
# Step 1: List all types exported from shared/src/index.ts
# rg: rg "^export\s+(type|interface|enum|const)" shared/src/index.ts
grep -E "^export\s+(type|interface|enum|const)" shared/src/index.ts

# Step 2: Search for duplicate declarations of contract types in backend and frontend
# rg: rg -t ts "type\s+WorkspaceMemberRole|enum\s+ApiKeyScope|type\s+NotificationType" backend/src frontend/src
grep -r "type\s+WorkspaceMemberRole\|enum\s+ApiKeyScope\|type\s+NotificationType" backend/src/ frontend/src/ --include="*.ts"

# Step 3: Any type that appears in BOTH backend/src/types/ (or backend route schemas)
# AND frontend/src/api/types/ should be consolidated into shared/
```

### Data Flow Validation

**For each domain, trace reads/writes from UI → API → DB**:

```
Domain: AI Provider Selection
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   UI Component  │───▶│    API Layer     │───▶│   Database      │
│ ProviderSelect  │    │ getProviders()   │    │ aiProviders     │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

**Data Flow Validation Checklist**:

- [ ] UI components use API queries/mutations (consistent data fetching)
- [ ] API functions read from database tables (no hardcoded values)
- [ ] Database schema has proper indexes for query patterns
- [ ] No caching layers that bypass the authority
- [ ] No fallback values that create dual authority

## Database Design and Migration Safety

> **Detailed Procedures**: See [DATABASE.md](./DATABASE.md) for comprehensive migration patterns, rollback strategies, schema versioning, and anti-patterns to avoid.

### Migration Safety Summary

**🚨 CRITICAL Requirements**:

- All migrations must have rollback capability
- Use batch processing (≤50 records per batch)
- Validate data integrity before and after migration
- All queries must use indexed fields for filtering

**Centralized Write Authority**:

Where a deployment uses a single-writer or worker-isolated database model (e.g., a backend that runs SQLite inside a dedicated worker), all mutating transactions must route through one designated command/transaction surface rather than ad-hoc `db.transaction()` calls scattered across the codebase. This preserves a single write authority, makes transactions registrable/auditable, and prevents write races. In standard Spernakit this is the service layer; in worker-isolated models it is the registered command set (e.g., `db/commands.ts`).

### Schema Design Standards

**Index Requirements**:

- All queries must use indexed fields for filtering
- Compound indexes for multi-field queries
- Proper index ordering for query patterns

```typescript
// Drizzle schema with proper indexes and foreign keys (backend/src/db/schema/ai-providers.ts)
import { sqliteTable, text, integer, index, foreignKey } from 'drizzle-orm/sqlite-core';
import { organizations } from './organizations';

export const aiProviders = sqliteTable(
	'ai_providers',
	{
		id: text('id').primaryKey(),
		organizationId: text('organization_id').notNull(),
		name: text('name').notNull(),
		tier: text('tier').notNull(),
		available: integer('available', { mode: 'boolean' }).notNull().default(true),
		region: text('region').notNull(),
	},
	(table) => [
		index('idx_ai_providers_available').on(table.available),
		index('idx_ai_providers_tier').on(table.tier),
		index('idx_ai_providers_region_available').on(table.region, table.available),
		// Foreign keys are declared via foreignKey({...}) in the constraints array — never inline .references().
		// Name format: fk_{table}_{column}_{target} (e.g., fk_ai_providers_organization_id_organizations).
		foreignKey({
			name: 'fk_ai_providers_organization_id_organizations',
			columns: [table.organizationId],
			foreignColumns: [organizations.id],
		}).onDelete('cascade'),
	],
);
```

## Scheduled Tasks and Polling Elimination

### Eliminate Client-Side Polling

**🚨 CRITICAL: Never poll from the client**

❌ **Bad: Client-Side Polling**:

```typescript
useEffect(() => {
	const interval = setInterval(async () => {
		try {
			const response = await fetch('/api/models/check-updates');
			const updates = await response.json();
			if (updates.hasNewModels) {
				setModels(updates.models);
			}
		} catch (error) {
			console.error('Failed to check model updates:', error);
		}
	}, 60000); // Poll every minute

	return () => clearInterval(interval);
}, []);
```

✅ **Good: React Query with Proper Caching**:

```typescript
// Client: React Query for data fetching with caching
import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../api/client'; // canonical fetch wrapper (auth/CSRF/retry)

function useAvailableModels() {
	return useQuery({
		queryKey: ['models', 'available'],
		// Always go through apiClient — never raw fetch — so auth, CSRF, and retry are applied
		queryFn: () => apiClient.get('/models'),
		staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
		refetchOnWindowFocus: true,
	});
}

// API: Query function with proper indexing (backend/src/routes/models.ts)
import { eq } from 'drizzle-orm';
import { models } from '../db/schema/models';

interface Model {
	id: string;
	name: string;
	available: boolean;
}

async function getAvailableModels(): Promise<Model[]> {
	// Uses index on available field
	return await db.select().from(models).where(eq(models.available, true));
}
```

### Backend Scheduled Tasks

**Pattern: Cron Job → Background Task**

✅ **Good: Proper Scheduled Task Pattern**:

```typescript
// Using spernakit's built-in schedulerService (backend/src/services/scheduler/)
// schedulerService registers tasks at startup and manages lifecycle

import { eq } from 'drizzle-orm';
import { models } from '../db/schema/models';
import { scheduledTaskExecutions } from '../db/schema/scheduled-task-executions';
import { schedulerService } from '../services/scheduler';

// Register scheduled task via schedulerService
schedulerService.register({
	name: 'sync-external-models',
	schedule: '0 * * * *', // Every hour
	handler: syncExternalModels,
});

// Background task function
interface SyncResult {
	synced: number;
	errors: string[];
}

async function syncExternalModels(): Promise<SyncResult> {
	// Scheduled task logic
	const startedAt = new Date();
	const externalModels = await fetchExternalModels();

	let synced = 0;
	const errors: string[] = [];

	for (const model of externalModels) {
		try {
			await db
				.insert(models)
				.values({
					externalId: model.id,
					name: model.name,
					available: model.available,
					syncedAt: new Date(),
				})
				.onConflictDoUpdate({
					target: models.externalId,
					set: {
						name: model.name,
						available: model.available,
						syncedAt: new Date(),
					},
				});
			synced++;
		} catch (error) {
			errors.push(`Model ${model.id}: ${(error as Error).message}`);
		}
	}

	// Persist execution history (ScheduledTaskExecution per STACK.md) so runs are
	// auditable — every scheduled task records its outcome to scheduledTaskExecutions.
	await db.insert(scheduledTaskExecutions).values({
		taskName: 'sync-external-models',
		startedAt,
		finishedAt: new Date(),
		status: errors.length === 0 ? 'success' : 'partial',
		result: { synced, errors },
	});

	return { synced, errors };
}
```

## Spernakit Applicability

This audit is designed to be stack-agnostic, but the following notes adapt its generic rules to the **Spernakit v3** stack (React 19 + Vite 8 + Elysia + Drizzle ORM + SQLite/PostgreSQL + TanStack Query + Zustand + Bun).

| Generic Rule            | Spernakit Status | Spernakit Equivalent / Notes                                                                                                                                                                                                           |
| ----------------------- | ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Configuration authority | Directly applies | `config/{slug}.json` is the sole config authority. No `.env` files. Bun configured with `env = false`. Approved exception: secret injection via `SECRET_CONFIG_KEYS` mapping only.                                                     |
| Cross-boundary types    | Directly applies | `shared/` workspace is the single source of truth for types consumed by both frontend and backend (`ErrorCode`, `UserRole`, `DataResponse<T>`, etc.). Domain-specific types stay in `frontend/src/api/types/` or backend-only helpers. |
| Database ORM            | Directly applies | Drizzle ORM with `bun:sqlite` (default) or `pg` driver. Schema in `backend/src/db/schema/` (SQLite) and `backend/src/db/schema-pg/` (PostgreSQL).                                                                                      |
| Schema parity           | Directly applies | `bun run check:schema-parity` ensures both dialects define the same columns and indexes. Always update both in the same commit.                                                                                                        |
| Scheduled tasks         | Directly applies | `schedulerService` with wall-clock-aligned `setTimeout`, config-derived intervals, bounded batch sizes, and persisted execution history in `scheduledTaskExecutions`.                                                                  |
| Real-time updates       | Directly applies | WebSocket channel-based pub/sub drives TanStack Query invalidation. No client-side polling.                                                                                                                                            |
| Server state            | Directly applies | TanStack Query for server state, Zustand for client state. Never React Context for state.                                                                                                                                              |
| Database location       | Directly applies | Database files ONLY in `data/` at project root. Never `backend/data/`.                                                                                                                                                                 |
| Auto-migration          | Adapt            | SQLite auto-applies pending migrations on startup (`autoMigrate.ts`) with pre/post `PRAGMA integrity_check`, backup, and automatic restore. PostgreSQL requires explicit `bun run db:migrate`.                                         |
| Index naming            | Directly applies | `idx_{table}_{columns}` for indexes. Foreign keys use `fk_{table}_{column}_{target}` (e.g., `fk_audit_logs_user_id_users`), declared via `foreignKey({...}).onDelete(...)` in the constraints array; never inline `.references()`.     |

### aidd context (Class B)

aidd is a single-user **local CLI + embedded Elysia control panel + spawned agent subprocesses + SQLite single-writer**, with NO multi-tenant / workspace / container / cloud layer. The backend runs SQLite inside a dedicated Bun worker, and **`backend/src/db/commands.ts` is the single write surface**: every mutating transaction is registered as a command there; never an ad-hoc `db.transaction()` call elsewhere. This is the aidd realization of the Centralized Write Authority rule above, so the corresponding checklist item is **in scope (not N/A)** and should be audited against `db/commands.ts`. Data-architecture rules that presuppose tenant-scoped row isolation, multi-writer connection pools, or cloud-managed datastores are **N/A (by design)** for aidd and should be scored as such rather than as Pass/finding, but only after confirming no degenerate equivalent exists. Marking a SaaS-only control N/A is permitted ONLY after confirming it truly does not exist in aidd; if a degenerate equivalent exists (e.g. the single-writer SQLite handle in place of pool/tenant isolation, or `.aidd/` files as a second source of truth), audit that equivalent.

## Audit Checklist

### **Critical Data Architecture Checks** 🚨

#### Single Source of Truth

- [ ] Every domain has a single, clearly documented authority
- [ ] Authority boundaries are clearly defined (environment/user/system)
- [ ] Zero duplicate registries or parallel interfaces
- [ ] No hardcoded fallbacks that create dual authority
- [ ] Runtime behavior aligns with declared authorities
- [ ] JSON config (`config/{slug}.json`) is the primary configuration authority; no `.env` files

#### Database Integrity

- [ ] All migrations have proper validation and rollback procedures
- [ ] All queries use indexed fields for filtering
- [ ] All database operations are bounded (use `.limit()` or pagination)
- [ ] Schema has proper indexes for all query patterns
- [ ] All API functions have proper input validation and return types
- [ ] Where a single-writer or worker-isolated DB model is used, all mutating transactions route through the designated command/transaction surface (a single write authority) rather than scattered inline `db.transaction()` calls

#### Scheduled Tasks

- [ ] No _unbounded or duplicative_ client-side polling (use React Query or similar). Bounded polling for active/long-lived entities is acceptable when documented at the feature-spec level and not duplicating an existing WebSocket invalidation path.
- [ ] All scheduled tasks use proper background job patterns
- [ ] Heavy operations not triggered directly from browser
- [ ] All scheduled tasks have proper error handling
- [ ] Scheduled tasks use bounded, indexed database queries

### **High Priority Data Architecture Checks** ⚠️

#### Authority Consistency

- [ ] 100% of consumers read from designated authority
- [ ] No caching layers that bypass authority
- [ ] Configuration documentation matches implementation
- [ ] Clear ownership boundaries for each data domain
- [ ] Drift detection mechanisms in place
- [ ] `shared/` workspace is the single source of truth for cross-cutting types (`ErrorCode`, `UserRole`, `DataResponse<T>`)
- [ ] WebSocket used for real-time updates alongside TanStack Query refetch patterns
- [ ] No entity has two freshness authorities (e.g., WebSocket invalidation AND `refetchInterval` on the same query); pick one; bounded polling exceptions for active/long-lived entities must be documented at the feature-spec level
- [ ] No in-memory filtering of database query results; use SQL `WHERE` clauses via Drizzle (`eq`, `and`, `or`) instead of `.all()` + JS `.filter()`

#### Database Design

- [ ] Compound indexes for multi-field queries
- [ ] Proper index ordering for query patterns
- [ ] Migration performance analysis completed
- [ ] Data validation during migrations
- [ ] Schema versioning and compatibility management
- [ ] Summary and aggregation functions use SQL aggregates (`count()`, `sum()`) with `.limit()`, not unbounded `.all()` + JS reduce
- [ ] All types that participate in the frontend/backend contract are declared in `shared/` workspace, not duplicated in `backend/src/types/` or `frontend/src/api/types/`

#### Task Architecture

- [ ] Scheduled tasks minimize resource consumption
- [ ] Proper monitoring and alerting for scheduled tasks
- [ ] Comprehensive error handling and retry logic
- [ ] External service synchronization properly scheduled
- [ ] Task execution times within acceptable limits

### **Medium Priority Data Architecture Checks** 📋

#### Documentation

- [ ] Authority map documented for all domains
- [ ] Migration procedures documented
- [ ] Scheduled task purposes documented
- [ ] Data flow diagrams current
- [ ] Schema evolution strategy documented
- [ ] Auto-migration on SQLite startup verified safe for data integrity
- [ ] Dual-dialect support (SQLite/PostgreSQL) does not cause data authority confusion
- [ ] PostgreSQL schema (`schema-pg/`) covers all tables defined in SQLite schema (`schema/`); verified via `bun run check:schema-parity`

#### Monitoring

- [ ] Authority drift monitoring in place
- [ ] Migration execution monitoring
- [ ] Scheduled task execution tracking
- [ ] Database performance metrics collected
- [ ] Real-time subscription health monitoring

## Feature.json Generation

For each finding requiring code changes, generate a feature.json in `.aidd/features/audit-data-architecture-{timestamp}-{slug}/` following the standard aidd format. Map severity: Critical→P0, High→P1, Medium→P2, Low→P3.

## Report Template

```markdown
# Data Architecture Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Data Architecture Score**: [Score]/25
**Truth Integrity Grade**: [A+/A/A-/B+/B/B-/C+/C/D/F]
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]

### Scoring Breakdown

- **Authority Clarity**: [Score]/5
- **Consistency**: [Score]/5
- **Absence of Duplication**: [Score]/5
- **Schema Quality**: [Score]/5
- **Runtime Fidelity**: [Score]/5

### Key Findings

- [Authority inventory summary]
- [Duplication and conflict assessment]
- [Database design evaluation]
- [Scheduled task migration status]

## Authority Inventory

### Configuration Authorities

| Domain   | Authority         | Files/Tables | Consumers    | Status  |
| -------- | ----------------- | ------------ | ------------ | ------- |
| [Domain] | [Env/User/System] | [Files]      | [Components] | [✅/❌] |

### Data Model Authorities

| Domain   | Authority  | Tables/Functions | Consumers    | Status  |
| -------- | ---------- | ---------------- | ------------ | ------- |
| [Domain] | [Database] | [Tables]         | [Components] | [✅/❌] |

## Detailed Findings

### Critical Issues 🚨

| Issue | Category        | Location    | Description   | Impact   | Remediation | Timeline |
| ----- | --------------- | ----------- | ------------- | -------- | ----------- | -------- |
| [ID]  | [SSOT/DB/Tasks] | [File:Line] | [Description] | [Impact] | [Fix]       | [Days]   |

### High Priority Issues ⚠️

| Issue | Category        | Location    | Description   | Impact   | Remediation | Timeline |
| ----- | --------------- | ----------- | ------------- | -------- | ----------- | -------- |
| [ID]  | [SSOT/DB/Tasks] | [File:Line] | [Description] | [Impact] | [Fix]       | [Days]   |

### Medium Priority Issues 📋

| Issue | Category        | Location    | Description   | Impact   | Remediation | Timeline |
| ----- | --------------- | ----------- | ------------- | -------- | ----------- | -------- |
| [ID]  | [SSOT/DB/Tasks] | [File:Line] | [Description] | [Impact] | [Fix]       | [Days]   |

## Metrics and Analysis

### Single Source of Truth

- **Authority Clarity**: [Score]/5 - [Description]
- **Consistency**: [Percentage]% of consumers use designated authority
- **Duplication**: [Number] duplicate authorities found
- **Runtime Alignment**: [Percentage]% runtime behavior matches design

### Database Architecture

- **Index Coverage**: [Percentage]% of queries use proper indexes
- **Query Performance**: [Percentage]% of queries under 100ms
- **Migration Safety**: [Percentage]% of migrations have rollback procedures
- **Schema Quality**: [Score]/5 - [Description]

### Scheduled Tasks

- **Polling Elimination**: [Percentage]% client-side polling removed
- **Task Pattern Compliance**: [Percentage]% use proper mutation → action pattern
- **Error Handling**: [Percentage]% have comprehensive error handling
- **Performance**: [Percentage]% of tasks complete within time limits

## Recommendations

### Immediate Actions (0-7 days)

1. [Critical authority conflicts]
2. [Database query performance issues]
3. [Client-side polling elimination]

### Short-term Actions (1-4 weeks)

1. [Authority consolidation]
2. [Migration safety improvements]
3. [Scheduled task migration]

### Long-term Actions (1-3 months)

1. [Comprehensive authority documentation]
2. [Database optimization strategy]
3. [Monitoring and alerting implementation]

## Validation Results

### Build Gates

- **Build**: [PASS/FAIL]
- **Lint**: [PASS/FAIL]
- **Type Check**: [PASS/FAIL]

### Quality Metrics

- **Authority Conflicts**: [Number] found
- **Missing Indexes**: [Number] queries need indexes
- **Polling Patterns**: [Number] instances found

## Next Steps

1. **Immediate**: Address critical authority conflicts
2. **Week 1**: Fix database query performance issues
3. **Week 2**: Eliminate client-side polling
4. **Month 1**: Complete scheduled task migration
5. **Quarter**: Implement comprehensive monitoring

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

## Deliverables

### Required Outputs

- **Data Architecture Assessment Report**: Comprehensive analysis of current architecture
- **Authority Inventory**: Complete mapping of all data authorities
- **Database Design Review**: Schema quality and migration safety assessment
- **Scheduled Task Migration Plan**: Polling elimination and task migration strategy
- **Monitoring Implementation Plan**: Authority drift and performance monitoring

### Success Criteria

- **100% authority clarity** for all domains
- **Zero duplicate authorities** or parallel interfaces
- **100% database queries** use proper indexes
- **Zero client-side polling** patterns
- **100% scheduled tasks** use proper patterns
- **All migrations** have rollback procedures

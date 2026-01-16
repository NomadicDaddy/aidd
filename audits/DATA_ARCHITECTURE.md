---
title: 'Data Architecture, Single Source of Truth, and Scheduled Tasks Audit'
last_updated: '2025-01-13'
version: '2.0'
category: 'Core Architecture'
priority: 'Critical'
estimated_time: '2-3 hours'
frequency: 'Quarterly'
consolidates: 'TRUTH.md, SCHEDULED_TASKS.md'
---

# Data Architecture Audit Framework

> **Related Audits**: See [DATABASE.md](./DATABASE.md) for detailed migration procedures, rollback strategies, and schema versioning. This audit focuses on Single Source of Truth and scheduled task patterns.

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

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
- **Real-time Updates**: Leverage backend's reactive capabilities instead of polling

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
5. [Audit Checklist](#audit-checklist)
6. [Report Template](#report-template)

## Pre-Audit Setup

### Required Tools and Access

- Access to codebase: `src/**`, configuration files, database schema
- Database schema: Schema definition files
- Backend functions: queries, mutations, API handlers
- Build/quality gates: TypeScript, ESLint, build scripts
- Version control: Git for history and dependency analysis

### Verification Commands

```bash
# Build validation
bun run build

# Lint validation
bun run lint

# Type check validation
bun run type-check

# Search for polling patterns
grep -r "setInterval\|setTimeout" --include="*.ts" --include="*.tsx" src/

# Search for authority conflicts
grep -r "DEFAULT_\|FALLBACK_" --include="*.ts" src/
```

## Single Source of Truth Assessment

### Authority Inventory

**Step 1: Enumerate Authorities by Domain**

Create an authority map for each data domain:

| Domain        | Authority   | Files/Tables                            | Consumers                         |
| ------------- | ----------- | --------------------------------------- | --------------------------------- |
| AI Providers  | Database    | `src/api/aiProviders.ts`, `aiProviders` | `src/hooks/useProviders.ts`       |
| Feature Flags | Environment | `.env`, build-time constants            | `src/config/features.ts`          |
| User Quotas   | Database    | `src/api/quotas.ts`, `userQuotas` table | `src/components/QuotaDisplay.tsx` |

### Authority Boundaries

**Configuration Tiers**:

1. **Environment (Build-time)**: Process environment variables, build flags
2. **User (Runtime/Local)**: User preferences, local settings
3. **System (Database)**: Business data, application state

✅ **Good Example: Clear Authority**:

```typescript
// Build-time flags (Environment authority)
export const BUILD_FEATURES = {
	EXPERIMENTAL_UI: process.env.NODE_ENV === 'development',
	DEBUG_MODE: process.env.VITE_DEBUG === 'true',
} as const;

// Runtime flags (Database authority)
interface RuntimeFeatures {
	betaFeatures: boolean;
	advancedMode: boolean;
}

async function getRuntimeFeatures(userId: string): Promise<RuntimeFeatures> {
	const user = await db.users.findUnique({
		where: { id: userId },
	});

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

**Search Patterns**:

```bash
# Find duplicate constants
grep -r "DEFAULT_" src/ --include="*.ts"
grep -r "FALLBACK_" src/ --include="*.ts"

# Find parallel interfaces
grep -r "interface.*Provider" src/ --include="*.ts"
grep -r "type.*Config" src/ --include="*.ts"

# Identify shadow configs
grep -r "process\.env\." src/ --include="*.ts" | grep -v "NODE_ENV"
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

### Schema Design Standards

**Index Requirements**:

- All queries must use indexed fields for filtering
- Compound indexes for multi-field queries
- Proper index ordering for query patterns

```typescript
// Schema with proper indexes (Prisma-like syntax)
model AIProvider {
  id        String   @id @default(cuid())
  name      String
  tier      String
  available Boolean
  region    String

  @@index([available])
  @@index([tier])
  @@index([region, available])
}
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

function useAvailableModels() {
	return useQuery({
		queryKey: ['models', 'available'],
		queryFn: async () => {
			const response = await fetch('/api/models');
			return response.json();
		},
		staleTime: 5 * 60 * 1000, // Consider data fresh for 5 minutes
		refetchOnWindowFocus: true,
	});
}

// API: Query function with proper indexing
interface Model {
	id: string;
	name: string;
	available: boolean;
}

async function getAvailableModels(): Promise<Model[]> {
	// Uses index on available field
	return await db.models.findMany({
		where: { available: true },
	});
}
```

### Backend Scheduled Tasks

**Pattern: Cron Job → Background Task**

✅ **Good: Proper Scheduled Task Pattern**:

```typescript
// Using a job scheduler (e.g., node-cron, bull, agenda)
import cron from 'node-cron';

// Schedule sync every hour
cron.schedule('0 * * * *', async () => {
	await syncExternalModels();
});

// Background task function
interface SyncResult {
	synced: number;
	errors: string[];
}

async function syncExternalModels(): Promise<SyncResult> {
	// Scheduled task logic
	const externalModels = await fetchExternalModels();

	let synced = 0;
	const errors: string[] = [];

	for (const model of externalModels) {
		try {
			await db.models.upsert({
				where: { externalId: model.id },
				create: {
					externalId: model.id,
					name: model.name,
					available: model.available,
					syncedAt: new Date(),
				},
				update: {
					name: model.name,
					available: model.available,
					syncedAt: new Date(),
				},
			});
			synced++;
		} catch (error) {
			errors.push(`Model ${model.id}: ${error.message}`);
		}
	}

	return { synced, errors };
}
```

## Audit Checklist

### **Critical Data Architecture Checks** 🚨

#### Single Source of Truth

- [ ] **Critical**: Every domain has a single, clearly documented authority
- [ ] **Critical**: Authority boundaries are clearly defined (environment/user/system)
- [ ] **Critical**: Zero duplicate registries or parallel interfaces
- [ ] **Critical**: No hardcoded fallbacks that create dual authority
- [ ] **Critical**: Runtime behavior aligns with declared authorities

#### Database Integrity

- [ ] **Critical**: All migrations have proper validation and rollback procedures
- [ ] **Critical**: All queries use indexed fields for filtering
- [ ] **Critical**: All database operations are bounded (use `take()` or pagination)
- [ ] **Critical**: Schema has proper indexes for all query patterns
- [ ] **Critical**: All API functions have proper input validation and return types

#### Scheduled Tasks

- [ ] **Critical**: Zero client-side polling (use React Query or similar)
- [ ] **Critical**: All scheduled tasks use proper background job patterns
- [ ] **Critical**: Heavy operations not triggered directly from browser
- [ ] **Critical**: All scheduled tasks have proper error handling
- [ ] **Critical**: Scheduled tasks use bounded, indexed database queries

### **High Priority Data Architecture Checks** ⚠️

#### Authority Consistency

- [ ] **High**: 100% of consumers read from designated authority
- [ ] **High**: No caching layers that bypass authority
- [ ] **High**: Configuration documentation matches implementation
- [ ] **High**: Clear ownership boundaries for each data domain
- [ ] **High**: Drift detection mechanisms in place

#### Database Design

- [ ] **High**: Compound indexes for multi-field queries
- [ ] **High**: Proper index ordering for query patterns
- [ ] **High**: Migration performance analysis completed
- [ ] **High**: Data validation during migrations
- [ ] **High**: Schema versioning and compatibility management

#### Task Architecture

- [ ] **High**: Scheduled tasks minimize resource consumption
- [ ] **High**: Proper monitoring and alerting for scheduled tasks
- [ ] **High**: Comprehensive error handling and retry logic
- [ ] **High**: External service synchronization properly scheduled
- [ ] **High**: Task execution times within acceptable limits

### **Medium Priority Data Architecture Checks** 📋

#### Documentation

- [ ] **Medium**: Authority map documented for all domains
- [ ] **Medium**: Migration procedures documented
- [ ] **Medium**: Scheduled task purposes documented
- [ ] **Medium**: Data flow diagrams current
- [ ] **Medium**: Schema evolution strategy documented

#### Monitoring

- [ ] **Medium**: Authority drift monitoring in place
- [ ] **Medium**: Migration execution monitoring
- [ ] **Medium**: Scheduled task execution tracking
- [ ] **Medium**: Database performance metrics collected
- [ ] **Medium**: Real-time subscription health monitoring

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

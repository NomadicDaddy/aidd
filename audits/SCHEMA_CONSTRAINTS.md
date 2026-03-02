---
title: 'Schema Constraints and Integrity Audit'
last_updated: '2026-03-01'
version: '1.0'
category: 'Core Architecture'
priority: 'Critical'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
consolidates: 'Schema constraint validation, data integrity checks, security-focused schema analysis'
---

# Schema Constraints and Integrity Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
>
> **Related Audits**: See [DATABASE.md](./DATABASE.md) for migration procedures. See [SECURITY.md](./SECURITY.md) for authentication/authorization. This audit focuses specifically on schema constraint correctness and data integrity patterns.

## Executive Summary

**🎯 Critical Schema Standards**

- **Unique Constraints**: Every column that semantically requires uniqueness MUST have a database-level unique constraint
- **Security Columns**: Nonces, tokens, and replay-attack prevention columns are CRITICAL - missing unique constraints are security vulnerabilities
- **One-to-One Relationships**: Foreign key columns in 1:1 relationships MUST have unique constraints to prevent data integrity violations
- **No Competing Systems**: No two tables or columns should serve overlapping purposes without clear documentation

**📋 Essential Constraint Patterns**

- **Anti-Replay Columns**: `nonce`, `token`, `key` columns in security tables MUST be unique
- **Per-Entity Settings**: `userId` in preference/settings tables MUST be unique (one row per user)
- **Rate Limiting Keys**: Rate limit key columns MUST be unique OR use upsert patterns
- **Polymorphic Junctions**: Entity-tag/permission junction tables MUST have unique constraints on `(entityType, entityId, targetId)`

**⚡ Security Impact**

- Missing unique constraint on `nonce` columns enables replay attacks
- Missing unique constraint on rate-limit keys causes inaccurate rate limiting under load
- Missing unique constraint on per-user settings causes unpredictable query results

## Table of Contents

1. [Audit Objectives](#audit-objectives)
2. [Pre-Audit Setup](#pre-audit-setup)
3. [Security-Critical Constraint Checks](#security-critical-constraint-checks)
4. [Data Integrity Constraint Checks](#data-integrity-constraint-checks)
5. [Overlapping Table Detection](#overlapping-table-detection)
6. [Duplicate System Detection](#duplicate-system-detection)
7. [Template vs App-Specific Origin Mapping](#template-vs-app-specific-origin-mapping)
8. [Audit Checklist](#audit-checklist)
9. [Feature.json Generation](#featurejson-generation)
10. [Report Template](#report-template)

## Audit Objectives

Conduct a systematic analysis of database schema files to identify:

1. **Missing unique constraints** on security-critical columns
2. **Data integrity violations** in one-to-one relationships
3. **Overlapping table purposes** that cause developer confusion
4. **Duplicate data systems** that create inconsistency risk
5. **Template-origin vs app-specific** files for proper escalation decisions

## Pre-Audit Setup

### Required Tools and Access

```bash
# Locate schema files
ls -la backend/src/db/schema/

# If comparing against template
ls -la /path/to/spernakit/backend/src/db/schema/
```

### Schema File Inventory

1. List all schema files in the target application
2. For derived applications: list schema files in the base template
3. Identify which schema files are template-origin vs app-specific

### Verification Commands

```bash
# Find columns that should be unique (nonce, token, key patterns)
grep -r "\.notNull()" backend/src/db/schema/ | grep -E "(nonce|token|key)"

# Find one-to-one relationship columns (settings, preferences)
grep -r "references.*users\.id" backend/src/db/schema/ | grep -v "\.unique()"

# Find potential duplicate tables (similar names)
ls backend/src/db/schema/ | sort | uniq -d
```

## Security-Critical Constraint Checks

### 🚨 CRITICAL: Anti-Replay Nonce Columns

**Pattern**: Tables that store nonces for replay attack prevention

**Required Constraint**: `nonce` column MUST have `.unique()`

```typescript
// ❌ VULNERABLE: Missing unique constraint
export const apiKeyNonces = sqliteTable('api_key_nonces', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	nonce: text('nonce').notNull(), // VULNERABILITY: duplicates allowed
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

// ✅ SECURE: Unique constraint prevents replay attacks
export const apiKeyNonces = sqliteTable('api_key_nonces', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	nonce: text('nonce').notNull().unique(), // SECURE: duplicates rejected
	expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});
```

**Risk Without Constraint**: During race conditions, duplicate nonces can be inserted, allowing replay attacks to bypass API key authentication.

**Detection Pattern**:

```bash
# Find nonce columns without unique
grep -A2 "nonce.*text" backend/src/db/schema/*.ts | grep -v "unique()"
```

### 🚨 CRITICAL: Rate Limit Key Columns

**Pattern**: Tables that track rate limit counters per key

**Required**: Either `.unique()` constraint OR documented upsert pattern in service

```typescript
// ❌ RISK: No unique constraint, no upsert documentation
export const rateLimitEntries = sqliteTable('rate_limit_entries', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	key: text('key').notNull(), // RISK: race conditions create duplicates
	count: integer('count').notNull().default(0),
	resetAt: integer('reset_at').notNull(),
});

// ✅ OPTION 1: Unique constraint
export const rateLimitEntries = sqliteTable('rate_limit_entries', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	key: text('key').notNull().unique(), // SAFE: duplicates rejected
	count: integer('count').notNull().default(0),
	resetAt: integer('reset_at').notNull(),
});

// ✅ OPTION 2: Documented upsert pattern in service
// Service uses: INSERT OR REPLACE ON CONFLICT(key) DO UPDATE...
```

**Risk Without Constraint**: Under high traffic with concurrent requests, multiple rows can be created for the same key, causing rate limit counters to split and rate limiting to become inaccurate.

**Detection Pattern**:

```bash
# Find rate limit tables
grep -l "rate.*limit\|ratelimit" backend/src/db/schema/*.ts

# Check key column for unique
grep -A5 "key.*text" backend/src/db/schema/rateLimit*.ts | grep "unique()"
```

## Data Integrity Constraint Checks

### 🚨 CRITICAL: One-to-One Relationship Columns

**Pattern**: Tables that should have exactly one row per entity (user preferences, user settings)

**Required Constraint**: The foreign key column MUST have `.unique()`

```typescript
// ❌ DATA INTEGRITY VIOLATION: Multiple preferences per user possible
const userNotificationPreferences = sqliteTable('user_notification_preferences', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.references(() => users.id, { onDelete: 'cascade' }), // MISSING: .unique()
	preferences: text('preferences', { mode: 'json' }),
});

// ✅ CORRECT: One preference row per user enforced
const userNotificationPreferences = sqliteTable('user_notification_preferences', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	userId: integer('user_id')
		.notNull()
		.unique() // ENFORCED: one row per user
		.references(() => users.id, { onDelete: 'cascade' }),
	preferences: text('preferences', { mode: 'json' }),
});
```

**Risk Without Constraint**:

- Multiple preference rows can be created for a single user
- `SELECT ... WHERE userId = ?` may return multiple rows, causing unpredictable behavior
- Updates may affect wrong row
- Data integrity is compromised

**Detection Pattern**:

```bash
# Find preference/settings tables
grep -l "preferences\|settings\|config" backend/src/db/schema/*.ts

# Check userId columns for unique constraint
grep -B2 -A5 "userId.*integer.*references" backend/src/db/schema/*.ts | grep -A5 "preferences\|settings"
```

### 📋 HIGH: Junction Table Uniqueness

**Pattern**: Polymorphic junction tables (entity_tags, entity_permissions)

**Required Constraint**: Composite unique on `(entityType, entityId, targetId)`

```typescript
// ❌ RISK: Duplicate tag assignments possible
const entityTags = sqliteTable('entity_tags', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	entityType: text('entity_type').notNull(),
	entityId: integer('entity_id').notNull(),
	tagId: integer('tag_id')
		.notNull()
		.references(() => tags.id),
});

// ✅ CORRECT: Prevent duplicate tag assignments
const entityTags = sqliteTable(
	'entity_tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		entityType: text('entity_type').notNull(),
		entityId: integer('entity_id').notNull(),
		tagId: integer('tag_id')
			.notNull()
			.references(() => tags.id),
	},
	(table) => [unique().on(table.entityType, table.entityId, table.tagId)]
);
```

## Overlapping Table Detection

### 📋 MEDIUM: Tables with Overlapping Purpose

**Pattern**: Two or more tables that store similar data with unclear boundaries

**Detection Questions**:

1. Do both tables track the same domain (e.g., compliance, security, metrics)?
2. Are both populated by different services?
3. Is there clear documentation on when to use each?
4. Could they be consolidated?

**Example Finding**:

```
Tables: complianceChecks, complianceResults
- complianceChecks: Records from security collector scans (CIS, NIST, PCI)
- complianceResults: Records from compliance scanner service (policy evaluations)

Questions:
1. Are both tables needed or can they be consolidated?
2. What is the authoritative source for compliance status?
3. Should one be deprecated?
```

**Detection Pattern**:

```bash
# Find tables with similar names
ls backend/src/db/schema/*.ts | xargs -n1 basename | sed 's/.ts$//' | sort

# Look for tables in same domain
grep -l "compliance\|audit\|security" backend/src/db/schema/*.ts
```

### Remediation Options

1. **If both needed**: Add clear documentation in schema comments explaining the distinction
2. **If redundant**: Create migration plan to consolidate
3. **If unclear**: Document as technical debt for future resolution

## Duplicate System Detection

### 📋 MEDIUM: Competing Tagging/Attribute Systems

**Pattern**: Two mechanisms for storing the same type of data

**Example Finding**:

```
Duplicate Tagging Systems:
1. JSON tags column on servers table: tags: text('tags', { mode: 'json' }).$type<string[]>()
2. Polymorphic entityTags table: Links tags to entities via entityType + entityId

Risk: Data inconsistency, confusion, split source of truth
```

**Detection Pattern**:

```bash
# Find JSON columns that might duplicate junction tables
grep -r "mode: 'json'" backend/src/db/schema/*.ts

# Find junction tables
grep -l "entity.*type\|entity.*id" backend/src/db/schema/*.ts

# Cross-reference: does entity table also have JSON column for same domain?
```

### Remediation

1. **Audit all usages** of both systems
2. **Create migration script** to consolidate data
3. **Deprecate and remove** the inferior approach
4. **Update documentation** to clarify single source of truth

## Template vs App-Specific Origin Mapping

### Purpose

When auditing a derived application (e.g., deeper built on spernakit), determine which findings should:

1. **ESCALATE** to the base template (template-origin files)
2. **KEEP LOCAL** to the derived app (app-specific files)

### Origin Classification

| Origin                | Criteria                                                 | Action                                                       |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| **TEMPLATE**          | File exists in both template and app with identical path | Finding applies to template - ESCALATE                       |
| **APP-SPECIFIC**      | File exists only in derived app                          | Finding stays local - KEEP                                   |
| **MODIFIED-TEMPLATE** | Template-origin file with app modifications              | Check if issue is in template portion - CONDITIONAL ESCALATE |

### Detection Method

```bash
# For each schema file in derived app
for file in d:/applications/APP/backend/src/db/schema/*.ts; do
	filename=$(basename "$file")
	template_file="d:/applications/spernakit/backend/src/db/schema/$filename"

	if [ -f "$template_file" ]; then
		echo "TEMPLATE: $filename"
		# Compare contents to check for modifications
		diff "$file" "$template_file"
	else
		echo "APP-SPECIFIC: $filename"
	fi
done
```

### Escalation Criteria

Escalate finding to template if ALL of:

1. File exists in template at same path
2. Same constraint issue exists in template file
3. Fix would benefit all derived applications

## Audit Checklist

### Critical Checks 🚨

- [ ] **Nonce columns** have `.unique()` constraint (replay attack prevention)
- [ ] **Rate limit key columns** have `.unique()` OR documented upsert pattern
- [ ] **Per-user settings tables** have unique constraint on `userId`
- [ ] **Security token columns** have `.unique()` constraint
- [ ] **API key columns** have `.unique()` constraint where semantically required

### High Priority Checks ⚠️

- [ ] **Junction tables** have composite unique constraints
- [ ] **Email/username columns** have `.unique()` constraint
- [ ] **External ID columns** have `.unique()` constraint
- [ ] **Session token columns** have `.unique()` constraint
- [ ] **Overlapping tables** documented or flagged for consolidation

### Medium Priority Checks 📋

- [ ] **Duplicate tagging systems** identified and documented
- [ ] **Overlapping table purposes** documented
- [ ] **Deprecated columns** flagged for removal
- [ ] **Migration paths** documented for consolidation
- [ ] **Template vs app-specific** origin mapped for all findings

### Low Priority Checks 💡

- [ ] Schema comments explain table purposes
- [ ] Foreign key cascade behavior documented
- [ ] Index coverage adequate for query patterns
- [ ] Soft delete patterns consistent

## Feature.json Generation

### Output Format

For each finding, generate a feature.json in `.automaker/features/audit-database-{timestamp}-{slug}/`:

```json
{
	"auditFinding": {
		"column": "nonce",
		"evidence": "backend/src/db/schema/apiKeyNonces.ts:14",
		"issue": "missing_unique_constraint",
		"risk": "replay_attack_bypass",
		"table": "api_key_nonces"
	},
	"auditSeverity": "critical",
	"auditSource": "DATABASE",
	"category": "Backend",
	"createdAt": "2026-03-01T00:00:00.000Z",
	"description": "AUDIT FINDING [Critical]: The `apiKeyNonces` table is missing a unique constraint on the `nonce` column...",
	"id": "audit-database-{timestamp}-{slug}",
	"priority": 1,
	"spec": "1. Modify backend/src/db/schema/apiKeyNonces.ts to add .unique() to the nonce column\n2. Create database migration...",
	"status": "backlog",
	"title": "Fix Missing Unique Constraint on apiKeyNonces.nonce",
	"updatedAt": "2026-03-01T00:00:00.000Z"
}
```

**NOTE: The `id` field MUST start with `audit-` and match the directory name.**

### Severity Mapping

| Issue Type                             | Severity | Priority |
| -------------------------------------- | -------- | -------- |
| Missing unique on security nonce/token | Critical | 1        |
| Missing unique on rate-limit key       | High     | 2        |
| Missing unique on 1:1 relationship     | Critical | 1        |
| Overlapping tables                     | Medium   | 3        |
| Duplicate systems                      | Medium   | 3        |

### Template Escalation

When escalating to template (spernakit), use this ID format:

```
spernakit-{YYYYMMDD}-{slug}
```

Include `spernakit_version` field with current template version.

## Report Template

```markdown
# Schema Constraints Audit Report - YYYY-MM-DD

## Executive Summary

**Application**: {app-name} (spernakit v{version})
**Findings**: {total} ({critical} critical, {high} high, {medium} medium)
**Template-Escalated**: {count}
**App-Specific**: {count}

### Constraint Health

| Category          | Checked | Issues Found |
| ----------------- | ------- | ------------ |
| Security Critical | {n}     | {n}          |
| Data Integrity    | {n}     | {n}          |
| Table Overlap     | {n}     | {n}          |
| Duplicate Systems | {n}     | {n}          |

## Critical Findings 🚨

### {finding-title} (`{finding-id}`)

- **Table**: `{table_name}`
- **Column**: `{column_name}`
- **Issue**: {issue_type}
- **Risk**: {risk_description}
- **Evidence**: `{file}:{line}`
- **Origin**: {TEMPLATE|APP-SPECIFIC}
- **Spec**:
    1. {remediation_step_1}
    2. {remediation_step_2}

## High Priority Findings ⚠️

| ID   | Table   | Column   | Issue   | Risk   | Origin   |
| ---- | ------- | -------- | ------- | ------ | -------- |
| {id} | {table} | {column} | {issue} | {risk} | {origin} |

## Medium Priority Findings 📋

| ID   | Issue Type          | Tables   | Description | Origin   |
| ---- | ------------------- | -------- | ----------- | -------- |
| {id} | overlapping_purpose | {tables} | {desc}      | {origin} |

## Template Escalations

The following findings exist in template-origin files and should be escalated to spernakit:

| Finding ID | Template File | Spernakit Finding ID    |
| ---------- | ------------- | ----------------------- |
| {id}       | {file}        | spernakit-{date}-{slug} |

## Recommendations

### Immediate (0-7 days)

1. Fix all CRITICAL security constraint issues
2. Create migrations for missing unique constraints

### Short-term (1-4 weeks)

1. Address HIGH priority data integrity issues
2. Document overlapping table purposes

### Long-term (1-3 months)

1. Consolidate duplicate systems
2. Remove deprecated tables/columns

---

**Auditor**: AI Development Director
**Date**: {date}
**Next Review**: {date + 3 months}
```

## Deliverables

### Required Outputs

1. **Feature.json files** for each finding in `.automaker/features/audit-database-{timestamp}-{slug}/`
2. **Audit report** summarizing all findings
3. **Origin map** showing template vs app-specific classification
4. **Escalation list** for findings that apply to template

### Success Criteria

- **100% of security-critical columns** have unique constraints
- **100% of 1:1 relationships** have unique foreign keys
- **Zero overlapping tables** without documentation
- **Zero duplicate systems** without migration plan
- **All findings** have remediation spec

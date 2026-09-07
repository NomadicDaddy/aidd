---
title: 'Schema Constraints and Integrity Audit'
last_updated: '2026-06-28'
version: '1.5'
category: 'Core Architecture'
priority: 'Critical'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'pre-release'
consolidates: 'Schema constraint validation, data integrity checks, security-focused schema analysis'
---

# Schema Constraints and Integrity Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.
>
> **Related Audits**: See [DATABASE.md](./DATABASE.md) for migration procedures. See [SECURITY.md](./SECURITY.md) for authentication/authorization. This audit focuses specifically on schema constraint correctness and data integrity patterns.

## Executive Summary

**Critical Schema Standards**

- **Unique Constraints**: Every column that semantically requires uniqueness MUST have a database-level unique constraint
- **Security Columns**: Nonces, tokens, and replay-attack prevention columns are CRITICAL - missing unique constraints are security vulnerabilities
- **One-to-One Relationships**: Foreign key columns in 1:1 relationships MUST have unique constraints to prevent data integrity violations
- **No Competing Systems**: No two tables or columns should serve overlapping purposes without clear documentation

**Essential Constraint Patterns**

- **Anti-Replay Columns**: `nonce`, `token`, `key` columns in security tables MUST be unique
- **Per-Entity Settings**: `userId` in preference/settings tables MUST be unique (one row per user)
- **Rate Limiting Keys**: Rate limit key columns MUST be unique OR use upsert patterns
- **Polymorphic Junctions**: Entity-tag/permission junction tables MUST have unique constraints on `(entityType, entityId, targetId)`

**Security Impact**

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
11. [Deliverables](#deliverables)

## Audit Objectives

Conduct a systematic analysis of database schema files to identify:

1. **Missing unique constraints** on security-critical columns
2. **Data integrity violations** in one-to-one relationships
3. **Overlapping table purposes** that cause developer confusion
4. **Duplicate data systems** that create inconsistency risk
5. **Template-origin vs app-specific** files for proper escalation decisions
6. **Index/FK naming convention** compliance (`idx_{table}_{columns}`, `fk_{table}_{column}_{target}`; the column qualifier disambiguates multiple FKs to the same target, e.g. `created_by`/`updated_by`/`deleted_by` → users)
7. **Auto-migration safety**: new constraints that could fail on startup with existing duplicate data

## Pre-Audit Setup

### Required Tools and Access

Read all schema files in the target application's `backend/src/db/schema/` directory. For derived applications, also read the base template's schema directory for origin comparison.

### Schema File Inventory

1. List all schema files in the target application
2. For derived applications: list schema files in the base template
3. Identify which schema files are template-origin vs app-specific

### Applicability (Auth-Less and Schema-Less Apps)

Not every target application carries the full spernakit auth surface. Before scoring, classify the app:

- **If the application has no auth/security tables** (no `users`, `nonce`, `rate_limit`, `mfa`, `oauth`, `csrf` tables), the **Security-Critical Constraint Checks** section yields **N/A**; proceed to Data Integrity, Value-Domain CHECK, Sequence/Ordering, and overlapping-table checks. Score the auth section as **N/A**, not 100/100, so an empty security surface does not inflate the report.
- **If the application has no database schema at all**, record the audit as N/A and stop.

This is expected for single-team tools derived from spernakit that strip the auth stack; it is not a finding. The security rules remain valid and CRITICAL for auth-bearing apps and must not be narrowed away.

### Dialect Awareness

Spernakit supports **SQLite** (default) and **PostgreSQL** (via `config.database.dialect`). All constraint rules apply regardless of dialect. Spernakit apps carry **both** schema directories simultaneously (`backend/src/db/schema/` for SQLite and `backend/src/db/schema-pg/` for PostgreSQL); derived applications do not choose a dialect at build time. Examples in this audit use `sqliteTable()`; the parallel `schema-pg/` files use `pgTable()` with identical logical structure. The same uniqueness, foreign key, and index naming conventions apply to both dialects.

### Schema Parity (SQLite ↔ PostgreSQL)

Spernakit maintains parallel schema directories (`schema/` for SQLite, `schema-pg/` for PostgreSQL). The automated `check:schema-parity` CI check validates structural parity between them. During audit, spot-check that unique constraints present in SQLite schemas are mirrored in PostgreSQL schemas and vice versa. Flag any divergence as a finding.

### Auto-Migration Safety

SQLite databases auto-apply pending migrations on startup (`autoMigrate.ts`). When adding a new unique constraint via migration, verify that **existing data does not violate the constraint** before the migration runs; otherwise the application will fail to start. Check this by:

1. Querying for duplicate values in the target column before writing the migration
2. Adding a data-fixup step in the migration if duplicates exist
3. Testing the migration against a copy of the production database

### Verification Commands

The following are **illustrative triage commands** intended only to narrow which files to open, **not** to produce findings directly. Every match must be hand-verified against the actual schema file because these greps produce high false-positive rates (see warnings below). Use the Claude Code `Grep` tool for these patterns if running under an agent.

```bash
# Find columns that MAY need a unique constraint (nonce, token, key patterns).
# ⚠️ FALSE POSITIVE EXPECTED: matches every column with "key"/"token" in the name
#    regardless of semantics. Always open the file to judge intent.
grep -r "\.notNull()" backend/src/db/schema/ | grep -E "(nonce|token|key)"

# Find every FK that references users.id WITHOUT an inline .unique().
# ⚠️ HEAVY FALSE POSITIVES: this flags every many-to-one relationship
#    (auditLogs.userId, notifications.userId, fileUploads.userId, etc.) —
#    most of these CORRECTLY have no unique constraint. Only flag findings
#    where the schema's docstring or service usage implies 1:1 semantics
#    (e.g., settings, preferences, per-user singleton tables). ALWAYS consult
#    the "Intentionally NOT unique" table below before filing a finding.
grep -r "references.*users\.id" backend/src/db/schema/ | grep -v "\.unique()"

# Verify index/FK naming conventions.
# ⚠️ NAMING CONVENTION: per DEVELOPMENT.md, FKs use the column-qualified
#    fk_{table}_{column}_{target} format and MUST be declared via
#    foreignKey({...}).onDelete(...) in the constraints array. This is
#    enforced across BOTH dialects — flag inline `.references()` and
#    unnamed FKs as findings in SQLite (schema/) and PostgreSQL (schema-pg/).
grep -r "index\|foreignKey\|\.references" backend/src/db/schema/ | grep -v "idx_\|fk_"

# Find any remaining inline .references() (banned — anonymous constraints).
# Every hit is a finding: the FK must move to a named foreignKey({...}) entry.
grep -rn "\.references(" backend/src/db/schema/ backend/src/db/schema-pg/
```

## Security-Critical Constraint Checks

### CRITICAL: Anti-Replay Nonce Columns

**Pattern**: Tables that store nonces for replay attack prevention

**Required Constraint**: `nonce` column MUST have `.unique()`

_Examples are simplified for illustration. Actual template files use the two-argument `sqliteTable` form with a constraints callback for indexes and include comprehensive JSDoc docstrings. See `apiKeyNonces.ts` for the complete pattern._

```typescript
// ❌ VULNERABLE: Missing unique constraint
export const apiKeyNonces = sqliteTable('api_key_nonces', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	nonce: text('nonce').notNull(), // VULNERABILITY: duplicates allowed
	// ... other columns
});

// ✅ SECURE: Unique constraint prevents replay attacks
export const apiKeyNonces = sqliteTable(
	'api_key_nonces',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		nonce: text('nonce').notNull().unique(), // SECURE: duplicates rejected
		// ... other columns
	},
	(table) => [index('idx_api_key_nonces_expires_at').on(table.expiresAt)],
);
```

**Risk Without Constraint**: During race conditions, duplicate nonces can be inserted, allowing replay attacks to bypass API key authentication.

**Detection Pattern**:

```bash
# Find nonce columns — then manually verify each has .unique() on the same logical line.
# ⚠️ `grep -A2 | grep -v` filters lines, not context blocks; if .unique() is placed on a
#    subsequent chained line (rare in this codebase, but possible), the block will falsely
#    pass. Treat this only as a file-locator, then open each file and read the full column
#    definition.
grep -n "nonce.*text" backend/src/db/schema/*.ts
```

### CRITICAL: Rate Limit Key Columns

**Pattern**: Tables that track rate limit counters per key

**Required**: Either `.unique()` constraint OR documented upsert pattern in service

_Examples are simplified for illustration. See `rateLimitEntries.ts` for the complete template pattern with indexes and docstrings._

```typescript
// ❌ RISK: No unique constraint, no upsert documentation
export const rateLimitEntries = sqliteTable('rate_limit_entries', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	key: text('key').notNull(), // RISK: race conditions create duplicates
	// ... other columns
});

// ✅ OPTION 1: Unique constraint (inline)
export const rateLimitEntries = sqliteTable(
	'rate_limit_entries',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		key: text('key').notNull().unique(), // SAFE: duplicates rejected
		// ... other columns
	},
	(table) => [index('idx_rate_limit_entries_reset_at').on(table.resetAt)],
);

// ✅ OPTION 2: Documented upsert pattern in service
// Service uses: INSERT OR REPLACE ON CONFLICT(key) DO UPDATE...
```

**Risk Without Constraint**: Under high traffic with concurrent requests, multiple rows can be created for the same key, causing rate limit counters to split and rate limiting to become inaccurate.

**Detection Pattern**:

```bash
# Find rate limit tables by filename or content.
grep -l "rate.*limit\|ratelimit" backend/src/db/schema/*.ts

# Then open each file and confirm the rate-limit `key` column either has `.unique()`
# inline OR the service layer uses `INSERT ... ON CONFLICT(key) DO UPDATE` (upsert).
# ⚠️ grep alone cannot prove upsert coverage — hand-verify in the service layer.
```

### HIGH: Share Tokens and Public Access Tokens

**Pattern**: Columns used as public URL tokens for resource sharing (e.g., `shareToken` on dashboards, shared links)

**Required Constraint**: Token column MUST have a `uniqueIndex()`; duplicate tokens could grant unauthorized access to resources

```typescript
// ✅ CORRECT: Share token with uniqueIndex
export const dashboards = sqliteTable(
	'dashboard_configs',
	{
		// ... other columns
		shareToken: text('share_token'),
	},
	(table) => [uniqueIndex('idx_dashboard_configs_share_token').on(table.shareToken)],
);
```

**Risk Without Constraint**: If two resources generate the same share token, users accessing via one token could see another user's shared resource. Tokens must be globally unique.

**Detection Pattern**: Search schema files for columns named `shareToken`, `shareLink`, `publicToken`, `accessToken` (when used for URL-based sharing), or similar patterns. Verify each has a unique constraint.

### CRITICAL: Real-World Template Unique Columns (Reference Inventory)

The following columns on canonical spernakit tables MUST carry `.unique()` (or `uniqueIndex()` for composites). Derived applications that remove or weaken these constraints are regressing the template's security posture. Treat divergence as **CRITICAL**.

| File                                        | Column                           | Why Unique                                                 |
| ------------------------------------------- | -------------------------------- | ---------------------------------------------------------- |
| `backend/src/db/schema/users.ts`            | `email`                          | Login identifier: duplicates break auth and password reset |
| `backend/src/db/schema/users.ts`            | `username`                       | Login identifier: duplicates break auth                    |
| `backend/src/db/schema/users.ts`            | `csrfToken`                      | Per-session CSRF replay prevention                         |
| `backend/src/db/schema/users.ts`            | `emailVerificationToken`         | Single-use verification link token                         |
| `backend/src/db/schema/users.ts`            | `refreshTokenHash`               | JWT refresh binding: duplicates enable token re-use        |
| `backend/src/db/schema/users.ts`            | `resetToken`                     | Single-use password-reset link token                       |
| `backend/src/db/schema/apiKeys.ts`          | `keyIndexHash`                   | O(1) lookup hash; MUST be unique                           |
| `backend/src/db/schema/apiKeyNonces.ts`     | `nonce`                          | Anti-replay                                                |
| `backend/src/db/schema/rateLimitEntries.ts` | `key`                            | One counter per rate-limit key                             |
| `backend/src/db/schema/mfaSettings.ts`      | `userId`                         | One MFA settings row per user                              |
| `backend/src/db/schema/dashboards.ts`       | `shareToken` (via `uniqueIndex`) | Public share URL                                           |

**Intentionally NOT unique** (these are easy false positives; do not flag as findings):

| File                                     | Column    | Why the absence of `.unique()` is correct                                                                                          |
| ---------------------------------------- | --------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `backend/src/db/schema/apiKeys.ts`       | `keyHash` | bcrypt-salted: each hash is globally distinct by construction; uniqueness would be redundant. Lookup uses `keyIndexHash` (unique). |
| `backend/src/db/schema/auditLogs.ts`     | `userId`  | Many-to-one: one user generates many log rows                                                                                      |
| `backend/src/db/schema/notifications.ts` | `userId`  | Many-to-one: one user receives many notifications                                                                                  |
| `backend/src/db/schema/fileUploads.ts`   | `userId`  | Many-to-one: one user uploads many files                                                                                           |

## Data Integrity Constraint Checks

### CRITICAL: One-to-One Relationship Columns

**Pattern**: Tables that should have exactly one row per entity (user preferences, user settings)

**Required Constraint**: The foreign key column MUST have `.unique()`

_Examples are simplified for illustration. Actual template files use alphabetical column ordering, two-argument `sqliteTable` form with a constraints callback, and JSDoc docstrings with "Intentional omissions" and "Foreign key cascade behavior" sections. The relationship is declared via `foreignKey({ columns, foreignColumns, name }).onDelete(...)` in the constraints array (never inline `.references()`); only `.unique()` stays inline on the column. See `mfaSettings.ts` for a representative template file._

```typescript
// ❌ DATA INTEGRITY VIOLATION: Multiple settings per user possible
export const mfaSettings = sqliteTable(
	'mfa_settings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').notNull(), // MISSING: .unique()
		// ... other columns (alphabetically ordered in actual files)
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_mfa_settings_user_id_users',
		}).onDelete('cascade'),
	],
);

// ✅ CORRECT: One settings row per user enforced via inline .unique();
// the FK is declared in the constraints array as a named constraint.
export const mfaSettings = sqliteTable(
	'mfa_settings',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		userId: integer('user_id').notNull().unique(), // ENFORCED: one row per user
		// ... other columns (alphabetically ordered in actual files)
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_mfa_settings_user_id_users',
		}).onDelete('cascade'),
	],
);
```

**Risk Without Constraint**:

- Multiple preference rows can be created for a single user
- `SELECT ... WHERE userId = ?` may return multiple rows, causing unpredictable behavior
- Updates may affect wrong row
- Data integrity is compromised

**Detection Pattern**:

```bash
# Find preference/settings tables (by filename or schema docstring).
grep -l "preferences\|settings\|config" backend/src/db/schema/*.ts

# Then open each file and verify the userId column has .unique() inline.
# ⚠️ The `grep -B2 -A5 | grep` context-block approach is unreliable
#    (context separators break line-based filtering). Prefer hand-inspection:
#    a single-row-per-user table should have `userId: integer('user_id').notNull().unique()`
#    on the column, with the FK declared as a named `foreignKey({...})` in the constraints array.
```

### HIGH: Junction Table Uniqueness

**Pattern**: Polymorphic junction tables (entity_tags, entity_permissions)

**Required Constraint**: Composite unique on `(entityType, entityId, targetId)`

```typescript
// ❌ RISK: Duplicate tag assignments possible
const entityTags = sqliteTable(
	'entity_tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		entityType: text('entity_type').notNull(),
		entityId: integer('entity_id').notNull(),
		tagId: integer('tag_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: 'fk_entity_tags_tag_id_tags',
		}),
	],
);

// ✅ CORRECT: Prevent duplicate tag assignments using uniqueIndex
// Template convention: use uniqueIndex() for composite uniqueness (provides named index);
// declare the FK as a named constraint in the constraints array, never inline .references().
const entityTags = sqliteTable(
	'entity_tags',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		entityType: text('entity_type').notNull(),
		entityId: integer('entity_id').notNull(),
		tagId: integer('tag_id').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.tagId],
			foreignColumns: [tags.id],
			name: 'fk_entity_tags_tag_id_tags',
		}),
		uniqueIndex('idx_entity_tags_entity_tag').on(table.entityType, table.entityId, table.tagId),
	],
);
```

### HIGH: Dual-Composite Uniqueness on One Table

**Pattern**: A single table that requires **two independent** composite unique indexes to enforce different invariants simultaneously.

**Canonical example**: `oauthAccounts` enforces both:

1. `(provider, providerAccountId)` must be unique; prevents two Spernakit users from claiming the same external OAuth identity.
2. `(userId, provider)` must be unique; prevents one Spernakit user from linking the same provider twice.

Neither constraint alone is sufficient. Both are required.

```typescript
// ✅ CORRECT: Two composite unique indexes on the same table
const oauthAccounts = sqliteTable(
	'oauth_accounts',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		provider: text('provider', { enum: ['google', 'github', 'microsoft'] }).notNull(),
		providerAccountId: text('provider_account_id').notNull(),
		userId: integer('user_id').notNull(),
		// ... other columns
	},
	(table) => [
		foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: 'fk_oauth_accounts_user_id_users',
		}).onDelete('cascade'),
		index('idx_oauth_accounts_user_id').on(table.userId),
		uniqueIndex('idx_oauth_accounts_provider_account').on(
			table.provider,
			table.providerAccountId,
		),
		uniqueIndex('idx_oauth_accounts_user_provider').on(table.userId, table.provider),
	],
);
```

**Soft-delete interaction**: If the table supports soft delete, both unique indexes continue to occupy slots for deleted rows. `oauthAccounts.ts` explicitly documents this in its docstring: unlink operations **must hard-delete** to free the slots, or users cannot relink. Document this pattern in the schema file's JSDoc whenever soft delete coexists with composite uniqueness.

**Detection**: Any table defining two or more `uniqueIndex()` entries in its constraints callback is using this pattern. Verify both capture real business invariants (not redundant coverage of the same column set).

### HIGH: Value-Domain CHECK Constraints

**Pattern**: Columns whose valid values are restricted to a fixed set (enum-like text columns such as `status`, `backend`, `type`, `method`, `role`) or to a structural invariant (JSON columns that must hold valid JSON).

> Score against "CHECK constraints on all enum-like columns"; for example, an unconstrained `runs.backend` column is a finding.

**Required**:

- **Enum-like text columns**: Constrain the value domain at the database level. Prefer Drizzle's `text('col', { enum: [...] })`, which emits a CHECK constraint, over an unconstrained `text('col')`. Where the value set is shared, source the enum from `spernakit-shared` (e.g. `MFA_METHODS`, `OAUTH_PROVIDERS`).
- **JSON columns**: Add a `json_valid()` CHECK (SQLite) / equivalent (PostgreSQL) so malformed JSON cannot be persisted (e.g. a `settings.value` column that must be valid JSON).

```typescript
// ❌ RISK: backend accepts any string — no value-domain enforcement
export const runs = sqliteTable('runs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	backend: text('backend').notNull(), // RISK: 'cli', 'web', or a typo all pass
});

// ✅ CORRECT: enum-constrained column emits a CHECK on the value domain
export const runs = sqliteTable('runs', {
	id: integer('id').primaryKey({ autoIncrement: true }),
	backend: text('backend', { enum: ['cli', 'web'] }).notNull(), // CHECK enforced
});
```

**Risk Without Constraint**: Application bugs or direct writes can persist out-of-domain values (typos, retired states) that downstream `switch`/filter logic does not handle, producing silent data corruption and unhandled cases.

**Detection Pattern**: Identify text columns whose name implies a closed value set (`status`, `state`, `backend`, `type`, `kind`, `method`, `mode`, `role`) and verify each uses `text({ enum: [...] })` or carries a CHECK constraint. For JSON columns, verify a `json_valid()` CHECK exists.

```bash
# Find candidate enum-like text columns lacking an `enum:` option.
grep -rnE "text\('(status|state|backend|type|kind|method|mode|role)" backend/src/db/schema/ \
	| grep -v "enum:"
```

### HIGH: Sequence / Ordering Uniqueness

**Pattern**: Tables with an ordering column (`displayOrder`, `sortOrder`, `position`, `rank`) scoped to a parent, where each position within a parent must be occupied at most once.

> `pipeline_step_results` must enforce unique `(session_id, display_order)` so two steps cannot claim the same slot in a session.

**Required Constraint**: A composite `uniqueIndex(parentId, order)` so a given position cannot be duplicated within its parent scope.

```typescript
// ❌ RISK: two steps can share display_order within the same session
const pipelineStepResults = sqliteTable(
	'pipeline_step_results',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: integer('session_id').notNull(),
		displayOrder: integer('display_order').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [pipelineSessions.id],
			name: 'fk_pipeline_step_results_session_id_pipeline_sessions',
		}).onDelete('cascade'),
	],
);

// ✅ CORRECT: position is unique per parent scope
const pipelineStepResults = sqliteTable(
	'pipeline_step_results',
	{
		id: integer('id').primaryKey({ autoIncrement: true }),
		sessionId: integer('session_id').notNull(),
		displayOrder: integer('display_order').notNull(),
	},
	(table) => [
		foreignKey({
			columns: [table.sessionId],
			foreignColumns: [pipelineSessions.id],
			name: 'fk_pipeline_step_results_session_id_pipeline_sessions',
		}).onDelete('cascade'),
		uniqueIndex('idx_pipeline_step_results_session_order').on(
			table.sessionId,
			table.displayOrder,
		),
	],
);
```

**Risk Without Constraint**: Duplicate positions make ordering non-deterministic: reorder operations, "move up/down" actions, and rendered sequences become ambiguous, and a buggy write can silently collapse two items onto one slot.

**Detection Pattern**: Search for ordering columns and verify each parent-scoped one has a composite `uniqueIndex` with its parent key.

```bash
grep -rnE "(display_order|sort_order|position|rank)" backend/src/db/schema/
```

## Overlapping Table Detection

### MEDIUM: Tables with Overlapping Purpose

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

**Detection Pattern**: List all schema file names and look for tables in the same domain (e.g., files containing "compliance", "audit", "security" in their names or table definitions). Cross-reference by reading each file's docstring to understand purpose.

### Remediation Options

1. **If both needed**: Add clear documentation in schema comments explaining the distinction
2. **If redundant**: Create migration plan to consolidate
3. **If unclear**: Document as technical debt for future resolution

### LOW: Boolean `isDefault` Flag Enforcement

**Pattern**: Tables with a boolean `isDefault` column where only one row per scope should be the default (e.g., one default workspace per user, one default dashboard per user)

**Required**: A documented enforcement strategy: either a partial unique index (PostgreSQL) or application-layer enforcement with docstring note (SQLite)

**PostgreSQL**: Use a partial unique index. In raw SQL: `CREATE UNIQUE INDEX idx_table_scope_default ON table (scopeId) WHERE isDefault = true`. In Drizzle (`schema-pg/`):

```typescript
import { sql } from 'drizzle-orm';
import { boolean, integer, pgTable, uniqueIndex } from 'drizzle-orm/pg-core';

const dashboards = pgTable(
	'dashboard_configs',
	{
		id: integer('id').primaryKey(),
		userId: integer('user_id').notNull(),
		isDefault: boolean('is_default').notNull().default(false),
		// ...
	},
	(table) => [
		uniqueIndex('idx_dashboard_configs_user_default')
			.on(table.userId)
			.where(sql`${table.isDefault} = true`),
	],
);
```

**SQLite**: SQLite does support partial indexes syntactically (`WHERE`-clauses on `CREATE INDEX`), but Drizzle's `sqlite-core` does not expose a direct `.where()` builder for `uniqueIndex` the way `pg-core` does. The practical consequence: document the application-layer enforcement strategy in the schema file's JSDoc docstring. For example, the dashboards schema explicitly notes: _"per-user uniqueness is enforced at the application layer: the service clears the previous default inside a transaction before setting the new one."_

**Detection**: Search for `isDefault` or `is_default` boolean columns. For each, verify the enforcement strategy is documented in the schema docstring or implemented as a database constraint.

## Duplicate System Detection

> **See [DATA_ARCHITECTURE.md](./DATA_ARCHITECTURE.md)** for higher-level duplicate-system / overlapping-consolidation analysis; this section focuses on schema-level competing storage mechanisms.

### MEDIUM: Competing Tagging/Attribute Systems

**Pattern**: Two mechanisms for storing the same type of data

**Example Finding**:

```
Duplicate Tagging Systems:
1. JSON tags column on servers table: tags: text('tags', { mode: 'json' }).$type<string[]>()
2. Polymorphic entityTags table: Links tags to entities via entityType + entityId

Risk: Data inconsistency, confusion, split source of truth
```

**Detection Pattern**: Read each schema file and identify JSON columns that store collections (arrays/maps) of a data type that also has a dedicated junction table. Cross-reference by searching for `mode: 'json'` columns alongside tables with `entityType`/`entityId` patterns.

### Remediation

1. **Audit all usages** of both systems
2. **Create migration script** to consolidate data
3. **Deprecate and remove** the inferior approach
4. **Update documentation** to clarify single source of truth

## Template vs App-Specific Origin Mapping

### Purpose

When auditing a derived application (e.g., an app built on spernakit), determine which findings should:

1. **ESCALATE** to the base template (template-origin files)
2. **KEEP LOCAL** to the derived app (app-specific files)

### Origin Classification

| Origin                | Criteria                                                 | Action                                                       |
| --------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| **TEMPLATE**          | File exists in both template and app with identical path | Finding applies to template - ESCALATE                       |
| **APP-SPECIFIC**      | File exists only in derived app                          | Finding stays local - KEEP                                   |
| **MODIFIED-TEMPLATE** | Template-origin file with app modifications              | Check if issue is in template portion - CONDITIONAL ESCALATE |

### Detection Method

For each schema file in the derived app's `backend/src/db/schema/` directory:

1. Check if a file with the same name exists in the spernakit template at `backend/src/db/schema/`
2. If it exists in both places: classify as **TEMPLATE** (or **MODIFIED-TEMPLATE** if contents differ)
3. If it exists only in the derived app: classify as **APP-SPECIFIC**

### Escalation Criteria

Escalate finding to template if ALL of:

1. File exists in template at same path
2. Same constraint issue exists in template file
3. Fix would benefit all derived applications

## Audit Checklist

### Critical Checks

- [ ] **Nonce columns** have `.unique()` constraint (replay attack prevention)
- [ ] **Rate limit key columns** have `.unique()` OR documented upsert pattern
- [ ] **Per-user settings tables** have unique constraint on `userId`
- [ ] **Security token columns** have `.unique()` constraint
- [ ] **API key columns** have `.unique()` constraint where semantically required
- [ ] **Share tokens and public access tokens** have `.unique()` or `uniqueIndex()` constraint
- [ ] **New unique constraints** tested against existing data before auto-migration (no startup failures)

### High Priority Checks

- [ ] **Junction tables** have composite unique constraints (use `uniqueIndex()` for named composite constraints)
- [ ] **Email/username columns** have `.unique()` constraint
- [ ] **External ID columns** have `.unique()` constraint
- [ ] **Session token columns** have `.unique()` constraint
- [ ] **Enum-like text columns** (`status`, `backend`, `type`, etc.) use `text({ enum: [...] })` or carry a CHECK constraint; **JSON columns** carry a `json_valid()` CHECK
- [ ] **Sequence/ordering columns** (`displayOrder`, `sortOrder`, `position`) have a composite `uniqueIndex(parentId, order)`
- [ ] **Foreign keys** declared via named `foreignKey({...}).onDelete(...)` in the constraints array (no inline `.references()`), in both `schema/` and `schema-pg/`
- [ ] **Overlapping tables** documented or flagged for consolidation
- [ ] **SQLite ↔ PostgreSQL schema parity**: unique constraints mirrored between `schema/` and `schema-pg/` (spot-check; automated via `check:schema-parity` in CI)

### Medium Priority Checks

- [ ] **Duplicate tagging systems** identified and documented
- [ ] **Overlapping table purposes** documented
- [ ] **Deprecated columns** flagged for removal
- [ ] **Migration paths** documented for consolidation
- [ ] **Template vs app-specific** origin mapped for all findings

### Low Priority Checks

- [ ] Schema comments explain table purposes
- [ ] Foreign key cascade behavior documented
- [ ] Index coverage adequate for query patterns
- [ ] Soft delete patterns consistent (core entities only; ephemeral/security tables use hard delete)
- [ ] Index names follow `idx_{table}_{columns}` convention
- [ ] Foreign key names follow `fk_{table}_{column}_{target}` convention, declared via `foreignKey({...}).onDelete(...)` in the constraints array; required in the schema source for **both** dialects. Flag inline `.references()` and unnamed/anonymous FKs in SQLite schemas as findings, not just PostgreSQL.
- [ ] Soft-delete + unique constraint interaction handled (partial indexes or application-level enforcement)
- [ ] Boolean `isDefault` flags have documented enforcement strategy (partial unique index for PostgreSQL, application-layer enforcement for SQLite with docstring note)

## Feature.json Generation

### Output Format

For each finding, generate a feature.json in `.aidd/features/audit-database-{timestamp}-{slug}/`:

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
	"auditSource": "SCHEMA_CONSTRAINTS",
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

| Issue Type                                       | Severity | Priority |
| ------------------------------------------------ | -------- | -------- |
| Missing unique on security nonce/token           | Critical | 1        |
| Missing unique on rate-limit key                 | High     | 2        |
| Missing unique on 1:1 relationship               | Critical | 1        |
| Missing unique on public share token             | High     | 2        |
| Overlapping tables                               | Medium   | 3        |
| Duplicate systems                                | Medium   | 3        |
| Boolean isDefault without documented enforcement | Low      | 4        |

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

1. **Feature.json files** for each finding in `.aidd/features/audit-database-{timestamp}-{slug}/`
2. **Audit report** summarizing all findings
3. **Origin map** showing template vs app-specific classification
4. **Escalation list** for findings that apply to template

### Success Criteria

- **100% of security-critical columns** have unique constraints
- **100% of 1:1 relationships** have unique foreign keys
- **Zero overlapping tables** without documentation
- **Zero duplicate systems** without migration plan
- **All findings** have remediation spec

---
title: 'Database Design and Migration Audit Framework'
last_updated: '2025-01-13'
version: '1.0'
category: 'Core Architecture'
priority: 'High'
estimated_time: '2-3 hours'
frequency: 'Quarterly'
---

# Database Design and Migration Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

## Executive Summary

**🎯 Critical Database Standards**

- **Schema Evolution**: Safe, backward-compatible migrations with rollback procedures
- **Data Integrity**: Comprehensive validation during migrations and schema changes
- **Performance Impact**: Migration performance analysis and optimization strategies
- **Version Control**: Schema versioning and compatibility management
- **Zero Downtime**: Migration strategies that maintain service availability

**📋 Essential Migration Patterns**

- **Incremental Changes**: Small, atomic migrations over large schema overhauls
- **Backward Compatibility**: Maintain compatibility during transition periods
- **Data Validation**: Integrity checks before and after migrations
- **Rollback Procedures**: Safe rollback strategies for failed migrations
- **Performance Monitoring**: Track migration impact on system performance

**⚡ Schema Design Standards**

- **Database Schema**: Proper indexing, field validation, and relationship design
- **Migration Safety**: Non-destructive changes with data preservation
- **Version Management**: Clear schema versioning and upgrade paths
- **Documentation**: Migration documentation and change logs

**🔒 Data Safety Requirements**

- **Backup Procedures**: Pre-migration backups and recovery strategies
- **Validation Checks**: Data integrity validation throughout migration process
- **Testing Protocols**: Testing in staging environments
- **Monitoring**: Real-time monitoring during migration execution

## Table of Contents

### **🚨 Critical Migration Standards**

1. [Migration Safety Procedures](#migration-safety-procedures)
2. [Schema Versioning and Compatibility](#schema-versioning-and-compatibility)
3. [Data Integrity Validation](#data-integrity-validation)
4. [Performance Impact Assessment](#performance-impact-assessment)

### **📋 Best Practices**

5. [Schema Design Patterns](#schema-design-patterns)
6. [Migration Planning and Execution](#migration-planning-and-execution)
7. [Rollback Strategies](#rollback-strategies)
8. [Testing and Validation](#testing-and-validation)

### **⚠️ Common Anti-Patterns**

9. [Migration Anti-Patterns to Avoid](#migration-anti-patterns-to-avoid)

## Migration Safety Procedures

### **🚨 CRITICAL: Pre-Migration Safety Checklist**

**Mandatory Steps (100% Compliance Required)**:

```typescript
// ✅ CORRECT: Safe migration pattern
interface MigrationResult {
	processed: number;
	errors: string[];
	completed: boolean;
}

async function migrateUserSchema(batchSize = 50, dryRun = false): Promise<MigrationResult> {
	// 1. Validate current schema state
	const schemaVersion = await db.metadata.findUnique({
		where: { key: 'schema_version' },
	});

	if (!schemaVersion || schemaVersion.value !== '1.0') {
		throw new Error('Invalid schema version for migration');
	}

	// 2. Get batch of records to migrate (uses index on migrated field)
	const users = await db.users.findMany({
		where: { migrated: false },
		take: batchSize,
	});

	if (users.length === 0) {
		return { processed: 0, errors: [], completed: true };
	}

	const errors: string[] = [];
	let processed = 0;

	// 3. Process each record with validation
	for (const user of users) {
		try {
			// Validate data before migration
			if (!user.email || !user.name) {
				errors.push(`Invalid user data: ${user.id}`);
				continue;
			}

			if (dryRun) {
				processed++;
				continue;
			}

			// Perform migration with new schema
			await db.users.update({
				where: { id: user.id },
				data: {
					email: user.email.toLowerCase(), // Normalize email
					displayName: user.name,
					migrationVersion: '2.0',
					migratedAt: new Date(),
					migrated: true,
				},
			});

			processed++;
		} catch (error) {
			errors.push(`Migration failed for ${user.id}: ${error.message}`);
		}
	}

	return {
		processed,
		errors,
		completed: users.length < batchSize,
	};
}
```

### **🔒 Rollback Procedures**

**Every migration MUST have a corresponding rollback function**:

```typescript
// ✅ CORRECT: Rollback function
interface RollbackResult {
	processed: number;
	completed: boolean;
}

async function rollbackUserSchema(batchSize = 50): Promise<RollbackResult> {
	// Use index on migrationVersion field
	const users = await db.users.findMany({
		where: { migrationVersion: '2.0' },
		take: batchSize,
	});

	for (const user of users) {
		await db.users.update({
			where: { id: user.id },
			data: {
				// Restore original schema
				name: user.displayName,
				migrationVersion: '1.0',
				migrated: false,
				// Remove new fields (set to null)
				displayName: null,
				migratedAt: null,
			},
		});
	}

	return {
		processed: users.length,
		completed: users.length < batchSize,
	};
}
```

## Schema Versioning and Compatibility

### **📋 Version Management Strategy**

**Schema Version Tracking**:

```typescript
// ✅ CORRECT: Schema version management (using Prisma-like schema)
// schema.prisma or equivalent schema definition

model Metadata {
  id        String   @id @default(cuid())
  key       String   @unique
  value     String   // Store as JSON for union types
  updatedAt DateTime @updatedAt

  @@index([key])
}

model User {
  id               String    @id @default(cuid())
  email            String    @unique
  name             String    // v1.0 field
  displayName      String?   // v2.0 field (optional for migration)
  migrationVersion String?   // Track which schema version
  migrated         Boolean   @default(false)
  createdAt        DateTime  @default(now())

  @@index([email])
  @@index([migrated])
  @@index([migrationVersion])
}
```

### **🔄 Backward Compatibility Patterns**

```typescript
// ✅ CORRECT: Backward compatible field access
interface UserResponse {
	id: string;
	email: string;
	displayName: string;
}

async function getUser(userId: string): Promise<UserResponse | null> {
	const user = await db.users.findUnique({
		where: { id: userId },
	});

	if (!user) return null;

	return {
		id: user.id,
		email: user.email,
		// Handle both old and new schema
		displayName: user.displayName || user.name || 'Unknown User',
	};
}
```

## Data Integrity Validation

### **✅ Validation Procedures**

**Pre-Migration Validation**:

```typescript
interface ValidationResult {
	valid: boolean;
	issues: string[];
}

async function validatePreMigration(): Promise<ValidationResult> {
	const issues: string[] = [];

	// Check for required fields (use raw query for null checks)
	const usersWithoutEmail = await db.users.count({
		where: { email: null },
	});

	if (usersWithoutEmail > 0) {
		issues.push(`${usersWithoutEmail} users missing email`);
	}

	// Check for data consistency - find duplicate emails
	const duplicateEmails = await db.users.groupBy({
		by: ['email'],
		_count: { email: true },
		having: {
			email: { _count: { gt: 1 } },
		},
	});

	if (duplicateEmails.length > 0) {
		issues.push(`${duplicateEmails.length} duplicate email addresses found`);
	}

	return { valid: issues.length === 0, issues };
}
```

## Performance Impact Assessment

### **📊 Migration Performance Monitoring**

```typescript
interface PerformanceMetrics {
	startTime: number;
	recordCount: number;
	estimatedDuration: number;
}

async function monitorMigrationPerformance(migrationName: string): Promise<PerformanceMetrics> {
	const startTime = Date.now();

	// Sample migration performance
	const sampleSize = 10;
	const sampleStart = Date.now();

	// Perform sample migration (uses index on migrated field)
	const sampleUsers = await db.users.findMany({
		where: { migrated: false },
		take: sampleSize,
	});

	// Simulate migration work
	for (const user of sampleUsers) {
		// Measure actual migration time per record
		await new Promise((resolve) => setTimeout(resolve, 1));
	}

	const sampleDuration = Date.now() - sampleStart;
	const avgTimePerRecord = sampleDuration / sampleSize;

	// Estimate total migration time
	const totalRecords = await db.users.count({
		where: { migrated: false },
	});

	const estimatedDuration = avgTimePerRecord * totalRecords;

	// Log performance metrics
	console.log(`Migration ${migrationName} performance:`, {
		avgTimePerRecord,
		totalRecords,
		estimatedDuration,
	});

	return {
		startTime,
		recordCount: totalRecords,
		estimatedDuration,
	};
}
```

### **⚡ Performance Optimization Strategies**

1. **Batch Processing**: Process records in small batches (50-100 records)
2. **Index Optimization**: Ensure proper indexes for migration queries
3. **Parallel Processing**: Use multiple migration functions for independent data
4. **Progress Tracking**: Monitor and report migration progress
5. **Resource Management**: Limit concurrent migrations to prevent overload

## Schema Design Patterns

### **🏗️ Schema Design Best Practices**

```typescript
// ✅ CORRECT: Well-designed database schema (Prisma-like syntax)

model User {
  id            String        @id @default(cuid())
  email         String        @unique
  createdAt     DateTime      @default(now())

  // Optional fields for schema evolution
  displayName   String?
  avatar        String?
  preferences   Json?         // Store as JSON for flexibility

  // Migration tracking
  schemaVersion String?
  lastMigrated  DateTime?

  // Relations
  profile       UserProfile?

  @@index([email])
  @@index([createdAt])
  @@index([schemaVersion])
}

// Separate table for complex relationships
model UserProfile {
  id        String   @id @default(cuid())
  userId    String   @unique
  bio       String?
  location  String?
  website   String?
  updatedAt DateTime @updatedAt

  // Relations
  user      User     @relation(fields: [userId], references: [id])

  @@index([userId])
}
```

### **🔗 Relationship Design Patterns**

```typescript
// ✅ CORRECT: Efficient relationship queries
interface UserWithProfile {
	user: {
		id: string;
		email: string;
		displayName: string | null;
	};
	profile?: {
		bio: string | null;
		location: string | null;
	};
}

async function getUserWithProfile(userId: string): Promise<UserWithProfile | null> {
	const user = await db.users.findUnique({
		where: { id: userId },
		include: {
			profile: true,
		},
	});

	if (!user) return null;

	return {
		user: {
			id: user.id,
			email: user.email,
			displayName: user.displayName,
		},
		profile: user.profile
			? {
					bio: user.profile.bio,
					location: user.profile.location,
				}
			: undefined,
	};
}
```

## Migration Planning and Execution

### **📋 Migration Execution Checklist**

**Phase 1: Planning (Required)**

- [ ] Document current schema state
- [ ] Design target schema with backward compatibility
- [ ] Create migration and rollback functions
- [ ] Estimate migration time and resource requirements
- [ ] Plan maintenance window if needed

**Phase 2: Testing (Required)**

- [ ] Test migration on development data
- [ ] Validate data integrity after migration
- [ ] Test rollback procedures
- [ ] Performance test with production-sized datasets
- [ ] Test application functionality with new schema

**Phase 3: Execution (Required)**

- [ ] Create pre-migration backup
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

### **🔄 Rollback Decision Matrix**

| Scenario                    | Rollback Strategy                   | Risk Level  | Time Window |
| --------------------------- | ----------------------------------- | ----------- | ----------- |
| **Data Corruption**         | Immediate rollback + restore backup | 🚨 CRITICAL | <5 minutes  |
| **Performance Degradation** | Gradual rollback with monitoring    | ⚠️ HIGH     | <30 minutes |
| **Feature Regression**      | Rollback + hotfix deployment        | 📋 MEDIUM   | <2 hours    |
| **Minor Issues**            | Forward fix or scheduled rollback   | 📝 LOW      | <24 hours   |

### **🚨 Emergency Rollback Procedures**

```typescript
// ✅ CORRECT: Emergency rollback with validation
interface EmergencyRollbackResult {
	success: boolean;
	message: string;
	affectedRecords: number;
}

async function emergencyRollback(
	migrationId: string,
	reason: string,
	validateOnly = false
): Promise<EmergencyRollbackResult> {
	// Log rollback initiation
	console.error(`Emergency rollback initiated: ${reason}`);

	// Validate rollback is possible
	const migrationStatus = await db.migrations.findUnique({
		where: { migrationId },
	});

	if (!migrationStatus || migrationStatus.status !== 'completed') {
		return {
			success: false,
			message: 'Migration not found or not in rollback-able state',
			affectedRecords: 0,
		};
	}

	if (validateOnly) {
		const affectedCount = await db.users.count({
			where: { migrationVersion: migrationStatus.targetVersion },
		});

		return {
			success: true,
			message: `Rollback validation successful. ${affectedCount} records would be affected.`,
			affectedRecords: affectedCount,
		};
	}

	// Execute rollback in batches
	let processedCount = 0;
	const batchSize = 50;

	while (true) {
		const batch = await db.users.findMany({
			where: { migrationVersion: migrationStatus.targetVersion },
			take: batchSize,
		});

		if (batch.length === 0) break;

		for (const record of batch) {
			await db.users.update({
				where: { id: record.id },
				data: {
					migrationVersion: migrationStatus.sourceVersion,
					// Restore original fields based on migration type
					...(migrationStatus.rollbackData as object),
				},
			});
			processedCount++;
		}
	}

	// Update migration status
	await db.migrations.update({
		where: { id: migrationStatus.id },
		data: {
			status: 'rolled_back',
			rolledBackAt: new Date(),
			rollbackReason: reason,
		},
	});

	return {
		success: true,
		message: `Rollback completed successfully. ${processedCount} records restored.`,
		affectedRecords: processedCount,
	};
}
```

## Migration Anti-Patterns to Avoid

### **❌ NEVER DO: Destructive Migrations**

```typescript
// ❌ BAD: Destructive migration without backup
async function badMigration(): Promise<void> {
	// NEVER: Drop fields without backup
	const users = await db.users.findMany();
	for (const user of users) {
		await db.users.update({
			where: { id: user.id },
			data: { oldField: null }, // Data loss!
		});
	}
}

// ✅ GOOD: Safe field removal with grace period
async function safeFieldRemoval(): Promise<void> {
	// Mark field as deprecated first
	const users = await db.users.findMany({
		where: { oldField: { not: null } },
	});

	for (const user of users) {
		// Archive old data before removal
		await db.archivedUserData.create({
			data: {
				userId: user.id,
				fieldName: 'oldField',
				value: user.oldField,
				archivedAt: new Date(),
			},
		});

		// Then remove field
		await db.users.update({
			where: { id: user.id },
			data: { oldField: null },
		});
	}
}
```

### **❌ NEVER DO: Large Batch Migrations**

```typescript
// ❌ BAD: Process all records at once
async function badBatchMigration(): Promise<void> {
	const allUsers = await db.users.findMany(); // Could be millions!

	for (const user of allUsers) {
		await db.users.update({
			where: { id: user.id },
			data: {
				/* changes */
			},
		});
	}
}

// ✅ GOOD: Small batch processing
async function goodBatchMigration(
	batchSize = 50
): Promise<{ processed: number; hasMore: boolean }> {
	// Use index on migrated field
	const batch = await db.users.findMany({
		where: { migrated: false },
		take: batchSize,
	});

	// Process small batch only
	for (const user of batch) {
		await db.users.update({
			where: { id: user.id },
			data: {
				/* changes */
			},
		});
	}

	return { processed: batch.length, hasMore: batch.length === batchSize };
}
```

## Audit Checklist

### Critical Checks 🚨

- [ ] No destructive migrations without backup procedures
- [ ] All migrations have rollback capability
- [ ] Pre-migration validation passes
- [ ] No data corruption or loss during migration

### High Priority Checks ⚠️

- [ ] Schema changes are backward compatible
- [ ] Migration uses batch processing (≤50 records per batch)
- [ ] Data integrity validation passes post-migration
- [ ] Performance impact assessed and acceptable

### Medium Priority Checks 📋

- [ ] Migration documentation complete
- [ ] Testing performed on staging environment
- [ ] Monitoring active during migration execution
- [ ] Old fields archived before removal

### Low Priority Checks 💡

- [ ] Migration metrics logged for future reference
- [ ] Schema version history maintained
- [ ] Cleanup schedule established for deprecated fields

## Success Criteria

### **✅ Quality Gates**

1. **Pre-Migration**: All validation checks pass
2. **During Migration**: Real-time monitoring shows healthy metrics
3. **Post-Migration**: Data integrity validation passes
4. **Application Testing**: All features work with new schema
5. **Performance Validation**: No significant performance regression

## Report Template

```markdown
# Database Migration Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Migration Health**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Data Integrity Status**: [PASS/FAIL]

### Migration Status Overview

- **Schema Version**: [Current] → [Target]
- **Records Migrated**: [Number]
- **Migration Duration**: [Time]
- **Rollback Capability**: [Yes/No]

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

## Schema Analysis

### Current Schema State

- **Tables**: [List]
- **Indexes**: [Count]
- **Relationships**: [Summary]

### Migration Validation

| Check                    | Status      | Notes     |
| ------------------------ | ----------- | --------- |
| Pre-migration validation | [PASS/FAIL] | [Details] |
| Data integrity           | [PASS/FAIL] | [Details] |
| Performance impact       | [PASS/FAIL] | [Details] |
| Rollback tested          | [PASS/FAIL] | [Details] |

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

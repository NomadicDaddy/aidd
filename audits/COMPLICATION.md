---
title: 'Code Complexity and Optimization Audit'
last_updated: '2026-06-28'
version: '1.3'
category: 'Core Quality'
priority: 'High'
estimated_time: '30-60 min'
frequency: 'Monthly'
lifecycle: 'development'
---

# Code Complexity and Optimization Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Audit Objectives](#audit-objectives)
3. [Audit Scope](#audit-scope)
4. [Spernakit Applicability](#spernakit-applicability)
5. [Pre-Audit Setup](#pre-audit-setup)
6. [Objective Complexity Metrics](#objective-complexity-metrics)
7. [Complexity Decision Framework](#complexity-decision-framework)
8. [Examples of Justified vs Unjustified Complexity](#examples-of-justified-vs-unjustified-complexity)
9. [Evaluation Criteria with Objective Metrics](#evaluation-criteria-with-objective-metrics)
10. [Focus Areas](#focus-areas)
11. [Audit Checklist](#audit-checklist)
12. [Clean-Pass Evidence Requirement](#clean-pass-evidence-requirement)
13. [Common Issues to Identify](#common-issues-to-identify)
14. [Deliverables](#deliverables)
15. [Report Template](#report-template)

## Executive Summary

This audit identifies and documents overcomplication and premature optimization across the codebase, using objective, measurable complexity metrics rather than subjective judgement.

**Critical priorities**:

- No function exceeds cyclomatic complexity of 10, deep nesting (4+ levels), or carries unjustified abstraction layers that block maintainability.
- No premature optimizations (manual memoization, speculative caching, micro-optimizations) reach production code without measured evidence.

**Essential standards**:

- Functions stay within objective thresholds - cyclomatic ≤7, ≤40 lines, ≤5 parameters, ≤3 nesting levels - measured at audit time (see [Pre-Audit Setup](#pre-audit-setup)).
- Every retained complexity passes the [Complexity Decision Framework](#complexity-decision-framework): it solves a real, measured problem with the simplest sufficient solution.

**Scope boundary (cross-audit triage)**: COMPLICATION owns _measured intra-unit_ complexity - cyclomatic complexity, nesting depth, parameter count, and premature optimization. To avoid double-counting, route related findings to their most specific audit category:

- **Code duplication and naming** → **CODE_QUALITY**
- **Deferred or known-shortcut technical debt** → **TECHDEBT**
- **File-, module-, and service-size** concerns → **REORG**

Assign each finding to exactly one audit so the same issue is not raised twice.

## Audit Objectives

Conduct a comprehensive code audit focused on identifying and documenting overcomplication and premature optimizations throughout the codebase.

## Audit Scope

### **Overcomplication Analysis**

- Identify functions/components with excessive complexity that could be simplified
- Find abstractions that add unnecessary layers without clear benefit
- Locate overly generic solutions where simpler, direct approaches would suffice
- Document patterns where simple problems have been solved with complex architectures
- Flag areas where code readability suffers due to unnecessary sophistication

### **Premature Optimization Detection**

- Identify performance optimizations implemented without evidence of actual performance problems
- Find caching mechanisms, memoization, or complex state management where simple solutions would work
- Locate micro-optimizations that sacrifice code clarity for negligible performance gains
- Document areas where optimization complexity outweighs the actual performance benefit
- Flag instances where optimization was added "just in case" rather than to solve measured problems (see [Spernakit Applicability](#spernakit-applicability) for the manual-memoization rule)

## Spernakit Applicability

This audit runs against spernakit-derived apps. The following stack facts are authoritative for every check below; do not re-derive or contradict them in individual findings.

- **React Compiler handles memoization.** Spernakit apps enable `babel-plugin-react-compiler`, so the compiler memoizes automatically. Flag manual `useMemo`, `useCallback`, and `React.memo` as unnecessary complexity - **unless** the file contains a `'use no memo'` directive, which is the sanctioned escape hatch and must not be flagged.
- **ESLint enforces no complexity rules.** The lint config configures no `complexity`, `max-lines-per-function`, `max-params`, or `max-depth` rules. All thresholds in this audit are audit-time observations, not CI gates (see [Pre-Audit Setup](#pre-audit-setup)).
- **Handler extraction, not controller classes.** Route handlers exceeding ~30 lines should be extracted as named functions, not controller classes - controller classes break the Elysia type chain.
- **Service-facade convention.** A facade that over-abstracts or adds indirection without clear value is a COMPLICATION concern. The _size_ threshold for splitting a service into a subdirectory + facade belongs to **REORG**, not here.

## Pre-Audit Setup

The thresholds and compliance targets in this audit are **audit-time observations, not CI gates**. Spernakit's lint config does not enforce complexity rules by default (no `complexity`, `max-lines-per-function`, `max-params`, or `max-depth` rules are configured), so measure each metric explicitly during the audit using one of the methods below.

### **Option A: Ad-hoc ESLint pass**

Spernakit ships ESLint and `typescript-eslint` - treat the versions pinned in `package.json` as authoritative (STACK is pinned at v3.11.0-lts, so any literal version here drifts). Run a temporary, audit-only ESLint invocation with the built-in complexity rules enabled to surface candidate violations - do **not** commit these rules to the repo config:

```bash
# Audit-time only — flags candidates for manual review, not a CI gate
bunx eslint backend/src frontend/src \
	--rule '{"complexity": ["warn", 7]}' \
	--rule '{"max-lines-per-function": ["warn", 40]}' \
	--rule '{"max-params": ["warn", 5]}' \
	--rule '{"max-depth": ["warn", 3]}'
```

### **Option B: Manual counting protocol**

Where an ESLint pass is impractical (mixed JSX, generated code), count manually:

- **Cyclomatic complexity**: start at 1, add 1 for each `if`, `while`, `for`, `case`, `&&`, `||`, `?`, and `catch`.
- **Function length**: lines between the opening and closing brace, excluding blank lines and the OpenAPI `detail` block for route handlers.
- **Parameter count**: positional parameters (an object parameter counts as one).
- **Nesting depth**: maximum number of enclosing block scopes at the deepest statement.

The "compliance %" figures in the report template are derived from these audit-time measurements; record the measurement method used so results are reproducible.

> **Note**: `knip` (dead-code detection; version per `package.json`) and the dead-code audit are out of scope here - this audit measures complexity of live code, not unused code.

## Objective Complexity Metrics

### **Quantitative Complexity Measurements**

#### **1. Cyclomatic Complexity (McCabe Complexity)**

**Measurement**: Count decision points (if, while, for, case, &&, ||, ?, catch)

```typescript
// ✅ LOW COMPLEXITY (Score: 2)
function validateUser(user: User): boolean {
	if (!user.email) return false; // +1
	if (!user.name) return false; // +1
	return true; // Base: 1
}

// ❌ HIGH COMPLEXITY (Score: 8)
function processUserData(user: User, options: ProcessOptions): ProcessResult {
	if (!user) return null; // +1
	if (user.type === 'admin' && user.active) {
		// +2 (&&)
		if (options.validateAdmin) {
			// +1
			try {
				return validateAdminUser(user);
			} catch (error) {
				// +1
				if (error.code === 'VALIDATION_ERROR') {
					// +1
					return handleValidationError(error);
				} else if (error.code === 'NETWORK_ERROR') {
					// +1
					return retryWithBackoff(user, options);
				}
			}
		}
	}
	return processRegularUser(user); // Base: 1
}
```

**Complexity Thresholds**:

- **1-4**: Simple (✅ Good)
- **5-7**: Moderate (⚠️ Review)
- **8-10**: Complex (❌ Refactor)
- **11+**: Very Complex (🚨 Critical)

#### **2. Function Length (Lines of Code)**

```typescript
// ✅ GOOD: Focused function (12 lines)
import { eq } from 'drizzle-orm';

async function createUser(email: string, name: string): Promise<string> {
	const [existingUser] = await db.select().from(users).where(eq(users.email, email));

	if (existingUser) {
		throw new Error('User already exists');
	}

	const [user] = await db
		.insert(users)
		.values({ email, name, createdAt: new Date() })
		.returning();

	return user.id;
}

// ❌ BAD: Overly long function (50+ lines)
async function processComplexUserWorkflow() {
	// ... 50+ lines of mixed concerns
}
```

**Length Thresholds**:

- **1-20 lines**: Simple (✅ Good)
- **21-40 lines**: Moderate (⚠️ Review)
- **41-60 lines**: Long (❌ Consider splitting)
- **61+ lines**: Very Long (🚨 Must split)

#### **3. Parameter Count**

```typescript
// ✅ GOOD: Few parameters (3)
function createNotification(userId: string, message: string, type: NotificationType) {
	// Implementation
}

// ❌ BAD: Too many parameters (7+)
function updateUserProfile(
	userId: string,
	name: string,
	email: string,
	avatar: string,
	bio: string,
	location: string,
	website: string,
	preferences: UserPreferences
) {
	// Should use object parameter instead
}

// ✅ BETTER: Object parameter
function updateUserProfile(userId: string, updates: UserProfileUpdates) {
	// Implementation
}
```

**Parameter Thresholds**:

- **1-3 parameters**: Simple (✅ Good)
- **4-5 parameters**: Moderate (⚠️ Consider object)
- **6+ parameters**: Complex (❌ Use object parameter)

#### **4. Nesting Depth**

```typescript
// ✅ GOOD: Shallow nesting (2 levels)
function processUser(user: User) {
	if (user.active) {
		if (user.verified) {
			return processVerifiedUser(user);
		}
		return processUnverifiedUser(user);
	}
	return null;
}

// ❌ BAD: Deep nesting (4+ levels)
function complexProcessing(data: any) {
	if (data) {
		// Level 1
		if (data.users) {
			// Level 2
			for (const user of data.users) {
				// Level 3
				if (user.active) {
					// Level 4
					if (user.permissions) {
						// Level 5 - Too deep!
						// Processing logic
					}
				}
			}
		}
	}
}
```

**Nesting Thresholds**:

- **1-2 levels**: Simple (✅ Good)
- **3 levels**: Moderate (⚠️ Review)
- **4+ levels**: Complex (❌ Refactor with early returns)

## Complexity Decision Framework

### **Decision Tree: When Complexity is Justified**

```
Is the complexity necessary?
├── Does it solve a real, measured problem?
│   ├── YES → Is the problem significant enough to warrant complexity?
│   │   ├── YES → Is this the simplest solution that solves the problem?
│   │   │   ├── YES → ✅ JUSTIFIED COMPLEXITY
│   │   │   └── NO → ❌ OVER-ENGINEERED (Simplify)
│   │   └── NO → ❌ PREMATURE OPTIMIZATION (Remove)
│   └── NO → ❌ UNNECESSARY COMPLEXITY (Remove)
└── Is it required by external constraints?
    ├── YES (API contracts, performance requirements, etc.)
    │   └── ✅ JUSTIFIED COMPLEXITY
    └── NO → ❌ UNNECESSARY COMPLEXITY (Remove)
```

### **Complexity Justification Matrix**

| Complexity Level | Business Value | Technical Debt | Decision                                                     |
| ---------------- | -------------- | -------------- | ------------------------------------------------------------ |
| **High**         | **High**       | **Low**        | ✅ **Justified** - Complex problem requires complex solution |
| **High**         | **High**       | **High**       | ⚠️ **Review** - Consider alternative approaches              |
| **High**         | **Low**        | **Low**        | ❌ **Unjustified** - Over-engineering                        |
| **High**         | **Low**        | **High**       | 🚨 **Critical** - Remove immediately                         |
| **Low**          | **High**       | **Low**        | ✅ **Ideal** - Simple solution for valuable feature          |
| **Low**          | **Low**        | **Low**        | ✅ **Acceptable** - No harm, but consider removal            |

### **Complexity Assessment Questions**

**For Each Complex Code Section, Ask**:

1. **Problem Significance**: Does this solve a real, measured problem?
2. **Solution Appropriateness**: Is this the simplest solution that works?
3. **Future Maintenance**: Will this be easy to understand and modify?
4. **Performance Impact**: Does the complexity provide measurable performance benefits?
5. **Business Value**: Does the complexity directly support business requirements?

**Scoring System (1-5 scale)**:

- **5 points**: Strongly agree
- **3 points**: Somewhat agree
- **1 point**: Disagree

**Total Score Interpretation**:

- **20-25 points**: Complexity is justified
- **15-19 points**: Review and potentially simplify
- **10-14 points**: Likely over-engineered
- **5-9 points**: Definitely remove complexity

## Examples of Justified vs Unjustified Complexity

### **✅ JUSTIFIED COMPLEXITY Examples**

#### **Example 1: Performance-Critical Data Processing**

```typescript
// ✅ JUSTIFIED: Complex but necessary for performance
import { eq, asc } from 'drizzle-orm';

async function processLargeDataset(datasetId: string): Promise<ProcessedRecord[]> {
	const BATCH_SIZE = 1000;
	const [dataset] = await db.select().from(datasets).where(eq(datasets.id, datasetId));

	if (!dataset) throw new Error('Dataset not found');

	// Complex batching logic justified by performance requirements
	const results: ProcessedRecord[] = [];
	let offset = 0;

	while (offset < dataset.totalRecords) {
		const batch = await db
			.select()
			.from(dataRecords)
			.where(eq(dataRecords.datasetId, datasetId))
			.orderBy(asc(dataRecords.createdAt))
			.offset(offset)
			.limit(BATCH_SIZE);

		// Complex transformation logic required by business rules
		const processedBatch = await Promise.all(
			batch.map(async (record) => {
				const enrichedData = await enrichRecord(record);
				const validatedData = await validateBusinessRules(enrichedData);
				return transformForOutput(validatedData);
			})
		);

		results.push(...processedBatch);
		offset += BATCH_SIZE;
	}

	return results;
}

// JUSTIFICATION:
// - Solves real performance problem (large datasets)
// - Batching prevents memory issues
// - Complex business rules require multi-step processing
// - Measured performance improvement: 10x faster than naive approach
```

#### **Example 2: Error Handling with Retry Logic**

```typescript
// ✅ JUSTIFIED: Complex error handling for reliability
async function reliableApiCall<T>(endpoint: string, data: unknown): Promise<T> {
	const MAX_RETRIES = 3;
	const BACKOFF_BASE = 1000;

	for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
		try {
			const response = await fetch(endpoint, {
				method: 'POST',
				body: JSON.stringify(data),
				headers: { 'Content-Type': 'application/json' },
			});

			if (response.ok) {
				return await response.json();
			}

			// Complex retry logic justified by reliability requirements
			if (attempt < MAX_RETRIES) {
				const isRetryable = response.status >= 500 || response.status === 429;
				if (isRetryable) {
					const delay = BACKOFF_BASE * Math.pow(2, attempt);
					await new Promise((resolve) => setTimeout(resolve, delay));
					continue;
				}
			}

			throw new Error(`API call failed: ${response.status}`);
		} catch (error) {
			if (attempt === MAX_RETRIES) {
				throw error;
			}
		}
	}

	throw new Error('Unreachable');
}

// JUSTIFICATION:
// - Solves real reliability problem (network failures)
// - Exponential backoff prevents overwhelming servers
// - Retry logic improves user experience
// - Required by production reliability standards
```

### **❌ UNJUSTIFIED COMPLEXITY Examples**

#### **Example 1: Over-Engineered Simple Function**

```typescript
// ❌ UNJUSTIFIED: Over-engineered simple validation
class UserValidationStrategy {
	abstract validate(user: User): ValidationResult;
}

class EmailValidationStrategy extends UserValidationStrategy {
	validate(user: User): ValidationResult {
		return { valid: !!user.email, field: 'email' };
	}
}

class NameValidationStrategy extends UserValidationStrategy {
	validate(user: User): ValidationResult {
		return { valid: !!user.name, field: 'name' };
	}
}

class UserValidator {
	private strategies: UserValidationStrategy[] = [
		new EmailValidationStrategy(),
		new NameValidationStrategy(),
	];

	validateUser(user: User): ValidationResult[] {
		return this.strategies.map((strategy) => strategy.validate(user));
	}
}

// ✅ BETTER: Simple and direct
function validateUser(user: User): { valid: boolean; errors: string[] } {
	const errors: string[] = [];

	if (!user.email) errors.push('Email is required');
	if (!user.name) errors.push('Name is required');

	return { valid: errors.length === 0, errors };
}

// PROBLEM:
// - 20+ lines vs 6 lines for same functionality
// - No business requirement for strategy pattern
// - No evidence this will need extension
// - Harder to understand and maintain
```

> **Scope note**: A class hierarchy is only over-engineering when it wraps a trivial, fixed problem like the two-field validation above. Legitimate domain abstractions - custom parsers, ECS entity-extension, multi-batch inference, and the batching/retry patterns in the [Justified Examples](#justified-complexity-examples) - solve real, measured problems and must **not** be flagged on the basis of "it's a class hierarchy" alone. Apply the [Complexity Decision Framework](#complexity-decision-framework) before flagging.

#### **Example 2: Premature Optimization**

```typescript
// ❌ UNJUSTIFIED: Premature memoization
// In spernakit apps, babel-plugin-react-compiler handles memoization automatically.
// Manual useMemo/useCallback/React.memo is unnecessary unless the file has 'use no memo'.
const memoizedUserFormatter = useMemo(() => {
  return (user: User) => {
    return `${user.firstName} ${user.lastName}`;
  };
}, []);

const UserDisplay = ({ user }: { user: User }) => {
  const formattedName = memoizedUserFormatter(user);
  return <span>{formattedName}</span>;
};

// ✅ BETTER: Simple and direct (React Compiler memoizes automatically)
const UserDisplay = ({ user }: { user: User }) => {
  return <span>{user.firstName} {user.lastName}</span>;
};

// PROBLEM:
// - No performance problem measured
// - String concatenation is extremely fast
// - Memoization adds complexity without benefit
// - React Compiler already handles memoization in spernakit apps
// - Harder to read and understand
```

## Evaluation Criteria with Objective Metrics

### **Code Complexity Assessment**

- [ ] **Cyclomatic Complexity**: Functions score ≤7 (85% compliance target)
- [ ] **Function Length**: Functions ≤40 lines (90% compliance target)
- [ ] **Parameter Count**: Functions ≤5 parameters (95% compliance target)
- [ ] **Nesting Depth**: Maximum 3 levels (90% compliance target)
- [ ] **Abstraction Appropriateness**: Each abstraction layer provides clear value

### **Optimization Assessment**

- [ ] **Evidence-Based**: All optimizations backed by performance measurements
- [ ] **Caching Justification**: Caching only where measured benefit exists
- [ ] **State Management**: Complexity matches actual state requirements
- [ ] **Micro-Optimization Impact**: Benefits outweigh complexity costs
- [ ] **Performance vs Clarity**: Reasonable trade-offs documented

## Focus Areas

- Backend service functions and business logic
- Frontend hooks and state management
- Utility functions and helper methods
- Component architectures and patterns
- Data processing and transformation logic

> **Scope boundary (REORG cross-reference)**: COMPLICATION owns _intra-unit_ complexity - cyclomatic complexity, nesting depth, parameter count, abstraction appropriateness, and premature optimization. **File-, module-, and service-size** concerns (including when a service should be split into a subdirectory + facade) belong to the **REORG** audit. When a finding could fit both, assign it to its most specific audit category so the same issue is not raised twice.

## Audit Checklist

### Critical Checks

- [ ] No functions exceed cyclomatic complexity of 10
- [ ] No premature optimizations affecting production code
- [ ] No unnecessary abstraction layers blocking maintainability

### High Priority Checks

- [ ] Functions ≤7 cyclomatic complexity (85% compliance)
- [ ] Functions ≤40 lines (90% compliance)
- [ ] Functions ≤5 parameters (95% compliance)
- [ ] Maximum 3 nesting levels (90% compliance)
- [ ] **High**: No manual `useMemo`, `useCallback`, or `React.memo` - except files with the `'use no memo'` escape-hatch directive, which are exempt (see [Spernakit Applicability](#spernakit-applicability))

### Medium Priority Checks

- [ ] All optimizations have documented performance justification
- [ ] Caching mechanisms backed by measured benefit
- [ ] State management complexity matches requirements
- [ ] **Medium**: Route handlers >30 lines extracted as named functions (see [Spernakit Applicability](#spernakit-applicability))
- [ ] **Medium**: Service facade abstractions are appropriate - a facade that over-abstracts or adds indirection without clear value is a COMPLICATION concern; the _size_ threshold for splitting a service into a subdirectory + facade belongs to **REORG** (see [Spernakit Applicability](#spernakit-applicability))

### Low Priority Checks

- [ ] Code simplification opportunities documented
- [ ] Complexity metrics tracked over time
- [ ] Refactoring recommendations prioritized

## Clean-Pass Evidence Requirement

Every historical run of this audit has been a zero-finding pass. A clean pass is a valid and expected outcome - but a green gate or a narrative ("complexity looks fine") is **not** sufficient evidence. To claim a clean pass, the auditor must demonstrate:

- [ ] The **measured complexity distribution** is cited with actual numbers - e.g. peak cyclomatic complexity observed, count/percentage of functions over each threshold, deepest nesting level, and largest parameter count - not a summary adjective.
- [ ] The measurement method is recorded (Option A ESLint pass or Option B manual protocol) so the result is reproducible.
- [ ] Each metric's compliance percentage is backed by the underlying counts, not asserted.
- [ ] Any function within review range (cyclomatic 5-7, 21-40 lines, 4-5 params, 3 nesting levels) is named and justified, even when no critical finding results.

Use the [no-findings / clean-pass variant](#report-template) of the Report Template when the audit produces no actionable findings.

## Common Issues to Identify

- Over-engineered solutions for simple problems
- Unnecessary abstraction layers
- Complex patterns where simple ones suffice
- Premature performance optimizations
- Excessive memoization and caching
- Overly generic implementations

## Deliverables

- Detailed audit report categorizing findings by severity
- Specific file paths, line numbers, and code examples
- Concrete simplification strategies for each identified issue
- Priority-based fix recommendations
- Metrics on code complexity reduction potential
- Impact assessment on maintainability and development velocity

## Report Template

```markdown
# Code Complexity Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Complexity Score**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Compliance Rate**: [Percentage]%

### Complexity Metrics Overview

- **Cyclomatic Complexity**: [X]% functions ≤7 (target: 85%)
- **Function Length**: [X]% functions ≤40 lines (target: 90%)
- **Parameter Count**: [X]% functions ≤5 params (target: 95%)
- **Nesting Depth**: [X]% ≤3 levels (target: 90%)

### Key Findings

- [Summary of major findings]

## Detailed Findings

### Critical Issues 🚨

| Issue | Location    | Complexity | Impact   | Remediation | Timeline |
| ----- | ----------- | ---------- | -------- | ----------- | -------- |
| [ID]  | [File:Line] | [Score]    | [Impact] | [Fix]       | [Days]   |

### High Priority Issues ⚠️

| Issue | Location    | Complexity | Impact   | Remediation | Timeline |
| ----- | ----------- | ---------- | -------- | ----------- | -------- |
| [ID]  | [File:Line] | [Score]    | [Impact] | [Fix]       | [Days]   |

### Medium Priority Issues 📋

| Issue | Location    | Complexity | Impact   | Remediation | Timeline |
| ----- | ----------- | ---------- | -------- | ----------- | -------- |
| [ID]  | [File:Line] | [Score]    | [Impact] | [Fix]       | [Days]   |

## Recommendations

### Immediate Actions (0-7 days)

1. [Refactor critical complexity issues]

### Short-term Actions (1-4 weeks)

1. [Address high-priority complexity]

### Long-term Actions (1-3 months)

1. [Establish complexity monitoring]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 1 month]
```

### No-Findings / Clean-Pass Variant

When the audit surfaces no actionable findings (the historical norm for this audit), use this shorter report. It still requires the measured distribution - a clean pass is only credible with numbers behind it (see [Clean-Pass Evidence Requirement](#clean-pass-evidence-requirement)).

```markdown
# Code Complexity Audit Report - YYYY-MM-DD - Clean Pass

## Result: No actionable findings

**Measurement method**: [Option A ad-hoc ESLint pass | Option B manual protocol]
**Scope measured**: [paths, e.g. backend/src + frontend/src]

### Measured Complexity Distribution

- **Cyclomatic Complexity**: peak [X]; [X]% of functions ≤7 (target 85%); functions in 5-7 review band: [list or count]
- **Function Length**: longest [X] lines; [X]% ≤40 lines (target 90%); functions in 21-40 review band: [list or count]
- **Parameter Count**: max [X]; [X]% ≤5 params (target 95%)
- **Nesting Depth**: deepest [X] levels; [X]% ≤3 levels (target 90%)

### Review-Band Items (no remediation required)

| Location    | Metric   | Value   | Why retained    |
| ----------- | -------- | ------- | --------------- |
| [File:Line] | [Metric] | [Value] | [Justification] |

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 1 month]
```

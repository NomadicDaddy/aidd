---
title: 'Code Quality, Organization, and Standards Audit'
last_updated: '2026-06-28'
version: '2.3'
category: 'Core Quality'
priority: 'High'
estimated_time: '15-30 min'
frequency: 'Monthly'
lifecycle: 'development'
consolidates: 'ORDER.md, COMPARISON.md, LINT.md, COMMENT.md, FILE.md'
---

# Code Quality Audit Framework

> **Consolidated Audit**: This audit consolidates ORDER, COMPARISON, LINT, COMMENT, and FILE audits into a single comprehensive code quality assessment.
>
> **Source audit scopes**:
>
> - **ORDER**: Ordering rules for objects, arrays, imports, attributes, and when _not_ to sort to keep diffs clean.
> - **COMPARISON**: Diff and PR review hygiene, minimizing noise and making structural changes easy to understand.
> - **LINT**: Lint configuration, `perfectionist` sorting enforcement, and quality gates for builds.
> - **COMMENT**: Comment and documentation standards, focusing on explaining "why" instead of restating code.
> - **FILE**: File-by-file in-use checks, naming/location rules, and file-structure compliance.

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

**Critical Code Quality Priorities**

- **Consistent Ordering**: 100% compliance with alphabetical ordering for non-functional sequences
- **Lint Compliance**: Zero linting errors, `--max-warnings 0` enforcement
- **Comment Quality**: High-quality documentation explaining "why" not "what"
- **File Organization**: Clear structure, proper naming, and appropriate permissions
- **Code Comparison**: Minimal diff noise, predictable structure

**Essential Standards (Required)**

- **Alphabetical Ordering**: All non-functional key-value pairs, arrays, imports sorted (plugin-enforced)
- **ESLint Enforcement**: `perfectionist` sorting rules enabled, builds fail on violations
- **Documentation Coverage**: Non-obvious public APIs and security/business-logic documented, complex logic explained
- **Professional Quality**: All code and comments maintain professional standards
- **File Structure**: Consistent organization, proper naming conventions, no unused code

**Quality Requirements**

- **Quality Gate**: `bun run smoke:qc` passes before merge (subsumes typecheck, lint, build, format check, and more)
- **Diff Cleanliness**: Changes are easy to review, minimal noise
- **Maintainability**: Code is self-documenting with strategic comments
- **Consistency**: Uniform patterns across entire codebase

## Table of Contents

1. [Pre-Audit Setup](#pre-audit-setup)
2. [Quality Gate](#quality-gate)
3. [Code Ordering Standards](#code-ordering-standards)
4. [Linting and Formatting](#linting-and-formatting)
5. [Comment Quality Assessment](#comment-quality-assessment)
6. [File Organization](#file-organization)
7. [Audit Checklist](#audit-checklist)
8. [Report Template](#report-template)

## Pre-Audit Setup

### Required Tools

- ESLint with `eslint-plugin-perfectionist` sorting rules and `eslint-plugin-unused-imports` enabled
- Prettier with `prettier-plugin-sort-json`, `prettier-plugin-organize-attributes`, and `prettier-plugin-tailwindcss` (these automate the JSON/object sort rules in section 1 and the attribute/Tailwind ordering rules in section 4 - ordering is plugin-enforced, not manual)
- TypeScript compiler for type checking
- `knip` for dead-code / unused-export detection (`bun run check:dead-code`)
- `check:max-lines` for the 300-line-per-file modularity gate (`bun run check:max-lines`, part of `smoke:qc`)
- Git for diff analysis

> **Test framework note**: The Spernakit/aidd stack has no unit-test framework (no vitest/jest/@testing-library). Static gates run via `bun run smoke:qc` and runtime verification via `crawltest`, so "test coverage" is not a CODE_QUALITY axis here.

### Verification Commands

```bash
# Primary quality gate (check-only aggregate — see Quality Gate section)
bun run smoke:qc

# Repair lint/format drift, then re-validate
bun run qc:fix

# Individual checks (all subsumed by smoke:qc)
bun run lint            # ESLint with --max-warnings 0
bun run format:check    # Prettier check (does NOT write; use `bun run format` to write)
bun run typecheck       # TypeScript compilation
bun run build           # Production build validation
```

## Quality Gate

`bun run smoke:qc` is the single source of truth for code-quality enforcement and **must pass before every commit**. It is a check-only aggregate; use `bun run qc:fix` to repair lint/format drift and re-validate. Because this gate auto-enforces nearly all ordering, formatting, and import-sort rules in this audit, most ordering checks below reduce to "verify enforcement is configured and `smoke:qc` passes" rather than manual per-file inspection.

**`smoke:qc` pipeline (canonical source - do not re-transcribe here):** The authoritative, ordered step list lives in `scripts/smoke.json` under the `qc` mode - read it there rather than relying on a hardcoded copy, which drifts. As of this revision the gate runs **20 steps**, spanning template/config/schema drift checks, `config:validate`, secrets-shape, `check:process-env`, `check:max-lines`, `check-application`, destructive-confirmation, docs consistency, `typecheck`, `lint`, `build`, API-type/feature-integration/schema-parity checks, `format:check`, dependency-version, and LTS lockfile/surface freeze guards.

**Code-quality-relevant gate steps this audit covers** (verify each is configured and passing):

- `lint` - ESLint with `--max-warnings 0`; runs `eslint-plugin-perfectionist` (ordering) and `eslint-plugin-unused-imports` (import hygiene). See [Linting and Formatting](#linting-and-formatting).
- `check:max-lines` - 300-line-per-file modularity gate. See [File Size and Modularity](#file-size-and-modularity).
- `check:process-env` - enforces that the only approved `process.env` access is the `configLoader.ts` secret-injection mapping (JSON-only config). A new `process.env` read anywhere else fails the gate.
- `typecheck`, `build`, `format:check` - type, build, and Prettier (ordering plugins) enforcement.

> **Auditor guidance**: If `bun run smoke:qc` passes, the ordering, lint, formatting, type, build, file-size, and process-env criteria in this audit are satisfied by definition. Spend manual effort on the axes the gate cannot judge - comment quality, documentation of non-obvious logic, file organization, and dead code (`bun run check:dead-code`).

## Code Ordering Standards

### The Principle of Order

> **Core Rule**: If the order of a set of items does not affect program logic, that set should be sorted alphabetically.

This single rule, when applied consistently, makes our codebase predictable, scannable, and significantly easier to maintain.

### 1. Key-Value Pairs (Objects, Configuration)

**Rule**: Any collection of key-value pairs where order is not functional must be sorted alphabetically by key.

**Applications**:

- JSON files (`package.json`, `tsconfig.json`, `.prettierrc`)
- YAML files (`docker-compose.yml`)
- JavaScript/TypeScript objects (config, lookup maps, style definitions)
- Dependencies in `package.json`
- Scripts in `package.json`

**The "Pinning" Exception**:
For critical files like `package.json`, pin the most important identifying keys to the top:

1. `name` (Pinned)
2. `version` (Pinned)
3. `private` (Pinned, if applicable)
4. _(...all other keys sorted alphabetically...)_

✅ **Good Example**:

```typescript
const config = {
	apiTimeout: 5000,
	enableCache: true,
	maxRetries: 3,
	retryDelay: 1000,
};
```

❌ **Bad Example**:

```typescript
const config = {
	maxRetries: 3,
	apiTimeout: 5000,
	retryDelay: 1000,
	enableCache: true,
};
```

### 2. Lists and Arrays

**Rule**: Any list or array where sequence is not functional must be sorted.

**Applications**:

- Configuration arrays (`ignores` in `eslint.config.js`)
- Constant arrays (`const ALLOWED_ROLES = ['admin', 'editor', 'viewer']`)
- Package keywords/workspaces

✅ **Good Example**:

```javascript
{
  ignores: [
    '**/dist/**',
    '**/node_modules/**',
    'artifacts/**',
    'coverage/**',
  ],
}
```

### 3. Imports and Exports

**Rule**: Module imports and named exports should be sorted alphabetically within groups.

**Best Practice**: Group imports by type (external, internal, assets), then sort within each group.

✅ **Good Example**:

```javascript
import axios from 'axios';
import { format } from 'date-fns';
import React from 'react';

import { Button } from './components';
import { useAuth } from './hooks';
```

### 4. Attributes and Properties

**Rule**: Attributes in markup should be sorted consistently (enforced by `prettier-plugin-organize-attributes`). Tailwind utility classes are ordered by `prettier-plugin-tailwindcss`.

**Applications**:

- JSX/HTML attributes (sorted by Prettier plugin)
- Tailwind utility class ordering (sorted by Prettier plugin)

> **Note**: Raw CSS/SCSS property sorting is less relevant in Spernakit projects that use Tailwind CSS utility classes exclusively. When raw CSS is used, sort properties alphabetically.

### CRITICAL: When NOT to Sort

**DO NOT SORT**:

- Middleware & plugin chains (execution order matters)
- Function arguments/parameters (signature order matters)
- CSS cascade layers (specificity matters)
- Array/tuple destructuring (position matters)
- Database schema fields (migration safety)
- Anything where sequence dictates logic

## Linting and Formatting

### ESLint Enforcement

**MANDATORY RULES**:

- `eslint-plugin-perfectionist` sorting rules are REQUIRED (`perfectionist/sort-objects`, `perfectionist/sort-interfaces`, `perfectionist/sort-object-types`, `perfectionist/sort-imports`)
- CI and local scripts MUST run with `--max-warnings 0`
- Violations fail builds; fix ordering rather than suppressing rules

### Scope

- Applies to JS/TS objects, JSON/YAML, dependency maps, scripts objects
- Tests and mocks MUST also comply
- Response/mock objects must follow ordering rules

### Function Return Type Standards

**Rule** (High): Exported / module-boundary functions should have explicit return type annotations. The stack rule `@typescript-eslint/explicit-function-return-type` is configured as **`warn`** with `allowExpressions`, `allowTypedFunctionExpressions`, `allowHigherOrderFunctions`, and `allowDirectConstAssertionInArrowFunctions` all `true`. Do **not** flag inline expressions, typed function expressions, higher-order function returns, or `as const` arrow returns - these are intentionally allowed.

✅ **Good Example**:

```typescript
interface User {
	id: string;
	name: string;
	email: string;
}

async function getUser(userId: string): Promise<User | null> {
	return await db.users.findById(userId);
}
```

❌ **Bad Example**:

```typescript
// Missing return type annotation
async function getUser(userId: string) {
	return await db.users.findById(userId);
}
```

### Validation Schemas

**Rule**: Sort keys alphabetically at every object shape level.

✅ **Good Example (TypeBox via Elysia)**:

```typescript
import { t } from 'elysia';

const createUserBody = t.Object({
	email: t.String({ format: 'email' }),
	password: t.String({ minLength: 8 }),
	role: t.Optional(t.Union([t.Literal('ADMIN'), t.Literal('OPERATOR'), t.Literal('VIEWER')])),
	username: t.String({ minLength: 3 }),
});

// Used in Elysia route definition:
app.post('/users', ({ body }) => createUser(body), {
	body: createUserBody,
});
```

## Comment Quality Assessment

### Comment Quality Standards

**Core Principle**: Comments should explain "why" not "what". Code should be self-documenting; comments provide context.

### ✅ High-Quality Comments

```typescript
/**
 * Calculates progressive tax using bracket system to avoid
 * floating-point precision issues with large income amounts.
 *
 * @param income - Annual income in dollars
 * @param taxYear - Tax year for bracket lookup (defaults to current)
 * @returns Tax amount owed, rounded to nearest cent
 */
export function calculateProgressiveTax(income: number, taxYear?: number): number {
	// Use bracket-by-bracket calculation to maintain precision
	// rather than percentage-based calculation which can compound errors
	let totalTax = 0;
	let remainingIncome = income;

	for (const bracket of getTaxBrackets(taxYear)) {
		const taxableInBracket = Math.min(remainingIncome, bracket.maxIncome - bracket.minIncome);
		totalTax += taxableInBracket * bracket.rate;
		remainingIncome -= taxableInBracket;
		if (remainingIncome <= 0) break;
	}

	return Math.round(totalTax * 100) / 100; // Round to nearest cent
}
```

### ❌ Poor Quality Comments

```typescript
// NEVER: Obvious or redundant comments
i = i + 1; // increment i
const user = getUser(); // get user

// NEVER: Misleading or outdated comments
// This function returns a string (actually returns number)
function calculateAge(): number {
	/* ... */
}

// NEVER: Vague TODO comments without ownership
// TODO: Fix this later
// FIXME: This doesn't work

// NEVER: Commented-out code without explanation
// const oldFunction = () => { return "deprecated"; };

// NEVER: Unprofessional language
// This is a stupid workaround for the broken API
```

### Documentation Requirements

> **Scope note**: The stack's jsdoc rules (`jsdoc/require-description`, `jsdoc/require-param`, `jsdoc/require-returns`) are configured as `warn`, not enforced gates. "100% public API documentation" is over-engineered for small self-hosted single-team tools. Scope documentation review to genuinely non-obvious public APIs and security/business-logic code, not every exported symbol.

**High-Priority Documentation**:

- Non-obvious public APIs have comprehensive JSDoc/TSDoc
- Complex business logic is clearly explained
- Security-related code has detailed documentation
- Error handling and edge cases are documented
- All TODO/FIXME comments have clear ownership and timelines

**High Priority Documentation**:

- Complex algorithms have step-by-step explanations
- Business rules and constraints are documented
- Performance optimizations are explained
- Non-obvious code patterns are clarified

## File Organization

### File Structure Standards

**Naming Conventions**:

- Specific patterns for file names, directories, and extensions
- Consistent naming across similar file types
- Clear indication of file purpose from name

**Location/Hierarchy**:

- Files reside in appropriate directories
- Clear separation of concerns
- Logical grouping of related files

**Permissions and Ownership** (informational - Docker/Linux deployment only):

- Appropriate file permissions (e.g., 644 for config, 755 for executables) apply only to Docker/Linux deployment artifacts. POSIX permission bits are meaningless on the Windows development host, so treat any permission observation as **Low/informational**, never a blocking finding.
- Correct ownership for security (deployment context only)

### File Size and Modularity

The `check:max-lines` gate (part of `smoke:qc`) fails the build when any tracked source file exceeds **300 lines**. This is the canonical file-size / modularity rule for the stack.

- Run `bun run check:max-lines` to confirm no tracked file is over 300 lines.
- Oversized files must be split at land-time, not deferred. Typical decompositions: extract complex route handlers (>30 lines) into named functions co-located in the route file; split a growing flat service into a facade + `services/{name}/` subdirectory (see DEVELOPMENT.md).
- A passing `smoke:qc` already proves compliance - spot-check only when investigating a specific module's structure.

### Module Export Conventions

- **Named exports only**: no `export default` in application modules (a single `default` in a `.d.ts` type-declaration file is acceptable). For `React.lazy()`, adapt named exports with `.then((m) => ({ default: m.Component }))`.
- **No CommonJS** (`require` / `module.exports`) in source - ES modules throughout.
- Surface intentional public-API exports that appear unreferenced as exceptions, not violations.

### In-Use Criteria

Files are considered "in-use" if they meet any of:

- Recent access/modification (last 90 days)
- Referenced by other active components
- Active log activity
- Part of deployed version in VCS

### Unused Code (Dead Code, Unused Exports/Imports)

Beyond unused _files_, check for unused _exports_ and _imports_ - the more common real finding and tool-detectable:

- Run `bun run check:dead-code` (`bunx knip`) to surface unused files, exports, and dependencies.
- `eslint-plugin-unused-imports` enforces import hygiene: `unused-imports/no-unused-imports` is `error` (fails the gate) and `unused-imports/no-unused-vars` is `warn`.
- Prefer deleting dead code over commenting it out; surface intentional-but-unreferenced exports (e.g., public API surface) as exceptions rather than violations.

### File Audit Process

For each file:

1. **Check In-Use Status**: Verify recent activity, dependencies, VCS status
2. **Check Naming Compliance**: Validate against naming conventions
3. **Check Location**: Verify proper directory placement
4. **Check Size**: Confirm the file is within the 300-line modularity threshold
5. **Check Content**: Validate format, structure, security
6. **Check Permissions** (deployment only): Validate Docker/Linux access controls - informational on Windows

## Audit Checklist

### **Critical Code Quality Checks**

#### Ordering Compliance

> **Note**: Object/import/array/attribute ordering is enforced by `perfectionist` + Prettier plugins and surfaces through `smoke:qc`. Verify enforcement is **configured** and the gate passes rather than manually inspecting per-file ordering.

- [ ] **Critical**: `eslint-plugin-perfectionist` sorting rules are enabled and enforced
- [ ] **Critical**: Prettier plugins (`sort-json`, `organize-attributes`, `tailwindcss`) are configured
- [ ] **Critical**: `bun run smoke:qc` passes (confirms package.json keys/scripts/deps, object, import, and attribute ordering)
- [ ] **Critical**: Build passes with `--max-warnings 0`

#### Linting and Formatting

- [ ] **Critical**: `bun run smoke:qc` passes (aggregate gate - subsumes the individual checks below)
- [ ] **Critical**: `bun run lint` passes with zero errors (`--max-warnings 0`)
- [ ] **Critical**: `bun run format:check` produces no changes
- [ ] **Critical**: `bun run typecheck` passes with zero errors
- [ ] **Critical**: `bun run build` completes successfully
- [ ] **High**: Exported / module-boundary functions have explicit return type annotations (inline/expression/HOF returns are intentionally allowed)

#### Documentation Quality

- [ ] **High**: Non-obvious public APIs have comprehensive JSDoc/TSDoc documentation
- [ ] **Critical**: Complex business logic is clearly explained with context
- [ ] **Critical**: Security-related code has detailed documentation
- [ ] **Critical**: No misleading or outdated comments exist
- [ ] **High**: All TODO/FIXME comments have clear ownership and timelines

#### File Organization

- [ ] **Critical**: All files follow naming conventions
- [ ] **Critical**: Files are in appropriate directories
- [ ] **Critical**: No tracked file exceeds 300 lines (`bun run check:max-lines` clean)
- [ ] **Critical**: Modules use named exports only - no `export default` in application code, no CommonJS (`require`/`module.exports`)
- [ ] **Critical**: No `process.env` access outside the approved `configLoader.ts` secret mapping (`bun run check:process-env` clean)
- [ ] **Critical**: No unused files without clear justification
- [ ] **High**: No unused exports/imports (`bun run check:dead-code` clean; `unused-imports` lint passes)
- [ ] **Critical**: All files are tracked in version control appropriately
- [ ] **Low**: File permissions correct (644 config / 755 executables) - Docker/Linux deployment only; informational on Windows

### **High Priority Code Quality Checks**

#### Code Organization

- [ ] **High**: Import statements are grouped and sorted alphabetically
- [ ] **High**: Tailwind utility class ordering follows consistent patterns (enforced by `prettier-plugin-tailwindcss`)
- [ ] **High**: JSX attributes are sorted alphabetically where practical
- [ ] **High**: Configuration arrays are sorted alphabetically
- [ ] **High**: Validation schemas have sorted keys at all levels

#### Comment Quality

- [ ] **High**: Complex algorithms have step-by-step explanations
- [ ] **High**: Business rules and constraints are documented
- [ ] **High**: Performance optimizations are explained
- [ ] **High**: Comments explain "why" rather than "what"
- [ ] **High**: No commented-out code without clear explanation

#### Code Consistency

- [ ] **High**: Consistent patterns across similar components
- [ ] **High**: Uniform error handling approaches
- [ ] **High**: Consistent naming conventions throughout
- [ ] **High**: Similar functionality uses similar implementations
- [ ] **High**: Code follows established architectural patterns

### **Medium Priority Code Quality Checks**

#### Documentation Completeness

- [ ] **Medium**: Internal utility functions have basic documentation
- [ ] **Medium**: Configuration and setup code is explained
- [ ] **Medium**: Data transformation logic is documented
- [ ] **Medium**: File-level comments explain module purpose
- [ ] **Medium**: Constants and configuration values are explained

#### Code Clarity

- [ ] **Medium**: Variable names are descriptive and clear
- [ ] **Medium**: Function names clearly indicate purpose
- [ ] **Medium**: Complex expressions are broken down for readability
- [ ] **Medium**: Magic numbers are replaced with named constants
- [ ] **Medium**: Code structure follows logical flow

### **Low Priority Code Quality Checks**

#### Polish and Refinement

- [ ] **Low**: Consistent spacing and indentation throughout
- [ ] **Low**: Consistent quote style (single vs double)
- [ ] **Low**: Consistent semicolon usage
- [ ] **Low**: Consistent trailing comma usage
- [ ] **Low**: Consistent line length (within reasonable limits)

## Report Template

```markdown
# Code Quality Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Code Quality Score**: [Score]/100
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]
**Medium Priority Issues Found**: [Number]
**Low Priority Issues Found**: [Number]

### Quality Gates Status

- **smoke:qc (aggregate)**: [PASS/FAIL]
- **Lint**: [PASS/FAIL]
- **Format (`format:check`)**: [PASS/FAIL]
- **Type Check (`typecheck`)**: [PASS/FAIL]
- **Build**: [PASS/FAIL]
- **File Size (`check:max-lines`)**: [PASS/FAIL]
- **Process Env (`check:process-env`)**: [PASS/FAIL]
- **Dead Code (`check:dead-code`)**: [PASS/FAIL]

### Key Findings

- [Ordering compliance assessment]
- [Documentation coverage evaluation]
- [File organization status]
- [Code consistency analysis]

## Detailed Findings

### Critical Issues 🚨

| Issue | Category   | Location    | Description   | Remediation | Timeline |
| ----- | ---------- | ----------- | ------------- | ----------- | -------- |
| [ID]  | [Category] | [File:Line] | [Description] | [Fix]       | [Days]   |

### High Priority Issues ⚠️

| Issue | Category   | Location    | Description   | Remediation | Timeline |
| ----- | ---------- | ----------- | ------------- | ----------- | -------- |
| [ID]  | [Category] | [File:Line] | [Description] | [Fix]       | [Days]   |

### Medium Priority Issues 📋

| Issue | Category   | Location    | Description   | Remediation | Timeline |
| ----- | ---------- | ----------- | ------------- | ----------- | -------- |
| [ID]  | [Category] | [File:Line] | [Description] | [Fix]       | [Days]   |

## Metrics and Analysis

### Ordering Compliance

- **package.json Files**: [Percentage]% compliant
- **Import Statements**: [Percentage]% sorted correctly
- **Tailwind Utility Classes**: [Percentage]% following consistent ordering
- **Configuration Arrays**: [Percentage]% sorted

### Documentation Coverage

> Report qualitatively, not as blanket coverage percentages - the stack's jsdoc rules are `warn`, and "100% public API documentation" is over-engineered for these tools. Focus on whether genuinely non-obvious APIs and security/business-logic are documented.

- **Non-obvious public APIs**: [documented? gaps?]
- **Security / business-logic code**: [documented? gaps?]
- **TODO/FIXME Items**: [Number] total, [Number] with clear ownership

### File Organization

- **Naming/Location**: [compliant? exceptions noted]
- **File Size (`check:max-lines`)**: [Number] files over 300 lines (0 expected when gate passes)
- **Unused Files**: [Number] potentially unused files identified

### Code Consistency

- **Pattern Consistency**: [Percentage]% follow established patterns
- **Naming Consistency**: [Percentage]% use consistent naming
- **Error Handling**: [Percentage]% use consistent error patterns
- **Comment Quality**: [Percentage]% meet professional standards

## Recommendations

### Immediate Actions (0-7 days)

1. [Critical ordering violations]
2. [Build-blocking issues]
3. [Security-related documentation gaps]

### Short-term Actions (1-4 weeks)

1. [High priority ordering improvements]
2. [Documentation standard implementation]
3. [File organization cleanup]

### Long-term Actions (1-3 months)

1. [Comprehensive consistency review]
2. [Automated quality tool improvements]
3. [Team training and standards adoption]

## Next Steps

1. **Immediate**: Fix all critical issues blocking builds
2. **Week 1**: Address high priority ordering and documentation gaps
3. **Week 2**: Clean up file organization and permissions
4. **Month 1**: Implement automated quality checks
5. **Month 3**: Complete comprehensive code quality review

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 1 month]
```

## Deliverables

### Required Outputs

- **Code Quality Assessment Report**: Comprehensive analysis of current code quality
- **Ordering Compliance Analysis**: Gap analysis and improvement recommendations
- **Documentation Coverage Report**: Documentation gaps and improvement plan
- **File Organization Review**: Cleanup plan for file structure and permissions
- **Quality Standards Guide**: Team guidelines for maintaining code quality

### Success Criteria

- **`bun run smoke:qc` passes** (subsumes lint, format check, typecheck, build, `check:max-lines`, `check:process-env`, and the rest of the gate)
- **100% ordering compliance** for non-functional sequences (plugin-enforced)
- **No file over 300 lines** (`check:max-lines` clean)
- **Named exports only; no `export default` in application code; no CommonJS**
- **Non-obvious public APIs and security/business-logic documented** (not blanket 100% coverage)
- **Zero misleading or outdated comments**
- **`bun run check:dead-code` clean** (no unused files/exports without justification)
- **95%+ file organization compliance**
- **Consistent code patterns across codebase**

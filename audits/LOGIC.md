---
title: 'Control Flow and Logic Evaluation Framework'
last_updated: '2026-06-28'
version: '1.4'
category: 'Core Quality'
priority: 'High'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'development'
---

# Control Flow & Logic Evaluation Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

## Executive Summary

This audit evaluates the correctness, clarity, and maintainability of control flow and business logic across the codebase. It covers branching decisions, error handling, state management, algorithmic efficiency, and cross-cutting concerns such as transactions and cache consistency.

**Critical priorities**:

- Control flow must correctly implement business requirements with no unreachable code or infinite loops.
- Error handling must be consistent, visible, and never silently swallow unexpected failures.
- Async work must not be silently dropped: no floating promises and no unguarded fire-and-forget calls.
- Concurrent state transitions (run/session lifecycle, heartbeat, reconciliation) must be guarded against interleaving.
- Multi-step data mutations must be atomic (transaction-wrapped, or routed through the worker command layer where the DB runs in a Bun worker).

**Essential standards**:

- React Compiler handles memoization automatically; no manual `useMemo`, `useCallback`, or `React.memo`.
- All `JSON.parse` calls against runtime data must be wrapped in `try-catch` with a fallback.
- Division operations must guard against zero divisors.
- Bare `catch {}` blocks are prohibited only when they swallow unexpected parse/decrypt/schema/IO failures without logging; a commented best-effort broadcast/notify path is not a finding.
- Nullish-vs-falsy checks must be correct (`??`/explicit `=== undefined` where `0`/`''`/`false` are valid), and discriminated-union switches must be exhaustive.
- _For apps with workspace/tenant scoping only_: workspace-scoped TanStack Query keys must include the active-tenant id to prevent cross-tenant data bleed.

**Requirements**:

- The codebase must achieve an overall Logic Quality Score of ≥4.0 for production code and ≥3.5 for development code.
- All Critical and High findings must have assigned owners and due dates before the audit is considered complete.

## Table of Contents

1. [Pre-audit Setup](#pre-audit-setup)
2. [Control Flow & Logic (Weight: 25%)](#1-control-flow--logic-weight-25)
3. [Complexity Reduction (Weight: 20%)](#2-complexity-reduction-weight-20)
4. [Workarounds & Technical Debt (Weight: 15%)](#workarounds--technical-debt-weight-15)
5. [Efficiency & Performance (Weight: 20%)](#efficiency--performance-weight-20)
6. [Data Flow & State Management (Weight: 10%)](#data-flow--state-management-weight-10)
7. [Dependencies & Architecture (Weight: 5%)](#dependencies--architecture-weight-5)
8. [Maintainability & Readability (Weight: 3%)](#maintainability--readability-weight-3)
9. [Testing & Debugging (Weight: 2%)](#testing--debugging-weight-2)
10. [Modern Best Practices](#modern-best-practices)
11. [Spernakit Applicability](#spernakit-applicability)
12. [Audit Checklist](#audit-checklist)
13. [Prioritization Methodology](#prioritization-methodology)
14. [Action Planning Templates](#action-planning-templates)
15. [Deliverables & Success Criteria](#deliverables--success-criteria)
16. [Report Template](#report-template)

## Pre-audit Setup

Before beginning the audit, ensure the following:

1. **Quality baseline is passing**:

    ```bash
    bun run smoke:qc
    ```

    This establishes a clean type-check, lint, build, and format baseline. If `smoke:qc` fails, resolve quality gate issues before auditing logic. The exact gate steps are defined canonically in `scripts/smoke.json`; consult that file for the current step list rather than relying on a hardcoded count.

2. **Application is running** (for dynamic verification):

    ```bash
    bun run dev
    ```

3. **Required tools**:
    - `rg` (ripgrep) or `grep` for cross-file pattern searches
    - `bun` (package manager and runtime)
    - Access to the audit report template at the end of this file

4. **Scope boundaries**:
    - Complexity-only findings (cyclomatic complexity, function length, nesting depth) should be deferred to the [COMPLICATION.md](./COMPLICATION.md) audit.
    - Security-specific findings (injection, auth bypass) should be deferred to the [SECURITY.md](./SECURITY.md) audit.
    - Performance-specific findings (bundle size, query N+1) should be deferred to the [PERFORMANCE.md](./PERFORMANCE.md) audit.

### Required Artifact Files

Consult these before forming findings; they anchor what "correct" means for this codebase:

- `/.aidd/spec.md`: product source of truth. Logic that contradicts the spec is a high-priority finding; logic that simply lacks coverage in the spec is a documentation gap, not a logic defect.
- `/.aidd/assertions.md`: behavioral, data, and security invariants. Every "broken logic" finding must be checked against assertions before being filed: an assertion already covers it (raise severity and cite the rule), or no assertion exists (the finding is novel; note the gap).
- `/.aidd/roadmap.json`: milestone scope gate. Logic intended for unshipped milestones is out-of-scope for this audit; do not flag missing logic that is roadmapped for a later milestone.
- `/CONTEXT.md` (if present): domain vocabulary and entity relationships. Logic findings that conflict with declared domain semantics (e.g. an entity behaving in a way the glossary forbids) should be raised; logic findings that disagree with the glossary on naming alone are documentation issues, not logic defects.

### **Evaluation Methodology Overview**

This framework provides a systematic approach to evaluating code logic and control flow with objective scoring, prioritization, and actionable improvement plans.

**Scoring System**: Each category uses a 5-point scale:

- **5 - Excellent**: Best practices followed, no improvements needed
- **4 - Good**: Minor improvements possible, low priority
- **3 - Acceptable**: Some issues present, medium priority
- **2 - Needs Improvement**: Significant issues, high priority
- **1 - Poor**: Critical issues, immediate attention required

**Scoring**: Use the /5 weighted system defined below. For /100 conversion: multiply the weighted total by 20 (e.g., 4.5/5 = 90/100).

**Overall Logic Quality Score**: Weighted average across all categories
**Target Score**: ≥4.0 for production code, ≥3.5 for development code

## **1. Control Flow & Logic (Weight: 25%)**

### **Illogical Flows Assessment**

**Evaluation Questions:**

- Does the code follow a logical sequence that matches the business requirements?
- Are there any unreachable code blocks or dead code paths?
- Do conditional statements make sense in their current context?
- Are there any infinite loops or recursive calls without proper termination conditions?
- Does the error handling flow logically from the potential failure points?

**Scoring Criteria:**

- **5 - Excellent**: Perfect logical flow, no dead code, clear business logic mapping
- **4 - Good**: Minor logical inconsistencies, mostly clear flow
- **3 - Acceptable**: Some confusing logic, occasional dead code
- **2 - Needs Improvement**: Multiple logical issues, significant dead code
- **1 - Poor**: Illogical flow, extensive dead code, business logic unclear

### **Branching Logic Assessment**

**Evaluation Questions:**

- Are nested if-else statements necessary, or could they be flattened?
- Can complex boolean expressions be simplified or broken down?
- Are there redundant conditions being checked multiple times?
- Could long if-else chains be replaced with early returns, lookup maps, or pattern matching?
- Are nullish-vs-falsy checks correct (`??`/explicit `=== undefined` where `0`/`''`/`false` are valid values, not `||` or truthiness that swallows them)?
- Are discriminated-union switches exhaustive (with a `never` default that fails on unhandled variants)?

**Scoring Criteria:**

- **5 - Excellent**: Optimal branching, clear conditions, no redundancy
- **4 - Good**: Minor nesting issues, mostly clear conditions
- **3 - Acceptable**: Some complex branching, occasional redundancy
- **2 - Needs Improvement**: Excessive nesting, complex conditions
- **1 - Poor**: Deep nesting, unreadable conditions, extensive redundancy

**Category Score Calculation**: Average of Illogical Flows + Branching Logic scores

## **2. Complexity Reduction (Weight: 20%)**

> **Detailed Metrics**: See [COMPLICATION.md](./COMPLICATION.md) for comprehensive complexity analysis including cyclomatic complexity thresholds, function length limits, parameter count guidelines, and nesting depth standards.

**Deduplication**: Complexity-only findings should be deferred to the COMPLICATION audit. Do not duplicate complexity findings here. If a finding has both logic and complexity dimensions, classify it under the logic category and note the complexity aspect.

### **Quick Complexity Assessment**

**Evaluation Questions:**

- Is this the simplest solution that meets the requirements?
- Are there overly complex algorithms where simpler ones would suffice?
- Does each function have a single, clear responsibility?

**Scoring Criteria:**

- **5 - Excellent**: Optimal simplicity, appropriate algorithms, clear responsibilities
- **4 - Good**: Minor complexity issues, mostly appropriate solutions
- **3 - Acceptable**: Some over-engineering, occasional complex solutions
- **2 - Needs Improvement**: Significant over-complexity, multiple responsibilities per function
- **1 - Poor**: Extensive over-engineering, unclear responsibilities throughout

**Category Score Calculation**: Use COMPLICATION.md metrics for objective scoring

## **Workarounds & Technical Debt (Weight: 15%)**

**Unnecessary Workarounds:**

- Are there hacks or workarounds that are no longer needed?
- Is the code working around limitations that have since been resolved?
- Are there temporary fixes that became permanent?
- Could modern language features replace older workaround patterns?
- Are there compatibility shims for versions no longer supported?

**Code Smells:**

- Are there magic numbers or hardcoded values that should be constants?
- Is there duplicated code that could be extracted into reusable functions?
- Are there long parameter lists that could be objects?
- Is there primitive obsession (using primitives instead of domain objects)?

## **Efficiency & Performance (Weight: 20%)**

**Unnecessary Steps:**

- Are there redundant operations or calculations?
- Is data being processed multiple times when once would suffice?
- Are there unnecessary database queries or API calls?
- Could operations be batched instead of performed individually?
- Are there expensive operations inside loops that could be moved outside?

**Resource Usage:**

- Are resources (files, connections, memory) properly managed and released?
- Is there unnecessary memory allocation or object creation?
- Could lazy loading be used instead of eager loading?
- Are there more efficient data structures for the use case?

## **Data Flow & State Management (Weight: 10%)**

**Data Handling:**

- Is data being transformed more times than necessary?
- Are there unnecessary data conversions or serialization steps?
- Could data be processed in streams instead of loading everything into memory?
- Are there redundant data validations?

**State Management:**

- Is state being managed at the appropriate level?
- Are there unnecessary global variables or shared state?
- Could immutable data structures simplify the logic?
- Is state being synchronized unnecessarily?

## **Dependencies & Architecture (Weight: 5%)**

**Dependency Management:**

- Are all imported libraries/modules actually being used?
- Could lighter-weight alternatives replace heavy dependencies?
- Are there circular dependencies that could be eliminated?
- Could dependency injection simplify testing and maintenance?

**Architecture Patterns:**

- Is the chosen architectural pattern appropriate for the problem size?
- Are there unnecessary layers of abstraction?
- Could simpler patterns achieve the same goals?
- Is the separation of concerns clear and logical?

## **Maintainability & Readability (Weight: 3%)**

**Code Clarity:**

- Is the code self-documenting, or does it need extensive comments to understand?
- Are variable and function names descriptive and consistent?
- Could complex expressions be broken down with intermediate variables?
- Is the code structure intuitive to follow?

**Documentation & Comments:**

- Are there outdated comments that no longer match the code?
- Could the code be made clearer instead of adding comments?
- Are there missing comments for complex business logic?
- Do comments explain "why" rather than just "what"?

## **Testing & Debugging (Weight: 2%)**

> **No unit test frameworks**: Spernakit-derived apps do not use vitest/jest/@testing-library. "Testability" here means structuring code for verification via `bun run smoke:qc`, crawltest, and integration scripts, not unit-test coverage. Do not flag the absence of unit tests as a logic defect.

**Testability:**

- Is the code structured in a way that makes it easy to test?
- Are there unnecessary dependencies that make testing difficult?
- Could pure functions replace stateful operations?
- Are there hidden dependencies that make testing complex?

**Error Handling:**

- Is error handling consistent throughout the codebase?
- Are errors being caught at the appropriate level?
- Could error handling be simplified or standardized?
- Are there bare `catch {}` blocks that silently swallow **unexpected** parse/decrypt/schema/IO failures without logging? (A commented best-effort broadcast/notify path that intentionally ignores a peer-send failure is not a finding.)
- Do catch blocks use `logger.warn` or `logger.error` to capture unexpected failures with context?
- Are there floating (un-awaited) promises or missing `.catch()` on fire-and-forget async work? Async calls must be awaited or have an explicit `.catch()`/best-effort wrapper that logs; fire-and-forget work must be intentional and documented.

## **Modern Best Practices**

**Language Features:**

- Could modern language features replace verbose older patterns?
- Are there built-in functions that could replace custom implementations?
- Could functional programming concepts simplify the logic?
- Are there standard library solutions for custom implementations?
- **React 19**: Is `use()` used for context and promise resolution instead of `useContext`?
- **React 19, `use(promise)` stability**: Are promises passed to `use()` stable across renders (cached, or created outside render / via a query layer)? A promise re-created inline on every render causes the component to re-suspend in a loop: a real control-flow defect, not just a perf issue.
- **React Compiler**: Is manual `useMemo`, `useCallback`, or `React.memo` avoided? (React Compiler handles memoization automatically; manual memoization only with profiling evidence.)
- **`useEffect` cleanup & dependencies**: Do effects that open subscriptions, intervals, WebSocket handlers, or timers return a cleanup that tears them down? Are dependency arrays correct (no stale closures over changing values, no unstable deps forcing re-runs)? Missing cleanup on a long-lived subscription is a logic/leak defect, not a style nit.
- **ESM**: Are ES Modules (`import`/`export`) used consistently with named exports? No `require`, `module.exports`, or `export default`, **except** the sanctioned `React.lazy()` shim `lazy(() => import('./C').then((m) => ({ default: m.Component })))`, where the `default:` key adapts a named export and is not a violation.

**Security & Safety:**

- Are there unnecessary security checks or validations?
- Could type safety eliminate runtime checks?
- Are concurrent state transitions (run/session lifecycle, heartbeat, reconciliation) guarded against interleaving? Terminal-status writes must go through a single idempotent path, not parallel writers.
- Are there other potential race conditions or concurrency issues in shared/async state?
- Are retried requests idempotent? The `apiClient` retries 5xx with exponential backoff (GET by default, opt-in for mutations); any mutation that opts into retry must be safe to apply more than once (idempotency key, upsert semantics, or natural idempotence); a retried non-idempotent POST is a logic defect.
- Is input validation happening at the right boundaries?

## Spernakit Applicability

This audit is designed to be stack-agnostic, but the following notes adapt its generic rules to the **Spernakit v3.11 (LTS)** stack (React 19 + Vite + Elysia + Drizzle ORM + TanStack Query + Zustand + Bun).

| Generic Rule                         | Spernakit Status | Spernakit Equivalent / Notes                                                                                                                                                                                                                                                                                                                                                    |
| ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Switch statements vs if-else         | Adapt            | Prefer early returns and lookup maps over `switch`. Elysia route groups and React component guards favor return-early patterns.                                                                                                                                                                                                                                                 |
| Manual memoization                   | N/A              | React Compiler (`babel-plugin-react-compiler`) handles memoization automatically. Manual `useMemo`/`useCallback`/`React.memo` is prohibited without profiling evidence.                                                                                                                                                                                                         |
| `useContext` for context consumption | Update           | React 19 introduces `use()`; prefer `use()` for context and promise resolution.                                                                                                                                                                                                                                                                                                 |
| Module system                        | Directly applies | ES Modules exclusively (`"type": "module"`). Named exports only: no `export default`, **except** the `React.lazy()` interop shim `lazy(() => import('./C').then((m) => ({ default: m.Component })))`, where `default:` adapts a named export. Barrel files (`index.ts`) re-export from domain files.                                                                            |
| Error handling                       | Adapt            | Backend uses `pino` (`logger.warn`/`logger.error`) with structured context. Bare `catch {}` is only acceptable when documented as best-effort.                                                                                                                                                                                                                                  |
| State management                     | Adapt            | Server state → TanStack Query. Client state → Zustand. Never React Context for state.                                                                                                                                                                                                                                                                                           |
| Cache consistency                    | Conditional      | Only for apps with workspace/tenant scoping: tenant-scoped TanStack Query keys must include the active-tenant id; global/admin queries appropriately omit it. Apps with no workspace/tenant concept are exempt.                                                                                                                                                                 |
| Database transactions                | Directly applies | Multi-step mutations must be atomic: via `db.transaction()` in standard Spernakit deployments; via the worker command layer (`db/commands.ts`) where the DB runs in a Bun worker, never raw `db.transaction()` across the worker boundary. Where the app ships both dialects, SQLite (`schema/`) and PostgreSQL (`schema-pg/`) definitions must remain structurally consistent. |
| Testing philosophy                   | Adapt            | No unit test frameworks (vitest, jest, etc.). Verification is via `bun run smoke:qc`, crawltest, and integration scripts.                                                                                                                                                                                                                                                       |
| Package manager                      | Directly applies | Bun (`bun`/`bunx`). No `npm` or `npx` in scripts or documentation.                                                                                                                                                                                                                                                                                                              |

## Audit Checklist

### Critical Checks 🚨

- [ ] No unreachable code blocks or infinite loops without termination
- [ ] All error handling flows logically from potential failure points
- [ ] No critical control flow issues blocking development (Score <2.0)
- [ ] Business logic clearly maps to code implementation

### High Priority Checks ⚠️

- [ ] Branching logic optimally structured (no excessive nesting >3 levels)
- [ ] Functions follow single responsibility principle
- [ ] No redundant conditions or duplicate boolean expressions
- [ ] Complex algorithms have appropriate complexity for requirements
- [ ] No floating promises: async calls are awaited or have an explicit `.catch()`/best-effort wrapper that logs; fire-and-forget work is intentional and documented
- [ ] Concurrent state transitions (run/session lifecycle, heartbeat, reconciliation) are guarded against interleaving; terminal-status writes go through a single idempotent path, not parallel writers
- [ ] _(Apps with workspace/tenant scoping only)_ Tenant-scoped TanStack Query keys include the active-tenant id
- [ ] JSON.parse calls wrapped in try-catch with fallback
- [ ] No bare `catch {}` that swallows **unexpected** parse/decrypt/schema/IO failures without logging; a commented best-effort broadcast/notify path that intentionally ignores a peer-send failure is not a finding
- [ ] Retried mutations are idempotent: any request that opts into `apiClient` 5xx retry/backoff is safe to apply more than once (idempotency key, upsert, or natural idempotence)

### Medium Priority Checks 📋

- [ ] Code smells addressed (magic numbers, hardcoded values)
- [ ] Resources properly managed and released
- [ ] State management at appropriate level
- [ ] Dependencies used efficiently (no unused imports)
- [ ] No unbounded Promise.all/map without throttling for large arrays
- [ ] Division operations have zero-guards where divisor could be 0
- [ ] Multi-step mutations are atomic: `db.transaction()` in standard deployments, or the worker command layer (`db/commands.ts`) where the DB runs in a Bun worker (never raw `db.transaction()` across the worker boundary)
- [ ] Nullish-vs-falsy checks are correct (`??`/explicit `=== undefined` where `0`/`''`/`false` are valid values) and discriminated-union switches are exhaustive (`never` default)
- [ ] No manual `useMemo`, `useCallback`, or `React.memo`; React Compiler handles memoization automatically
- [ ] Promises passed to `use()` are stable across renders (not re-created inline every render); no re-suspend loop
- [ ] `useEffect` hooks that open subscriptions/intervals/WebSocket handlers/timers return a cleanup, and dependency arrays are correct (no stale closures, no unstable deps forcing re-runs)
- [ ] _(Only when the app ships both dialects: `schema/` and `schema-pg/` present)_ Multi-dialect schema definitions (SQLite/PostgreSQL) remain structurally consistent for logic-dependent columns, indexes, and constraints

### Low Priority Checks 💡

- [ ] Code self-documenting with clear variable names
- [ ] Comments explain "why" not just "what"
- [ ] Modern language features used appropriately
- [ ] Test coverage adequate for critical paths
- [ ] LIKE pattern inputs escaped to prevent wildcard injection
- [ ] All modules use ES Modules (`import`/`export`) with named exports exclusively: no `require`, `module.exports`, or `export default` (the `React.lazy()` `default:` interop shim is exempt)

## **Prioritization Methodology**

### **Issue Priority Matrix**

| Score Range | Priority Level   | Action Timeline           | Business Impact                  |
| ----------- | ---------------- | ------------------------- | -------------------------------- |
| **1.0-1.9** | 🚨 **CRITICAL**  | Immediate (1-3 days)      | High risk, blocks development    |
| **2.0-2.9** | ⚠️ **HIGH**      | Next sprint (1-2 weeks)   | Significant technical debt       |
| **3.0-3.9** | 📋 **MEDIUM**    | Next quarter (1-3 months) | Moderate improvement opportunity |
| **4.0-4.9** | 📝 **LOW**       | Backlog (3+ months)       | Minor optimization               |
| **5.0**     | ✅ **EXCELLENT** | No action needed          | Best practices followed          |

### **Weighted Category Priorities**

1. **Control Flow & Logic (25%)** - Core functionality correctness
2. **Efficiency & Performance (20%)** - User experience impact
3. **Complexity Reduction (20%)** - Maintainability and development speed (see [COMPLICATION.md](./COMPLICATION.md) for detailed metrics)
4. **Workarounds & Technical Debt (15%)** - Long-term code health
5. **Data Flow & State Management (10%)** - System reliability
6. **Dependencies & Architecture (5%)** - System scalability
7. **Maintainability & Readability (3%)** - Team productivity
8. **Testing & Debugging (2%)** - Quality assurance

### **Overall Logic Quality Calculation**

```
Overall Score = (Control Flow × 0.25) + (Efficiency × 0.20) + (Complexity × 0.20) +
                (Technical Debt × 0.15) + (Data Flow × 0.10) + (Architecture × 0.05) +
                (Maintainability × 0.03) + (Testing × 0.02)
```

## **Action Planning Templates**

### **Critical Issues Action Plan (Score 1.0-1.9)**

```markdown
## CRITICAL Logic Issue

**File/Function**: [Location]
**Category**: [Control Flow/Complexity/etc.]
**Current Score**: [1.0-1.9]
**Target Score**: [≥3.0]

### Issue Description

[Specific problem identified]

### Business Impact

- **Risk**: [Development blocking/Performance/Security]
- **Affected Users**: [Number/Percentage]
- **Estimated Cost**: [Development time/Performance impact]

### Action Items

- [ ] **Immediate (Day 1)**: [Critical fix]
- [ ] **Short-term (Days 2-3)**: [Stabilization]
- [ ] **Validation**: [Testing/Review requirements]

### Success Criteria

- [ ] Score improves to ≥3.0
- [ ] No functional regressions
- [ ] Performance impact resolved

### Assigned To\*\*: [Developer]

**Due Date**: [Within 3 days]
```

### **High Priority Action Plan (Score 2.0-2.9)**

```markdown
## HIGH Priority Logic Improvement

**File/Function**: [Location]
**Category**: [Category name]
**Current Score**: [2.0-2.9]
**Target Score**: [≥4.0]

### Improvement Opportunity

[Description of issues and potential improvements]

### Implementation Plan

- [ ] **Week 1**: [Analysis and design]
- [ ] **Week 2**: [Implementation and testing]
- [ ] **Validation**: [Code review and testing]

### Expected Benefits

- **Maintainability**: [Improvement description]
- **Performance**: [Expected gains]
- **Developer Experience**: [Productivity improvements]

### Resource Requirements

- **Developer Time**: [Hours/Days]
- **Testing Effort**: [Hours]
- **Review Requirements**: [Team members needed]
```

### **Continuous Improvement Tracking**

```markdown
## Logic Quality Metrics Dashboard

| Category       | Current Score | Target Score | Trend     | Last Updated |
| -------------- | ------------- | ------------ | --------- | ------------ |
| Control Flow   | [Score]       | ≥4.0         | [↑↓→]     | [Date]       |
| Complexity     | [Score]       | ≥4.0         | [↑↓→]     | [Date]       |
| Efficiency     | [Score]       | ≥4.0         | [↑↓→]     | [Date]       |
| Technical Debt | [Score]       | ≥4.0         | [↑↓→]     | [Date]       |
| **Overall**    | **[Score]**   | **≥4.0**     | **[↑↓→]** | **[Date]**   |

### Monthly Review Actions

- [ ] Identify lowest-scoring categories
- [ ] Plan improvement initiatives
- [ ] Update team training priorities
- [ ] Review and adjust scoring criteria
```

These evaluation frameworks should be applied systematically during code reviews to identify areas for simplification and improvement with clear priorities and actionable plans.

## Deliverables & Success Criteria

### Deliverables

1. **Scored audit report** using the report template below, with category scores, weighted overall score, and prioritized findings.
2. **Prioritized findings list** with file/line references, severity classifications, and recommended remediation steps.
3. **Action plans** for Critical and High findings, including owners, timelines, and success criteria.
4. **Coverage notes** documenting which checklist items were investigated and produced no findings (for transparency).

### Success Criteria

- [ ] Overall Logic Quality Score ≥4.0 for production code, ≥3.5 for development code.
- [ ] Zero Critical issues remain unassigned.
- [ ] All High priority issues have assigned owners and due dates.
- [ ] No bare `catch {}` that swallows unexpected parse/decrypt/schema/IO failures without logging (commented best-effort broadcast/notify paths are exempt).
- [ ] No floating promises or unguarded fire-and-forget async work.
- [ ] _(Apps with workspace/tenant scoping only)_ All tenant-scoped TanStack Query keys include the active-tenant id.
- [ ] All multi-step database mutations are atomic (`db.transaction()`, or the worker command layer where the DB runs in a Bun worker).
- [ ] Report is reviewed and signed off by the lead developer or tech lead.

## Report Template

```markdown
# Control Flow & Logic Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Logic Quality Score**: [Score]/5.0
**Target Score**: ≥4.0
**Critical Issues Found**: [Number]
**High Priority Issues Found**: [Number]

### Category Scores

| Category                 | Score     | Weight   | Weighted Score |
| ------------------------ | --------- | -------- | -------------- |
| Control Flow & Logic     | [X]/5     | 25%      | [Score]        |
| Efficiency & Performance | [X]/5     | 20%      | [Score]        |
| Complexity Reduction     | [X]/5     | 20%      | [Score]        |
| Technical Debt           | [X]/5     | 15%      | [Score]        |
| Data Flow & State        | [X]/5     | 10%      | [Score]        |
| Architecture             | [X]/5     | 5%       | [Score]        |
| Maintainability          | [X]/5     | 3%       | [Score]        |
| Testing                  | [X]/5     | 2%       | [Score]        |
| **Overall**              | **[X]/5** | **100%** | **[Score]**    |

### Key Findings

- [Summary of major findings]

## Detailed Findings

### Critical Issues 🚨 (Score 1.0-1.9)

| Issue | Location    | Category   | Score   | Impact   | Timeline |
| ----- | ----------- | ---------- | ------- | -------- | -------- |
| [ID]  | [File:Line] | [Category] | [Score] | [Impact] | 1-3 days |

### High Priority Issues ⚠️ (Score 2.0-2.9)

| Issue | Location    | Category   | Score   | Impact   | Timeline  |
| ----- | ----------- | ---------- | ------- | -------- | --------- |
| [ID]  | [File:Line] | [Category] | [Score] | [Impact] | 1-2 weeks |

### Medium Priority Issues 📋 (Score 3.0-3.9)

| Issue | Location    | Category   | Score   | Impact   | Timeline   |
| ----- | ----------- | ---------- | ------- | -------- | ---------- |
| [ID]  | [File:Line] | [Category] | [Score] | [Impact] | 1-3 months |

## Recommendations

### Immediate Actions (0-7 days)

1. [Address critical control flow issues]

### Short-term Actions (1-4 weeks)

1. [Improve high-priority areas]

### Long-term Actions (1-3 months)

1. [Establish ongoing quality monitoring]

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

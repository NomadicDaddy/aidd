---
title: 'Unified Severity Classification System'
last_updated: '2026-10-01'
version: '2.3'
category: 'Reference'
priority: 'Medium'
type: 'reference'
lifecycle: 'reference'
description: 'Standard severity classification system for aidd audit findings'
---

# Unified Severity Classification System

## Table of Contents

1. [Overview](#overview)
2. [Severity Levels](#severity-levels)
3. [Classification Guidelines](#classification-guidelines)
4. [Feature.json Output](#featurejson-output)
5. [Severity Distribution Guidelines](#severity-distribution-guidelines)
6. [Audit Framework Compliance](#audit-framework-compliance)
7. [Self-Assessment](#self-assessment)

## Overview

This document defines the standardized 4-level severity classification system used by all aidd audits. When an audit discovers issues, it creates **feature.json files** in `/.aidd/features/` with severity mapped to priority.

> **Note**: This severity system applies to **audit findings** (issues discovered during audits), not to feature priority in regular `feature.json` files. See `docs/reference/feature-fields.md` for the complete feature.json schema.

## Severity Levels

### **Level 1: Critical**

**Definition**: Issues that pose immediate risk to production stability, security, or core application functionality.

**Characteristics**:

- Security vulnerabilities that could be exploited
- Production-breaking bugs or errors
- Data corruption or loss potential
- Authentication/authorization bypasses
- Performance issues causing system unavailability
- Build failures preventing deployments

**Examples**:

- SQL injection vulnerabilities
- Exposed sensitive data or API keys
- Application crashes or critical path failures
- Authentication bypass vulnerabilities
- Memory leaks causing system instability
- Critical performance regressions (>50% degradation)

**Impact Assessment**: High business impact, high technical risk

---

### **Level 2: High Priority**

**Definition**: Issues that significantly impact code quality, maintainability, performance, or user experience but don't pose immediate production risk.

**Characteristics**:

- Performance degradation (10-50%)
- Maintainability issues affecting development velocity
- Accessibility violations (WCAG AA failures)
- Significant technical debt accumulation
- Missing error handling for critical paths
- Scalability limitations

**Examples**:

- N+1 database query patterns
- Missing indexes for frequent queries
- Large bundle sizes affecting load times
- Deprecated API usage with migration deadlines
- Memory leaks in non-critical components
- Poor error handling in user-facing features
- Missing validation for user inputs

**Impact Assessment**: Medium-high business impact, medium-high technical risk

---

### **Level 3: Medium Priority**

**Definition**: Issues that affect best practices, consistency, development efficiency, or future maintainability but don't significantly impact current functionality.

**Characteristics**:

- Code style inconsistencies
- Missing documentation for complex logic
- Suboptimal patterns that could be improved
- Minor performance optimizations
- Non-critical accessibility improvements
- Technical debt that may cause future issues

**Examples**:

- Inconsistent naming conventions
- Duplicate code that could be refactored
- Missing TypeScript types (using `any`)
- Outdated dependencies with available updates
- Missing test coverage for non-critical paths
- Hardcoded values that should be configurable
- Minor CSS optimization opportunities

**Impact Assessment**: Medium business impact, low-medium technical risk

---

### **Level 4: Low Priority**

**Definition**: Minor improvements, optimizations, or enhancements that would be nice to have but don't significantly impact current operations.

**Characteristics**:

- Code cleanup opportunities
- Minor style improvements
- Documentation enhancements
- Developer experience improvements
- Cosmetic UI/UX refinements
- Future-proofing improvements

**Examples**:

- Comment improvements or additions
- Variable renaming for clarity
- Minor code organization improvements
- Non-critical dependency updates
- Cosmetic UI adjustments
- Developer tooling enhancements
- Code formatting inconsistencies

**Impact Assessment**: Low business impact, low technical risk

## Classification Guidelines

### **Factors to Consider**

#### **Security Impact**

- **Critical**: Exploitable vulnerabilities, data exposure
- **High**: Potential vulnerabilities, insufficient protection
- **Medium**: Security best practice violations
- **Low**: Security improvements, hardening opportunities

#### **Performance Impact**

- **Critical**: System unavailable or severely degraded (>50% regression)
- **High**: Significant performance impact (10-50% regression)
- **Medium**: Noticeable performance issues (<10% regression)
- **Low**: Minor optimization opportunities

#### **Business Impact**

- **Critical**: Core functionality broken, revenue impact
- **High**: Major features affected, user experience degraded
- **Medium**: Minor features affected, development efficiency reduced
- **Low**: Cosmetic issues, future considerations

#### **Technical Risk**

- **Critical**: Immediate production risk, data integrity risk
- **High**: Potential for cascading failures, maintainability risk
- **Medium**: Development efficiency impact, future risk
- **Low**: Code quality, documentation issues

### **Edge Case Guidelines**

#### **When Multiple Factors Apply**

- Use the **highest applicable severity level**
- Document all contributing factors in the feature description
- Consider cumulative impact of multiple medium issues

#### **Framework-Specific Considerations**

- **React**: Component rendering issues may be High if affecting UX
- **Database**: Query performance issues often High due to scalability impact
- **Tailwind**: CSS issues typically Medium unless affecting accessibility
- **Security**: Authentication/authorization issues typically Critical

#### **Context-Dependent Severity**

- Development vs Production environment
- Core vs auxiliary functionality
- Frequency of code path execution
- Number of users affected

#### **Findings About the Audit's Own Evidence**

[AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) defines findings that are about the evidence, not the code. Classify them as it states:

- A named instrument that is absent, unwired, or unfaithful is **High**: the target has no working measurement for a dimension the audit requires.
- A red gate with no named mechanism and no evidence is a finding against the target. Classify it by what the gate protects.
- A red gate classed environmental is a **hold**, not a finding. It gets no severity and no feature.json. It is reported, and it is never counted as a pass.
- A missing falsification record, or an absence claim with no known-positive control, makes a report incomplete. In your own report, supply the missing record before scoring. Found in an earlier report, it is an incomplete-audit finding: classify it by the control that was left unverified.

#### **What Severity Must Not Depend On**

- How many findings the audit has already raised at that level. The distribution figures below describe a typical result. They are not a quota.
- How hard the fix is. Effort belongs in `spec`.
- Whether a gate is green. A passing gate does not lower the severity of a defect it failed to catch.

## Feature.json Output

### **Severity to Priority Mapping**

When creating feature.json files for audit findings, map severity to priority:

| Severity | `priority` | `auditSeverity` |
| -------- | ---------- | --------------- |
| Critical | 1          | "Critical"      |
| High     | 2          | "High"          |
| Medium   | 3          | "Medium"        |
| Low      | 4          | "Low"           |

### **Required Fields for Audit Features**

Each audit finding produces a feature.json file with these fields:

```json
{
	"affectedFiles": ["path/to/file1.ts", "path/to/file2.ts"],
	"auditSeverity": "High",
	"auditSource": "{AUDIT_NAME}",
	"category": "Audit",
	"createdAt": "{ISO_timestamp}",
	"dependencies": [],
	"description": "Verified: path/to/file1.ts:42 - specific pattern observed, followed by a short explanation of the issue and its impact.",
	"id": "audit-{audit_name_lower}-{unix_timestamp}-{descriptive-slug}",
	"passes": false,
	"priority": 2,
	"spec": "Detailed remediation steps:\n1. Step one\n2. Step two",
	"status": "backlog",
	"title": "Brief title of the issue",
	"updatedAt": "{ISO_timestamp}"
}
```

The `description` MUST carry the verification evidence: a `file:line` reference plus the
concrete pattern or behavior observed in the current codebase. The line is the one read in the
live file during this audit, never a line number copied from an audit definition or an earlier
report. Never put a credential value in `description`, `spec`, or `title`: name the file and the
kind of secret, and give at most a redacted marker. There is no separate
`verificationEvidence` field; the runtime contract and the live findings keep evidence in
`description`. `category` is `"Audit"` for audit findings, and `dependencies` is present (an
empty array when the fix has no prerequisites).

> **Runtime note (spec feedback loop)**: When the runtime normalizes a finding, it
> automatically appends a feedback-loop requirement to `spec` (instructing the agent to update
> the originating `feature.json` spec(s) so the issue is not reintroduced during a feature-based
> rebuild). You do not write this clause yourself (it is injected if absent), but the persisted
> `spec` will always carry it.

> **Runtime note (duplicate detection)**: The runtime gives each finding a fingerprint computed
> from `auditSource`, the normalized `title`, and the sorted set of `affectedFiles` (path
> separators and a leading `./` are normalized). See `findingFingerprint` and `matchingFeature` in
> `shared/src/modes/audit-findings.ts`. A new finding whose fingerprint matches a record that is
> still open (`passes` not true and `status` not `completed`) is skipped as a duplicate. One that
> matches a record already resolved, or a ledger entry marked remediated, is recorded as a
> recurrence of the earlier finding. One that matches a ledger entry dismissed as a false positive
> is suppressed. Records written before fingerprints existed are matched the older way: same
> `auditSource` and either the same `title` or any shared `affectedFiles` entry. Keep `title` and
> `affectedFiles` specific and stable: rewording a title or changing the file list produces a new
> fingerprint and a second record for the same issue.

**CRITICAL: The `id` field MUST:**

1. Start with `audit-` prefix
2. Match the directory name exactly (without the trailing slash)
3. Example: If directory is `audit-security-1736985600-jwt-contains-email/`, then `id` must be `"audit-security-1736985600-jwt-contains-email"`

### **Field Descriptions**

| Field           | Description                                                                                                               |
| --------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `priority`      | Numeric priority (1-4) mapped from severity                                                                               |
| `auditSource`   | Name of the audit that found this issue                                                                                   |
| `auditSeverity` | String severity level ("Critical", "High", etc.)                                                                          |
| `category`      | `"Audit"` for audit findings (groups them in status summaries and dashboards)                                             |
| `dependencies`  | Array of feature IDs that must pass first; use `[]` when the fix has no prerequisites                                     |
| `affectedFiles` | Array of file paths affected by this issue                                                                                |
| `description`   | Must include the verification evidence: a `file:line` reference and the specific pattern observed in the current codebase |
| `spec`          | Remediation steps - what needs to be done to fix this                                                                     |
| `passes`        | Always `false` for new audit findings                                                                                     |

### **Feature Directory Naming**

Audit features are created in directories following this pattern:

```
/.aidd/features/audit-{audit_name_lower}-{unix_timestamp}-{descriptive-slug}/feature.json
```

## Severity Distribution Guidelines

### **Healthy Audit Distribution**

A well-maintained codebase typically shows:

- **Critical**: 0-2% of total findings
- **High**: 5-15% of total findings
- **Medium**: 30-50% of total findings
- **Low**: 35-60% of total findings

### **Red Flags in Distribution**

- **>5% Critical findings**: Indicates systemic problems
- **>30% High findings**: Technical debt accumulation
- **<20% Medium/Low findings**: May indicate incomplete audit
- **All findings same severity**: Poor classification or limited scope

## Audit Framework Compliance

### **Required Usage**

- All audits MUST use this 4-level severity system
- Severity MUST be documented in `auditSeverity` field (a missing or unrecognized value defaults to **Medium**, priority 3, so always set it explicitly)
- `priority` MUST match the severity mapping (Critical=1, High=2, etc.)
- `spec` field MUST contain actionable remediation steps
- `description` MUST include the concrete code evidence (a `file:line` reference and the observed pattern) that justified creating the finding

### **Consistency Requirements**

- Similar issues across audits should have consistent severity
- Use the highest applicable severity when multiple factors apply
- Each finding should be independently actionable

## Self-Assessment

When classifying severity, ask these questions:

1. Would this issue cause immediate production problems? → **Critical**
2. Would this issue significantly impact users or development? → **High**
3. Would this issue affect maintainability or best practices? → **Medium**
4. Is this primarily a minor improvement or cleanup? → **Low**

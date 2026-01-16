---
title: 'Unified Severity Classification System'
last_updated: '2025-01-13'
version: '1.0'
category: 'Reference'
priority: 'Medium'
type: 'reference'
description: 'Standard severity classification system used by all audits'
---

# Unified Severity Classification System

## Table of Contents

1. [Overview](#overview)
2. [Severity Levels](#severity-levels)
3. [Classification Guidelines](#classification-guidelines)
4. [Usage in Audit Reports](#usage-in-audit-reports)
5. [Detailed Findings](#detailed-findings)
6. [Severity Distribution Guidelines](#severity-distribution-guidelines)
7. [Integration with Development Workflow](#integration-with-development-workflow)
8. [Audit Framework Compliance](#audit-framework-compliance)
9. [Validation and Quality Assurance](#validation-and-quality-assurance)

## Overview

This document defines the standardized 4-level severity classification system used across all audit frameworks in this project. All audits must use this classification to ensure consistency in prioritization and remediation planning.

## Severity Levels

### **Level 1: Critical** 🚨

**Definition**: Issues that pose immediate risk to production stability, security, or core application functionality.

**Characteristics**:

- Security vulnerabilities that could be exploited
- Production-breaking bugs or errors
- Data corruption or loss potential
- Authentication/authorization bypasses
- Performance issues causing system unavailability
- Build failures preventing deployments

**Response Time**: **Immediate** (0-24 hours)

**Examples**:

- SQL injection vulnerabilities
- Exposed sensitive data or API keys
- Application crashes or critical path failures
- Authentication bypass vulnerabilities
- Memory leaks causing system instability
- Critical performance regressions (>50% degradation)

**Impact Assessment**: High business impact, high technical risk

---

### **Level 2: High Priority** ⚠️

**Definition**: Issues that significantly impact code quality, maintainability, performance, or user experience but don't pose immediate production risk.

**Characteristics**:

- Performance degradation (10-50%)
- Maintainability issues affecting development velocity
- Accessibility violations (WCAG AA failures)
- Significant technical debt accumulation
- Missing error handling for critical paths
- Scalability limitations

**Response Time**: **1-2 weeks**

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

### **Level 3: Medium Priority** 📋

**Definition**: Issues that affect best practices, consistency, development efficiency, or future maintainability but don't significantly impact current functionality.

**Characteristics**:

- Code style inconsistencies
- Missing documentation for complex logic
- Suboptimal patterns that could be improved
- Minor performance optimizations
- Non-critical accessibility improvements
- Technical debt that may cause future issues

**Response Time**: **1-4 weeks**

**Examples**:

- Inconsistent naming conventions
- Duplicate code that could be refactored
- Missing TypeScript types (using `any`)
- Outdated dependencies with available updates
- Missing unit tests for non-critical functions
- Hardcoded values that should be configurable
- Minor CSS optimization opportunities

**Impact Assessment**: Medium business impact, low-medium technical risk

---

### **Level 4: Low Priority** 💡

**Definition**: Minor improvements, optimizations, or enhancements that would be nice to have but don't significantly impact current operations.

**Characteristics**:

- Code cleanup opportunities
- Minor style improvements
- Documentation enhancements
- Developer experience improvements
- Cosmetic UI/UX refinements
- Future-proofing improvements

**Response Time**: **1-3 months** (or next major refactoring cycle)

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
- Document all contributing factors in the issue description
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

## Usage in Audit Reports

### **Report Section Structure**

```markdown
## Detailed Findings

### Critical Issues (Severity Level 1) 🚨

> Issues requiring immediate attention

### High Priority Issues (Severity Level 2) ⚠️

> Issues for next sprint/iteration

### Medium Priority Issues (Severity Level 3) 📋

> Issues for upcoming releases

### Low Priority Issues (Severity Level 4) 💡

> Improvement opportunities
```

### **Issue Documentation Template**

```markdown
#### Issue #{Number}: {Title}

- **Severity**: {Critical/High/Medium/Low} (Level {1-4})
- **File(s)**: `path/to/file.ts:line`
- **Category**: {Security/Performance/Maintainability/etc.}
- **Impact**: {Description of business/technical impact}
- **Evidence**: {Code snippet or detailed description}
- **Recommendation**: {Specific action to resolve}
- **Effort Estimate**: {Hours/Days/Weeks}
- **Dependencies**: {Any blocking factors}
```

## Severity Distribution Guidelines

### **Healthy Audit Distribution**

A well-maintained codebase typically shows:

- **Critical**: 0-2% of total issues
- **High**: 5-15% of total issues
- **Medium**: 30-50% of total issues
- **Low**: 35-60% of total issues

### **Red Flags in Distribution**

- **>5% Critical issues**: Indicates systemic problems
- **>30% High issues**: Technical debt accumulation
- **<20% Medium/Low issues**: May indicate incomplete audit
- **All issues same severity**: Poor classification or limited scope

## Integration with Development Workflow

### **Sprint Planning Integration**

- **Critical**: Address immediately, may require hotfix
- **High**: Include in current or next sprint
- **Medium**: Plan for upcoming sprints (2-3 iterations)
- **Low**: Backlog for future iterations or tech debt sprints

### **Code Review Guidelines**

- Block merges for Critical issues
- Require plan for High issues before merge
- Document Medium issues for future addressing
- Optional addressing of Low issues

### **Monitoring and Escalation**

- **Critical**: Immediate notification, incident response
- **High**: Daily standup discussion, sprint adjustment
- **Medium**: Sprint retrospective item
- **Low**: Quarterly tech debt review

## Audit Framework Compliance

### **Required Usage**

- All audit frameworks MUST use this 4-level system
- Issue severity MUST be documented with rationale
- Recommendations MUST align with severity level urgency
- Action plans MUST prioritize by severity level

### **Consistency Checks**

- Similar issues across audits should have consistent severity
- Severity should align with recommended response timeframes
- Documentation should justify severity assignment

### **Framework-Specific Mappings**

#### **Performance Audits**

- Page load >5s = Critical
- Core Web Vitals failures = High
- Bundle size optimization = Medium
- Minor optimizations = Low

#### **Security Audits**

- Authentication bypass = Critical
- XSS/CSRF vulnerabilities = High
- Missing security headers = Medium
- Security hardening = Low

#### **Code Quality Audits**

- Build failures = Critical
- Major anti-patterns = High
- Style inconsistencies = Medium
- Documentation gaps = Low

## Validation and Quality Assurance

### **Self-Assessment Questions**

1. Would this issue cause immediate production problems? → Critical
2. Would this issue significantly impact users or development? → High
3. Would this issue affect maintainability or best practices? → Medium
4. Is this primarily a minor improvement or cleanup? → Low

### **Peer Review Process**

- Critical and High severity assignments should be peer-reviewed
- Justification should be provided for severity decisions
- Consistency should be checked across similar issue types

### **Appeals Process**

- Severity levels can be appealed with technical justification
- Appeals should be documented in audit reports
- Final severity decisions should be consensus-based when possible

---

**Version**: 1.0
**Last Updated**: 2025-01-02
**Next Review**: Quarterly or when audit frameworks are updated

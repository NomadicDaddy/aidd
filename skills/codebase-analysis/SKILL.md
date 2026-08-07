---
name: codebase-analysis
description: 'Run a broad aidd-oriented codebase analysis across architecture, performance, security, metadata health, and technical debt. Use for a full codebase review, health check, or technical-debt assessment of an aidd-managed project.'
metadata:
    aidd-category: runtime
    aidd-contracts: humanize-docs
    aidd-references: audits/SEVERITY_CLASSIFICATION.md
---

# Codebase Analysis

Run a broad aidd-oriented codebase analysis across architecture, performance, security, metadata health, and technical debt.

## Usage

```
codebase-analysis [app]
```

## Scope (analysis only)

This is a read-only analysis. It observes and reports; it does not change the project.

- Do NOT edit source files or config (including `tsconfig.json`, `package.json`, lint config).
- Write only under `.aidd/audit-reports/` (the report) and `.aidd/CHANGELOG.md` (the summary).
- Do NOT `git add` or `git commit`; leave the deliverables as workspace artifacts for the user.
- Run build, lint, and tests to observe status only. Never apply a fix to make a gate pass; a
  failing gate is a finding to report, not a task to resolve.

## Instructions

1. **Comprehensive context mapping**:
    - Analyze all architectural patterns and their relationships
    - Map data flow across the entire application
    - Identify integration points and dependencies
    - Assess type safety across the codebase
    - Identify performance bottlenecks and optimization opportunities
    - Review security patterns and potential vulnerabilities
    - Evaluate code quality metrics and technical debt
    - Map reusable components and their usage patterns

2. **Historical evolution analysis**:
    - Review git history for architectural decisions and outcomes
    - Identify bug patterns and resolution strategies
    - Assess code quality trends over time
    - Note technical debt accumulation and resolution patterns

3. **Cross-language consistency validation**:
    - Check naming conventions across TypeScript/JavaScript
    - Verify error handling pattern consistency
    - Validate API design pattern adherence
    - Review data validation approaches
    - Assess testing strategies and coverage
    - Check documentation standards compliance

4. **Performance analysis**:
    - Database query patterns and optimization opportunities
    - Frontend performance bottlenecks
    - Bundle size optimization opportunities
    - Caching strategy effectiveness
    - Code splitting and lazy loading opportunities

5. **Security assessment**:
    - Authentication and authorization patterns
    - Input validation and sanitization
    - Injection vulnerability patterns (SQL, XSS)
    - Secrets management and exposure risks
    - API security implementation
    - Third-party dependency security risks

6. **Technical debt and quality metrics**:
    - Cyclomatic complexity analysis
    - Code duplication patterns
    - Test coverage gaps
    - Outdated patterns and practices
    - Refactoring opportunities

7. **Generate analysis report** with sections:
    - **Executive Summary**: Overall health score (A-F), top 3 critical issues, top 3 optimization opportunities
    - **Detailed Findings**: Architecture, Performance, Security, Quality, Evolution
    - **Actionable Recommendations**: High/Medium/Low priority with implementation steps; severity/priority definitions come from `.aidd/audits/SEVERITY_CLASSIFICATION.md` (staged into this workspace; the authority), or `<aidd-root>/audits/SEVERITY_CLASSIFICATION.md` when running inside the aidd repo; keep the High/Medium/Low labels
    - **Implementation Roadmap**: Immediate (1-2 days), Short-term (1-2 weeks), Medium-term (1-2 months), Long-term (3-6 months)

    Write the report prose to the humanize-docs style contract
    (`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or
    `<aidd-root>/skills/humanize-docs/SKILL.md` when running inside the aidd repo); read it
    before drafting. Minimum bar if it is unavailable: plain natural language, no em-dashes, no
    AI filler (delve, leverage, robust, seamless), and state findings factually instead of
    dramatizing them.

8. **Run quality validation**:
    - Run build; document any TypeScript errors
    - Run lint; document any lint errors
    - Run tests; document coverage gaps

9. **Save report only when requested or recipe-owned**:
    - Report path: `.aidd/audit-reports/CODEBASE_ANALYSIS-{YYYY-MM-DD}.md`

10. **Report completion**:
    - Provide path to analysis report
    - Summarize critical findings
    - Create `.aidd/features/*/feature.json` remediation entries for confirmed actionable issues when the workflow asks for durable backlog output

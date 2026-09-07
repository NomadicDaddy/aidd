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

This is an analysis-only workflow. It may write the declared report artifacts, but it does not
change the application implementation.

- Do NOT edit source files or config (including `tsconfig.json`, `package.json`, lint config).
- Write only under `.aidd/audit-reports/` (the report) and `.aidd/CHANGELOG.md` (the summary).
  When the invocation explicitly requests durable backlog output, it may also create remediation
  records under `.aidd/features/`; the standard `codebase-analysis` recipe does not request them.
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
    - Compare `.aidd` feature, roadmap, run, and report metadata with the implementation and call
      out stale, contradictory, or incomplete records

2. **Historical evolution analysis**:
    - Review git history for architectural decisions and outcomes
    - Identify bug patterns and resolution strategies
    - Assess code quality trends over time
    - Note technical debt accumulation and resolution patterns

3. **Cross-language consistency validation**:
    - Check naming conventions across the languages the project actually uses
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
    - **Executive Summary**: Overall health score (A-F) with its evidence, up to 3 highest-severity
      confirmed issues, and up to 3 optimization opportunities. State explicitly when a category
      has no qualifying findings; do not promote findings to fill the list.
    - **Detailed Findings**: Architecture, Performance, Security, Quality, Evolution. Classify
      finding severity as Critical, High, Medium, or Low using
      `.aidd/audits/SEVERITY_CLASSIFICATION.md` (staged into this workspace; the authority), or
      `<aidd-root>/audits/SEVERITY_CLASSIFICATION.md` when running inside the aidd repo.
    - **Actionable Recommendations**: High/Medium/Low implementation priority with concrete steps;
      keep this delivery priority distinct from each finding's severity.
    - **Implementation Roadmap**: Immediate, Short-term, Medium-term, Long-term, ordered by risk and
      dependencies. Do not invent calendar estimates when the evidence does not support them.

    Write the report prose to the humanize-docs style contract
    (`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or
    `<aidd-root>/skills/humanize-docs/SKILL.md` when running inside the aidd repo); read it
    before drafting. Minimum bar if it is unavailable: plain natural language, no em-dashes, no
    AI filler (delve, leverage, robust, seamless), and state findings factually instead of
    dramatizing them.

8. **Run quality validation**:
    - Inspect the project's manifest and repository guidance, then run its available build, lint,
      typecheck, and test commands
    - Record command, exit status, and relevant failures without changing files to make a gate pass
    - Document coverage gaps only when coverage evidence exists; do not infer coverage from a
      passing test command

9. **Save report only when requested or recipe-owned**:
    - Report path: `.aidd/audit-reports/CODEBASE_ANALYSIS-{YYYY-MM-DD}.md`
    - When the report is saved, append a concise factual summary to `.aidd/CHANGELOG.md`

10. **Report completion**:
    - Provide the report path when saved; otherwise state that the analysis was returned without a
      workspace report
    - Summarize the highest-severity confirmed findings, including an explicit no-findings result
      when applicable
    - Create `.aidd/features/*/feature.json` remediation entries only for confirmed actionable
      issues when the invocation explicitly asks for durable backlog output; reconcile against
      existing records first and follow the referenced severity contract

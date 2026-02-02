---
title: 'Documentation Quality and Coverage Audit'
last_updated: '2025-12-02'
version: '1.0'
category: 'Quality'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
---

# Documentation Quality and Coverage Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

This audit evaluates the quality, completeness, and alignment of documentation across a project or an entire repo family: READMEs, architecture docs, API docs, code comments, and user-facing guides.

## Audit Objectives

- Ensure **critical paths** (setup, deploy, contribute) are fully documented
- Verify that **architecture and audits/commands** are discoverable and up to date
- Assess **comment and inline documentation** quality ("why" not just "what")
- Identify **gaps, rot, and contradictions** between docs and reality

## Scope

- Top-level project docs: `README.md`, `CONTRIBUTING.md`, `docs/**`
- Project-specific documentation (guides, frameworks, rules)
- API and integration docs (OpenAPI/Swagger, narrative API docs)
- Code comments and internal docs tied to critical flows

## Methodology

### 1. Inventory key documentation assets

- List all major doc entry points (root README, docs site, project guides)
- Identify ownership and last-updated dates

### 2. Task-based walkthroughs

For each critical flow, attempt to execute using only the docs:

- New developer setup
- Running tests and linting
- Performing a deployment
- Running a representative audit/command workflow

Record where:

- Steps are missing or ambiguous
- Docs contradict actual behavior/config
- Important caveats are undocumented

### 3. Quality assessment

Evaluate docs for:

- **Accuracy**: matches current code and infrastructure
- **Completeness**: covers all required steps and edge cases
- **Clarity**: clear, concise, and logically structured
- **Audience fit**: appropriate detail for target reader (dev, operator, user)

### 4. Comment and inline documentation review

Sample representative modules and review:

- Public APIs: JSDoc/TSDoc present and accurate
- Complex logic: comments explain reasoning and trade-offs
- TODO/FIXME: owned, scoped, and not stale
- No misleading or obsolete comments

## Audit Checklist

### Critical Checks 🚨

- [ ] New engineer can set up the project using docs alone
- [ ] Deployment steps are fully documented and accurate
- [ ] Security- and data-sensitive flows have clear documentation

### High Priority Checks ⚠️

- [ ] All public APIs have basic reference documentation
- [ ] Key architecture decisions are documented (ADR-style or equivalent)
- [ ] Major commands and audits have clear usage docs and entry points

### Medium Priority Checks 📋

- [ ] Comments and inline documentation meet CODE_QUALITY standards
- [ ] Known gaps and outdated docs are tracked as issues/tasks
- [ ] Style and tone are reasonably consistent

### Low Priority Checks 💡

- [ ] Documentation formatting follows conventions
- [ ] Cross-references and links are maintained
- [ ] Version history and changelog maintained

## Report Template

```markdown
# Documentation Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Documentation Score**: [Score]/100
**Critical Gaps**: [Number]
**High Priority Gaps**: [Number]

## Key Findings

- Setup experience
- Deployment documentation
- Architecture & API docs
- Inline documentation

## Detailed Findings

### Critical Gaps

- [Description, location, impact, recommended fix]

### High Priority Gaps

- [Description, location, impact, recommended fix]

### Medium/Low Priority Gaps

- [Description, location, impact, recommended fix]

## Recommendations

### Immediate (0-7 days)

1. Fix blockers that prevent new engineers from setting up or deploying

### Short-term (1-4 weeks)

1. Close top architecture/API documentation gaps

### Long-term (1-3 months)

1. Establish documentation ownership and regular review cadence

---

**Auditor**: [Name]
**Date**: [Date]
**Next Review**: [Date + 3 months]
```

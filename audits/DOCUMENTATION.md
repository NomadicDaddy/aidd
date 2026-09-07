---
title: 'Documentation Quality and Coverage Audit'
last_updated: '2026-06-28'
version: '1.3'
category: 'Quality'
priority: 'Medium'
estimated_time: '1-2 hours'
frequency: 'Quarterly'
lifecycle: 'post-release'
---

# Documentation Quality and Coverage Audit Framework

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md): read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

This audit evaluates the quality, completeness, and alignment of documentation across a project or an entire repo family: READMEs, architecture docs, API docs, code comments, and user-facing guides.

## Table of Contents

- [Audit Objectives](#audit-objectives)
- [Pre-Audit Setup](#pre-audit-setup)
- [Scope](#scope)
- [Methodology](#methodology)
- [Audit Checklist](#audit-checklist)
- [Report Template](#report-template)
- [Deliverables](#deliverables)
- [Success Criteria](#success-criteria)

## Audit Objectives

- Ensure **critical paths** (setup, deploy, contribute) are fully documented
- Verify that **architecture and audits/commands** are discoverable and up to date
- Assess **comment and inline documentation** quality ("why" not just "what")
- Identify **gaps, rot, and contradictions** between docs and reality

## Pre-Audit Setup

### Required Tools

- Markdown linter or viewer for reviewing doc formatting
- Access to the running application (for OpenAPI spec verification)
- `bun run config:validate` output (validates config documentation accuracy)

### Verification Commands

```bash
# Check if OpenAPI spec is accessible (dev mode only — endpoint is NOT mounted in
# built/preview/production instances and will 404 there; default backend port is 3331)
curl -s http://localhost:3331/api/v1/docs/json | head -c 200

# Verify config schema documentation exists
ls config/config-schema.json

# Check for stale docs by comparing last-modified dates
git log --format='%ai %s' -- docs/ README.md CHANGELOG.md | head -20
```

## Scope

- Top-level project docs: `README.md`, `CONTRIBUTING.md`, `docs/**`
- Project-specific documentation (guides, frameworks, rules)
- API and integration docs (OpenAPI/Swagger, narrative API docs)
- Code comments and internal docs tied to critical flows

### Spernakit Documentation Assets

For Spernakit-based applications, verify these canonical `docs/template/` documentation files:

- `docs/template/STACK.md`: Technical stack and architecture reference (canonical)
- `docs/template/DEVELOPMENT.md`: Development best practices and coding conventions (canonical)
- `docs/template/GETTING_STARTED.md`: New-developer setup walkthrough
- `docs/template/API_REFERENCE.md` / `docs/template/API_STANDARD.md`: API documentation and conventions
- `docs/template/CONFIGURATION.md`: Configuration documentation
- `docs/template/TESTING.md`: Test strategy (crawltest / `smoke:qc`, NOT vitest/jest/@testing-library)
- `docs/template/TROUBLESHOOTING.md` / `docs/template/KNOWN_ISSUES.md`: Operational gotchas and tracked gaps
- `docs/template/DEPLOYMENT.md`: Deployment and Docker configuration
- `docs/template/CHANGELOG.md`: Version history
- `docs/template/adr/`: Canonical home for architecture decision records (ADR-style)
- `docs/template/architecture/`: System/backend/frontend/database/deployment architecture docs
- `config/config-schema.json`: Generated JSON Schema for config intellisense
- OpenAPI spec at `/api/v1/docs/json`: API contract documentation (dev mode only)

### .aidd Project Artifacts

For aidd-managed projects, verify the `.aidd/` documentation set (these are first-class
documentation assets that reports already evaluate):

- `.aidd/spec.md`: Product/feature specification
- `.aidd/project-structure.md`: Directory and module layout reference
- `.aidd/assertions.md`: Behavioral assertions / acceptance criteria
- `.aidd/screen-map.md`: Screen/route inventory and navigation map
- `.aidd/testing-scenarios.md`: End-to-end testing scenarios
- `.aidd/roadmap.json`: Feature roadmap and backlog
- `.aidd/project.md`: Project-specific metadata and context

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

### Critical Checks

- [ ] New engineer can set up the project using docs alone
- [ ] Deployment steps are fully documented and accurate
- [ ] Security- and data-sensitive flows have clear documentation

### High Priority Checks

- [ ] Public/external-facing APIs have reference documentation (for Spernakit apps the dev-mode OpenAPI spec at `/api/v1/docs/json` satisfies this; hand-written exhaustive reference docs are NOT required for internal single-team tools)
- [ ] Key architecture decisions are documented (ADR-style, e.g. `docs/template/adr/`)
- [ ] Major commands and audits have clear usage docs and entry points
- [ ] Test/CI documentation references the real test commands (`bun run crawltest`, `bun run smoke:qc`) and does not document unit-test frameworks the stack does not use (no vitest/jest/@testing-library; cross-reference `docs/template/TESTING.md`)

### Medium Priority Checks

- [ ] Comments and inline documentation meet CODE_QUALITY standards
- [ ] Known gaps and outdated docs are tracked as issues/tasks
- [ ] Style and tone are reasonably consistent

### Low Priority Checks

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

## Deliverables

The audit should produce:

- Documentation audit report at `.aidd/audit-reports/DOCUMENTATION-YYYY-MM-DD.md`.
- Documentation inventory covering root docs, `docs/**`, OpenAPI/API references, config schema, and `.aidd/` artifacts.
- Task-walkthrough notes for setup, testing, deployment, and a representative audit/command workflow.
- List of stale, contradictory, missing, or undiscoverable docs with file references.
- Feature JSON remediation files for confirmed Critical/High/Medium findings.

## Success Criteria

The audit is successful when it can confirm:

- A new engineer can set up and run the project using the documentation alone (no tribal knowledge required)
- Deployment steps are documented and verified end-to-end against actual infrastructure
- No contradictions exist between the docs and live config, commands, or behavior
- The canonical `docs/template/` set and `.aidd/` project artifacts are present, current, and discoverable
- Test/CI documentation matches the real stack (`bun run crawltest`, `bun run smoke:qc`) with no references to unused unit-test frameworks

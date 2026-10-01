---
title: 'Documentation Quality and Coverage Audit'
last_updated: '2026-10-01'
version: '1.4'
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

### Identify the Target Kind First

This audit runs against Spernakit-derived web apps, CLIs, static sites and aidd itself. Before
applying any stack-specific requirement, establish what the target is from its own files (package
scripts, directory layout, `.aidd/project-profile.json`), not from this document:

- **Spernakit target** (the template or an app derived from it): the Spernakit-specific commands,
  config schema, OpenAPI and `docs/template/` requirements below apply.
- **Any other target**: use the target's own package scripts and its documented interface (CLI
  `--help`, public API, published site). The Spernakit-specific requirements do not apply. Record
  each one as not applicable, with the evidence that shows the target kind, instead of reporting it
  as missing documentation.

### Required Tools

- Markdown linter or viewer for reviewing doc formatting
- The target's own verification scripts, read from its `package.json` (or equivalent)
- Spernakit targets only: access to the application running in dev mode (for OpenAPI spec
  verification), and `bun run config:validate` output

`config:validate` checks the config JSON files (defaults, example, and the live instance) against
the config schema, plus security checks on the instance. It does not read documentation. Treat a
green result as supporting evidence that the shipped config examples are schema-valid, nothing
more. Compare the documented keys, defaults and precedence against the config loader and schema
separately. A green config gate is never proof that the prose is correct.

### Verification Commands

```bash
# Check for stale docs by comparing last-modified dates (any target)
git log --format='%ai %s' -- docs/ README.md CHANGELOG.md | head -20

# Spernakit targets only: check the OpenAPI spec is accessible. The endpoint is mounted in
# dev mode only and returns 404 in built/preview/production instances. Resolve the backend
# port from the target (server.backendPort in its config, or its entry in the fleet manifest
# spernakit.psd1). Do not assume 3331: that is the template's own port, and each derived app
# owns a different one.
curl -s http://localhost:<backendPort>/api/v1/docs/json | head -c 200

# Spernakit targets only: verify the generated config schema exists
ls config/config-schema.json
```

## Scope

- Top-level project docs: `README.md`, `CONTRIBUTING.md`, `docs/**`
- Project-specific documentation (guides, frameworks, rules)
- API and integration docs (OpenAPI/Swagger, narrative API docs)
- Instructions users follow outside `docs/`: CLI `--help` output, and skill or agent instruction
  files the project ships
- Code comments and internal docs tied to critical flows

### Spernakit Documentation Assets

For a verified Spernakit target only, check these template documentation files. Locate the set from
the target's actual layout before declaring anything missing: the template and derived apps carry it
at `docs/template/`, and aidd may stage referenced copies under `.aidd/docs/`. A file found in
either place is present.

- `docs/template/STACK.md`: Technical stack and architecture reference (canonical)
- `docs/template/DEVELOPMENT.md`: Development best practices and coding conventions (canonical)
- `docs/template/GETTING_STARTED.md`: New-developer setup walkthrough
- `docs/template/API_REFERENCE.md` / `docs/template/API_STANDARD.md`: API documentation and conventions
- `docs/template/CONFIGURATION.md`: Configuration documentation
- `docs/template/TESTING.md`: Test strategy (crawltest / `smoke:qc`; Spernakit deliberately has no vitest/jest/@testing-library)
- `docs/template/TROUBLESHOOTING.md` / `docs/template/KNOWN_ISSUES.md`: Operational gotchas and tracked gaps
- `docs/template/DEPLOYMENT.md`: Deployment and Docker configuration
- `docs/template/CHANGELOG.md`: Version history
- `docs/template/adr/`: Canonical home for architecture decision records (ADR-style)
- `docs/template/architecture/`: System/backend/frontend/database/deployment architecture docs
- `config/config-schema.json`: Generated JSON Schema for config intellisense
- OpenAPI spec at `/api/v1/docs/json`: API contract documentation (dev mode only)

### .aidd Project Artifacts

For aidd-managed projects, the `.aidd/` documentation set is a first-class documentation asset.
The authority for which artifacts exist and how strongly each is expected is the artifact catalog
in the aidd repository, `docs/reference/artifacts.md`. It classes each artifact as `required`,
`recommended`, `optional`, `tracked`, `generated`, `runtime` or `secret`. The list below is the
subset this audit reads for accuracy; it is not the complete required set.

- `CONTEXT.md` (repository root, required): Domain vocabulary and entity relationships
- `.aidd/spec.md` (required): Product/feature specification
- `.aidd/project-structure.md` (recommended): Directory and module layout reference
- `.aidd/assertions.md` (recommended): Behavioral assertions / acceptance criteria
- `.aidd/screen-map.md` (recommended): Screen/route inventory and navigation map
- `.aidd/testing-scenarios.md` (recommended): End-to-end testing scenarios
- `.aidd/roadmap.json` (recommended): Feature roadmap and backlog
- `.aidd/project.md` (recommended): Project-specific metadata and context
- `.aidd/project-profile.json` (recommended): Inferred project profile; check it still describes the project
- `.aidd/deployment.md` (tracked): Deployment target and procedure; check it against the real deploy configuration

Apply the catalog's classes when judging absence:

- A missing `required` artifact is a finding once the project is in the coding phase. A missing
  `recommended` artifact is a lower-severity gap. A missing `optional` or `tracked` artifact is not
  a finding by itself; audit it for accuracy only when it is present.
- Do not require `generated`, `runtime` or `secret` artifacts, and do not read secret files.
- `.aidd/features/*/feature.json` records belong to the feature-review workflow. Report a feature
  record here only when a document under audit contradicts it; do not re-review the records.

## Methodology

### 1. Inventory key documentation assets

- List all major doc entry points (root README, docs site, project guides)
- Include what users actually follow: CLI `--help` output and shipped skill or agent instruction
  files count as documentation when the project has them
- For aidd-managed projects, include the `.aidd/` artifacts above, using the artifact catalog for
  the expected set
- Identify ownership and last-updated dates
- Record which documents were read in full, which were sampled, and which were not reviewed

### 2. Task-based walkthroughs

For each critical flow, check whether it can be completed using only the docs:

- New developer setup
- Running tests and linting
- Performing a deployment
- Running a representative audit/command workflow

Trace every flow first: read the instructions step by step against the scripts, config and code
they name. Execute a step only when it is authorized and safe:

- Run only commands that are read-only or confined to a disposable or explicitly approved
  environment.
- Never deploy, publish, reset or delete data, or change shared services to test instructions.
  Deployment, release and data-reset instructions are verified by tracing them against the real
  deploy configuration and scripts, not by running them.
- Missing permission to execute is not a documentation defect. Record the flow as traced only.

For each flow record whether it was traced, executed, blocked, or not applicable, and where:

- Steps are missing or ambiguous
- Docs contradict actual behavior/config
- Important caveats are undocumented

### 3. Quality assessment

Before testing accuracy, classify each document or passage as current reference or dated history.
Only a claim presented as current must match today's code. Dated material (changelog entries,
dated posts, diary entries, migration notes) is checked against the period it states; an old entry
that was true when written is not a finding.

Evaluate docs for:

- **Accuracy**: current reference prose matches current code and infrastructure
- **Completeness**: covers all required steps and edge cases
- **Clarity**: clear, concise, and logically structured
- **Audience fit**: appropriate detail for target reader (dev, operator, user)

Review style by purpose, not by uniformity. Preserve prose that works: the author's voice, stated
uncertainty, quotations and necessary technical detail. Do not recommend a rewrite solely to make
documents sound alike, and do not apply a detector score or a stylistic quota. A release note, a
reference page and a personal post may legitimately differ in length, structure and tone.

### 4. Comment and inline documentation review

Sample representative modules and review:

- Public APIs: JSDoc/TSDoc present and accurate
- Complex logic: comments explain reasoning and trade-offs
- TODO/FIXME: owned, scoped, and not stale
- No misleading or obsolete comments

## Audit Checklist

### Critical Checks

- [ ] New engineer can set up the project using docs alone
- [ ] Deployment steps are fully documented and accurate (verified by tracing against the deploy configuration and scripts; never by deploying)
- [ ] Security- and data-sensitive flows have clear documentation

### High Priority Checks

- [ ] Public/external-facing APIs have reference documentation (for Spernakit apps the dev-mode OpenAPI spec at `/api/v1/docs/json` satisfies this; hand-written exhaustive reference docs are NOT required for internal single-team tools)
- [ ] Key architecture decisions are documented (ADR-style, e.g. `docs/template/adr/`)
- [ ] Major commands and audits have clear usage docs and entry points
- [ ] Test/CI documentation references the test commands the target really has, read from its package scripts, and does not document a test framework the target does not use. Spernakit targets: `bun run crawltest` and `bun run smoke:qc`, with no vitest/jest/@testing-library (cross-reference `docs/template/TESTING.md`). Targets that do run unit tests, such as aidd with `bun:test`, must document them

### Medium Priority Checks

- [ ] Comments and inline documentation meet CODE_QUALITY standards
- [ ] Known gaps and outdated docs are tracked as issues/tasks
- [ ] Claims presented as current match today's code; dated history is judged against its stated period
- [ ] Style and tone fit each document's purpose and audience; effective prose and author voice are preserved, not flattened for consistency

### Low Priority Checks

- [ ] Documentation formatting follows conventions
- [ ] Cross-references and links are maintained
- [ ] Version history and changelog maintained

## Report Template

This audit defines no scoring rubric, so it does not produce a numeric score. Write the score as
`N/A` and let the severity counts and the findings carry the result. Do not derive a number from
checklist ticks or from a green gate.

The report must also carry the sections [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) requires:
the instrument validation table, the methodology validity summary and the falsification records.
Every "not applicable" disposition, including each Spernakit-specific requirement set aside for a
non-Spernakit target, needs a falsification record.

```markdown
# Documentation Audit Report - YYYY-MM-DD

## Executive Summary

**Overall Score**: N/A (this audit defines no scoring rubric)
**Critical Gaps**: [Number]
**High Priority Gaps**: [Number]
**Medium Priority Gaps**: [Number]
**Low Priority Gaps**: [Number]

## Scope and Coverage

- **Target kind**: [Spernakit template / Spernakit-derived app / CLI / static site / other, with the evidence]
- **Reviewed revision**: [commit hash, and whether the working tree was clean]
- **Documents read in full**: [list]
- **Documents sampled**: [list, with what was sampled]
- **Not reviewed**: [list, with reason]

| Workflow                  | Traced | Executed | Outcome                                     |
| ------------------------- | ------ | -------- | ------------------------------------------- |
| New developer setup       | [y/n]  | [y/n]    | [verified / defect / blocked / N/A and why] |
| Tests and linting         | [y/n]  | [y/n]    | [verified / defect / blocked / N/A and why] |
| Deployment                | [y/n]  | no       | [traced only; never executed by this audit] |
| Representative audit/task | [y/n]  | [y/n]    | [verified / defect / blocked / N/A and why] |

## Instrument Validation (Phase 0)

[Table and summary from AUDIT_METHODOLOGY.md, one row per script, artifact or probe relied on]

## Methodology Validity

[Summary and falsification records from AUDIT_METHODOLOGY.md]

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
- Documentation inventory covering root docs, `docs/**`, API references, CLI help and shipped skill or agent instructions where the target has them, and `.aidd/` artifacts; for Spernakit targets also the OpenAPI spec and config schema. State what was read in full, sampled, or not reviewed.
- Task-walkthrough notes for setup, testing, deployment, and a representative audit/command workflow, each marked traced, executed, blocked, or not applicable.
- List of stale, contradictory, missing, or undiscoverable docs with file references.
- The instrument validation table, methodology validity summary and falsification records required by [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md).
- Feature JSON remediation files for confirmed Critical/High/Medium findings.

## Success Criteria

The audit succeeds when its report is supported by evidence, whether or not the target has
defects. An audit that finds serious gaps and documents them well has succeeded. The report must:

- State the target kind, the reviewed revision, and which documents were read in full, sampled, or not reviewed
- Say, for setup and for running the project, whether a new engineer could follow the documentation alone, and name each step where they could not
- Trace deployment instructions against the actual deploy configuration and scripts, without deploying, and record any workflow that could not be verified
- Limit its conclusion about contradictions to the claims inspected: list each contradiction found between the docs and live config, commands or behavior, and do not assert that none exist beyond the reviewed scope
- Report the template documentation set (Spernakit targets) and the `.aidd/` project artifacts (aidd-managed projects) as present, current and discoverable, or file the gaps
- Check test/CI documentation against the commands the target really has (Spernakit targets: `bun run crawltest`, `bun run smoke:qc`, no unit-test framework)
- Carry no numeric score, and satisfy the methodology gate

---
name: bug2feature
description: 'Retrieve bug and feature reports from whatever intake a project uses, verify them against the codebase, and create correctly classified feature.json entries. Use when converting submitted reports into an actionable aidd backlog.'
metadata:
    aidd-category: audit-remediation
    spernakit-references: docs/template/STACK.md
---

# Bug and Feature Request Triage

Convert actionable reports from a project's bug intake into precise `.aidd/features/` entries.

## Applicability

**Applies to every aidd-managed project**, whatever its stack. Reports reach a project through
different channels: an in-app report API, an issue tracker, a testing run's findings, or a list
the user supplies directly. The triage work downstream of retrieval is identical in every case,
so the intake is a parameter, not a precondition. A project without an in-app report API is
normal and fully in scope.

The one genuine precondition is that reports exist and can be read. If no intake yields any
report, say so and stop; that, not the absence of a particular API, is the reason to decline.

## Inputs

- Resolve the target application and, when supplied, the report IDs to process.
- Determine the intake, and the access it needs, before retrieval (Phase 1). Some intakes require
  a running application and an authenticated session; others are a file or a tracker query.
- Load the application's specification, roadmap, feature catalog, and relevant source code.
- Preserve the original submission identifiers and evidence.

## Workflow

1. Read [the complete triage workflow](references/TRIAGE-WORKFLOW.md) before classifying or
   writing anything.
2. Investigate each submission against the current codebase.
3. Classify it as a bug, feature request, duplicate, resolved item, or non-actionable item.
4. Present the triage report, then create every actionable feature file directly.
5. Create only actionable entries, using `remediation-*` for bugs and clean feature slugs for
   feature requests.
6. Assign roadmap metadata and run the required feature validation.

## Output

Report classifications, created files, skipped submissions, roadmap assignments, and validation
evidence.

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
5. Create only actionable entries, using clean feature slugs for feature requests and, for bugs,
   the `remediation-*` naming **only when the target is the Spernakit template itself**. A bug filed
   against a derived application takes a clean descriptive slug like any other feature, and records
   its origin in `title` and `notes` rather than in the id.

    `remediation-<YYYYMMDD>-<slug>` and `audit-<slug>-<digits>-<slug>` name ephemeral process
    records: findings from the template's own development, whose content reaches applications by
    being folded into a durable feature, after which the finding is deleted upstream. An app-owned
    finding has no such lifecycle. Nothing folds it anywhere and nothing deletes it, so it is a
    durable feature in that app's own corpus from the moment it is written.

    This is enforced, not advisory. `scripts/lib/template-features/resident.ts` in every derived app
    audits resident records before any version comparison and fails
    `check:template-features` on any directory matching those patterns, classifying it as a leaked
    template process record at every template version, with no exemption for app ownership. The
    failure short-circuits that app's entire feature-record sync, so one badly named record hides
    every other drift in the app until it is renamed.

6. Assign roadmap metadata and run the required feature validation.

## Output

Report classifications, created files, skipped submissions, roadmap assignments, and validation
evidence.

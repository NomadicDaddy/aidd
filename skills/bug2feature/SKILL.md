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

## Usage

```
bug2feature [app] [--report-ids <id,...>]
```

- Zero args → infer the app from the current repository and process the available untriaged reports.
- `[app]` → application name or path.
- `--report-ids` → comma-separated intake identifiers. If omitted, process the applicable
  available reports from the resolved intake.

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
5. Create only actionable entries, using clean feature slugs for feature requests and the
   `remediation-<YYYYMMDD>-<slug>` naming for bugs, **in any repository** — a derived application
   included. Ownership goes in `title` and `notes`, never in the id.

    The prefix marks a kind, not an owner. `remediation-<YYYYMMDD>-<slug>` and
    `audit-<slug>-<digits>-<slug>` name non-standalone process records: findings that remediate
    something already built, as against a feature request describing a capability that does not yet
    exist. A bug is a finding wherever it was filed, so `kind: 'bug'` takes the prefix and
    `kind: 'feature'` takes a clean slug, and neither answer turns on who owns the target.

    Filing that way in a Spernakit-derived app is safe, and has been since 2026-08-26.
    `scripts/lib/template-features/resident.ts` judges a resident process record by provenance
    rather than by name: the name pattern selects only which records it examines, and it fails one
    when the template corpus carries the same directory or the app's own copy carries
    `spernakit_version` — either of which means the record arrived from upstream. Its own header
    says an application "is entitled to author its own `remediation-<date>-…` finding: aidd's
    pipelines mint that name," and its failure output says "A finding this application authored
    itself is not reported here, whatever it is named." What still short-circuits an app's entire
    feature-record sync is a resident record carrying `spernakit_version`, whatever it is called —
    that one came from the template and belongs upstream, so never write that field here.

    An app-owned finding has no upstream lifecycle: nothing folds it into a durable feature and
    nothing deletes it. That is a reason to run `promote-remediation` on it once the work proves to
    be standalone, not a reason to name it as though it already were.

6. Assign roadmap metadata and run the required feature validation.

## Output

Report classifications, created files, skipped submissions, roadmap assignments, and validation
evidence.

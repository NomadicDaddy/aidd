---
name: bug2feature
description: 'Retrieve authenticated bug and feature reports from a Spernakit app, verify them against the codebase, and create correctly classified feature.json entries. Use when converting submitted app reports into an actionable aidd backlog.'
metadata:
    aidd-category: audit-remediation
    spernakit-references: docs/template/STACK.md
---

# Bug and Feature Request Triage

Convert actionable reports from the authenticated Spernakit bug-report API into precise
`.aidd/features/` entries.

## Inputs

- Resolve the target application and, when supplied, the report IDs to process.
- Require a running application and an authenticated ADMIN or SYSOP session for report retrieval.
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

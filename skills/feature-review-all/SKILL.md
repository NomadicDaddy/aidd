---
name: feature-review-all
description: 'Run the aidd-local feature-review sweep across selected applications with .aidd/features. Use when validating or repairing feature metadata across multiple application repositories.'
metadata:
    aidd-category: metadata
---

# Cross-App Feature Review Sweep

Run the aidd-local feature review sweep across selected applications that contain `.aidd/features`, using the repo-native `aidd-tools` wrapper and local sweep script.

## Usage

```
feature-review-all [--apps <app,...>] [--dry-run] [--report-only]
                   [--depth <mode>] [--fix-mode <mode>]
```

## Arguments

- `--apps <csv>` - Optional comma-separated subset of app names from `<applications-root>/AGENTS.md`
- `--dry-run` - Inventory and analyze only; do not modify feature files or write reports
- `--report-only` - Re-scan current state and regenerate reports without mutating feature files
- `--depth <mode>` - Review depth; default and current supported mode is `full-backlog-light-completed`
- `--fix-mode <mode>` - Fix policy; default and current supported mode is `aggressive`

## Workflow

1. Run the helper through aidd tools first:

    `bun run aidd-tools -- features:review-sweep [flags]`

2. Discover candidate apps from `<applications-root>/AGENTS.md`, then filter to roots that actually contain `.aidd/features`.

3. Exclude `.old` directories and apps with no `.aidd/features` tree.

4. For every targeted app, let the helper perform the mechanical pass:
    - inventory counts and baseline git status capture
    - invalid JSON detection and minimal repair
    - canonical schema normalization (`spec`, `affectedFiles`, `dependencies`)
    - legacy alias removal (`acceptance_criteria`, `file_locations`)
    - dependency remapping when a dependency is clearly a feature title instead of a feature id
    - per-app report generation in `{app}/.aidd/reports/feature-review-YYYY-MM-DD.md`
    - dirty-repo mutation guard so new changes stay inside `.aidd/features/*/feature.json` and `.aidd/reports/*`

5. For backlog features only, apply the existing `feature-review` skill heuristics on top of the helper output:
    - codebase alignment
    - vague or underspecified specs
    - duplication and overlap
    - cathedral risks
    - dependency integrity
    - cross-feature conflicts

6. Treat completed and verified features as compliance-only:
    - keep them on canonical schema
    - do not reopen them automatically
    - do not invent retroactive semantics or verification evidence
    - leave cross-feature feedback-loop steps in backlog specs intact; the implementing coding run amends the completed source feature's `spec`/`notes`, not this review (see `feature-review` fix rule 13)

7. After any deeper backlog edits, re-run the helper in `--report-only` mode so the aggregate and per-app reports reflect the final state.

8. Do not shell into the aidd installation to validate. aidd re-validates every feature record when the run ends and reports any contract issues with the run. That covers the project this run targets; for another project, report the metadata as unvalidated instead of reaching outside the workspace. This skill sweeps several apps, so name every app whose metadata you changed in the report output; aidd only validates the one this run targets.

## Current Expectations

- `dependencies` is required and must resolve
- Canonical schema is `spec` plus `affectedFiles`
- Legacy aliases must be migrated away
- Audit features should keep `auditSource`, `auditSeverity`, and `affectedFiles`
- `verificationEvidence` is a current standard for audit findings, but it must never be fabricated
- For backlog audit findings, only backfill `verificationEvidence` when the evidence is already concrete in the feature content
- For completed historical audit findings, report missing `verificationEvidence` but do not invent it

## Outputs

- Per-app report:
    - `{app}/.aidd/reports/feature-review-YYYY-MM-DD.md`
- Aggregate report:
    - `<aidd-root>/reports/feature-review-all-YYYY-MM-DD.md`

## Completion Criteria

- Zero invalid JSON feature files in scope
- Zero uses of `acceptance_criteria`
- Zero uses of `file_locations`
- Zero mixed legacy/canonical schema files
- Zero orphan feature directories without `feature.json`
- Dependency validation passes or unresolved dependencies are reported with evidence
- Post-run diffs stay inside allowed paths

## Notes

- Default scope is every current app or queue in the applications index (`AGENTS.md`) with
  `.aidd/features`. If no index exists, discover candidates from the configured application and
  queue roots; do not depend on a provider-specific instruction filename.
- Dirty repositories are in scope; do not require a clean worktree gate
- The local `scripts/feature-review-sweep.ts` helper is the source of truth for inventory, normalization, and report generation
- The `feature-review` skill remains the source of truth for deeper backlog review judgment

---
name: feature-review-all
description: 'Run the aidd-local feature-review sweep across selected applications with .aidd/features. Use when validating or repairing feature metadata across multiple application repositories.'
metadata:
    aidd-category: metadata
    aidd-contracts: feature-review, prompt-guidelines
---

# Cross-App Feature Review Sweep

Run the aidd-local feature review sweep across selected applications that contain `.aidd/features`, using the repo-native `aidd-tools` wrapper and local sweep script.

## Usage

```
feature-review-all [--apps <app,...>] [--dry-run] [--report-only]
                   [--depth <mode>] [--fix-mode <mode>]
```

## Arguments

- `--apps <csv>` - Optional comma-separated subset of names parsed from the workspace
  applications index (`AGENTS.md`, with `CLAUDE.md` as the fallback filename)
- `--dry-run` - Inventory and analyze only; do not modify feature files or write reports
- `--report-only` - Re-scan current state and regenerate reports without mutating feature files
- `--depth <mode>` - Review depth; default and current supported mode is `full-backlog-light-completed`
- `--fix-mode <mode>` - Fix policy; default and current supported mode is `aggressive`

## Workflow

1. Run the helper through aidd tools first:

    `bun run aidd-tools -- features:review-sweep [flags]`

2. Let the helper read the first existing workspace index candidate (`AGENTS.md`, then
   `CLAUDE.md`). It discovers apps from Markdown table rows whose second column is an absolute
   `d:` location, then applies `--apps` when supplied.

3. Exclude `.old` directories and apps with no `.aidd/features` tree.

4. For every targeted app, let the helper perform the mechanical pass:
    - inventory counts and baseline git status capture
    - invalid JSON detection and minimal repair
    - canonical schema normalization (`spec`, `affectedFiles`, `dependencies`)
    - alias-field removal (`acceptance_criteria`, `file_locations` rewritten to the canonical fields)
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

8. In apply and `--report-only` modes, the helper invokes the local aidd CLI with
   `--check-features` once for every selected app and records PASS, FAIL, or skipped in each
   per-app report. `--dry-run` skips this validator. Do not duplicate the helper's validations;
   name every app whose metadata changed and report any validator failure or skip.

## Current Expectations

- `dependencies` is required and must resolve
- Canonical schema is `spec` plus `affectedFiles`
- Alias fields (`acceptance_criteria`, `file_locations`) must be rewritten to the canonical fields
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
- Zero files mixing alias and canonical schema fields
- Zero orphan feature directories without `feature.json`
- Dependency validation passes or unresolved dependencies are reported with evidence
- Post-run diffs stay inside allowed paths

## Notes

- Default scope is every parseable app in the first existing applications index candidate with a
  `.aidd/features` directory. The current helper requires that index table: it aborts when neither
  candidate exists or when no indexed app with features is discovered; it does not scan configured
  application or queue roots as a fallback.
- Dirty repositories are in scope; do not require a clean worktree gate
- The local `scripts/feature-review-sweep.ts` helper is the source of truth for inventory, normalization, and report generation
- The `feature-review` skill remains the source of truth for deeper backlog review judgment

---
name: update-roadmap
description: "Reconcile .aidd/roadmap.json with a local app's .aidd/features/ inventory using current aidd roadmap conventions. Use to refresh, rebuild, or reconcile a project roadmap against its actual features."
metadata:
    aidd-category: metadata
---

# Update Roadmap

Review a local app's `.aidd/features/` inventory and reconcile `.aidd/roadmap.json` to current aidd
roadmap conventions.

## Usage

```
update-roadmap <app-name-or-path>
update-roadmap <app-name-or-path> --dry-run
```

## Arguments

- `<app-name-or-path>` - Target app from `<applications-root>/AGENTS.md` or an explicit path containing `.aidd/features`.
- `--dry-run` - Report intended roadmap changes before writing.

## Workflow

1. Resolve the app locally and verify `.aidd/features/` exists. Stop for external, unmapped, or non-aidd targets.
2. Read every `.aidd/features/*/feature.json` and the existing `.aidd/roadmap.json`, if present.
3. Preserve existing milestones. Do not create a future milestone unless the user explicitly asks for one.
4. Treat the current milestone as the milestone with the highest numeric `priority` in `roadmap.milestones`. Assign newly discovered or unmapped features there.
5. Preserve explicit feature dependencies, but normalize them to existing feature IDs. Flag missing dependencies instead of inventing placeholders.
6. Keep completed historical features mapped to their existing milestone unless the current roadmap is demonstrably wrong.
7. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace.

8. Do not shell into the aidd installation to validate. aidd re-validates every feature record when the run ends and reports any contract issues with the run. That covers the project this run targets; for another project, report the metadata as unvalidated instead of reaching outside the workspace.

## Output

Report milestone counts, newly mapped features, and dependency warnings. aidd reports the roadmap-apply and feature-contract results itself with the run.

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
7. After writing `roadmap.json`, run from `<aidd-root>`:

    ```bash
    bun run aidd-tools -- roadmap:apply --project-dir <app-dir>
    ```

    Use `--dry-run` first when the roadmap diff is large.

8. If feature metadata changed, validate from `<aidd-root>`:

    ```bash
    bun run start -- --project-dir <app-dir> --check-features
    ```

## Output

Report milestone counts, newly mapped features, dependency warnings, the `roadmap:apply` updated/unchanged/error summary, and feature validation status.

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
update-roadmap <app> [--dry-run]
```

## Arguments

- `<app>` - Target app from `<applications-root>/AGENTS.md` or an explicit path containing `.aidd/features`.
- `--dry-run` - Report intended roadmap changes without writing them. When launching through aidd,
  use the review-only execution intent with this flag so run-end metadata reconciliation also
  withholds writes.

## Workflow

1. Resolve the app locally and verify `.aidd/features/` exists. Stop for external, unmapped, or
   non-aidd targets.
2. Read every `.aidd/features/*/feature.json` and the existing `.aidd/roadmap.json`, if present.
   Roadmap feature keys are feature directory names, even when a record's `id` differs.
3. If the roadmap is absent or has no milestones, create a single `v1.0` milestone at priority 1
   and map every feature directory to it. Carry non-empty feature dependencies into those entries,
   translating feature IDs to directory names where they differ.
4. Otherwise preserve the roadmap's milestone names, descriptions, lifecycle, and valid feature
   assignments. Order milestones by ascending numeric priority and normalize their priorities to a
   contiguous `1..N`; declaration order breaks ties and follows explicitly prioritized milestones.
   The current milestone is the first one in that order containing unfinished work, or the last
   existing milestone when all work is complete.
5. Remove roadmap feature entries whose directory no longer exists. Repair every unmapped or
   invalidly mapped feature into the last milestone in priority order. This clears the project-wide
   roadmap gate without silently expanding the current milestone's scope. Do not create another
   future milestone unless the user explicitly asks for one.
6. Preserve completed historical assignments by default. When a completed feature's parseable
   `shippedVersion` proves it belongs in an earlier version-bounded milestone, pull it back; never
   push completed work forward merely because its latest revision shipped later.
7. Preserve explicit roadmap dependencies. Roadmap dependencies name feature directories; when
   importing dependencies from `feature.json`, translate feature IDs to their directories. Move a
   dependent later when necessary so it never precedes its dependency. Flag dangling dependencies
   and cycles instead of inventing targets or guessing through an unorderable cycle.
8. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when
   the run ends: milestone priorities and resolved dependency IDs land in the feature records, and
   the `updated / unchanged / errors` summary is reported with the run. That covers the project
   this run targets; if you changed assignments in another project, report it as needing a separate
   pass instead of reaching outside the workspace.
9. Do not shell into the aidd installation to validate. aidd re-validates every feature record when
   the run ends and reports contract issues with the run. Re-read the roadmap and confirm every
   feature directory is mapped to a defined milestone and every roadmap key still exists. For
   another project, report the metadata as unvalidated instead of reaching outside the workspace.

## Output

Report milestone counts; removed, newly mapped, and moved features; dependency warnings; and any
unresolved placement issue. aidd reports the roadmap-apply and feature-contract results itself with
the run.

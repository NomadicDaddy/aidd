---
name: ui-playground-apply
description: 'Review, confirm, ingest, and apply UI changes from a provenance-backed *-ui-playground to its source site, excluding fixture-only code and preserving routes, data contracts, behavior, and accessibility. Use when designer changes are ready for production review or when checking what differs; after an approved site commit, chain ui-playground-sync to advance the source baseline and preserve any remaining playground work.'
metadata:
    aidd-category: runtime
    aidd-contracts: ui-playground-sync
---

# Apply UI Playground Changes

Review playground changes against recorded source provenance. Apply only a deliberately authorized
UI delta, validate the site, and synchronize the playground to the resulting site commit.

## Usage

```text
ui-playground-apply [site-or-playground-path]
ui-playground-apply [site-or-playground-path] --apply
ui-playground-apply [site-or-playground-path] --apply --no-commit
```

Run without `--apply` to produce a read-only review. End that invocation after reporting the exact
scope and the apply command. An invocation containing `--apply` authorizes the reviewed,
high-confidence UI changes and continues directly through validation. It also authorizes a scoped
site commit and chained playground synchronization unless `--no-commit` is present.

## Inputs

Accept either a source site or `*-ui-playground` path. Resolve the pair from the sibling naming
convention and `playground/source.json`. Report both paths, the recorded source commit, current site
commit, and copied paths before continuing.

Use the staged `ui-playground-sync` contract for provenance, port rules, and the final
site-to-playground reconciliation.

## Hard Invariants

- Perform the review without modifying either repository.
- Require both repositories to be Git repositories with clean worktrees. Do not use `git stash`.
- Require the recorded source commit to resolve in the recorded source repository.
- Treat fixture servers, playground configuration, launchers, tests, generated output, caches, and
  dependencies as playground-only. Never copy them to the site.
- Default the eligible apply scope to `frontend/`. Include another copied path only when the user
  explicitly approves it and it is required by the UI change.
- Preserve routes, API signatures, query keys, stores, permissions, data density, accessibility,
  responsive behavior, and existing features unless the user explicitly approves a functional
  change.
- Do not infer production readiness from a clean diff or passing playground tests.
- Treat only an invocation containing `--apply` as authorization to edit the site.
- Do not push. Do not commit in review mode or when `--no-commit` is present.

## Inspect the Relationship

Run the read-only helper:

```text
bun .aidd/skills/ui-playground-apply/scripts/review.ts <playground-path> [site-path]
```

When invoking from the canonical catalog, use
`skills/ui-playground-apply/scripts/review.ts`. The report separates:

- Playground changes relative to the recorded source commit
- Site changes since the recorded source commit
- Current differences between playground and site
- Dirty worktree state

If the current site commit differs from provenance, run `ui-playground-sync` first. Review only
after the playground has incorporated current site changes or after conflicts are resolved. This
prevents stale source changes from being mistaken for designer work.

## Review Workflow

1. Read applicable instructions and inspect the source routing, navigation, stores, hooks, API
   modules, design tokens, responsive layout, and quality gates.
2. Confirm provenance and clean status with the helper.
3. Produce unified diffs for every changed eligible file. Inspect surrounding source code; do not
   judge isolated hunks.
4. Classify each hunk:

| Classification                                         | Action                                     |
| ------------------------------------------------------ | ------------------------------------------ |
| Visual or interaction polish                           | Propose applying                           |
| Responsive or accessibility improvement                | Propose applying after verification        |
| Intentional source behavior required by the new layout | Propose with explicit rationale            |
| Route, API, store, permission, or persistence change   | Preserve source unless separately approved |
| Fixture or playground infrastructure                   | Exclude                                    |
| Generated, cached, dependency, or lockfile noise       | Exclude                                    |
| Unclear or conflicting                                 | Hold for user decision                     |

5. Trace affected components to their consumers. Verify loading, empty, error, permission, and
   mobile states even when the designer changed only the happy path.
6. Present an approval table with file, hunks, classification, production effect, and proposed
   action. List exclusions and unresolved decisions separately.
7. In review mode, report the exact apply scope, exclusions, unresolved decisions, and the command
   to invoke with `--apply`. End without editing either repository.

In apply mode, repeat the complete read-only review first. Apply every high-confidence proposed
hunk directly. Hold unclear or conflicting hunks and continue independent work; if held hunks make
the approved UI internally inconsistent, return non-success without editing.

## Apply Workflow

With `--apply`:

1. Recheck both statuses and source commits. Stop if either changed since review.
2. Apply only approved hunks to the site. Preserve unrelated changes and source-native imports,
   API wiring, types, routes, and state management.
3. Copy binary assets only when approved and license/provenance is known.
4. Never copy root playground files or anything under `fixtures/`, `playground/`, playground
   `scripts/`, or playground-only `test/`.
5. Review the complete site diff and confirm it contains only approved files and effects.
6. Run focused tests, then the site's complete native quality gate. Fix integration failures
   file-by-file; do not relax or bypass checks.
7. Crawl every affected route at desktop and mobile sizes. Fail on page errors, console errors,
   unexpected API failures, accessibility regressions, or non-production network dependencies.

If validation fails, keep the site changes visible for remediation and do not advance playground
provenance.

## Commit and Bidirectional Reconciliation

Unless `--no-commit` is present:

1. Stage only approved site files and show the staged diff summary.
2. Commit without pushing.
3. Invoke `ui-playground-sync` in update mode against the new site commit.
4. Let sync compare recorded source, current playground, and new site:
    - When the applied site tree already matches the playground, advance provenance without
      replaying the UI patch.
    - When site formatting or integration fixes differ, merge them back into the playground.
    - Preserve unapproved designer changes relative to the new source baseline.
    - Stop on conflicts.
5. Run the playground's complete quality gate.
6. Commit the playground synchronization. Create a baseline tag only when its copied paths exactly
   match the new source.

With `--no-commit`, do not fabricate a source commit or update provenance. Report that
bidirectional synchronization is deferred until the site changes are committed.

## Final Verification

Confirm:

- Site diff contains no playground-only code
- Every affected route and interaction remains wired
- Site native quality gate passes
- Site commit contains only approved changes, when authorized
- Playground provenance points to that exact site commit, when synchronized
- Remaining playground delta contains only unapplied designer work
- Final Git status of both repositories is reported accurately

## Output

Report:

- Provenance and pre-apply source drift
- Reviewed, approved, excluded, and unresolved hunks
- Site files changed
- Behavior and accessibility preserved
- Validation commands and results
- Site commit, if authorized
- Chained synchronization result and remaining designer delta
- Final status of both repositories

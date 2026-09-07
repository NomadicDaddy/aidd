---
name: spernakit-justify-diffs
description: 'Compare Spernakit template files with derived-app copies, classifying differences as branding, app requirements, or unjustified drift. Use to explain, audit, or reconcile template-to-app divergence.'
metadata:
    aidd-category: spernakit-fleet
---

# Justify Diffs

Classify every difference between selected Spernakit template files and their derived-application
counterparts.

## Usage

```
spernakit-justify-diffs <app> [file-pair...]
```

- `<app>` → derived application name or path.
- `[file-pair...]` → one or more canonical/derived file pairs. If omitted, use the selected
  template-managed worklist supplied by the invoking workflow.

## Inputs

- Resolve the Spernakit repository, the derived application, and its declared
  `spernakit_version` from `package.json`.
- Load the derived application's specification and domain constraints, its staged template
  references under `.aidd/docs/template/`, and `.templateoverrides` when present.
- Run `bun run check:drift` in the derived application. Use its dynamically discovered results as
  the authoritative template-managed worklist and honor an explicit file-pair scope.

## Workflow

1. Start from the drift checker's `pure`, `branded`, `infrastructure`,
   `security-infrastructure`, and suppressed results. Treat branding normalization and an override
   reason as evidence, not proof that a behavioral difference is justified.
2. Produce a unified diff for every differing canonical/derived pair and inspect every hunk. For a
   suppressed path, also inspect what the override withholds; use `bun run check:override-deltas --
--target-version <version>` when reviewing an upgrade target.
3. Classify each hunk as one of:
    - **Branding** — expected application name, slug, port, cookie, path, or package-name changes.
    - **App-specific requirement** — behavior or configuration required by the derived app's
      documented domain.
    - **Backport candidate** — a reusable improvement with a current Spernakit consumer.
    - **Unjustified drift** — a difference with no branding, domain, or reusable-improvement basis.
    - **Unresolved** — ownership or behavior cannot be established confidently.
4. Recommend the direction from the classification: preserve branding and app requirements;
   backport reusable improvements to Spernakit before adopting them in the app; restore
   unjustified app drift from Spernakit; preserve unresolved hunks pending stronger evidence.
5. Reconcile high-confidence unjustified drift in the derived application. Do not apply backport
   candidates as part of this classification skill; hand focused backports to
   `spernakit-diff-sync` and whole-application work to `spernakit-template-refactor`. aidd decides
   whether this run may write — a review-only run forbids edits and turns reconciliation into a
   recommendation.

## Validation

Verify every justification against current application behavior, documented requirements, and the
drift checker's classification. Re-run `bun run check:drift` and the affected repository's
relevant validation gates after applying a reconciliation; do not claim an override or a green
drift result proves the application behavior is correct.

## Output

Report each file and hunk with its drift category, classification, evidence, recommended direction,
and any required follow-up. Distinguish applied reconciliations, preserved intentional differences,
backport candidates, and unresolved hunks, and state explicitly when no discrepancies remain.

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

- Resolve the canonical Spernakit file and each derived counterpart.
- Load the derived application's specification, domain constraints, and template overrides.

## Workflow

1. Compare each file byte for byte and inspect every differing hunk.
2. Classify justified differences as branding or app-specific requirements that do not warrant a
   template backport.
3. Classify reusable improvements as backport candidates.
4. Classify all remaining differences as unjustified drift.
5. Reconcile the differences you classified as unjustified drift, in the direction step 4 named.
   aidd decides whether this run may write — a review-only run forbids edits outright, turning this
   step into recommending the reconciliation.

## Validation

Verify every justification against current application behavior and documented requirements.

## Output

Report each file and hunk with its classification, evidence, recommended direction, and any
required follow-up.

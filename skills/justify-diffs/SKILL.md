---
name: justify-diffs
description: 'Compare Spernakit template files with derived-app copies, classifying differences as branding, app requirements, or unjustified drift. Use to explain, audit, or reconcile template-to-app divergence.'
metadata:
    aidd-category: spernakit-fleet
---

# Justify Diffs

Classify every difference between selected Spernakit template files and their derived-application
counterparts.

## Inputs

- Resolve the canonical Spernakit file and each derived counterpart.
- Load the derived application's specification, domain constraints, and template overrides.

## Workflow

1. Compare each file byte for byte and inspect every differing hunk.
2. Classify justified differences as branding or app-specific requirements that do not warrant a
   template backport.
3. Classify reusable improvements as backport candidates.
4. Classify all remaining differences as unjustified drift.
5. Keep the review read-only unless the user requests reconciliation.

## Validation

Verify every justification against current application behavior and documented requirements.

## Output

Report each file and hunk with its classification, evidence, recommended direction, and any
required follow-up.

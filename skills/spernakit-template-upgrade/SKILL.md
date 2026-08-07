---
name: spernakit-template-upgrade
description: 'Upgrade a derived application to a target Spernakit template version by applying the template delta while preserving domain-specific code. Use to absorb template releases, dependency changes, removals, and breaking changes.'
metadata:
    aidd-category: spernakit-fleet
    spernakit-references: docs/template/STACK.md, docs/template/DEVELOPMENT.md
---

# Template Upgrade

Upgrade a derived application to a target Spernakit version while preserving domain-specific
behavior and intentional template overrides.

## Usage

```
spernakit-template-upgrade <app> --to <target-version>
```

- `<app>` → derived application name or path.
- `<target-version>` → Spernakit tag or version to adopt. Resolve the current version from the
  derived application's `package.json`.

## Inputs

- Resolve the derived application, current template version, and target template version.
- Confirm both repositories are available and inspect their working-tree state.
- Load `.templateoverrides`, the template manifest, and the relevant changelog range.

## Workflow

1. Read [the complete upgrade workflow](references/UPGRADE-WORKFLOW.md) before changing files.
2. Compute the template delta and present an ordered upgrade plan.
3. Apply dependency, addition, removal, update, schema, and feature changes in the documented
   order.
4. Preserve domain code and honor explicit overrides; do not add compatibility layers.
5. Update the template version and run the full verification sequence.

## Output

Report applied changes, preserved overrides, domain decisions, backport candidates, and complete
validation evidence.

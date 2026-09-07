---
name: spernakit-template-upgrade
description: 'Upgrade a derived application to a target Spernakit template version by applying the template delta while preserving domain-specific code. Use to absorb template releases, dependency changes, removals, and breaking changes.'
metadata:
    aidd-category: spernakit-fleet
    spernakit-references: docs/template/STACK.md, docs/template/DEVELOPMENT.md, docs/template/CHANGELOG.md
---

# Template Upgrade

Upgrade a derived application to a target Spernakit version while preserving domain-specific
behavior and intentional template overrides.

## Usage

```
spernakit-template-upgrade <app> [--to <target-version>]
```

- `<app>` → derived application name or path.
- `<target-version>` → optional Spernakit tag or version to adopt. When omitted, use the current
  Spernakit checkout version.

## Inputs

- Resolve the derived application and its source template version from `package.json`; when the
  field is absent, infer a unique matching tag or stop instead of guessing.
- Confirm the source and target tags exist, the source is v3.29.0 or later, and a Spernakit checkout
  at the target version carries its matching live `.aidd/` feature corpus. Inspect the working-tree
  state of every repository.
- Load `.templateoverrides`, the target template manifest and docs, and the relevant changelog
  range. Establish drift, override, and protected-file baselines before changing files.

## Workflow

1. Read [the complete upgrade workflow](references/UPGRADE-WORKFLOW.md) before changing files.
2. Generate and review the read-only sync packet, compute the release delta, and present an ordered
   upgrade plan.
3. Sync the target manifest, then apply dependency, addition, removal, update, schema, and feature
   changes in the documented order.
4. Preserve domain code and honor explicit overrides; do not add compatibility layers.
5. Update the template version and run the full verification sequence.

## Output

Report applied changes, preserved overrides, domain decisions, backport candidates, and complete
validation evidence.

---
name: check-settings
description: "Compare an application's settings UI with its runtime configuration store. Use for settings or config audits, missing-setting checks, or read-only and exposure reconciliation."
metadata:
    aidd-category: audit-remediation
---

# Check Settings

Compare an application's settings UI with its runtime configuration sources.

## Usage

```
check-settings [app]
```

- Zero args → use the current repository.
- `[app]` → application name or path.

## Inputs

- Resolve the target application and every settings route or component.
- Identify configuration files, environment-backed settings, persistent stores, schemas, and
  backend read and write endpoints.

## Workflow

1. Inventory each setting from source through storage, API, and UI.
2. Classify whether it may be hidden, visible read-only, or safely editable at runtime.
3. Identify missing UI coverage, unauthorized write paths, mismatched defaults, and stale labels.
4. Trace every proposed editable setting end to end before recommending it.
5. Apply the remediation each finding calls for, tracing it end to end as step 4 requires before
   you make it. aidd decides whether this run may write — a review-only run forbids edits outright,
   turning this step into reporting the remediation.

## Validation

Cross-check each finding against the live schema, backend authorization, persistence behavior,
and frontend caller.

## Output

Report the setting, source of truth, current exposure, recommended exposure, evidence, and any
required remediation.

---
name: check-settings
description: "Compare an application's settings UI with its runtime configuration sources and persistence. Use for settings or config audits, missing-setting checks, or read-only and exposure reconciliation."
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
- Identify configuration precedence, default resolution, API DTOs, authorization, and the runtime
  consumers that receive saved values.

## Workflow

1. Inventory each setting from its raw source through persisted storage, effective-value
   resolution, API, UI, and runtime consumer. Mark stages that the application does not have.
2. Record precedence, defaults, validation, normalization, storage ownership, and every name or
   shape transformation between those stages.
3. Classify each setting as hidden, visible read-only, write-only secret, safely editable with live
   application, or editable but restart-bound. Do not expose stored secret values merely to make
   them editable.
4. Identify missing UI coverage, unauthorized write paths, unsafe secret exposure, mismatched
   defaults, stale labels, destructive full-object writes, and misleading activation behavior.
5. Trace every proposed editable setting end to end, including authorization, clear-versus-omit
   semantics, preservation of unexposed fields, and the consumer that applies it.
6. Apply the remediation each finding calls for, tracing it end to end as step 5 requires before
   you make it. aidd decides whether this run may write — a review-only run forbids edits outright,
   turning this step into reporting the remediation.

## Validation

Cross-check each finding against the live schema, precedence and default resolution, backend
authorization, persistence behavior, API contract, frontend caller, and runtime consumer. Use
focused tests with fixtures or temporary config paths to verify representative save, clear, and
reload behavior without changing the operator's real configuration. Confirm that saves preserve
unmanaged fields and stored secrets unless the UI explicitly clears them, and distinguish values
applied immediately from values that need a restart.

## Output

Report the setting, raw and effective sources of truth, transformations, current and recommended
exposure, activation timing, evidence, and any required remediation. State which files changed and
which focused validation ran.

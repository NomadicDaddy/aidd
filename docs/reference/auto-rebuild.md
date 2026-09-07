# Auto-Rebuild Guide

This guide describes the current rebuild loop for a project that already has or needs `.aidd/`
metadata. The workflow rebuilds from specs and features through the TypeScript runtime and current
validation gates.

## Prerequisites

- Bun dependencies installed in your aidd checkout.
- A target project directory.
- A clear project spec or existing codebase that aidd can onboard.
- A clean or intentionally scoped git worktree in the target project.

## New or Empty Project

For a new project, provide a spec file:

```powershell
bun run start -- --project-dir C:\path\to\new-app --spec C:\path\to\spec.md --max-iterations 1
```

aidd creates project metadata under `.aidd/`, copies scaffolding, and starts initializer work.

## Existing Project

For an existing project, run aidd against the directory:

```powershell
bun run start -- --project-dir C:\path\to\some-app --max-iterations 1
```

If required `.aidd/` metadata is incomplete, aidd runs onboarding before normal coding work.

## Feature Backlog

The rebuild backlog lives in:

```text
.aidd/features/<feature-id>/feature.json
```

Use clean feature IDs, accurate dependencies, and `status: "backlog"` with `passes: false` for
approved work. Use `waiting_approval` for work that needs a human decision before an agent should
touch it. The `id` must equal the directory name (audit findings included), or feature validation
fails.

Every feature directory must also be mapped to a milestone in `.aidd/roadmap.json`, whose
`features` and `dependencies` entries are keyed by directory name. Coding runs select only from the
first milestone that still has unfinished work; a feature with no roadmap entry, or one naming a
milestone the roadmap does not define, blocks coding until the mapping is fixed. A project with no
`roadmap.json` gets one synthesized on its first coding run (every feature mapped to `v1.0`,
dependencies preserved).

Validate the backlog:

```powershell
bun run start -- --project-dir C:\path\to\some-app --check-features
```

## Running Work

Common execution patterns:

```powershell
bun run start -- --project-dir C:\path\to\some-app --feature run-console
bun run start -- --project-dir C:\path\to\some-app --milestone v1.0
bun run start -- --project-dir C:\path\to\some-app --filter-by category --filter "Web"
bun run start -- --project-dir C:\path\to\some-app --validate
bun run start -- --project-dir C:\path\to\some-app --todo
```

`--feature` and `--filter-by` take a feature directory and a `feature.json` field respectively;
`--milestone` takes a key from `milestones` in `.aidd/roadmap.json`, and an unknown value fails
with the list of milestones the roadmap defines.

Use `--max-iterations N` when you want a bounded run. Use `--simulation` only for smoke and parser
tests where no real provider should be called.

## Auditing During Rebuild

Run audits after a meaningful slice exists:

```powershell
bun run start -- --project-dir C:\path\to\some-app --audit SECURITY
bun run start -- --project-dir C:\path\to\some-app --audit-all
```

Review audit findings before remediating large batches. After findings are fixed, consolidate them
back into base feature specs so rebuild instructions stay complete.

## Validation Gates

For the target project:

```powershell
bun run start -- --project-dir C:\path\to\some-app --check-features
bun run start -- --project-dir C:\path\to\some-app --check-artifacts
```

For changes to aidd itself:

```powershell
bun run smoke:qc
```

## Completion

A rebuild slice is complete when:

- selected features have `status: "completed"` and `passes: true`
- validation commands pass
- relevant manual or browser checks are recorded
- completed audit/remediation findings are consolidated into base features
- the final commit contains only the intended project changes

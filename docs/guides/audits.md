# Audit Guide

aidd audit mode runs a named audit definition against a project, writes a report, and can create
audit finding feature files for confirmed issues.

## Audit Definitions

Audit definitions live under `audits/`. Each file is prompt material for one audit family, such as
`SECURITY`, `DEAD_CODE`, `TECHDEBT`, `DOCUMENTATION`, or `FEATURE_INTEGRATION`.

Run a single audit:

```powershell
bun run start -- --project-dir C:\path\to\some-app --audit SECURITY
```

Run several named audits in one batched prompt:

```powershell
bun run start -- --project-dir C:\path\to\some-app --audit SECURITY,DEAD_CODE
```

Explicit `--audit` runs refresh the named audits even when matching reports already exist.

Run every non-reference audit definition that still needs a report:

```powershell
bun run start -- --project-dir C:\path\to\some-app --audit-all
```

## Outputs

Audit mode writes:

- `.aidd/audit-reports/<AUDIT>-YYYY-MM-DD.md`
- `.aidd/features/audit-<type>-<timestamp>-<slug>/feature.json` for findings
- `.aidd/CHANGELOG.md` entries when the agent records audit work
- normal iteration artifacts under `.aidd/iterations/`

For batched audits, the result marker uses `auditReports[]`. See
[parallel-multi-audit.md](../architecture/parallel-multi-audit.md) for the exact batch contract.

## Working Findings Off in Bulk

Coding-mode selection excludes category-Audit findings by default. `--audit-findings` is an
explicit opt-in sweep that lifts that exclusion for one run, so coding iterations pull approved
audit findings from the backlog (ordered by severity, then priority):

```powershell
bun run start -- --project-dir C:\path\to\some-app --audit-findings
```

An optional source operand narrows the sweep to findings whose `auditSource` matches one audit:

```powershell
bun run start -- --project-dir C:\path\to\some-app --audit-findings SECURITY
```

## Finding Contract

Audit finding feature files should include:

- `id` matching `audit-<type>-<timestamp>-<slug>`
- `auditSource` with the source audit name
- `auditSeverity` with a concrete severity
- `priority` derived from severity (`Critical` -> `1`, `High` -> `2`, `Medium` -> `3`, `Low` -> `4`)
- `title`, `description`, `category`, `spec`, `dependencies`, `status`, and `passes`
- `affectedFiles` when the finding is tied to specific files

An audit finding should stay actionable. The `spec` should describe the fix and include enough
evidence for another agent or engineer to verify the issue without rerunning the whole audit.

## Verification Gate

Audit mode requires current-code verification before creating a finding. Do not file stale,
historical, inferred, or speculative issues. Every finding description must include a `Verified:`
line that cites the confirming evidence, such as a file path with line number or a grep result.

Use the audit definition's severity guidance, then map severity to the numeric feature priority
(lower sorts earlier during selection):

| Severity | Feature priority |
| -------- | ---------------- |
| Critical | 1                |
| High     | 2                |
| Medium   | 3                |
| Low      | 4                |

When evidence is weak, rerun the relevant search or file read before filing. If the issue cannot be
verified in the current codebase, record it in the audit report narrative instead of creating a
feature file.

## Triage and Deduplication

Before creating a finding, audit mode should check existing features:

- Same `auditSource` and similar title usually means the issue is already tracked.
- `passes: false` means the issue is still open.
- `passes: true` means the issue was previously resolved; verify whether it regressed before
  creating a new finding.
- Template-owned issues in derived apps should be marked as upstream debt and consolidated in the
  template repo when appropriate.

## Follow-up Flow

Recommended sequence:

1. Run the audit.
2. Review generated findings for false positives if the audit produced a large batch.
3. Implement or schedule confirmed findings.
4. Run the `consolidate-features` skill after completed findings are fixed so their
   requirements are folded back into owning base feature specs.

## Verification

After audit metadata changes:

```powershell
bun run start -- --project-dir C:\path\to\some-app --check-features
```

For aidd repository changes, also run:

```powershell
bun run smoke:qc
```

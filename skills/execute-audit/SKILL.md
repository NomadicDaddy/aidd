---
name: execute-audit
description: 'Run a current aidd audit against a local project, preserving reports under .aidd/audit-reports/ and actionable findings as .aidd/features/audit-*. Use to run a named aidd audit against a project and capture its findings.'
metadata:
    aidd-category: audit-remediation
    aidd-references: audits/SEVERITY_CLASSIFICATION.md
---

# Execute Audit

Run an aidd audit against a local project through audit mode, preserving reports under
`.aidd/audit-reports/` and actionable findings as `.aidd/features/audit-*`.

## Usage

```
execute-audit <app-name-or-path> <AUDIT_NAME>
execute-audit <app-name-or-path> --audit-all
```

## Arguments

- `<app-name-or-path>` - Target app from `<applications-root>/AGENTS.md` or an explicit path containing `.aidd/`.
- `<AUDIT_NAME>` - Audit definition name from `<aidd-root>/audits/`, without `.md`.
- `--audit-all` - Run the applicable audit set through aidd's profile-aware audit selection.

## Workflow

1. Resolve the app to a local directory and verify `.aidd/` exists. Stop for external or unmapped targets.
2. Verify the requested audit exists under `<aidd-root>/audits/`. If no audit was supplied, run all
   applicable audits in filename order using the current audit-all flags.
3. Run from `<aidd-root>`:

    ```bash
    bun run start -- --project-dir <app-dir> --audit <AUDIT_NAME>
    ```

    For an applicable batch, use the current aidd audit-all flags rather than manually concatenating audit files.

4. Let aidd persist the report and findings. Do not hand-write `.aidd/audit-reports/`, `.aidd/features/`, or `.aidd/CHANGELOG.md` outside the aidd audit result contract.
5. After the run, inspect the summary and generated paths. Expected outputs are:
    - `.aidd/audit-reports/<AUDIT_NAME>-<timestamp>.md`;
    - zero or more `.aidd/features/audit-*` feature directories.
6. If new feature files were created, run:

    ```bash
    bun run start -- --project-dir <app-dir> --check-features
    ```

7. When a prior report of the same audit type exists, compare it against the new report before summarizing. Look under `.aidd/audit-reports/` first; also check the legacy location read-only as a fallback: `docs/audits/<AUDIT_NAME>_AUDIT_REPORT_*.md` (do not write new reports there). Treat findings present in both reports (matched by finding ID, affected file path, or clearly equivalent description) as regressions. Do not edit the generated report to record this; surface it in your completion summary.
8. Report the audit name, report path, finding count, validation result, any regressions, and any remaining audit(s). For a finding that has regressed across 2+ audit runs, flag it for severity escalation and recommend an automated prevention mechanism (lint rule, CI assertion, `smoke:qc` check, or targeted regression test).

## Notes

- Severity definitions live in `.aidd/audits/SEVERITY_CLASSIFICATION.md` (staged; or `<aidd-root>/audits/SEVERITY_CLASSIFICATION.md` in the aidd repo).
- Use `bun run aidd-tools -- audit:profile-mapping` when audit applicability mapping appears stale.
- Audit reports live exclusively at `.aidd/audit-reports/`.

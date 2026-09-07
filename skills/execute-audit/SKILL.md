---
name: execute-audit
description: 'Run current aidd audits against a local project, preserving reports under .aidd/audit-reports/ and actionable findings as .aidd/features/audit-*. Use to run named audits or the profile-applicable audit set and capture their findings.'
metadata:
    aidd-category: audit-remediation
    aidd-references: audits/SEVERITY_CLASSIFICATION.md
---

# Execute Audit

Run one or more aidd audits against a local project through audit mode, preserving reports under
`.aidd/audit-reports/` and actionable findings as `.aidd/features/audit-*`.

## Usage

```
execute-audit <app> <audit-name>[,<audit-name>...]
execute-audit <app> --audit-all
```

## Arguments

- `<app>` - Existing local project directory. A bare name resolves below aidd's configured
  `applicationsRoot`; a relative or absolute path resolves directly.
- `<audit-name>` - One audit definition name from `<aidd-root>/audits/`, without `.md`, or a
  comma-separated list of names.
- `--audit-all` - Run missing or stale audits from the profile-applicable set. aidd ranks that set
  by change potential; it does not run in filename order.

## Workflow

1. Resolve the app to an existing local directory. Do not require a pre-existing `.aidd/`: audit
   execution creates the metadata directories and stages the selected audit definitions.
2. Verify every explicitly requested audit exists and is runnable under `<aidd-root>/audits/`.
   For `--audit-all`, let aidd discover runnable definitions, apply the project profile and
   overrides, skip fresh reports, and rank the remaining audits.
3. Run from `<aidd-root>`:

    ```bash
    bun run start -- --project-dir <app-dir> --audit <AUDIT_NAME>[,<AUDIT_NAME>...]
    ```

    For the profile-selected set, run:

    ```bash
    bun run start -- --project-dir <app-dir> --audit-all
    ```

4. Let aidd parse `AIDD_RESULT` and persist accepted reports, findings, finding-ledger events, and
   any resulting roadmap assignments. Do not hand-write `.aidd/audit-reports/`,
   `.aidd/features/`, `.aidd/findings-ledger.jsonl`, `.aidd/roadmap.json`, or
   `.aidd/CHANGELOG.md` outside that contract.
5. After the run, inspect the summary and generated paths. Expected outputs are:
    - `.aidd/audit-reports/<AUDIT_NAME>-YYYY-MM-DD.md` for every accepted report (a second run of
      the same audit on the same day replaces that audit's report);
    - zero or more `.aidd/features/audit-*` feature directories;
    - `.aidd/findings-ledger.jsonl` events when the run reports findings;
    - an updated `.aidd/roadmap.json` when new findings are assigned into an existing roadmap.
6. If new feature files were created, read them back to confirm their IDs, content, and count.
   aidd validates the complete feature collection after each iteration and reports contract issues
   in the run; do not shell into the aidd installation to run `--check-features` again.

7. Review prior reports before launching. Audit mode automatically supplies up to three recent
   `.aidd/audit-reports/<AUDIT_NAME>-*.md` summaries to the auditor; also check
   `docs/audits/<AUDIT_NAME>_AUDIT_REPORT_*.md` read-only as a legacy fallback (do not write new
   reports there). This matters because a same-day run replaces the current dated report.
8. Classify repeated findings from aidd's persisted result:
    - an open fingerprint match is a pre-existing finding and is suppressed as a duplicate, not a
      regression;
    - a fingerprint previously remediated or otherwise resolved and then emitted again is a
      recurrence, recorded in `.aidd/findings-ledger.jsonl` and in the new feature's notes;
    - a finding previously dismissed as a false positive remains suppressed.
9. Report the audit names, report paths, total and newly created finding counts, validation result,
   suppressed duplicate/dismissal counts, recurrences, and remaining audits. For a confirmed
   recurrence, recommend an appropriate automated prevention mechanism such as a lint rule, CI
   assertion, `smoke:qc` check, or targeted regression test.

## Notes

- Severity definitions live in `.aidd/audits/SEVERITY_CLASSIFICATION.md` (staged; or `<aidd-root>/audits/SEVERITY_CLASSIFICATION.md` in the aidd repo).
- Use `bun run aidd-tools -- audit:profile-mapping` when audit applicability mapping appears stale.
- Audit reports live exclusively at `.aidd/audit-reports/`.

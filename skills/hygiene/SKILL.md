---
name: hygiene
description: 'Run the current aidd HYGIENE audit (canonical definition at <aidd-root>/audits/HYGIENE.md) against a project, following its phases, checklists, and report templates. Use for a code-hygiene audit, a cleanliness or dead-code sweep, or running HYGIENE on an app.'
metadata:
    aidd-category: audit-remediation
    aidd-contracts: execute-audit
    aidd-references: audits/HYGIENE.md, audits/SEVERITY_CLASSIFICATION.md
---

# Code Hygiene Audit

> **Canonical source**: [audits/HYGIENE.md](../../audits/HYGIENE.md).

Execute the HYGIENE audit as defined in `.aidd/audits/HYGIENE.md` (staged into this project; or `<aidd-root>/audits/HYGIENE.md` when running inside the aidd repo). Follow all phases, checklists, and report templates from the canonical audit definition.

## Usage

```
hygiene <app>
```

Resolve the target app locally, then run aidd audit mode from `<aidd-root>`:

```bash
bun run start -- --project-dir <app-dir> --audit HYGIENE
```

Return the report and verified findings through the audit mode `AIDD_RESULT` contract. Let aidd
persist the accepted report at `.aidd/audit-reports/HYGIENE-YYYY-MM-DD.md` and any findings under
`.aidd/features/audit-hygiene-*`; do not write those artifacts directly. Use the aidd-local
`execute-audit` skill's prior-report discovery rules when comparing results.

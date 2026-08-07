---
name: hygiene
description: 'Run the current aidd HYGIENE audit (canonical definition at <aidd-root>/audits/HYGIENE.md) against a project, following its phases, checklists, and report templates. Use for a code-hygiene audit, a cleanliness or dead-code sweep, or running HYGIENE on an app.'
metadata:
    aidd-category: audit-remediation
    aidd-references: audits/HYGIENE.md
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

Output belongs in `.aidd/audit-reports/HYGIENE-{timestamp}.md`; confirmed findings belong in
`.aidd/features/audit-*`. Use the aidd-local `execute-audit` skill's prior-report discovery rules
when comparing results.

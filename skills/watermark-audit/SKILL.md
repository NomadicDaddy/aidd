---
name: watermark-audit
description: 'Run the current aidd WATERMARK audit (canonical definition at <aidd-root>/audits/WATERMARK.md) against a project. Use when asked to check a repository for AI watermarks, steganography, hidden tracking, embedded metadata, covert telemetry, or AI-generation artifacts.'
metadata:
    aidd-category: audit-remediation
    aidd-contracts: execute-audit
    aidd-references: audits/WATERMARK.md, audits/AUDIT_METHODOLOGY.md, audits/SEVERITY_CLASSIFICATION.md
---

# Watermark, Steganography, and Covert Telemetry Audit

> **Canonical source**: [audits/WATERMARK.md](../../audits/WATERMARK.md).

Execute the WATERMARK audit as defined in `.aidd/audits/WATERMARK.md` (staged into the target
project; or `<aidd-root>/audits/WATERMARK.md` when running inside the aidd repo). Follow its
current posture, scope rules, validated-instrument requirements, checklists, severity rules, and
report contract. Treat the staged audit definition as authoritative instead of duplicating its
commands or classifications here.

## Usage

```
watermark-audit <app>
```

Resolve the target app locally, review the applicable prior WATERMARK reports, then run aidd audit
mode from `<aidd-root>`:

```bash
bun run start -- --project-dir <app-dir> --audit WATERMARK
```

Return the report and verified findings through the audit-mode `AIDD_RESULT` contract. Let aidd
persist the accepted report at `.aidd/audit-reports/WATERMARK-YYYY-MM-DD.md`, finding-ledger events,
and any findings under `.aidd/features/audit-watermark-*`; do not write those artifacts directly.
Use the aidd-local `execute-audit` skill's prior-report discovery, duplicate-suppression,
recurrence, and validation rules when interpreting the result.

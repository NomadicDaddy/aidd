# Parallel Multi-Audit Batching

aidd batches multi-audit runs into one backend invocation when more than one requested audit still needs a real report.

## CLI Behavior

Explicit multi-audit runs batch all requested audit names. Existing reports do not suppress an
explicit `--audit` request, so this form is suitable for refreshing named audits:

```bash
bun run start -- --project-dir . --audit SECURITY,DEAD_CODE
```

`--audit-all` discovers every non-reference audit definition under `audits/` and batches all
remaining audits that do not already have a real report:

```bash
bun run start -- --project-dir . --audit-all
```

Single-audit runs keep the existing single-audit prompt and result contract.

## Agent Contract

For batched runs, the audit prompt includes every selected audit definition in its own named section and instructs capable CLIs to delegate the individual audits to parallel subagents. Backends without subagent support may still complete the same audit batch in one run.

The final result marker must contain one report entry for every selected audit:

```text
AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[],"reportMarkdown":"# SECURITY Audit Report\n\nSummary..."}]}
```

Each `auditReports[]` entry is processed independently. aidd writes one `.aidd/audit-reports/<AUDIT>-<date>.md` report per audit and creates audit finding feature files using that entry's `auditName` as `auditSource`.

## Iteration Metadata

Batched audit iterations record:

- `requestedAudits`
- `selectedAuditBatch`
- `completedAudits`
- `missingAudits`
- `invalidAuditReports`
- `perAuditFindingTotals`
- `perAuditFindingsCreated`
- `perAuditReportPaths`
- `auditBatchParallelInstruction`

If a selected audit is omitted from `auditReports[]`, the batch is marked incomplete and the missing audit remains eligible for the next iteration.

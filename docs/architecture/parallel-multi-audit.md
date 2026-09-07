# Parallel Multi-Audit Batching

aidd batches multi-audit runs into one backend invocation when more than one requested audit still needs a fresh report.

## CLI Behavior

Explicit multi-audit runs batch all requested audit names. Existing reports do not suppress an
explicit `--audit` request, so this form is suitable for refreshing named audits:

```bash
bun run start -- --project-dir . --audit SECURITY,DEAD_CODE
```

`--audit-all` discovers every non-reference audit definition under the aidd install root's
`audits/`, drops the ones that do not apply to the project's assurance profile, ranks the rest by
change potential, and batches every remaining audit whose report is missing or stale:

```bash
bun run start -- --project-dir . --audit-all
```

Single-audit runs keep the existing single-audit prompt and result contract.

## Agent Contract

For batched runs, the audit prompt includes every selected audit definition in its own named section and instructs capable CLIs to delegate the individual audits to parallel subagents. Backends without subagent support may still complete the same audit batch in one run.

The final result marker must contain one report entry for every selected audit:

```text
AIDD_RESULT: {"auditReports":[{"auditName":"SECURITY","auditFindings":[{"title":"Brief issue title","description":"Verified: path/to/file.ts:42 - evidence","spec":"Concrete remediation steps","severity":"High","affectedFiles":["path/to/file.ts"]}],"reportMarkdown":"# SECURITY Audit Report\n\nSummary..."},{"auditName":"DEAD_CODE","auditFindings":[],"noFindingsJustification":"Inspected backend/src/routes/*.ts and frontend/src/pages/* with rg for unreferenced exports; every match is registered, so nothing qualified.","reportMarkdown":"# DEAD_CODE Audit Report\n\nSummary..."}]}
```

Each entry's `auditName` must be one of the selected audit names, and duplicates are rejected. An
entry with an empty `auditFindings` array must carry a concrete `noFindingsJustification`; an entry
that omits it, or whose findings lack a title, spec, `Verified:` description line, recognized
severity, or at least one affected file, is rejected whole and that audit stays pending.

Each `auditReports[]` entry is processed independently. aidd writes one `.aidd/audit-reports/<AUDIT>-YYYY-MM-DD.md` report per audit and creates audit finding feature files using that entry's `auditName` as `auditSource`.

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

If a selected audit is omitted from `auditReports[]` or its entry is rejected, the batch is marked incomplete and that audit remains eligible for the next iteration.

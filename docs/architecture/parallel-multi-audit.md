# Multi-Audit Runs

aidd runs one audit per agent session, always. A run asked for several audits works through them
in order, one session each; no session is ever given more than one audit.

## CLI Behavior

An explicit multi-audit run takes the named audits in the order given. Existing reports do not
suppress an explicit `--audit` request, so this form is suitable for refreshing named audits:

```bash
bun run start -- --project-dir . --audit SECURITY,DEAD_CODE
```

`--audit-all` discovers every non-reference audit definition under the aidd install root's
`audits/`, drops the ones that do not apply to the project's assurance profile, ranks the rest by
change potential, and runs each audit whose report is missing or stale, highest-ranked first:

```bash
bun run start -- --project-dir . --audit-all
```

Within one run an audit is settled once, in one of three ways, and is not selected again:

- **Done** — its report was accepted and persisted.
- **Could not run** — the agent reported that the audit cannot be performed. The reason is
  recorded and the audit stays stale, so a later run attempts it again.
- **Given up on** — its session failed twice in the run: it exited non-zero, emitted no structured
  result, or had its report rejected by validation.

## Agent Contract

The audit prompt carries exactly one audit definition. The final result marker is a single object
that names its audit:

```text
AIDD_RESULT: {"auditName":"SECURITY","auditFindings":[{"title":"Brief issue title","description":"Verified: path/to/file.ts:42 - evidence","spec":"Concrete remediation steps","severity":"High","affectedFiles":["path/to/file.ts"]}],"reportMarkdown":"# SECURITY Audit Report\n\nSummary..."}
```

`auditName` must be the audit the session was given; a result naming any other audit is rejected.
A result with an empty `auditFindings` array must carry a concrete `noFindingsJustification`; a
result that omits it, or whose findings lack a title, spec, `Verified:` description line,
recognized severity, or at least one affected file, is rejected whole and the audit stays pending.

An agent that cannot perform the audit says so instead of writing a report that says SKIPPED or
INCOMPLETE:

```text
AIDD_RESULT: {"auditName":"LIGHTHOUSE","auditStatus":"unavailable","unavailableReason":"No Lighthouse artifact exists under logs/ and no browser is installed to produce one.","auditFindings":[]}
```

`unavailableReason` is required and `auditFindings` must be empty. A measurement audit
(PERFORMANCE, LIGHTHOUSE, BUILD_OUTPUT) whose numeric score had to be withheld because no
instrument backed it is treated the same way.

aidd writes one `.aidd/audit-reports/<AUDIT>-YYYY-MM-DD.md` report per audit and creates audit
finding feature files with the audit's name as `auditSource`. A could-not-run report begins with
the marker `<!-- aidd:audit-unavailable -->` and the reason. It is kept for the record but is not
audit evidence: neither `--audit-all` selection nor any panel view counts it as a fresh report.

## Run Record and Iteration Metadata

The run's driver names every audit the run was asked for, not only the audit of its last session.
Every iteration summary starts with a line for the audit just processed and carries a run-level
line, so the final summary describes the whole run:

```text
audit run so far: 3 of 30 audit(s) done, 7 finding(s) (5 new); could not run: LIGHTHOUSE; gave up after 2 failed attempts: DEAD_CODE; 25 remain
```

Each audit iteration records, for the audit it held:

- `auditName`
- `completedAudits`
- `missingAudits`
- `invalidAuditReports`
- `perAuditFindingTotals`
- `perAuditFindingsCreated`
- `perAuditReportPaths`

and, for the run so far:

- `requestedAudits`
- `remainingAudits`
- `unavailableAudits`
- `abandonedAudits`

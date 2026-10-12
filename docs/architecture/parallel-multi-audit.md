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

- **Done**: its report was accepted and persisted.
- **Could not run**: the agent reported that the audit cannot be performed. The reason is
  recorded and the audit stays stale, so a later run attempts it again.
- **Given up on**: its session failed twice in the run. The run then carries on with the next
  audit.

### What counts as a failed attempt

A failed attempt is a session that failed on its own account: the agent exited non-zero, the
provider returned an error, the backend went idle, no structured result came back, or the report
was rejected by validation. Each one counts once against the audit the session held. After the
first, the same audit is selected again; after the second, the audit is given up on and the run
moves to the next one.

Some failures are not the audit's and are never counted as attempts, so no audit is given up on
because of them. They end the run, or are handled by the gate that already owns them:

| Session outcome                                                                         | Counted as an attempt | What the run does                                                    |
| --------------------------------------------------------------------------------------- | --------------------- | -------------------------------------------------------------------- |
| Agent exit 1, or any exit code aidd does not name below 128                             | yes                   | continues with the next selection                                    |
| Provider error (72) with no sign of a backend-wide cause                                | yes                   | continues; a transient one is first retried under the timeout policy |
| No structured result or no report (73)                                                  | yes                   | continues with the next selection                                    |
| Report rejected by validation (exit 0)                                                  | yes                   | continues with the next selection                                    |
| Idle timeout (71)                                                                       | yes                   | follows the timeout policy: retried up to its limit, otherwise ends  |
| Provider error (72) naming credentials, quota or credit, or a backend that cannot start | not applicable        | ends                                                                 |
| Stop requested                                                                          | no                    | ends as stopped                                                      |
| Aborted or interrupted (124), or an exit code of 128 and above                          | no                    | ends, unless the abort tolerance allows another try                  |
| Rate limited (74)                                                                       | no                    | waits and retries the same audit, or ends when the wait is too long  |
| Flailing guard (75)                                                                     | no                    | nudges once, then ends                                               |
| Write allowlist violation (76), validation gate (7), merge parked (77)                  | no                    | ends                                                                 |
| Provider flagged the content (78), no assistant output (70)                             | no                    | ends                                                                 |
| Wall-clock budget, iteration limit                                                      | not applicable        | ends                                                                 |

The timeout policy still bounds a backend that has stopped answering: consecutive idle timeouts
and transient provider errors end the run at the configured retry limit, whichever audits they
fell on.

### How the run ends

A run that settled every audit as done or could not run ends as `completed`. Audits that could not
run do not fail the run, and the summary names them.

A run that gave up on at least one audit did not do what it was asked and does not end as
`completed`. If at least one audit was done, it ends as `partial_success_blocked` with exit code 0,
which the panel shows as a partial success. If none was done, it ends as `exit_error` with exit
code 1. The summary names the audits it gave up on in both cases.

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

An agent that cannot perform the audit declares that in the result instead of returning an
ordinary result whose report says SKIPPED or INCOMPLETE:

```text
AIDD_RESULT: {"auditName":"LIGHTHOUSE","auditStatus":"unavailable","unavailableReason":"No Lighthouse artifact exists under logs/ and no browser is installed to produce one.","auditFindings":[]}
```

`unavailableReason` is required. `auditFindings` is normally empty, with one exception: when the
missing instrument is itself a defect of the project (a project that should be measurable has no
way to produce the measurement), the agent may file that as a finding in the same result, and aidd
keeps it. A target that simply has nothing for the audit to measure gets no finding; such a target
should not have the audit applied at all, which the project profile or an audit override settles.
The audit definitions and the result contract state this same rule.

Two other results are treated as could not run, whatever `auditStatus` says. One is a measurement
audit (PERFORMANCE, LIGHTHOUSE, BUILD_OUTPUT) whose numeric score had to be withheld because no
instrument backed it. The other is a report whose own status line reads
`**Status:** SKIPPED / data-unavailable`. Only that status line counts: a measured report that
uses the same phrase for one sub-metric it could not collect is still real evidence.

aidd writes one `.aidd/audit-reports/<AUDIT>-YYYY-MM-DD.md` report per audit and creates audit
finding feature files with the audit's name as `auditSource`. A could-not-run report begins with
the marker `<!-- aidd:audit-unavailable -->` and the reason. It is kept for the record but is not
audit evidence: neither `--audit-all` selection nor any panel view counts it as a fresh report.
Readers look for the marker only on the leading lines of the file, where the writer puts it, so a
real report that quotes the marker text in its body is still counted.

Reports are one file per audit per day, so a second result on the same day replaces the first.
A could-not-run result is the exception: when a real report for the audit was already written
that day, the real report is left untouched and no could-not-run report is written. The audit is
still listed as could not run for that run, and the summary says the existing report was kept.

## Run Record and Iteration Metadata

The run's driver names every audit on the run's worklist, not only the audit of its last session.
The run record also carries a finding count per audit, and that list names only the audits the run
performed: an audit it gave up on, or that could not run, is on the driver and not on the counts.
Audit scoring credits a run to the audits on the counts, so an audit nothing audited is never
scored as a performance that found nothing.

Every iteration summary starts with a line for the audit just processed and carries a run-level
line, so the final summary describes the whole run:

```text
audit run so far: 3 of 30 audit(s) done, 7 finding(s) (5 new); could not run: LIGHTHOUSE; gave up after 2 failed attempts: DEAD_CODE; 25 remain
```

Each audit iteration records, for the audit it held:

- `auditName`
- `completedAudits`
- `missingAudits` (the audit, when the session left it unsettled)
- `failedAttempt` (which failed attempt at the audit this was, when one was counted)
- `invalidAuditReports`
- `perAuditFindingTotals`
- `perAuditFindingsCreated`
- `perAuditReportPaths`

and, for the run so far:

- `requestedAudits`
- `remainingAudits`
- `unavailableAudits`
- `abandonedAudits`

---
name: spernakit-tester
description: 'Test Spernakit and Spernakit-derived applications through automated crawl coverage, exploratory browser testing, or supplied end-user scenarios. Use for QA runs, regression testing, tester scenarios, role-based workflow verification, or browser-visible defect reporting.'
metadata:
    aidd-category: runtime
    aidd-contracts: testing-scenarios
---

# Test a Spernakit Application

Exercise a Spernakit application as a user, collect reproducible evidence, and report defects
through the application's bug-report workflow. Combine the repository's crawl and smoke gates
with the canonical `agent-browser` skill for interactive testing.

Do not inspect product source to invent findings. Read configuration, test output, and logs only
to prepare the run or explain an observed failure.

## Inputs

Resolve these values before testing:

| Input                 | Default                                                  |
| --------------------- | -------------------------------------------------------- |
| Application directory | Current Spernakit or derived-app repository              |
| Target URL            | Frontend URL from the active application config          |
| Scope                 | Full user-accessible application                         |
| Authentication        | Anonymous unless the user provides credentials or a role |
| Scenarios             | `{APP_DIR}/.aidd/testing-scenarios.md` when present      |
| Evidence directory    | `{APP_DIR}/screenshots/tester/{SESSION}/`                |

Treat a supplied Markdown test script, inline test cases, or selected project scenarios as a
scripted run. Otherwise, perform an exploratory run. Use the `testing-scenarios` skill to change
the project scenario catalog; do not edit it during a test run.

## Preconditions

1. Confirm that the target is Spernakit or a Spernakit-derived application.
2. Read `docs/template/TESTING.md` in the target repository. Treat it as the current command
   reference when it differs from this skill.
3. Confirm that the requested URL and role are authorized for testing.
4. For rapid multi-role login tests, verify that the active development config sets both
   `rateLimit.enabled` and `rateLimit.authEnabled` to `false`. Prefer process-local overrides that
   are restored when testing ends. If none exist, preserve persistent configuration and run
   rate-aware tests.
5. Check whether the application is already reachable.
6. If the application is not running, run `bun run start` from `{APP_DIR}` and record that this
   run owns the process. Wait for the URL to respond before continuing.

Never start a second copy of a long-running command because the first appears slow. Wait for the
existing process and inspect its output or logs.

## Choose the Test Path

### Automated coverage

Use the repository-native gates before or alongside browser exploration:

| Goal                                | Command                                         |
| ----------------------------------- | ----------------------------------------------- |
| Check code quality without mutation | `bun run smoke:qc`                              |
| Crawl an already-running dev app    | `bun run crawltest`                             |
| Crawl one route                     | `bun scripts/crawltest.ts --page /path`         |
| Crawl a route family                | `bun scripts/crawltest.ts --start-from /prefix` |
| Verify routing and error handling   | `bun scripts/crawltest.ts --404`                |
| Capture crawl screenshots           | Add `--screenshot-pages`                        |
| Start, crawl, and stop dev services | `bun run smoke:dev`                             |
| Exercise the preview build          | `bun run smoke:preview`                         |

Read `logs/crawltest.json` after a crawl. Treat console errors, network failures, content
assertion failures, and interaction failures as leads that still require reproducible evidence.
Do not run `smoke:reset`, `supertest`, or another reset-capable gate unless the user explicitly
requests that broader validation.

### Exploratory coverage

Use the canonical `agent-browser` skill for interactive browser automation. Load its current
instructions before issuing commands because its CLI is maintained outside aidd.

Start an isolated session and preserve existing evidence:

```text
agent-browser --session {SESSION} open {TARGET_URL}
agent-browser --session {SESSION} wait --load networkidle
agent-browser --session {SESSION} snapshot -i
agent-browser --session {SESSION} screenshot --annotate {EVIDENCE_DIR}/orientation.png
```

Explore these areas systematically:

1. Navigation and routing
2. Forms, validation, and submission behavior
3. Dialogs, menus, filters, tables, and other interactive controls
4. Authentication, authorization, and role-specific visibility
5. Loading, empty, success, and error states
6. Responsive behavior and keyboard access when relevant

Navigate through visible controls. Do not type guessed routes and report their 404 responses as
product defects. Refresh the interactive snapshot after navigation or any significant DOM change.

Check browser and application logs at orientation, after important workflows, and at wrap-up:

```text
agent-browser --session {SESSION} errors
agent-browser --session {SESSION} console
```

Correlate each error with the page and action that produced it. Ignore normal startup messages,
expected development-mode warnings, and duplicate instances of an already-recorded error.

### Scripted coverage

Execute supplied cases in order unless the user selects a subset. Accept headings such as
`TC-001`, numbered project scenarios, or plain-language end-user goals. For each case:

1. Establish its preconditions.
2. Translate each action literally into browser interaction.
3. Capture evidence at the assertion boundary.
4. Record `PASS`, `FAIL`, `BLOCKED`, or `ERROR`.
5. Return to a clean starting state when the cases are independent.

Do not explore adjacent features during a scripted run. If one case creates state required by a
later case, record the dependency and mark dependent cases `BLOCKED` when setup fails.

## Capture Evidence

Create a new session-specific evidence directory; never clear a previous run. Capture at least
one screenshot for every failed assertion or reported defect. Use a short video when timing or a
sequence of interactions is essential to reproduce the problem.

```text
agent-browser --session {SESSION} screenshot --annotate {EVIDENCE_DIR}/{CASE}-failure.png
agent-browser --session {SESSION} record start {EVIDENCE_DIR}/{CASE}-repro.webm
# Reproduce the interaction at a readable pace.
agent-browser --session {SESSION} record stop
```

Record the URL, role, viewport when relevant, reproduction steps, expected result, actual result,
and evidence path. Confirm suspected click or submission failures with a fresh snapshot and a
second deliberate attempt before reporting them. Do not attribute failures to the automation
harness without evidence.

## Report Findings

Use the application's bug-report dialog when available:

- Select **Bug** when an existing capability behaves incorrectly.
- Select **Feature** when the required capability does not exist.
- Put the summary, expected and actual results, reproduction steps, severity, and evidence path
  in the description.
- Prefix scripted findings with the test-case ID.
- Leave the optional reporter email blank unless the user requests otherwise.
- Confirm the success notification and, when possible, the corresponding backend log entry.

Spernakit stores current reports in its database. Do not write a fallback `data/bugs.json` file.
If the dialog is unavailable or submission cannot be confirmed, preserve the finding in the final
results and identify the reporting blocker.

Do not report expected authorization failures, deliberately unavailable features, subjective
preferences, manually guessed routes, or duplicate manifestations of the same defect.

## Validation and Cleanup

Before finishing:

1. Reconcile visited pages and executed cases with captured evidence.
2. Recheck browser errors, console output, and relevant application logs.
3. Close the browser session with `agent-browser --session {SESSION} close`.
4. If this run started the application, run `bun run stop` from `{APP_DIR}`. Leave a pre-existing
   application process running.
5. Report every command executed and whether it passed, failed, or was blocked.

Do not claim that the application works unless `bun run smoke:qc` passes. A passing quality gate
does not replace end-user verification, and a passing browser scenario does not replace the
quality gate.

## Output

For exploratory runs, report:

- Areas and roles tested
- Routes and workflows exercised
- Automated gate and crawl results
- Findings submitted, with evidence paths
- Browser or server errors
- Blockers and excluded areas
- Application and browser lifecycle actions

For scripted runs, include a results table:

| Test case | Result    | Evidence or notes                            |
| --------- | --------- | -------------------------------------------- |
| `TC-001`  | `PASS`    | Expected result observed                     |
| `TC-002`  | `FAIL`    | `{EVIDENCE_DIR}/TC-002-failure.png`          |
| `TC-003`  | `BLOCKED` | Required state from `TC-002` was unavailable |

Include totals for `PASS`, `FAIL`, `BLOCKED`, and `ERROR`, followed by the same gate, finding,
log, blocker, and lifecycle details required for exploratory runs.

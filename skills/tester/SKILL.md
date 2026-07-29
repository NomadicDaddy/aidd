---
name: tester
description: 'Test any running application through exploratory browser testing, the project’s own automated gates, or supplied end-user scenarios, and report defects with reproducible evidence. Use for QA runs, regression testing, tester scenarios, role-based workflow verification, or browser-visible defect reporting.'
metadata:
    aidd-category: runtime
    aidd-contracts: bug2feature, testing-scenarios
---

# Test an Application

Exercise a running application as a user, collect reproducible evidence, and report defects
through whatever intake the project provides. Combine the project's own automated gates with the
canonical `agent-browser` skill for interactive testing.

Do not inspect product source to invent findings. Read configuration, test output, and logs only
to prepare the run or explain an observed failure.

## Applicability

**Applies to any project that serves an interface a browser can reach**, whatever its stack. The
one genuine precondition is a reachable URL. A headless library, a CLI, or a background service
with no user-facing surface has nothing for this skill to exercise, and that, not the project's
framework or template provenance, is the reason to decline.

Every command, path, and reporting channel below is discovered from the target project. Never
assume a script exists because another project has one. A project that defines fewer gates than
another is still fully in scope; say which were available and which ran.

## Inputs

Resolve these values before testing:

| Input                 | Default                                                  |
| --------------------- | -------------------------------------------------------- |
| Application directory | Current repository, or the named application root        |
| Target URL            | Frontend URL from the project's own dev configuration    |
| Scope                 | Full user-accessible application                         |
| Authentication        | Anonymous unless the user provides credentials or a role |
| Scenarios             | `{APP_DIR}/.aidd/testing-scenarios.md` when present      |
| Evidence directory    | `{APP_DIR}/screenshots/tester/{SESSION}/`                |

Treat a supplied Markdown test script, inline test cases, or selected project scenarios as a
scripted run. Otherwise, perform an exploratory run. Use the `testing-scenarios` skill to change
the project scenario catalog; do not edit it during a test run.

## Phase 0: Discover the project's surface

Read the manifest the project actually uses (`package.json`, `Makefile`, `pyproject.toml`,
`Cargo.toml`, `mix.exs`, `docker-compose.yml`) and record four things. Use those answers for the
rest of the run.

1. **Lifecycle commands.** How the app starts and stops, and the URL it serves. Common shapes:
   `bun run start` / `bun run dev`, `npm run dev`, `make dev`, `docker compose up`,
   `uvicorn app:app`, `mix phx.server`.
2. **Automated gates.** Prefer an aggregate gate when the project defines one (`smoke:qc`,
   `make check`, `tox`). Otherwise collect the individual type-check, lint, test, and build
   commands. Note any crawler or end-to-end suite: Playwright, Cypress, Selenium, or a
   project-local crawl script, along with the artifact it writes.
3. **Testing documentation.** Read a testing guide when the project has one (`docs/TESTING.md`,
   `TESTING.md`, `CONTRIBUTING.md`). Treat it as the current command reference where it differs
   from this skill.
4. **Defect intake.** Decide before testing starts where findings will be filed, in this order of
   preference: an in-app bug-report feature, the project's issue tracker, an aidd
   `remediation-*` record through the `bug2feature` skill, or the run's final results. Never
   invent a storage file the project does not already use.

Report which of these existed and which did not. A missing gate or intake is a fact about the
project, not a blocker.

## Preconditions

1. Confirm that the requested URL and role are authorized for testing.
2. Check whether the application is already reachable.
3. If the application is not running, start it with the command found in Phase 0 from `{APP_DIR}`
   and record that this run owns the process. Wait for the URL to respond before continuing.
4. For rapid multi-role login tests, check whether the active development configuration throttles
   authentication or requests. Prefer process-local overrides that are restored when testing ends.
   If none exist, preserve persistent configuration and run rate-aware tests.

Never start a second copy of a long-running command because the first appears slow. Wait for the
existing process and inspect its output or logs.

## Choose the Test Path

### Automated coverage

Run the project's own gates from Phase 0 before or alongside browser exploration:

| Goal                                | Command                                              |
| ----------------------------------- | ---------------------------------------------------- |
| Check code quality without mutation | The project's aggregate gate, or its lint plus tests |
| Exercise routes automatically       | The project's crawler or end-to-end suite            |
| Verify routing and error handling   | The suite's negative or 404 coverage, when it has it |
| Capture screenshots automatically   | The suite's screenshot mode, when it has it          |

Read the artifact the suite writes. Treat console errors, network failures, content assertion
failures, and interaction failures as leads that still require reproducible evidence. Do not run
a reset-capable or destructive gate unless the user explicitly requests that broader validation.

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

Create a new session-specific evidence directory; never clear a previous run. Use the project's
own screenshot or artifact directory when it has one, and the default from Inputs when it does
not. Capture at least one screenshot for every failed assertion or reported defect. Use a short
video when timing or a sequence of interactions is essential to reproduce the problem.

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

File each finding through the intake chosen in Phase 0:

- Classify the finding as a defect when an existing capability behaves incorrectly, and as a
  feature request when the required capability does not exist.
- Include the summary, expected and actual results, reproduction steps, severity, and evidence
  path.
- Prefix scripted findings with the test-case ID.
- Confirm that submission succeeded and, when possible, the corresponding backend or tracker
  record.

If the intake is unavailable or submission cannot be confirmed, preserve the finding in the final
results and identify the reporting blocker. Do not create a parallel storage file for findings.

Do not report expected authorization failures, deliberately unavailable features, subjective
preferences, manually guessed routes, or duplicate manifestations of the same defect.

## Validation and Cleanup

Before finishing:

1. Reconcile visited pages and executed cases with captured evidence.
2. Recheck browser errors, console output, and relevant application logs.
3. Close the browser session with `agent-browser --session {SESSION} close`.
4. If this run started the application, stop it with the command found in Phase 0 from
   `{APP_DIR}`. Leave a pre-existing application process running.
5. Report every command executed and whether it passed, failed, or was blocked.

Do not claim that the application works unless the project's own quality gate passes. A passing
quality gate does not replace end-user verification, and a passing browser scenario does not
replace the quality gate. When the project defines no gate, say so rather than implying one ran.

## Output

For exploratory runs, report:

- Areas and roles tested
- Routes and workflows exercised
- Automated gate results, naming which gates the project defines
- Findings submitted, with evidence paths and the intake used
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

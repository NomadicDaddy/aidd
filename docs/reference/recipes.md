# aidd Recipes

Recipes are multi-step pipelines defined in `recipes/*.json`. Recipe ids are derived from filenames, so the JSON file does not need an explicit id field. The embedded web control panel and pipeline runner read the same files.

Supported step types are `aidd-cli`, `skill`, `shell`, and `recipe-ref`. Steps may carry `preHookJson`, `postHookJson`, `onFailure`, `retryCount`, and `when` values depending on the workflow.

Recipe launches use the selected launch target for CLI, model, and reasoning effort. The session-level launch target wins over the same field in a step's own config, so a backend or model chosen visibly at launch is never beaten by buried step config; where the launch target leaves a field unset, the step's config applies, then the project and global defaults.

A step whose config sets `includePriorStepOutput: true` receives the immediately preceding step's output summary appended to its prompt under a labelled heading. Steps are otherwise independent processes with no memory of each other, so the review → remediate recipes use this flag to hand review findings to the remediation step instead of making it rediscover them.

Launching a recipe creates a pipeline session. A session that completes some steps but fails others resolves to a `completed_with_failures` partial-success status (with a failed-step summary) rather than a bare `failed`. Telemetry records partial successes as `failed`, since invocation events have no partial-success status.

Every attempt at a step is persisted as its own row in that session's report. A step with `retryCount` records attempt 1, attempt 2, and so on, each keeping its own status, exit code, and error message, so a step that failed and then succeeded still shows the failure that provoked the retry. A step with `onFailure: auto-fix` records the remediation run between the two attempts it sits between, labelled `Auto-fix after attempt N`; a step that ran once carries no attempt label at all. Sessions recorded before aidd persisted attempt identity — and the duplicate rows left behind by earlier duplicate executions — have none of these fields. Those are grouped by parent, depth, sequence number, step definition, and name, numbered only when a step definition anchors the group, and otherwise labelled `Retry (legacy)` rather than given a fabricated ordinal.

A web restart during a retry cycle resumes the step rather than moving past it. The attempt in flight keeps its row until the row that supersedes it exists, and an auto-fix run never becomes the only live row for its step, so the resumed session always finds the step it was still owed. Any remediation or hook row left open by the restart is terminalized when the step resumes rather than sitting `running` beside it.

Step config strings substitute `{name}` placeholders from the session's parameters. Alongside the recipe's own parameters and the built-in `{application}`, `{projectDir}`, and `{projectName}`, two reserved names resolve from the executing session and cannot be overridden by a recipe parameter of the same name:

- `{pipelineSessionId}` — the session's id.
- `{sessionMetricsPath}` — the project-relative path of this session's metrics file (`.aidd/runtime/pipeline-sessions/<id>/metrics.json`), which the pipeline refreshes after every completed top-level step. A step that reports on the session reads that path directly. Do not glob for the file or pick the most recently modified one: two pipelines running in the same project each refresh their own, so that selection can summarize the wrong session. The metrics are transient — a boot sweep removes every session's file once it is no longer running.

## Recipe Index

| Recipe ID                                   | Name                                                                         | Steps | Parameters                            |
| ------------------------------------------- | ---------------------------------------------------------------------------- | ----- | ------------------------------------- |
| `apply-ui`                                  | apply ui                                                                     | 5     | application, source                   |
| `audit-all`                                 | audit (all)                                                                  | 3     | application                           |
| `audit-and-remediate`                       | audit and remediate                                                          | 3     | application                           |
| `audit-maintenance`                         | audit maintenance                                                            | 2     | none                                  |
| `bug2feature`                               | bug2feature                                                                  | 2     | application                           |
| `check-artifacts`                           | check-artifacts                                                              | 1     | none                                  |
| `codebase-analysis`                         | codebase-analysis                                                            | 1     | application                           |
| `coding`                                    | coding                                                                       | 4     | application, feature                  |
| `coding-review-remediate-document-changes`  | coding, deep review, remediation, and change documentation                   | 4     | application, feature                  |
| `coding-spirit-coderabbit-document-changes` | coding, spirit and CodeRabbit reviews, remediation, and change documentation | 6     | application, feature                  |
| `deploy`                                    | deploy                                                                       | 8     | application, deployCommand, healthUrl |
| `feature-consolidation-document-changes`    | feature consolidation and document changes                                   | 3     | application                           |
| `frontend-polish`                           | frontend polish                                                              | 12    | application, filterBy, filterValue    |
| `generate-application-features`             | generate application features                                                | 2     | application                           |
| `generate-testing-scenarios`                | generate testing scenarios                                                   | 1     | application                           |
| `interview`                                 | interview                                                                    | 9     | application                           |
| `new-app-from-idea`                         | new-app-from-idea                                                            | 8     | application, stopBeforeImplementation |
| `project-intake`                            | project-intake                                                               | 9     | application                           |
| `project-reintake`                          | project-reintake                                                             | 2     | application                           |
| `reconcile-project-artifacts`               | reconcile project artifacts                                                  | 2     | application                           |
| `remediate-audit-findings`                  | remediate audit findings                                                     | 3     | application, filterBy, filterValue    |
| `remediate-bugs`                            | remediate bugs                                                               | 3     | application, filterBy, filterValue    |
| `ship-changes`                              | ship changes                                                                 | 4     | application                           |
| `spernakit-bump`                            | spernakit bump                                                               | 4     | bumpHint                              |
| `spernakit-dance`                           | spernakit dance                                                              | 2     | bumpHint                              |
| `spernakit-dance-resume`                    | spernakit dance (resume)                                                     | 1     | resumeArgs                            |
| `spernakit-propagate`                       | spernakit propagate                                                          | 12    | application, version                  |
| `spernakit-release`                         | spernakit release                                                            | 4     | bumpHint, version, application        |
| `spernakit-replatform-assessment`           | spernakit-replatform-assessment                                              | 7     | application                           |
| `test-and-remediate`                        | test and remediate                                                           | 5     | application                           |
| `test-application-chaos`                    | test application (chaos)                                                     | 2     | application                           |
| `test-application-scenarios`                | test application (scenarios)                                                 | 2     | application                           |
| `triumvirate-coding-document-changes`       | triumvirate coding and document changes                                      | 2     | application                           |
| `ui-redesign`                               | ui redesign                                                                  | 3     | application                           |
| `update-application-documentation`          | update application documentation                                             | 4     | application                           |

## Recipes

### apply-ui

Apply an externally provided UI to an application, compare the result against a pre-apply snapshot to catch dropped behavior, then review and validate the resulting feature metadata.

- **Name:** apply ui
- **Parameters:** application, source
- **Steps:** 5

1. `shell` - Snapshot pre-apply UI (command: refuse on a dirty working tree or a pre-existing `.worktrees/ui-reference`, then `git worktree add --detach .worktrees/ui-reference HEAD`)
2. `skill` - Apply source UI (args: {source}; skillId: spernakit-apply-ui)
3. `skill` - Check UI parity (args: .worktrees/ui-reference .; skillId: ui-parity); post-hook removes the snapshot worktree
4. `skill` - Review parity features (args: {application}; skillId: feature-review); retryCount: 1
5. `aidd-cli` - Validate feature metadata (validate: true)

`spernakit-apply-ui` re-skins the app in place, and its own Phase 5.6 only files backlog stubs for _net-new_ source elements. It cannot see the opposite direction: existing behavior the rebuild silently dropped, degraded, or relocated. That is what `ui-parity` reports — but `ui-parity` compares two codebase _paths_, and after an in-place apply the pre-apply version exists only in git history. Step 1 therefore materializes it as a detached worktree at `.worktrees/ui-reference`, which the template `.gitignore` already excludes.

Step 1 **refuses rather than repairs**. It exits non-zero if the working tree is dirty, because `HEAD` is the parity reference and uncommitted UI work would be invisible to the snapshot and then reported back as a gap. It also exits non-zero if `.worktrees/ui-reference` already exists, naming the manual `git worktree remove` that clears it. Force-removing that path and then `rm -rf`'ing it would silently destroy an unrelated worktree that happened to occupy the name; a recipe step must never delete a directory it has not confirmed it owns.

Cleanup is a **post-hook on step 3**, not a trailing step, because `stepExecutor` stops the pipeline as soon as a step fails (`if (!result.ok && (step.onFailure ?? 'stop') !== 'continue') return result`), so a final cleanup step would be skipped in exactly the failure cases that leave a snapshot behind. Post-hooks run after the step completes regardless of its status and cannot fail the parent step, which is the finalization semantics this needs. Step 3 is the last step that reads the reference, so the hook is safe there. A failure in step 2 still leaves the worktree on disk — harmless, ignored, and step 1 will name it on the next run.

Step 3 is `apply-changes`, not `review-only`: `ui-parity` does not merely report: its Phase 5 writes `.aidd/features/` entries for every high- and medium-priority gap and its Phase 6 assigns each one to the current milestone. Steps 4 and 5 then review and validate that generated metadata, mirroring `ui-redesign`'s tail. Unlike `ui-redesign` this recipe is not metadata-only — step 2 rewrites frontend code.

Both skill paths in step 3 resolve against the target app, which is the working directory for every step in the pipeline.

### audit-all

Run all audits, review findings, and review features.

- **Name:** audit (all)
- **Parameters:** application
- **Steps:** 3

1. `aidd-cli` - Run all audits (auditAll: true; maxIterations: 3)
2. `skill` - Review audit findings (args: {application}; skillId: audit-finding-review)
3. `skill` - Review features (args: {application}; skillId: feature-review)

### audit-and-remediate

Run all audits, review the findings, remediate them, and produce a session report.

- **Name:** audit and remediate
- **Parameters:** application
- **Steps:** 3

1. `recipe-ref` - Run audits and review findings (params: {"application":"{application}"}; recipeName: audit (all))
2. `recipe-ref` - Remediate audit findings (params: {"application":"{application}"}; recipeName: remediate audit findings)
3. `aidd-cli` - Create session report (maxIterations: 1; prompt: Write a session report to .aidd/reports/audit-and-remediate-<YYYYMMDD-HHMM>.md, using the current date and time for the filename. Read the per-step timing and outcome data from {sessionMetricsPath}, which the pipeline wrote for this session and refreshed after every completed step...)

Step 1 delegates to `audit-all`, so the audits actually run before their findings are reviewed. There is no "delete resolved features" step: `remediate audit findings` ends in `consolidate-features`, which folds completed findings into their source features and removes the redundant files itself.

### audit-maintenance

Resync aidd's derived audit definitions with their source skills, then review every audit against current practice.

- **Name:** audit maintenance
- **Parameters:** none
- **Steps:** 2

1. `skill` - Resync derived audits (skillId: update-audits); onFailure: continue
2. `skill` - Review audit definitions (skillId: audit-review)

This recipe maintains aidd itself, not a managed application, so it takes no `application` parameter. Step 1 pulls the Vercel-derived audits (`COMPOSITION_PATTERNS`, `REACT_BEST_PRACTICES`, `WEB_DESIGN_GUIDELINES`) back in line with their upstream source skills and continues on failure when those sources are unreachable; step 2 then reviews every audit under `audits/` against report history and the skills that feed it.

This recipe is deliberately **not** metadata-only. Both skills write `<aidd-root>/audits/{NAME}.md`, which is outside the `.aidd/` allowlist that metadata-only sessions enforce: `managedStepHandler` would pass `--write-allowlist .aidd` to the run and the `stepRunner` backstop would then diff the worktree, revert every audit edit, and fail the step. Marking this recipe metadata-only makes it undo its own output.

### bug2feature

Convert bugs to feature remediations and review them.

- **Name:** bug2feature
- **Parameters:** application
- **Steps:** 2

1. `skill` - Run bug2feature (args: {application}; skillId: bug2feature)
2. `skill` - Review features (args: {application}; skillId: feature-review)

### check-artifacts

Recalculate .aidd/.artifacts-check.json by running `aidd --check-artifacts` against the target project. This validates artifact status; it does not edit project artifacts.

- **Name:** check-artifacts
- **Parameters:** none
- **Steps:** 1

1. `aidd-cli` - Run aidd --check-artifacts (checkArtifacts: true; validate: true)

### codebase-analysis

Run a broad codebase analysis across architecture, performance, security, metadata health, and technical debt. Analysis only: it writes a dated report under .aidd/audit-reports/ and a summary in .aidd/CHANGELOG.md, never edits application code or configuration, and leaves its output as uncommitted workspace artifacts.

- **Name:** codebase-analysis
- **Parameters:** application
- **Steps:** 1

1. `skill` - Analyze codebase (args: {application} — save the analysis report under .aidd/audit-reports/ using the dated CODEBASE_ANALYSIS filename the skill specifies...; skillId: codebase-analysis)

The step is `apply-changes` even though the analysis edits no application code: the skill still has to write its report and changelog entry under `.aidd/`, and a `review-only` step would leave both in the run transcript. This recipe owns the report artifact and also states that request explicitly; a direct skill invocation saves a report only when the caller requests one.

### coding

Default coding run using the selected launch CLI: code the selected work, review the result for spirit and intent, remediate every confirmed and applicable finding, then document and commit the changes.

- **Name:** coding
- **Parameters:** application, feature (default empty — selects normal backlog work)
- **Steps:** 4

1. `aidd-cli` - Run coding (feature: {feature})
2. `skill` - Spirit review (skillId: spirit)
3. `aidd-cli` - Remediate spirit findings (maxIterations: 1; prompt: Review the change set the spirit review covered — the working tree plus any commits produced earlier in this pipeline — and the immediately preceding spirit findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

The review step takes no args. `spirit` is `spirit [boundary] [focus]`, so an application name lands in the `[boundary]` slot as a ref or path the project does not have; with zero args the skill resolves the change set itself — the working tree plus the commits step 1 just produced — which is what a post-coding review wants. `document-changes` is `document-changes [app]`, so it keeps `{application}`.

### coding-review-remediate-document-changes

Run coding, perform a deep review, remediate every confirmed and applicable finding, then document and commit the changes.

- **Name:** coding, deep review, remediation, and change documentation
- **Parameters:** application, feature (default empty — selects normal backlog work)
- **Steps:** 4

1. `aidd-cli` - Run coding (feature: {feature})
2. `skill` - Deep review (skillId: deepreview)
3. `aidd-cli` - Remediate deep review findings (maxIterations: 1; prompt: Review the change set the deep review covered — the working tree plus any commits produced earlier in this pipeline — and the immediately preceding deep review findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

### coding-spirit-coderabbit-document-changes

Run coding, review the result for spirit and intent, remediate every confirmed and applicable finding, run an independent CodeRabbit review, remediate its confirmed and applicable findings, then document and commit the changes.

- **Name:** coding, spirit and CodeRabbit reviews, remediation, and change documentation
- **Parameters:** application, feature (default empty — selects normal backlog work)
- **Steps:** 6

1. `aidd-cli` - Run coding (feature: {feature})
2. `skill` - Spirit review (skillId: spirit)
3. `aidd-cli` - Remediate spirit findings (maxIterations: 1; prompt: Review the change set the spirit review covered — the working tree plus any commits produced earlier in this pipeline — and the immediately preceding spirit findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
4. `skill` - CodeRabbit review (args: {application}; skillId: coderabbit)
5. `aidd-cli` - Remediate CodeRabbit findings (maxIterations: 1; prompt: Review the change set the CodeRabbit review covered — the working tree plus any commits produced earlier in this pipeline — and the immediately preceding CodeRabbit findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
6. `skill` - Document changes (args: {application}; skillId: document-changes)

### deploy

Deploy the application with its own deploy script, gated by build and test validation, verified by a health check, tagged, and audited. aidd orchestrates; the project owns the deploy command and credentials.

- **Name:** deploy
- **Parameters:** application, deployCommand (default `bun run deploy`), healthUrl (default empty — skips the health check)
- **Steps:** 8

1. `shell` - Require a clean working tree (fails when `git status --porcelain` reports anything)
2. `skill` - Validate build (args: {application}; skillId: validate-build)
3. `skill` - Validate tests (args: {application}; skillId: validate-tests)
4. `aidd-cli` - Deployment audit (auditNames: DEPLOYMENT; maxIterations: 1); onFailure: continue
5. `shell` - Re-check the working tree (fails when validation or the audit left anything uncommitted)
6. `shell` - Deploy ({deployCommand} in the project directory)
7. `shell` - Post-deploy health check (curl with retries against {healthUrl} when provided)
8. `shell` - Tag release (`deploy-<timestamp>` git tag; refuses when the tree is dirty); onFailure: continue

The recipe refuses to start from a dirty tree, and the DEPLOYMENT audit runs before the deploy so its findings can inform the release rather than only recording it.

Validation can fix files, and the audit can write metadata, after the initial clean-tree check. Step 5 checks again before deployment. If anything is uncommitted, commit the reviewed changes and rerun. This keeps deployment from using changes absent from the later tag.

The deploy command runs on the web host in the project directory, exactly like other shell steps. aidd never holds deploy credentials: whatever `bun run deploy` (or the override) needs must already be configured for the user account running aidd. The `deployment-readiness` skill prepares a project for this recipe (deploy script, deploy config, `.aidd/deployment.md` runbook).

### feature-consolidation-document-changes

Consolidate completed feature findings, review feature metadata, then document and commit the changes.

- **Name:** feature consolidation and document changes
- **Parameters:** application
- **Steps:** 3

1. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)
2. `skill` - Review features (args: {application}; skillId: feature-review)
3. `skill` - Document changes (args: {application}; skillId: document-changes)

### frontend-polish

Observe every frontend surface at desktop and mobile and exercise the running application against one build, file every finding through a single writer, then remediate, validate, and consolidate it in one pass before re-sweeping to prove the fixes landed.

- **Name:** frontend polish
- **Parameters:** application, filterBy (default `id`), filterValue (default `remediation-*`)
- **Steps:** 12

1. `skill` - Sweep desktop surfaces (args: {application} --mode desktop; skillId: frontend-design-sweep)
2. `skill` - Sweep mobile surfaces (args: {application} --mode mobile; skillId: frontend-design-sweep)
3. `skill` - Test application (args: {application}; skillId: tester)
4. `skill` - File sweep findings (args: {application} --source design-sweep:desktop,design-sweep:mobile; skillId: ui-redesign-planner)
5. `skill` - Convert defects to features (args: {application}; skillId: bug2feature)
6. `skill` - Review filed features (args: {application}; skillId: feature-review); retryCount: 1
7. `aidd-cli` - Remediate findings (filterBy: {filterBy}; filterValue: {filterValue})
8. `aidd-cli` - Validate remediations (validate: true)
9. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)
10. `skill` - Verify desktop remediations (args: {application} --mode desktop; skillId: frontend-design-sweep)
11. `skill` - Verify mobile remediations (args: {application} --mode mobile; skillId: frontend-design-sweep)
12. `skill` - Document changes (args: {application}; skillId: document-changes)

The phases are observe (1-3), file (4-5), remediate (6-8), and verify (9-12).

Steps 1-3 inspect the same build without applying fixes between passes. The two sweeps and the test run gather their own evidence.

Step 4 reads both sweep reports and files findings once. It decides whether an issue needs one cross-viewport feature or separate desktop and mobile features. Mode-specific features use mode-qualified slugs; existing remediation directories are not overwritten.

The `design-sweep:{mode}` selectors resolve the run-stamped reports through the sweep index. The recipe does not need to predict their filenames.

**One remediation filter, because both writers use the same name.** Step 7 is an ordinary coding run narrowed by `filterBy`/`filterValue`, the same mechanism `remediate-bugs` and `remediate-audit-findings` use, and `buildAiddRequest` reads a single `filterBy`/`filterValue` pair per step. That is enough here because `ui-redesign-planner` and `bug2feature` both mint `remediation-{YYYYMMDD}-{slug}`: the prefix marks a non-standalone finding, not a template-owned one, so `remediation-*` selects the sweep findings and the converted defects together. This recipe carried a second filter pair until 2026-08-30, when the naming convention was relaxed to match what Spernakit's `resident.ts` had already permitted since 2026-08-26; before that, `bug2feature` gave app-owned defects clean slugs and a single `remediation-*` filter silently skipped every one of them, leaving them filed, validated as a no-op, and consolidated unremediated. The step no-ops cleanly when nothing was filed: a run with no matching work stops with `no_work`, which is a completed run, so the pipeline continues.

Step 9 consolidates the validated findings once, after remediation. This lets sweep findings and reported defects fold into the same owning features.

Steps 10-11 repeat the visual review at the original viewport modes and report resolved, persisting, and introduced issues against the earlier runs. They omit `--features`, so new regressions are reported rather than filed into a backlog that no later step will remediate.

The verification sweeps cover the whole app because shared fixes can affect pages that were not edited. A run-specific `--scope` can reduce that work when narrower coverage is appropriate.

The recipe does not rerun functional testing after remediation: its verification sweeps are visual. Add a second `tester` step if that coverage is needed. Since August 26, 2026, Spernakit-derived apps accept app-owned resident findings by provenance; records carrying a `spernakit_version` stamp still fail that gate.

### generate-application-features

Analyze the codebase and generate feature.json reconstruction blueprints.

- **Name:** generate application features
- **Parameters:** application
- **Steps:** 2

1. `skill` - Generate features (args: {application} --apply; skillId: feature-coverage-audit)
2. `skill` - Review features (args: {application}; skillId: feature-review)

### generate-testing-scenarios

Analyze the codebase and generate testing scenarios for the application.

- **Name:** generate testing scenarios
- **Parameters:** application
- **Steps:** 1

1. `skill` - Generate scenarios (args: {application}; skillId: testing-scenarios)

### interview

Run an interview workflow, review the responses, convert them into remediation features, review and validate those features, and record the durable invariants the interview established.

- **Name:** interview
- **Parameters:** application
- **Steps:** 9

1. `skill` - Generate interview questions (args: {application}; skillId: onboarding-interview)
2. `aidd-cli` - Answer interview questions (interview: true)
3. `aidd-cli` - Review interview responses (maxIterations: 1; prompt: Review and assess the interview responses for {application}. Read every response file under .aidd/responses/ and verify each claim against the live codebase. Create or update .aidd/response-review.md — the project-relative path skill:doc2feature reads back in the next step — covering: claims the codebase contradicts or that look fabricated...)
4. `skill` - Convert responses to features (args: .aidd/responses {application}; skillId: doc2feature)
5. `aidd-cli` - Review remediation features (maxIterations: 1; prompt: Review and assess the remediation features created from the interview responses for {application}. Create or update .aidd/remediation-review.md — the project-relative path skill:feature-review reads back in a later step — with a per-feature assessment giving its strengths and concerns...)
6. `skill` - Review features (args: {application}; skillId: feature-review)
7. `aidd-cli` - Generate assertions list (maxIterations: 1; prompt: Record the durable invariants the interview established for {application} in .aidd/assertions.md. That file is the project's catalog of behavioral, data, and UX rules that must not regress, and its stable IDs are cited by gates and audit reports...)
8. `aidd-cli` - Validate completions (validate: true)
9. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)

Steps 3, 5, and 7 write to project-relative paths (`.aidd/response-review.md`, `.aidd/remediation-review.md`, `.aidd/assertions.md`). Every step in a pipeline already runs with the target project as its working directory, so prefixing those paths with `{application}` would bury the files one level deeper than the skills that read them back look.

### new-app-from-idea

Take a freshly created project from idea to a validated blueprint by default; feature implementation and build validation require an explicit opt-in.

- **Name:** new-app-from-idea
- **Parameters:** application, stopBeforeImplementation (default `true` — stops after the validated blueprint)
- **Steps:** 8

1. `recipe-ref` - Generate features from spec (params: {"application":"{application}"}; recipeName: generate application features); retryCount: 1
2. `skill` - Create roadmap (args: {application}; skillId: update-roadmap); retryCount: 1
3. `aidd-cli` - Validate and persist blueprint (maxIterations: 1; prompt: Validate the blueprint only. Confirm roadmap.json includes an MVP milestone; every MVP feature is backlog; every post-MVP feature is waiting_approval; all features have passes:false; and...); retryCount: 1
4. `recipe-ref` - Implement feature backlog (params: {"application":"{application}"}; recipeName: coding); retryCount: 1; when stopBeforeImplementation equals false
5. `skill` - Validate build (args: {application}; skillId: validate-build); when stopBeforeImplementation equals false
6. `skill` - Validate tests (args: {application}; skillId: validate-tests); when stopBeforeImplementation equals false
7. `skill` - Document changes (args: {application}; skillId: document-changes); when stopBeforeImplementation equals false
8. `aidd-cli` - First-session report (maxIterations: 1; prompt: Write a first-session report to .aidd/reports/first-session.md (overwrite if present; record the current date inside it). Read the per-step timing and outcome data from {sessionMe...); retryCount: 1

There is no separate feature-review step: `generate application features` already ends with one, so a second pass would re-review the features it just approved.

Steps 5 and 6 stop the pipeline on failure. With `onFailure: continue` a failed build or a failing test suite would fall straight through to step 7, where `document-changes` commits — versioning implementation work that its own gates had just rejected. The cost of stopping is that step 8's first-session report does not run on a validation failure; the step results and their error messages are still recorded on the pipeline session, so the diagnosis survives without it.

### project-intake

Review an existing codebase and build its .aidd metadata: analysis, interview, profile, artifact checks, feature coverage, testing scenarios, audits, and an intake report. Writes are scoped to .aidd/. All backlog and in-progress features are held for approval.

- **Name:** project-intake
- **Metadata-only:** yes
- **Parameters:** application
- **Steps:** 9

1. `recipe-ref` - Analyze codebase (params: {"application":"{application}"}; recipeName: codebase-analysis); retryCount: 1
2. `recipe-ref` - Onboarding interview (params: {"application":"{application}"}; recipeName: interview); onFailure: continue
3. `aidd-cli` - Infer project profile (maxIterations: 1; prompt: Read the codebase analysis output and source tree for this project. Infer and write .aidd/project-profile.json describing the project's assurance profile. The file contract is strict and a file that breaks it is rejected silently...); retryCount: 1
4. `recipe-ref` - Check artifacts (params: {"application":"{application}"}; recipeName: check-artifacts); onFailure: continue
5. `recipe-ref` - Generate feature coverage (params: {"application":"{application}"}; recipeName: generate application features); retryCount: 1
6. `recipe-ref` - Generate testing scenarios (params: {"application":"{application}"}; recipeName: generate testing scenarios); retryCount: 1
7. `recipe-ref` - Run audits (params: {"application":"{application}"}; recipeName: audit (all)); onFailure: continue
8. `aidd-cli` - Park features for approval (maxIterations: 1; prompt: Park all open generated features for approval. Walk every .aidd/features/\*/feature.json in this project: for each feature whose status is 'backlog' or 'in_progress', set status t...); retryCount: 1
9. `aidd-cli` - Intake report (maxIterations: 1; prompt: Write an intake report to .aidd/reports/intake.md (overwrite if present, and record the current date inside it). Summarize: detected stack and inferred project profile; which .aid...); retryCount: 1

Feature review and audit-finding review are not separate steps: `generate application features` (step 5) already ends in a feature review, and `audit (all)` (step 7) already runs the finding review and a second feature review.

### project-reintake

Repair and refresh an existing project's .aidd metadata, then re-run project intake without duplicating features. Existing backlog and in-progress features return to waiting_approval before coding can resume.

- **Name:** project-reintake
- **Metadata-only:** yes
- **Parameters:** application
- **Steps:** 2

1. `aidd-cli` - Reconcile existing metadata (maxIterations: 1; prompt: Reconcile this project's .aidd metadata before re-ingestion. Inspect what already exists and repair it in place: (1) if .aidd/ holds artifacts that do not match the current contra...); retryCount: 1
2. `recipe-ref` - Re-run project intake (params: {"application":"{application}"}; recipeName: project-intake)

### reconcile-project-artifacts

Refresh every documented project artifact against the live application, then recalculate canonical artifact status.

- **Name:** reconcile project artifacts
- **Parameters:** application
- **Steps:** 2

1. `skill` - Refresh project artifacts (args: {application}; skillId: refresh-project-artifacts); retryCount: 1
2. `recipe-ref` - Recalculate artifact status (params: {"application":"{application}"}; recipeName: check-artifacts)

The refresh skill reads the canonical reference at runtime and records an outcome for every row,
including related documentation and deploy configuration. It updates durable artifacts from live
evidence, runs generated producers only when their inputs exist, preserves manual decisions, and
protects runtime history and secrets. The final step remains the check-only status recalculation.

### remediate-audit-findings

Run aidd to remediate audit-sourced feature files, validate, and consolidate.

- **Name:** remediate audit findings
- **Parameters:** application, filterBy (default `id`), filterValue (default `audit-*`)
- **Steps:** 3

1. `aidd-cli` - Remediate audit findings (filterBy: {filterBy}; filterValue: {filterValue})
2. `aidd-cli` - Validate completions (validate: true)
3. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)

### remediate-bugs

Run aidd to remediate bug-sourced feature files, validate, and consolidate.

- **Name:** remediate bugs
- **Parameters:** application, filterBy (default `id`), filterValue (default `remediation-*`)
- **Steps:** 3

1. `aidd-cli` - Remediate bugs (filterBy: {filterBy}; filterValue: {filterValue})
2. `aidd-cli` - Validate completions (validate: true)
3. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)

### ship-changes

Validate the working tree, document and commit the work, then publish it as a GitHub pull request.

- **Name:** ship changes
- **Parameters:** application
- **Steps:** 4

1. `skill` - Validate build (args: {application}; skillId: validate-build)
2. `skill` - Validate tests (args: {application}; skillId: validate-tests)
3. `skill` - Document and commit changes (args: {application}; skillId: document-changes)
4. `skill` - Open pull request (args: {application}; skillId: ship-pr)

This is the tail the coding recipes stop short of: they end at `document-changes`, which writes the changelog and commits in bundles but never pushes. Neither gate uses `onFailure: continue` — a failed build or test suite must stop the recipe rather than open a pull request over broken work. There is no `commit-bundles` step because `document-changes` already groups its commits the way that skill would; use `commit-bundles` on its own when you want the commits without the release documentation.

### spernakit-bump

Test, bug-fix, validate, and bump spernakit template version.

- **Name:** spernakit bump
- **Parameters:** bumpHint (default empty)
- **Steps:** 4

1. `skill` - Test spernakit (args: spernakit; skillId: spernakit-tester)
2. `recipe-ref` - Bug to feature (params: {"application":"spernakit"}; recipeName: bug2feature)
3. `recipe-ref` - Remediate bugs (params: {"application":"spernakit"}; recipeName: remediate bugs)
4. `skill` - Bump version (args: {bumpHint}; skillId: spernakit-bump)

There is no separate validation or capture step. The `spernakit-bump` skill prepares the version and
documentation, runs `bun run smoke:qc` while those changes are dirty, commits the release-branch
candidate, and then runs `bun run supertest` so capture can verify a clean committed source. After
the PR is squash-merged and the exact main commit passes CI, the skill captures that clean main
commit again before creating and pushing the tag. Any tracked fix repeats validation, commit, and
capture before the next push. There is no separate consolidate step either: `remediate bugs` ends
with one, and nothing runs between it and the version bump.

The parameter is a bump _hint_, not a version. The `spernakit-bump` skill derives the new version itself; leave `bumpHint` blank to let it size the release from `git log`, or pass `+0.0.1` / `+0.1.0` to force it. It defaults to empty, so the recipe launches without an argument.

### spernakit-dance

Align the core Spernakit template documentation, then run The Dance across the template and every derived application.

- **Name:** spernakit dance
- **Parameters:** bumpHint (default empty)
- **Steps:** 2

1. `skill` - Align template docs (skillId: spernakit-update-docs)
2. `skill` - Run The Dance (args: {bumpHint}; skillId: spernakit-dance)

This is the fleet-wide counterpart to `spernakit-release`, which propagates to exactly one `{application}`. The `spernakit-dance` skill owns the whole fan-out itself — ship the template, three-way sync each app, tester fan-out, triage, remediation, supertest and `smoke:qc` verification, per-app tagging, fleet-manifest reconciliation, dev diary, and session report — with checkpointed resume in `<applications-root>/.dance-state.json`. A recipe cannot loop, so it does not try to; it adds the one thing the skill does not do, which is bringing README, STACK, DEVELOPMENT, the fleet manifest, workspace AGENTS guidance, and the SPERNAKIT audit in line before the template ships. Leave `bumpHint` blank to let the skill size the release from `git log`, or pass `+0.0.1` / `+0.1.0` to force it.

Step 1 stops the recipe when it fails. That is deliberate even though a doc misalignment sounds minor: step 2 commits, tags, and pushes the template and every derived application, so it is the one step in this recipe whose output cannot be quietly rolled back. Alignment is the recipe's stated prerequisite for the release, and a prerequisite that can fail without consequence is not one.

### spernakit-dance-resume

Resume an interrupted dance from the .dance-state.json checkpoint in the applications root. Single step: it drops the template-docs alignment that the full spernakit-dance recipe runs first and calls the dance skill directly, leaving the checkpoint to decide what still needs doing. Always set the resume args from the checkpoint before launching: the default is a placeholder, and Part A begins with A1, which ships a new template release.

- **Name:** spernakit dance (resume)
- **Parameters:** resumeArgs (default `--resume-from A`)
- **Steps:** 1

1. `skill` - Resume The Dance (args: {resumeArgs}; skillId: spernakit-dance)

`spernakit-dance` is the wrong entry point for a run that already started. Its step 1 re-aligns the template docs, so re-running it after a crash re-checks documentation the interrupted run already shipped. This recipe drops that step and calls the skill directly, leaving the checkpoint to decide what still needs doing.

Dropping step 1 is not the same as guaranteeing no release. The dance skill still owns Part A, and `--resume-from A` re-runs A1, which ships and tags a new template — use it only when the template ship really is the unfinished part.

The `resumeArgs` default is a placeholder, not a suggestion — always set it from the checkpoint before launching. Read `<applications-root>/.dance-state.json`, pass `--resume-from` matching its `phase`, and pass `--scope`/`--pilot` agreeing with its `scope` when narrowing to a subset. The skill validates that the checkpoint's scope and bump match the flags; if either disagrees it renames the checkpoint to `.dance-state.mismatch-<timestamp>.json` and restarts the dance from Phase 0, so narrow the checkpoint first and let the flags agree with it. For the same reason, never pass a bump hint here — a hint that disagrees with the checkpoint is exactly the mismatch that discards it.

Phase 0 gates every resume regardless: it needs clean trees in every scoped app and a green spernakit `smoke:qc`, so an interrupted dance cannot resume until the app it died in is committed or reset.

### spernakit-propagate

Upgrade template, test, fix, validate, commit, and update dev diary.

- **Name:** spernakit propagate
- **Parameters:** application, version
- **Steps:** 12

1. `shell` - Refuse to propagate into the template (command: exit 1 when the project directory is named `spernakit` and contains `scripts/init.ts`)
2. `skill` - Template upgrade (args: {application} --to {version}; skillId: spernakit-template-upgrade)
3. `skill` - Classify template drift (args: {application}; skillId: spernakit-justify-diffs)
4. `skill` - Template refactor (args: {application}; skillId: spernakit-template-refactor)
5. `skill` - Test application (args: {application}; skillId: spernakit-tester)
6. `recipe-ref` - Bug to feature (params: {"application":"{application}"}; recipeName: bug2feature)
7. `recipe-ref` - Remediate bugs (params: {"application":"{application}"}; recipeName: remediate bugs)
8. `shell` - Run supertest (command: bun run supertest); onFailure: auto-fix; retryCount: 3
9. `shell` - Quality gate (command: bun run smoke:qc); onFailure: auto-fix; retryCount: 2
10. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)
11. `shell` - Commit changes (command: git add -A, then commit as `sv{version}: template upgrade for {application}` only when something is staged)
12. `skill` - Update dev diary (skillId: devdiary-update); onFailure: continue

The `version` parameter is the unprefixed template version (`3.1.16`); the recipe adds the `sv` prefix when it writes the commit message.

Step 1 exists because every later step assumes the working directory is a derived application. Launched against the template itself, step 2 would upgrade spernakit to its own version and step 11 would run `git add -A` over the release commit. The guard is the template-detection predicate the rest of the codebase uses — a directory named `spernakit` that contains `scripts/init.ts` — and it fails the run before anything is written rather than reporting the damage afterward.

Step 11 guards the commit with `git diff --cached --quiet ||` rather than committing unconditionally. Steps 5 through 9 routinely leave nothing to commit — an upgrade that found no drift, or a remediation pass that consolidated its own work — and `git commit` on an empty index exits non-zero, which would abort the pipeline before step 11 on the runs that went cleanest.

Step 3 is read-only: `spernakit-justify-diffs` classifies differences as branding, application requirements, or unjustified drift. Its findings stay in the run transcript and are not passed to step 4, `spernakit-template-refactor`. Treat that review as an operator checkpoint, not as input that constrains the refactor.

There is deliberately no `spernakit-diff-sync` step. Running one after step 3 looks justifiable as "the only skill of the three that executes backports rather than only flagging them" — which is not true: `spernakit-template-refactor` categorizes a bug fix as "port back to template" and applies the safe default of porting an enhancement to the template first, then refactoring. The two skills also divide by scope in their own contracts: `spernakit-diff-sync` is for "a specific fix, enhancement, or small file set," and `spernakit-template-refactor` for "when the goal is to assess and realign an entire derived application," which is exactly what propagate does. Running diff-sync immediately after a whole-app realignment leaves it building its worklist from `bun run check:drift` after that drift has just been eliminated. Use `spernakit-diff-sync` on its own, against a clean tree, for targeted drift work.

### spernakit-release

Full spernakit release: bump the template version, propagate it to an application, write the changelog. Steps are independent runs with no data passing between them, so the bump cannot hand its new version to the propagate step — you supply both the bump hint and the version it will produce, and they must agree.

- **Name:** spernakit release
- **Parameters:** bumpHint, version, application
- **Steps:** 4

1. `shell` - Refuse to release into the template (command: exit 1 when the project directory is named `spernakit` and contains `scripts/init.ts`)
2. `recipe-ref` - Bump spernakit (params: {"bumpHint":"{bumpHint}"}; recipeName: spernakit bump)
3. `recipe-ref` - Propagate to application (params: {"application":"{application}","version":"{version}"}; recipeName: spernakit propagate)
4. `skill` - Write changelog (args: {application}; skillId: changelog-rewrite); onFailure: continue

`bumpHint` is required here even though the standalone `spernakit-bump` recipe leaves it optional. A blank hint lets the bump skill size the release from `git log`, which makes its output unpredictable — and step 3 has to be told the version up front, because a pipeline step cannot read what an earlier step produced. Supply `+0.0.1` or `+0.1.0` and set `version` to spernakit's current `package.json` version plus that hint. If the two disagree, step 3 fails resolving a template tag that does not exist instead of quietly shipping the wrong version.

Step 1 is the same template guard `spernakit-propagate` carries, repeated here because this recipe is launched independently and its own step 2 would otherwise bump the template and then propagate that bump back into it.

### spernakit-replatform-assessment

Assess whether an existing project should be replatformed onto Spernakit, and if so produce an evidence-backed migration plan. Runs intake, judges Spernakit fit (honestly — a "do not replatform" verdict is a valid outcome), inventories features and architecture, generates a vertical-slice migration backlog with a risk/parity checklist, and stops at a human approval gate. Read-only on application code: writes only under .aidd/, and never begins the migration.

- **Name:** spernakit-replatform-assessment
- **Metadata-only:** yes
- **Parameters:** application
- **Steps:** 7

1. `recipe-ref` - Project intake (params: {"application":"{application}"}; recipeName: project-intake); retryCount: 1
2. `aidd-cli` - Spernakit fit assessment (maxIterations: 1; prompt: Assess whether this project is a good candidate to replatform onto Spernakit (the TypeScript full-stack template). Read the intake report (.aidd/reports/intake.md), the inferred p...); retryCount: 1
3. `aidd-cli` - Feature inventory (maxIterations: 1; prompt: Produce a factual feature inventory as the source of truth for migration scope. Using the features already recorded under .aidd/features/ and the actual source, write .aidd/report...); retryCount: 1
4. `aidd-cli` - Route, page, and data-model summary (maxIterations: 1; prompt: Summarize the current architecture as migration input. Write .aidd/reports/architecture-summary.md (overwrite; include today's date) covering: routes/endpoints, pages/screens, the...); retryCount: 1
5. `aidd-cli` - Migration backlog generation (maxIterations: 1; prompt: Generate a migration backlog for moving this project onto Spernakit, as feature records under .aidd/features/ plus the roadmap entries those records require. If the fit assessment (.a...); retryCount: 1
6. `aidd-cli` - Risk and parity checklist (maxIterations: 1; prompt: Write .aidd/reports/migration-risk-parity.md (overwrite; include today's date) with two sections. Risks: the main risks of this migration (data migration, auth, external integrati...); retryCount: 1
7. `aidd-cli` - Assessment summary and approval gate (maxIterations: 1; prompt: Write the top-level assessment to .aidd/reports/replatform-assessment.md (overwrite; include today's date): the Spernakit fit verdict and rationale, a short feature-inventory and ...); retryCount: 1

### test-and-remediate

Test application, convert bugs to features, remediate, and produce session report.

- **Name:** test and remediate
- **Parameters:** application
- **Steps:** 5

1. `skill` - Test application (args: {application}; skillId: tester)
2. `skill` - Convert bugs to features (args: {application}; skillId: bug2feature)
3. `skill` - Review features (args: {application}; skillId: feature-review)
4. `recipe-ref` - Remediate bugs (params: {"application":"{application}"}; recipeName: remediate bugs)
5. `aidd-cli` - Create session report (maxIterations: 1; prompt: Write a session report to .aidd/reports/test-and-remediate-<YYYYMMDD-HHMM>.md, using the current date and time for the filename. Read the per-step timing and outcome data from {sessionMetricsPath}, which the pipeline wrote for this session and refreshed after every completed step...)

Step 1 runs the stack-agnostic `tester` skill, so this recipe works against any aidd-managed application. On a Spernakit app, findings land in the application's database, so there is no `data/bugs.json` to clean up, and `remediate bugs` ends in `consolidate-features`, which removes the redundant finding files itself. Use `spernakit-tester` directly when a run should bind Spernakit's crawl gates.

### test-application-chaos

Run chaos testing via the tester skill, then convert bugs to features.

- **Name:** test application (chaos)
- **Parameters:** application
- **Steps:** 2

1. `skill` - Run chaos tester (args: {application} run an exploratory chaos pass: ignore the project scenario catalog in .aidd/testing-scenarios.md and instead probe the application through its visible controls with boundary and invalid input...; skillId: tester)
2. `recipe-ref` - Bug to feature (params: {"application":"{application}"}; recipeName: bug2feature)

The `tester` skill runs the project scenario catalog when it finds one, so a bare `{application}` here would have made this recipe a duplicate of `test-application-scenarios`. The args name the chaos pass explicitly and tell the skill to ignore the catalog.

### test-application-scenarios

Run the scripted scenarios in .aidd/testing-scenarios.md via the tester skill, then convert bugs to features.

- **Name:** test application (scenarios)
- **Parameters:** application
- **Steps:** 2

1. `skill` - Run testing scenarios (args: {application} --scenarios .aidd/testing-scenarios.md: run every scenario in the project catalog, in order; if the catalog is missing or has no scenarios, report that and stop...; skillId: tester)
2. `recipe-ref` - Bug to feature (params: {"application":"{application}"}; recipeName: bug2feature)

Step 1 delegates to the `tester` skill rather than restating server startup and bug-reporting rules in an inline prompt, so scripted scenario runs and exploratory runs file findings the same way — which is what step 2's `bug2feature` expects to read. The args pass the catalog through the skill's own `--scenarios` flag and tell it to stop rather than fall back to an exploratory pass when the catalog is missing, so a project without scenarios fails loudly instead of quietly running the wrong recipe.

### triumvirate-coding-document-changes

Run Triumvirate coding on an application, then document and commit the changes.

- **Name:** triumvirate coding and document changes
- **Parameters:** application
- **Steps:** 2

1. `aidd-cli` - Run Triumvirate coding (triumvirate: true)
2. `skill` - Document changes (args: {application}; skillId: document-changes)

### ui-redesign

Review an application's frontend UX, write a redesign plan, generate remediation feature metadata, review it, and validate the feature set.

- **Name:** ui redesign
- **Metadata-only:** yes
- **Parameters:** application
- **Steps:** 3

1. `skill` - Plan UI redesign (args: {application}; skillId: ui-redesign-planner)
2. `skill` - Review generated features (args: {application}; skillId: feature-review); retryCount: 1
3. `aidd-cli` - Validate feature metadata (validate: true)

### update-application-documentation

Review and update application documentation to match current implementation, humanize the prose, then document and commit the changes.

- **Name:** update application documentation
- **Parameters:** application
- **Steps:** 4

1. `aidd-cli` - Update docs (maxIterations: 1; prompt: Review {application}'s current codebase and every document in docs/. Correct confirmed inaccuracies in API references, architecture docs, and feature documentation...)
2. `skill` - Humanize doc prose (args: {application} docs/ - review every Markdown file and make needed prose edits in place. Leave effective prose unchanged...; skillId: humanize-docs)
3. `skill` - Review and correct docs (args: {application} docs/ - correct every inaccuracy you confirm against the current codebase...; skillId: review-or-create-doc)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

Step 2 reviews every Markdown file under `docs/` and saves only needed prose edits. Effective text stays unchanged. It preserves factual scope, technical detail, commands, and links; a style pass is not a requirement to rewrite every document.

Step 3 checks the revised documents against the implementation and corrects confirmed inaccuracies in place. Both editing steps use `apply-changes` and stop the recipe on failure. The final `document-changes` step documents and commits the resulting work; it does not apply findings left only in a review transcript.

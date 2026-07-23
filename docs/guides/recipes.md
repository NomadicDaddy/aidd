# aidd Recipes

Recipes are multi-step pipelines defined in `recipes/*.json`. Recipe ids are derived from filenames, so the JSON file does not need an explicit id field. The embedded web control panel and pipeline runner read the same files.

Supported step types are `aidd-cli`, `skill`, `shell`, and `recipe-ref`. Steps may carry `preHookJson`, `postHookJson`, `onFailure`, and `retryCount` values depending on the workflow.

Recipe launches use the selected launch target for CLI, model, and reasoning effort unless a custom step explicitly sets a legacy execution override.

Launching a recipe creates a pipeline session. A session that completes some steps but fails others resolves to a `completed_with_failures` partial-success status (with a failed-step summary) rather than a bare `failed`. Telemetry records partial successes as `failed`, since invocation events have no partial-success status.

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
| `coding-spirit-document-changes`            | coding, spirit review, remediation, and change documentation                 | 4     | application, feature                  |
| `deploy`                                    | deploy                                                                       | 8     | application, deployCommand, healthUrl |
| `feature-consolidation-document-changes`    | feature consolidation and document changes                                   | 3     | application                           |
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
| `spernakit-bump`                            | spernakit bump                                                               | 4     | version                               |
| `spernakit-dance`                           | spernakit dance                                                              | 2     | bumpHint                              |
| `spernakit-propagate`                       | spernakit propagate                                                          | 11    | application, version                  |
| `spernakit-release`                         | spernakit release                                                            | 3     | version, application                  |
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

Step 1 **refuses rather than repairs**. It exits non-zero if the working tree is dirty, because `HEAD` is the parity reference and uncommitted UI work would be invisible to the snapshot and then reported back as a gap. It also exits non-zero if `.worktrees/ui-reference` already exists, naming the manual `git worktree remove` that clears it. An earlier version force-removed that path and then `rm -rf`'d it, which would silently destroy an unrelated worktree that happened to occupy the name; a recipe step must never delete a directory it has not confirmed it owns.

Cleanup is a **post-hook on step 3**, not a trailing step, because `stepExecutor` stops the pipeline as soon as a step fails (`if (!result.ok && (step.onFailure ?? 'stop') !== 'continue') return result`), so a final cleanup step would be skipped in exactly the failure cases that leave a snapshot behind. Post-hooks run after the step completes regardless of its status and cannot fail the parent step, which is the finalization semantics this needs. Step 3 is the last step that reads the reference, so the hook is safe there. A failure in step 2 still leaves the worktree on disk — harmless, ignored, and step 1 will name it on the next run.

Step 3 is `apply-changes`, not `review-only`: `ui-parity` does not merely report: its Phase 5 writes `.aidd/features/` entries for every high- and medium-priority gap and its Phase 6 runs `roadmap:apply`. Steps 4 and 5 then review and validate that generated metadata, mirroring `ui-redesign`'s tail. Unlike `ui-redesign` this recipe is not metadata-only — step 2 rewrites frontend code.

Both skill paths in step 3 resolve against the target app, which is the working directory for every step in the pipeline.

### audit-all

Run all audits, review findings, and review features.

- **Name:** audit (all)
- **Parameters:** application
- **Steps:** 3

1. `aidd-cli` - Run all audits (auditAll: true; maxIterations: 1)
2. `skill` - Review audit findings (args: {application}; skillId: audit-finding-review)
3. `skill` - Review features (args: {application}; skillId: feature-review)

### audit-and-remediate

Run all audits, review the findings, remediate them, and produce a session report.

- **Name:** audit and remediate
- **Parameters:** application
- **Steps:** 3

1. `recipe-ref` - Run audits and review findings (params: {"application":"{application}"}; recipeName: audit (all))
2. `recipe-ref` - Remediate audit findings (params: {"application":"{application}"}; recipeName: remediate audit findings)
3. `aidd-cli` - Create session report (maxIterations: 1; prompt: Create a session report at {application}/.aidd/reports/ with a timestamp filename. Include: time taken for each step, summary of audit findings, features created, remediations app...)

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

1. `aidd-cli` - Run aidd --check-artifacts (checkArtifacts: true)

### codebase-analysis

Run codebase analysis on an application.

- **Name:** codebase-analysis
- **Parameters:** application
- **Steps:** 1

1. `skill` - Analyze codebase (args: {application}; skillId: codebase-analysis)

### coding

Default coding run using the selected launch CLI: code the selected work, review the result for spirit and intent, remediate every confirmed and applicable finding, then document and commit the changes.

- **Name:** coding
- **Parameters:** application, feature (default empty — selects normal backlog work)
- **Steps:** 4

1. `aidd-cli` - Run coding (feature: {feature})
2. `skill` - Spirit review (args: {application}; skillId: spirit)
3. `aidd-cli` - Remediate spirit findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding spirit findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

### coding-review-remediate-document-changes

Run coding, perform a deep review, remediate every confirmed and applicable finding, then document and commit the changes.

- **Name:** coding, deep review, remediation, and change documentation
- **Parameters:** application, feature (default empty — selects normal backlog work)
- **Steps:** 4

1. `aidd-cli` - Run coding (feature: {feature})
2. `skill` - Deep review (args: {application}; skillId: deepreview)
3. `aidd-cli` - Remediate deep review findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding deep review findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

### coding-spirit-coderabbit-document-changes

Run coding, review the result for spirit and intent, remediate every confirmed and applicable finding, run an independent CodeRabbit review, remediate its confirmed and applicable findings, then document and commit the changes.

- **Name:** coding, spirit and CodeRabbit reviews, remediation, and change documentation
- **Parameters:** application, feature (default empty — selects normal backlog work)
- **Steps:** 6

1. `aidd-cli` - Run coding (feature: {feature})
2. `skill` - Spirit review (args: {application}; skillId: spirit)
3. `aidd-cli` - Remediate spirit findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding spirit findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
4. `skill` - CodeRabbit review (args: {application}; skillId: coderabbit)
5. `aidd-cli` - Remediate CodeRabbit findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding CodeRabbit findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
6. `skill` - Document changes (args: {application}; skillId: document-changes)

### coding-spirit-document-changes

Run coding, review the result for spirit and intent, remediate every confirmed and applicable finding, then document and commit the changes.

- **Name:** coding, spirit review, remediation, and change documentation
- **Parameters:** application, feature (default empty — selects normal backlog work)
- **Steps:** 4

1. `aidd-cli` - Run coding (feature: {feature})
2. `skill` - Spirit review (args: {application}; skillId: spirit)
3. `aidd-cli` - Remediate spirit findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding spirit findings for {application}. Remediate every confirmed finding that is reasonable, applicable, and within the reviewed change's scope ...)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

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
8. `shell` - Tag release (`deploy-<timestamp>` git tag, skipped when the tree is dirty); onFailure: continue

The recipe refuses to start from a dirty tree, and the DEPLOYMENT audit runs before the deploy so its findings can inform the release rather than only recording it.

Step 5 exists because steps 1 through 4 can all dirty the tree after step 1 vouched for it: validation runs with `apply-changes`, so `validate-build` and `validate-tests` are expected to fix what they find. Without a second check the deploy would ship those fixes while the tag step — which runs only afterward and carries `onFailure: continue` — quietly declined to tag, leaving deployed bytes that exist in no commit and no release tag, and a pipeline that still reported success. Checking before the deploy converts that into an actionable stop: commit the fixes, then rerun.

The deploy command runs on the web host in the project directory, exactly like other shell steps. aidd never holds deploy credentials: whatever `bun run deploy` (or the override) needs must already be configured for the user account running aidd. The `deployment-readiness` skill prepares a project for this recipe (deploy script, deploy config, `.aidd/deployment.md` runbook).

### feature-consolidation-document-changes

Consolidate completed feature findings, review feature metadata, then document and release the changes.

- **Name:** feature consolidation and document changes
- **Parameters:** application
- **Steps:** 3

1. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)
2. `skill` - Review features (args: {application}; skillId: feature-review)
3. `skill` - Document changes (args: {application}; skillId: document-changes)

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

Run an interview workflow, review the responses, convert them into remediations, and summarize the resulting assertions.

- **Name:** interview
- **Parameters:** application
- **Steps:** 9

1. `skill` - Generate interview questions (args: {application}; skillId: onboarding-interview)
2. `aidd-cli` - Answer interview questions (interview: true)
3. `aidd-cli` - Review interview responses (maxIterations: 1; prompt: Review and assess the interview responses for {application}. Create or update {application}/.aidd/response-review.md with a concise assessment covering response quality, gaps, con...)
4. `skill` - Convert responses to features (args: {application}; skillId: doc2feature)
5. `aidd-cli` - Review remediation features (maxIterations: 1; prompt: Review and assess the remediation features created from the interview responses for {application}. Create or update {application}/.aidd/remediation-review.md with your findings, i...)
6. `skill` - Review features (args: {application}; skillId: feature-review)
7. `aidd-cli` - Generate assertions list (maxIterations: 1; prompt: Generate a consolidated list of the assertions established in {application}. Create or update {application}/.aidd/assertions.md with a clear, deduplicated checklist of the claims,...)
8. `aidd-cli` - Validate completions (validate: true)
9. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)

### new-app-from-idea

Take a freshly created project from idea to a validated blueprint by default; feature implementation and build validation require an explicit opt-in.

- **Name:** new-app-from-idea
- **Parameters:** application, stopBeforeImplementation
- **Steps:** 8

1. `recipe-ref` - Generate features from spec (params: {"application":"{application}"}; recipeName: generate application features); retryCount: 1
2. `skill` - Create roadmap (args: {application}; skillId: update-roadmap); retryCount: 1
3. `aidd-cli` - Validate and persist blueprint (maxIterations: 1; prompt: Validate the blueprint only. Confirm roadmap.json includes an MVP milestone; every MVP feature is backlog; every post-MVP feature is waiting_approval; all features have passes:false; and...); retryCount: 1
4. `recipe-ref` - Implement feature backlog (params: {"application":"{application}"}; recipeName: coding); retryCount: 1; when stopBeforeImplementation equals false
5. `skill` - Validate build (args: {application}; skillId: validate-build); when stopBeforeImplementation equals false
6. `skill` - Validate tests (args: {application}; skillId: validate-tests); when stopBeforeImplementation equals false
7. `skill` - Document changes (args: {application}; skillId: document-changes); when stopBeforeImplementation equals false
8. `aidd-cli` - First-session report (maxIterations: 1; prompt: Write a first-session report to .aidd/reports/first-session.md (overwrite if present; record the current date inside it). Read the per-step timing and outcome data from the .aidd/...); retryCount: 1

There is no separate feature-review step: `generate application features` already ends with one, so a second pass would re-review the features it just approved.

Steps 5 and 6 stop the pipeline on failure. They previously carried `onFailure: continue`, which let a failed build or a failing test suite fall straight through to step 7, where `document-changes` commits — versioning implementation work that its own gates had just rejected. The cost of stopping is that step 8's first-session report does not run on a validation failure; the step results and their error messages are still recorded on the pipeline session, so the diagnosis survives without it.

### project-intake

Metadata-only intake for an existing codebase: analyze, interview, infer profile, check artifacts, generate feature coverage and testing scenarios, audit, park open generated features for approval, and produce an intake report. Understands the project; never mutates app code outside .aidd/.

- **Name:** project-intake
- **Metadata-only:** yes
- **Parameters:** application
- **Steps:** 9

1. `recipe-ref` - Analyze codebase (params: {"application":"{application}"}; recipeName: codebase-analysis); retryCount: 1
2. `recipe-ref` - Onboarding interview (params: {"application":"{application}"}; recipeName: interview); onFailure: continue
3. `aidd-cli` - Infer project profile (maxIterations: 1; prompt: Read the codebase analysis output and source tree for this project. Infer and write .aidd/project-profile.json describing the project's assurance profile: stack, deployment, auth ...); retryCount: 1
4. `recipe-ref` - Check artifacts (params: {"application":"{application}"}; recipeName: check-artifacts); onFailure: continue
5. `recipe-ref` - Generate feature coverage (params: {"application":"{application}"}; recipeName: generate application features); retryCount: 1
6. `recipe-ref` - Generate testing scenarios (params: {"application":"{application}"}; recipeName: generate testing scenarios); retryCount: 1
7. `recipe-ref` - Run audits (params: {"application":"{application}"}; recipeName: audit (all)); onFailure: continue
8. `aidd-cli` - Park features for approval (maxIterations: 1; prompt: Park all open generated features for approval. Walk every .aidd/features/\*/feature.json in this project: for each feature whose status is 'backlog' or 'in_progress', set status t...); retryCount: 1
9. `aidd-cli` - Intake report (maxIterations: 1; prompt: Write an intake report to .aidd/reports/intake.md (overwrite if present, and record the current date inside it). Summarize: detected stack and inferred project profile; which .aid...); retryCount: 1

Feature review and audit-finding review are not separate steps: `generate application features` (step 5) already ends in a feature review, and `audit (all)` (step 7) already runs the finding review and a second feature review.

### project-reintake

Re-ingest an already-managed project: reconcile or repair existing .aidd metadata (stale contract artifacts) and then re-run the metadata-only project-intake pipeline, refreshing artifacts without duplicating existing features.

- **Name:** project-reintake
- **Metadata-only:** yes
- **Parameters:** application
- **Steps:** 2

1. `aidd-cli` - Reconcile existing metadata (maxIterations: 1; prompt: Reconcile this project's .aidd metadata before re-ingestion. Inspect what already exists and repair it in place: (1) if .aidd/ holds artifacts from an older contract version, refr...); retryCount: 1
2. `recipe-ref` - Re-run project intake (params: {"application":"{application}"}; recipeName: project-intake)

### reconcile-project-artifacts

Review missing or stale canonical aidd artifacts against the live project, reconcile inaccurate content within CONTEXT.md and .aidd/, then recalculate artifact status.

- **Name:** reconcile project artifacts
- **Parameters:** application
- **Steps:** 2

1. `aidd-cli` - Reconcile canonical artifacts (maxIterations: 1; writeAllowlist: [.aidd, CONTEXT.md]; prompt: Reconcile {application}'s canonical aidd artifacts against the live project. Begin with .aidd/.artifacts-check.json as status evidence only; do not treat age alone as proof that content is wrong. ...); retryCount: 1
2. `recipe-ref` - Recalculate artifact status (params: {"application":"{application}"}; recipeName: check-artifacts)

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
- **Parameters:** version
- **Steps:** 4

1. `skill` - Test spernakit (args: spernakit; skillId: spernakit-tester)
2. `recipe-ref` - Bug to feature (params: {"application":"spernakit"}; recipeName: bug2feature)
3. `recipe-ref` - Remediate bugs (params: {"application":"spernakit"}; recipeName: remediate bugs)
4. `skill` - Bump version (args: {version}; skillId: spernakit-bump)

There is no separate supertest step: the `spernakit-bump` skill runs `bun run supertest` and `bun run smoke:qc` itself, and fixes what they report, before it stamps the version or tags the release. There is no separate consolidate step either — `remediate bugs` ends with one, and nothing runs between it and the version bump.

### spernakit-dance

Align the core Spernakit template documentation, then run The Dance across the template and every derived application.

- **Name:** spernakit dance
- **Parameters:** bumpHint (default empty)
- **Steps:** 2

1. `skill` - Align template docs (skillId: update-spernakit-docs)
2. `skill` - Run The Dance (args: {bumpHint}; skillId: dance)

This is the fleet-wide counterpart to `spernakit-release`, which propagates to exactly one `{application}`. The `dance` skill owns the whole fan-out itself — ship the template, three-way sync each app, tester fan-out, triage, remediation, supertest and `smoke:qc` verification, per-app tagging, dev diary, and session report — with checkpointed resume in `<applications-root>/.dance-state.json`. A recipe cannot loop, so it does not try to; it adds the one thing the skill does not do, which is bringing README, STACK, DEVELOPMENT, and the SPERNAKIT audit in line before the template ships. Leave `bumpHint` blank to let the skill size the release from `git log`, or pass `+0.0.1` / `+0.1.0` to force it.

Step 1 stops the recipe when it fails. That is deliberate even though a doc misalignment sounds minor: step 2 commits, tags, and pushes the template and every derived application, so it is the one step in this recipe whose output cannot be quietly rolled back. Alignment is the recipe's stated prerequisite for the release, and a prerequisite that can fail without consequence is not one.

### spernakit-propagate

Upgrade template, test, fix, validate, commit, and update dev diary.

- **Name:** spernakit propagate
- **Parameters:** application, version
- **Steps:** 11

1. `skill` - Template upgrade (args: {application} --to {version}; skillId: template-upgrade)
2. `skill` - Classify template drift (args: {application}; skillId: justify-diffs)
3. `skill` - Template refactor (args: {application}; skillId: template-refactor)
4. `skill` - Test application (args: {application}; skillId: spernakit-tester)
5. `recipe-ref` - Bug to feature (params: {"application":"{application}"}; recipeName: bug2feature)
6. `recipe-ref` - Remediate bugs (params: {"application":"{application}"}; recipeName: remediate bugs)
7. `shell` - Run supertest (command: bun run supertest); onFailure: auto-fix; retryCount: 3
8. `shell` - Quality gate (command: bun run smoke:qc); onFailure: auto-fix; retryCount: 2
9. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)
10. `shell` - Commit changes (command: git add -A && git commit -m 'sv{version}: template upgrade for {application}')
11. `skill` - Update dev diary (skillId: devdiary-update); onFailure: continue

The `version` parameter is the unprefixed template version (`3.1.16`); the recipe adds the `sv` prefix when it writes the commit message.

Step 2 runs read-only on purpose: `justify-diffs` only classifies each differing hunk as branding, an app-specific requirement, or unjustified drift, and writes nothing. Its classification does **not** reach step 3 — pipeline steps are independent runs with no data passing between them, and `justify-diffs` persists nothing to disk, so its output lands in the run transcript and the operator's review, not in `template-refactor`'s prompt. Read step 2 as a checkpoint a human can inspect when a propagate run goes wrong, not as a guard that constrains the refactor.

There is deliberately no `spernakit-diff-sync` step. An earlier version ran one after step 3, justified in this guide as "the only skill of the three that executes backports rather than only flagging them" — which is not true: `template-refactor` categorizes a bug fix as "port back to template" and applies the safe default of porting an enhancement to the template first, then refactoring. The two skills also divide by scope in their own contracts: `spernakit-diff-sync` is for "a specific fix, enhancement, or small file set," and `template-refactor` for "when the goal is to assess and realign an entire derived application," which is exactly what propagate does. Running diff-sync immediately after a whole-app realignment left it building its worklist from `bun run check:drift` after that drift had just been eliminated. Use `spernakit-diff-sync` on its own, against a clean tree, for targeted drift work.

### spernakit-release

Full spernakit release: bump version, propagate to an application, write changelog.

- **Name:** spernakit release
- **Parameters:** version, application
- **Steps:** 3

1. `recipe-ref` - Bump spernakit (params: {"version":"{version}"}; recipeName: spernakit bump)
2. `recipe-ref` - Propagate to application (params: {"application":"{application}","version":"{version}"}; recipeName: spernakit propagate)
3. `skill` - Write changelog (args: {application}; skillId: changelog-rewrite); onFailure: continue

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
5. `aidd-cli` - Migration backlog generation (maxIterations: 1; prompt: Generate a migration backlog for moving this project onto Spernakit, as feature records under .aidd/features/ (create or update feature.json files only). If the fit assessment (.a...); retryCount: 1
6. `aidd-cli` - Risk and parity checklist (maxIterations: 1; prompt: Write .aidd/reports/migration-risk-parity.md (overwrite; include today's date) with two sections. Risks: the main risks of this migration (data migration, auth, external integrati...); retryCount: 1
7. `aidd-cli` - Assessment summary and approval gate (maxIterations: 1; prompt: Write the top-level assessment to .aidd/reports/replatform-assessment.md (overwrite; include today's date): the Spernakit fit verdict and rationale, a short feature-inventory and ...); retryCount: 1

### test-and-remediate

Test application, convert bugs to features, remediate, and produce session report.

- **Name:** test and remediate
- **Parameters:** application
- **Steps:** 5

1. `skill` - Test application (args: {application}; skillId: spernakit-tester)
2. `skill` - Convert bugs to features (args: {application}; skillId: bug2feature)
3. `skill` - Review features (args: {application}; skillId: feature-review)
4. `recipe-ref` - Remediate bugs (params: {"application":"{application}"}; recipeName: remediate bugs)
5. `aidd-cli` - Create session report (maxIterations: 1; prompt: Create a session report at {application}/.aidd/reports/ with a timestamp filename. Include: time taken for each step, summary of bugs found, features created, remediations applied...)

Reports live in the application's database, so there is no `data/bugs.json` to clean up, and `remediate bugs` ends in `consolidate-features`, which removes the redundant finding files itself.

### test-application-chaos

Run chaos testing via spernakit-tester, then convert bugs to features.

- **Name:** test application (chaos)
- **Parameters:** application
- **Steps:** 2

1. `skill` - Run spernakit-tester (args: {application}; skillId: spernakit-tester)
2. `recipe-ref` - Bug to feature (params: {"application":"{application}"}; recipeName: bug2feature)

### test-application-scenarios

Run testing scenarios from testing-scenarios.md, then convert bugs to features.

- **Name:** test application (scenarios)
- **Parameters:** application
- **Steps:** 2

1. `skill` - Run testing scenarios (args: {application} run the scripted scenarios recorded in .aidd/testing-scenarios.md; skillId: spernakit-tester)
2. `recipe-ref` - Bug to feature (params: {"application":"{application}"}; recipeName: bug2feature)

Step 1 delegates to the `spernakit-tester` skill rather than restating server startup and bug-reporting rules in an inline prompt, so scripted scenario runs and exploratory runs file findings the same way — which is what step 2's `bug2feature` expects to read.

### triumvirate-coding-document-changes

Run Triumvirate coding on an application, then document and release the resulting changes.

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

1. `skill` - Plan UI redesign (args: {application}; skillId: ui-redesign-planner); retryCount: 1
2. `skill` - Review generated features (args: {application}; skillId: feature-review); retryCount: 1
3. `aidd-cli` - Validate feature metadata (validate: true)

### update-application-documentation

Review and update application documentation to match current implementation.

- **Name:** update application documentation
- **Parameters:** application
- **Steps:** 4

1. `aidd-cli` - Update docs (maxIterations: 1; prompt: Review {application}'s current codebase state and update all documentation in the docs/ directory to accurately reflect the current implementation. Update API references, architec...)
2. `skill` - Humanize doc prose (args: {application} docs/ — rewrite every Markdown file under docs/ in place...; skillId: humanize-docs)
3. `skill` - Review and correct docs (args: {application} docs/ — correct every inaccuracy you confirm...; skillId: review-doc)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

Step 2 rewrites the prose an agent just produced in step 1, which is the only place in the pipeline where that happens. It runs before the review, not after: humanizing is a structural rewrite and can introduce inaccuracy, so `review-doc` needs to check the text that will actually ship. `humanize-docs` rewrites _provided text_ rather than resolving an application on its own, so the step passes an explicit `docs/` scope alongside the application name — and its args go further, demanding the rewrites be saved back over each source file. The skill's own output contract is "provide the rewritten text only," which in a pipeline step means the rewrite lands in the run transcript and disappears; nothing later in the recipe reads that transcript, so the instruction to write in place is what makes the step change anything at all.

Step 3 runs `apply-changes`, and its args carry an explicit correction request. `review-doc` is read-only by default — its process ends with "keep the review read-only unless the user explicitly requests an update" — and nothing downstream applies its findings: `document-changes` documents and commits work that already exists and states outright that it does not modify product code. Left read-only, the review would report inaccuracies into the run transcript and step 4 would then commit the very docs it had just faulted. Pipeline steps are independent runs with no data passing between them, so the correction has to happen inside the step that finds the problem — and for the same reason step 3 stops the recipe when it fails rather than continuing, since a failed correction pass followed by a successful commit ships exactly the documentation the review rejected.

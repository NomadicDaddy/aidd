# aidd Recipes

Recipes are multi-step pipelines defined in `recipes/*.json`. Recipe ids are derived from filenames, so the JSON file does not need an explicit id field. The embedded web control panel and pipeline runner read the same files.

Supported step types are `aidd-cli`, `skill`, `shell`, and `recipe-ref`. Steps may carry `preHookJson`, `postHookJson`, `onFailure`, and `retryCount` values depending on the workflow.

Recipe launches use the selected launch target for CLI, model, and reasoning effort unless a custom step explicitly sets a legacy execution override.

Launching a recipe creates a pipeline session. A session that completes some steps but fails others resolves to a `completed_with_failures` partial-success status (with a failed-step summary) rather than a bare `failed`. Telemetry records partial successes as `failed`, since invocation events have no partial-success status.

## Recipe Index

| Recipe ID                                   | Name                                          | Steps | Parameters                            |
| ------------------------------------------- | --------------------------------------------- | ----- | ------------------------------------- |
| `audit-all`                                 | audit (all)                                   | 3     | application                           |
| `audit-and-remediate`                       | audit and remediate                           | 5     | application                           |
| `audit-finding-review`                      | audit-finding-review                          | 1     | application                           |
| `bug2feature`                               | bug2feature                                   | 2     | application                           |
| `check-artifacts`                           | check-artifacts                               | 1     | none                                  |
| `codebase-analysis`                         | codebase-analysis                             | 1     | application                           |
| `coding`                                    | coding                                        | 1     | application, feature                  |
| `coding-review-remediate-document-changes`  | coding review remediate and document changes  | 4     | application                           |
| `coding-spirit-coderabbit-document-changes` | coding spirit coderabbit and document changes | 6     | application                           |
| `coding-spirit-document-changes`            | coding spirit and document changes            | 4     | application                           |
| `deploy`                                    | deploy                                        | 6     | application, deployCommand, healthUrl |
| `feature-consolidation-document-changes`    | feature consolidation and document changes    | 3     | application                           |
| `feature-review`                            | feature-review                                | 1     | application                           |
| `generate-application-features`             | generate application features                 | 2     | application                           |
| `generate-testing-scenarios`                | generate testing scenarios                    | 1     | application                           |
| `interview`                                 | interview                                     | 9     | application                           |
| `new-app-from-idea`                         | new-app-from-idea                             | 7     | application, stopBeforeImplementation |
| `project-intake`                            | project-intake                                | 11    | application                           |
| `project-reintake`                          | project-reintake                              | 2     | application                           |
| `reconcile-project-artifacts`               | reconcile project artifacts                   | 2     | application                           |
| `remediate-audit-findings`                  | remediate audit findings                      | 3     | application, filterBy, filterValue    |
| `remediate-bugs`                            | remediate bugs                                | 3     | application, filterBy, filterValue    |
| `spernakit-bump`                            | spernakit bump                                | 6     | version                               |
| `spernakit-propagate`                       | spernakit propagate                           | 9     | application, version                  |
| `spernakit-release`                         | spernakit release                             | 3     | version, application                  |
| `spernakit-replatform-assessment`           | spernakit-replatform-assessment               | 7     | application                           |
| `test-and-remediate`                        | test and remediate                            | 7     | application                           |
| `test-application-chaos`                    | test application (chaos)                      | 2     | application                           |
| `test-application-scenarios`                | test application (scenarios)                  | 2     | application                           |
| `triumvirate-coding-document-changes`       | triumvirate coding and document changes       | 2     | application                           |
| `ui-redesign`                               | ui redesign                                   | 3     | application                           |
| `update-application-documentation`          | update application documentation              | 2     | application                           |

## Recipes

### audit-all

Run all audits, review findings, and review features.

- **Name:** audit (all)
- **Parameters:** application
- **Steps:** 3

1. `aidd-cli` - Run all audits (auditAll: true; maxIterations: 1)
2. `skill` - Review audit findings (args: {application}; skillId: audit-finding-review)
3. `skill` - Review features (args: {application}; skillId: feature-review)

### audit-and-remediate

Review audit findings, remediate, and produce session report.

- **Name:** audit and remediate
- **Parameters:** application
- **Steps:** 5

1. `skill` - Review audit findings (args: {application}; skillId: audit-finding-review)
2. `skill` - Review features (args: {application}; skillId: feature-review)
3. `recipe-ref` - Remediate audit findings (params: {"application":"{application}"}; recipeName: remediate audit findings)
4. `aidd-cli` - Delete resolved audit features (maxIterations: 1; prompt: Delete resolved audit feature directories from {application}/.aidd/features/ that have been fully remediated. Only remove directories whose feature.json indicates completion.)
5. `aidd-cli` - Create session report (maxIterations: 1; prompt: Create a session report at {application}/.aidd/reports/ with a timestamp filename. Include: time taken for each step, summary of audit findings, features created, remediations app...)

### audit-finding-review

Review audit-sourced feature.json findings against the codebase and classify each as KEEP, REMOVE, CONSOLIDATE, ESCALATE, or DOWNGRADE.

- **Name:** audit-finding-review
- **Parameters:** application
- **Steps:** 1

1. `skill` - Review audit findings (args: {application}; skillId: audit-finding-review)

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

Plain coding run using the selected launch CLI. No workflow flags; aidd selects the coding prompt for onboarded projects.

- **Name:** coding
- **Parameters:** application, feature (default empty — selects normal backlog work)
- **Steps:** 1

1. `aidd-cli` - Run coding (feature: {feature})

### coding-review-remediate-document-changes

Run coding, review the result, remediate confirmed review findings, then document and release the changes.

- **Name:** coding review remediate and document changes
- **Parameters:** application
- **Steps:** 4

1. `aidd-cli` - Run coding
2. `skill` - Deep review (args: {application}; skillId: deepreview)
3. `aidd-cli` - Remediate review findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding review findings for {application}. Remediate confirmed correctness, security, type, lint, or stack-compliance issues ...)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

### coding-spirit-coderabbit-document-changes

Run coding, review the result with spirit, remediate confirmed findings, re-review with CodeRabbit, remediate confirmed findings, then document and release the changes.

- **Name:** coding spirit coderabbit and document changes
- **Parameters:** application
- **Steps:** 6

1. `aidd-cli` - Run coding
2. `skill` - Spirit review (args: {application}; skillId: spirit)
3. `aidd-cli` - Remediate spirit findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding spirit findings for {application}. Remediate confirmed correctness, security, type, lint, or stack-compliance issues ...)
4. `skill` - CodeRabbit review (args: {application}; skillId: coderabbit)
5. `aidd-cli` - Remediate CodeRabbit findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding CodeRabbit findings for {application}. Remediate confirmed correctness, security, type, lint, or stack-compliance issues ...)
6. `skill` - Document changes (args: {application}; skillId: document-changes)

### coding-spirit-document-changes

Run coding, review the result with spirit, remediate confirmed findings, then document and release the changes.

- **Name:** coding spirit and document changes
- **Parameters:** application
- **Steps:** 4

1. `aidd-cli` - Run coding
2. `skill` - Spirit review (args: {application}; skillId: spirit)
3. `aidd-cli` - Remediate spirit findings (maxIterations: 1; prompt: Review the current working tree and the immediately preceding spirit findings for {application}. Remediate confirmed correctness, security, type, lint, or stack-compliance issues ...)
4. `skill` - Document changes (args: {application}; skillId: document-changes)

### deploy

Deploy the application with its own deploy script, gated by build and test validation, verified by a health check, tagged, and audited. aidd orchestrates; the project owns the deploy command and credentials.

- **Name:** deploy
- **Parameters:** application, deployCommand (default `bun run deploy`), healthUrl (default empty — skips the health check)
- **Steps:** 6

1. `skill` - Validate build (args: {application}; skillId: validate-build)
2. `skill` - Validate tests (args: {application}; skillId: validate-tests)
3. `shell` - Deploy ({deployCommand} in the project directory)
4. `shell` - Post-deploy health check (curl with retries against {healthUrl} when provided)
5. `shell` - Tag release (`deploy-<timestamp>` git tag); onFailure: continue
6. `aidd-cli` - Deployment audit (auditNames: DEPLOYMENT; maxIterations: 1); onFailure: continue

The deploy command runs on the web host in the project directory, exactly like other shell steps. aidd never holds deploy credentials: whatever `bun run deploy` (or the override) needs must already be configured for the user account running aidd. The `deployment-readiness` skill prepares a project for this recipe (deploy script, deploy config, `.aidd/deployment.md` runbook).

### feature-consolidation-document-changes

Consolidate completed feature findings, review feature metadata, then document and release the changes.

- **Name:** feature consolidation and document changes
- **Parameters:** application
- **Steps:** 3

1. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)
2. `skill` - Review features (args: {application}; skillId: feature-review)
3. `skill` - Document changes (args: {application}; skillId: document-changes)

### feature-review

Review backlog feature.json files against the codebase for conflicts, contradictions, vagueness, duplication, and missing detail; auto-fixes all issues found.

- **Name:** feature-review
- **Parameters:** application
- **Steps:** 1

1. `skill` - Review features (args: {application}; skillId: feature-review)

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
- **Steps:** 7

1. `recipe-ref` - Generate features from spec (params: {"application":"{application}"}; recipeName: generate application features); retryCount: 1
2. `recipe-ref` - Review features (params: {"application":"{application}"}; recipeName: feature-review); retryCount: 1
3. `skill` - Create roadmap (args: {application}; skillId: update-roadmap); retryCount: 1
4. `aidd-cli` - Validate and persist blueprint (maxIterations: 1; prompt: Validate the blueprint only. Confirm roadmap.json includes an MVP milestone; every MVP feature is backlog; every post-MVP feature is waiting_approval; all features have passes:false; and...); retryCount: 1
5. `recipe-ref` - Implement feature backlog (params: {"application":"{application}"}; recipeName: coding); retryCount: 1; when stopBeforeImplementation equals false
6. `skill` - Validate build (args: {application}; skillId: validate-build); onFailure: continue; when stopBeforeImplementation equals false
7. `aidd-cli` - First-session report (maxIterations: 1; prompt: Write a first-session report to .aidd/reports/first-session.md (overwrite if present; record the current date inside it). Read the per-step timing and outcome data from the .aidd/...); retryCount: 1

### project-intake

Metadata-only intake for an existing codebase: analyze, interview, infer profile, check artifacts, generate feature coverage and testing scenarios, audit, park open generated features for approval, and produce an intake report. Understands the project; never mutates app code outside .aidd/.

- **Name:** project-intake
- **Metadata-only:** yes
- **Parameters:** application
- **Steps:** 11

1. `recipe-ref` - Analyze codebase (params: {"application":"{application}"}; recipeName: codebase-analysis); retryCount: 1
2. `recipe-ref` - Onboarding interview (params: {"application":"{application}"}; recipeName: interview); onFailure: continue
3. `aidd-cli` - Infer project profile (maxIterations: 1; prompt: Read the codebase analysis output and source tree for this project. Infer and write .aidd/project-profile.json describing the project's assurance profile: stack, deployment, auth ...); retryCount: 1
4. `recipe-ref` - Check artifacts (params: {"application":"{application}"}; recipeName: check-artifacts); onFailure: continue
5. `recipe-ref` - Generate feature coverage (params: {"application":"{application}"}; recipeName: generate application features); retryCount: 1
6. `recipe-ref` - Review features (params: {"application":"{application}"}; recipeName: feature-review); retryCount: 1
7. `recipe-ref` - Generate testing scenarios (params: {"application":"{application}"}; recipeName: generate testing scenarios); retryCount: 1
8. `recipe-ref` - Run audits (params: {"application":"{application}"}; recipeName: audit (all)); onFailure: continue
9. `recipe-ref` - Review audit findings (params: {"application":"{application}"}; recipeName: audit-finding-review); retryCount: 1
10. `aidd-cli` - Park features for approval (maxIterations: 1; prompt: Park all open generated features for approval. Walk every .aidd/features/\*/feature.json in this project: for each feature whose status is 'backlog' or 'in_progress', set status t...); retryCount: 1
11. `aidd-cli` - Intake report (maxIterations: 1; prompt: Write an intake report to .aidd/reports/intake.md (overwrite if present, and record the current date inside it). Summarize: detected stack and inferred project profile; which .aid...); retryCount: 1

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

1. `aidd-cli` - Reconcile canonical artifacts (maxIterations: 1; writeAllowlist: [.aidd, CONTEXT.md]; prompt: review the artifact-check status against the live project, update inaccurate content, and timestamp-renew still-accurate stale artifacts); retryCount: 1
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

### spernakit-bump

Test, bug-fix, validate, and bump spernakit template version.

- **Name:** spernakit bump
- **Parameters:** version
- **Steps:** 6

1. `skill` - Test spernakit (args: spernakit; skillId: spernakit-tester)
2. `recipe-ref` - Bug to feature (params: {"application":"spernakit"}; recipeName: bug2feature)
3. `recipe-ref` - Remediate bugs (params: {"application":"spernakit"}; recipeName: remediate bugs)
4. `shell` - Run supertest (command: bun run supertest); onFailure: auto-fix; retryCount: 3
5. `skill` - Consolidate features (args: spernakit; skillId: consolidate-features)
6. `skill` - Bump version (args: {version}; skillId: spernakit-bump)

### spernakit-propagate

Upgrade template, test, fix, validate, commit, and update dev diary.

- **Name:** spernakit propagate
- **Parameters:** application, version
- **Steps:** 9

1. `skill` - Template upgrade (args: {application}; skillId: template-upgrade)
2. `skill` - Template refactor (args: {application}; skillId: template-refactor)
3. `skill` - Test application (args: {application}; skillId: spernakit-tester)
4. `recipe-ref` - Bug to feature (params: {"application":"{application}"}; recipeName: bug2feature)
5. `recipe-ref` - Remediate bugs (params: {"application":"{application}"}; recipeName: remediate bugs)
6. `shell` - Run supertest (command: bun run supertest); onFailure: auto-fix; retryCount: 3
7. `skill` - Consolidate features (args: {application}; skillId: consolidate-features)
8. `shell` - Commit changes (command: git add -A && git commit -m '{version}: template upgrade for {application}')
9. `skill` - Update dev diary (skillId: devdiary-update); onFailure: continue

### spernakit-release

Full spernakit release: bump version, propagate to an application, write changelog.

- **Name:** spernakit release
- **Parameters:** version, application
- **Steps:** 3

1. `recipe-ref` - Bump spernakit (params: {"version":"{version}"}; recipeName: spernakit bump)
2. `recipe-ref` - Propagate to application (params: {"application":"{application}","version":"sv{version}"}; recipeName: spernakit propagate)
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
- **Steps:** 7

1. `skill` - Test application (args: {application}; skillId: spernakit-tester)
2. `skill` - Convert bugs to features (args: {application}; skillId: bug2feature)
3. `aidd-cli` - Clean up ingested bugs (maxIterations: 1; prompt: Delete ingested bug entries from {application}/data/bugs.json. Only remove entries that have been successfully converted to feature.json files. If the file contains only placehold...)
4. `skill` - Review features (args: {application}; skillId: feature-review)
5. `recipe-ref` - Remediate bugs (params: {"application":"{application}"}; recipeName: remediate bugs)
6. `aidd-cli` - Delete resolved remediation features (maxIterations: 1; prompt: Delete resolved remediation feature directories from {application}/.aidd/features/ that have been fully remediated. Only remove directories whose feature.json indicates completion.)
7. `aidd-cli` - Create session report (maxIterations: 1; prompt: Create a session report at {application}/.aidd/reports/ with a timestamp filename. Include: time taken for each step, summary of bugs found, features created, remediations applied...)

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

1. `aidd-cli` - Run testing scenarios (maxIterations: 1; prompt: Read {application}/.aidd/testing-scenarios.md and find the test scenarios. First check whether the app is already reachable on its configured port. If it is NOT running, start it ...)
2. `recipe-ref` - Bug to feature (params: {"application":"{application}"}; recipeName: bug2feature)

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
- **Steps:** 2

1. `aidd-cli` - Update docs (maxIterations: 1; prompt: Review {application}'s current codebase state and update all documentation in the docs/ directory to accurately reflect the current implementation. Update API references, architec...)
2. `skill` - Review docs (args: {application}; skillId: review-doc); onFailure: continue

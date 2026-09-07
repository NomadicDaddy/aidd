# aidd Project Lifecycle

This document traces a project end-to-end through aidd: from creation or intake, through
phase progression and feature-driven development, to auditing and maturity advancement. It
ties the more focused references together, naming the real entry points and linking the
canonical doc for each stage rather than restating it.

```text
create / intake ──► phase detection ──► orchestration loop ──► feature selection
                                                                      │
                          maturity ◄── audit ◄── completion ◄─────────┘
                             │
                          roadmap gating (sequences all coding)
```

## Three orthogonal axes

aidd tracks three independent dimensions. Conflating them is the most common source of
confusion, so the lifecycle is easiest to read by keeping them separate:

| Axis          | Question it answers                     | Values                                  | Owner                               |
| ------------- | --------------------------------------- | --------------------------------------- | ----------------------------------- |
| **Phase**     | What work does the runtime select next? | `initializer` / `onboarding` / `coding` | `shared/src/metadata/onboarding.ts` |
| **Maturity**  | Which project artifacts exist?          | `specified` → `shipped` (7 stages)      | `shared/src/metadata/maturity.ts`   |
| **Milestone** | How are features grouped and sequenced? | project-defined (e.g. MVP, v1.0)        | `shared/src/metadata/roadmap.ts`    |

A project can be in the `coding` phase while only at maturity stage `Planned`, working
features inside milestone `v1.0`. The axes move at different rates and for different reasons.

## 1. Creation

`createProject` (`backend/src/services/project/create.ts`) handles four creation paths
through one interface:

- **Fresh**: creates an empty directory and launches an immediate `coding` run. Fresh
  projects set `initGitAfterScaffold` so aidd initializes git (templates do their own).
- **Spernakit**: `ensureSpernakitCheckout` resolves a checkout containing the portable
  generator `scripts/init.ts` — the directory of `web.spernakitInitScript` when that is set,
  otherwise a cache under `<dataDir>/templates/spernakit`, cloned on demand from
  `web.spernakitTemplateRepo` (default `NomadicDaddy/spernakit`) at `web.spernakitTemplateRef`
  and rebuilt whenever repo or ref changes. `runSpernakitInit` then runs
  `bun <checkout>/scripts/init.ts` against the target. Neither config key is required; with
  both unset the template is simply cloned. The synthesized `spernakit` template entry is
  listing metadata only — its `initCommand` is never executed — but an explicit
  `web.templates` entry named `spernakit` overrides it and runs through the generic engine
  instead.
- **Registered template**: `runTemplateScaffold` executes the entry's `initCommand` with
  `{name}` / `{description}` / `{targetPath}` / `{root}` substitution.
- **GitHub template URL**: `runGithubTemplateClone` degit-clones `input.templateUrl`. These
  always go through create-then-ingest.

Templates carrying `postCreate: 'ingest'` (the default for third-party entries) and every
GitHub clone skip the coding run and launch the intake pipeline instead, treating the
scaffold like an existing codebase.

A user-provided spec is copied to `.aidd/spec.md` **after** scaffolding so template files
can't overwrite it, and stale SQLite rows from any prior project at the same path are purged
before launch. See [recipes.md](../reference/recipes.md) and
[project-profile.md](../reference/project-profile.md).

## 2. Intake (existing codebase)

`recipes/project-intake.json` is a 9-step, **metadata-only** recipe (`metadataOnly: true`):
it writes to `.aidd/` and never mutates application code, so production codebases can be
onboarded without risk. The steps build on each other: codebase analysis → interview → infer
`project-profile.json` → check artifacts → reverse-engineer feature coverage → generate
testing scenarios → run applicable audits → park open generated features as
`waiting_approval` → write `.aidd/reports/intake.md`. The profile inferred in step 3 is what
`filterApplicableAuditNames` uses to decide which audits actually run. Finding triage and
feature review are not separate intake steps; they run nested inside the `audit (all)`
recipe-ref (`recipes/audit-all.json`). The parking step is why intake never leaves actionable
work behind: everything it generates needs explicit human approval before an agent can pick
it up. See [artifacts.md](../reference/artifacts.md).

## 3. Phase detection

`detectInitialPhase` (`shared/src/metadata/onboarding.ts`) classifies the project on disk,
checking conditions in order:

1. **`coding`**: `isOnboardingComplete` is true, meaning `.aidd/spec.md`, `.aidd/CHANGELOG.md`,
   and a `features/` directory holding at least one **real backlog feature**. "Real" is
   load-bearing: `hasRealBacklogFeature` requires a feature that `classifyFeatureStatusType`
   calls a `feature`, so the audit findings and remediation items that intake files do not
   satisfy the check and cannot trick a first coding run into skipping onboarding.
2. **`onboarding`**: otherwise, if the directory contains any non-ignored files (ignoring
   `.git`, `.aidd`, `node_modules`, etc.), it's an existing codebase needing analysis.
3. **`initializer`**: otherwise the project is empty and needs scaffolding.

Phase drives **work selection**: initializer and onboarding phases compile phase-specific
prompts instead of selecting features. An onboarding run that reaches coding-ready advances
and the run completes. An initializer run has a second gate: it must also produce a persisted
blueprint (`readPersistedBlueprintReadiness`). Once both hold, `--stop-before-implementation`
decides what happens next — set, the run stops at the ready blueprint (this is the default the
web New Project flow sends); unset (the CLI default), `advanceBlueprintRunToCoding` switches
the same run to feature-driven work.

## 4. Orchestration loop

`runOrchestrator` (`cli/src/orchestrator/orchestrator.ts`) is the bounded state machine that
drives every run. It creates a mode handler (`coding`, `audit`, `interview`, …) and loops:
`selectWork` → `buildPromptPlan` → `executeIteration` → `finalizeIteration` →
`handlePostIteration`. The loop ends when the mode signals completion, `maxIterations` is
reached, or an early exit fires (dirty tree, stop file, an expired or too-thin wall-clock
budget, or a fatal error). The full CLI path (argv → `RunPlan` → mode handler → prompt
compiler → backend → iteration artifacts) is documented in
[execution-flow.md](../reference/execution-flow.md).

## 5. Feature selection (coding mode)

`selectWork` (`cli/src/modes/coding.ts`) returns a phase prompt for initializer/onboarding
phases; otherwise it selects a feature. Before any feature is chosen it evaluates the roadmap
gate (see §8) and, if blocked, returns a no-work result. `selectFeatureCandidates`
(`shared/src/metadata/features/query.ts`) then filters and ranks the backlog:

- **Filter**: drop features where `passes === true`, where `status === 'completed'`, where
  `status === 'waiting_approval'`, or whose dependencies aren't all satisfied. Audit findings
  are excluded unless `includeAudit` is set (see §7).
- **Sort**: `in_progress` first (so started work resumes), then ascending numeric
  `priority` (default 999), then feature directory as a stable tiebreak.

Selection is **lease-aware**, not simply top-of-list: `selectLeasableFeature`
(`cli/src/modes/coding/lease-selection.ts`) walks the ranked candidates and takes the first
one whose exclusive per-feature lease it can acquire, so a concurrent run against the same
project never gets handed a feature another live run holds. If every candidate is leased the
run reports lease-blocked; if none survive the filter at all, the result explains why
(dependency-blocked vs. pending-approval). `selectNextFeature` is the single-pick wrapper over
the same ranking, used by the non-lease-aware modes in `cli/src/modes/base.ts`. See
[feature-fields.md](../reference/feature-fields.md).

## 6. Completion and continuation

`processResult` (`cli/src/modes/coding.ts`) decides whether the run continues. It does **not
trust the agent's claim alone**: the `AIDD_RESULT` marker must name the selected feature with
`status: completed` / `passes: true`, **and** the on-disk `feature.json` must actually show
the same. If the marker claims completion but the metadata wasn't updated, the completion is
ignored and the run continues. A completion claim whose own prose admits verification was
blocked or skipped is likewise rejected, and the feature is parked as `waiting_approval`
rather than counted (`cli/src/modes/coding/completion.ts`). It then computes a work breakdown
(eligible, dependency-blocked, pending-approval, incoherent-passing, remaining); when
`eligible` is zero the run completes even if other features remain, since they're all blocked
or awaiting approval.

## 7. Audit and findings

`selectMode` (`cli/src/plan/resolve.ts`) returns `audit` mode for `--audit` and `--audit-all`;
no config setting selects it. Findings are stored as ordinary `feature.json` files whose IDs
take the shape `audit-<type>-<digits>-<slug>` — one of the alternatives allowed by the general
`FEATURE_ID_PATTERN` (`shared/src/metadata/features/types.ts`), which validates every feature
ID, not just findings. `isAuditFinding` (`shared/src/metadata/features/query.ts`) treats a
feature as a finding when it carries an `auditSource` field **or** its ID matches that prefix
regex, and normal coding excludes them so they don't interrupt planned work; dedicated
remediation recipes set `includeAudit` to make them selectable. Reports are written under
`.aidd/audit-reports/`. See
[Audits](../../frontend/content/docs/audits.md) and [audit-applicability.md](../reference/audit-applicability.md).

## 8. Roadmap gating

`evaluateRoadmapCodingGate` (`shared/src/metadata/roadmap.ts`) enforces milestone discipline
before any feature is selected. It **blocks all coding** if the roadmap is malformed: any
feature unmapped to a milestone (`unmapped_features`) or referencing a non-existent one
(`invalid_milestone_mapping`). When valid, `firstIncompleteMilestone` picks the active
milestone (the first in order with any feature where `passes !== true`) and only features in
that milestone are eligible. This makes progression sequential: a milestone must complete
before the next opens, and the gate enforces it in the orchestrator rather than via prompt
instructions. `roadmapScopedQuery` in coding mode wraps this gate. A _missing_ `roadmap.json`
is not a block: `readOrCreateRoadmap` builds one from the existing features and writes it
before the gate runs, so only a malformed mapping stops work.

## 9. Maturity ladder

`MATURITY_STAGES` (`shared/src/metadata/maturity.ts`) defines seven ordered stages by required
artifacts. The reported current stage is the **first incomplete** one — `computeMaturity`
(`backend/src/services/maturity/scoreAggregation.ts`) takes the lowest stage whose required
artifacts are not all present, so a gap low down holds the project there even when later
artifacts exist; when every stage is complete the current stage is `null`. An artifact counts
as present when it is fresh, **stale**, or skipped via `.aidd/maturity.json`: passing
`MATURITY_STALE_DAYS = 30` marks an artifact stale and surfaces it as the suggested next
action, but does not knock the stage back to incomplete.

| #   | Stage      | Required artifacts                                           |
| --- | ---------- | ------------------------------------------------------------ |
| 1   | Specified  | `spec.md`, `assertions.md`, `CONTEXT.md`                     |
| 2   | Structured | `project-structure.md`, `project.md`, `project-profile.json` |
| 3   | Mapped     | `screen-map.md`, `testing-scenarios.md`                      |
| 4   | Planned    | `roadmap.json`, ≥1 `feature.json`                            |
| 5   | Engaged    | `questions.md`, CHANGELOG entries, `docs/`                   |
| 6   | Audited    | profile-applicable audits run regularly and pass             |
| 7   | Shipped    | `.aidd/deployment.md`, deploy config, ≥1 release tag         |

The Shipped stage is evidence-based: aidd never performs the deployment itself. The deploy-config
artifact (Dockerfile, `wrangler.toml`, `.github/workflows/`, …) only applies when the project
profile's `deployment` is not `local`; the release-tag artifact is satisfied by any git tag,
detected from `.git/refs/tags`/`packed-refs` without spawning git.

`MATURITY_INVOCATIONS` maps each artifact to **how to create it**: a `skill` (e.g.
`onboarding-interview` → `questions.md`), an `audit`, a `feature`, a `manual` edit (e.g.
`project.md`), or a `profile` configuration. This makes the ladder actionable: the UI can show
a missing artifact and a button to produce it. Maturity is independent of phase and milestone.
See [artifacts.md](../reference/artifacts.md) for how each artifact is created or refreshed.

## 10. Recipe pipeline execution

Recipes (creation, intake, audit, remediation, …) run as persisted pipeline sessions. The
implementation under `backend/src/services/pipeline/` is decomposed so that adding a step type
means adding one dispatcher branch and one handler, without touching the orchestrator:

```text
PipelineService.launchRecipe()                      facade
  └─ LaunchService.launchRecipe()                   insert 'queued' session, run in background
       └─ StepExecutor.executeRecipeSteps()         iterate steps; advance completed progress
            └─ executeStep()                         one step: pre-hook → retry/auto-fix → post-hook
                 └─ StepDispatcher.dispatch()        route by stepType
                      ├─ shell        → ShellStepHandler
                      ├─ recipe-ref   → RecipeRefHandler (recurses)
                      └─ aidd-cli /
                         skill   → ManagedStepHandler → launchRun + waitForRun
```

- **Step types** are `aidd-cli | skill | recipe-ref | shell` (`backend/src/types/pipeline.ts`).
  Managed steps (`aidd-cli`, `skill`) launch a detached CLI run and block until it reaches
  a terminal state. A `skill` step forwards the skill **identity** (not a pre-compiled
  prompt) and launches in `directive` mode, so the CLI stays the single place that compiles
  the directive and stages the skill's contract dependencies into the project's `.aidd/`.
- **Failure handling** is driven by per-step policy. Each step's `onFailure`
  (`auto-fix | continue | stop`, default `stop`) plus `retryCount` sets the attempt budget;
  `auto-fix` runs a remediation pass between attempts. A failed step halts the pipeline unless
  its `onFailure` is `continue`. A session with at least one completed step and at least one
  failed step resolves to the `completed_with_failures` partial-success terminal state (with a
  failed-step summary) instead of a bare `failed`
  (`backend/src/services/pipeline/outcomeSummary.ts`).
- **Metadata-only sessions** enforce the `.aidd/`-only write boundary by snapshotting the
  worktree and reverting any out-of-bounds writes server-side, mirroring the CLI
  `--write-allowlist` guard.
- **Resume**: sessions in flight at a web restart are reconciled by `resumeStaleSessions`,
  which reconstructs nested `recipe-ref` execution, re-attaches to the deepest still-running
  managed run, and unwinds each recipe level before advancing the parent.

See [overview.md](./overview.md) (Web Control Panel) and [recipes.md](../reference/recipes.md).

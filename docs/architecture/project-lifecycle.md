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
| **Maturity**  | Which `.aidd/` artifacts exist?         | `specified` → `shipped` (7 stages)      | `shared/src/metadata/maturity.ts`   |
| **Milestone** | How are features grouped and sequenced? | project-defined (e.g. MVP, v1.0)        | `shared/src/metadata/roadmap.ts`    |

A project can be in the `coding` phase while only at maturity stage `Planned`, working
features inside milestone `v1.0`. The axes move at different rates and for different reasons.

## 1. Creation

`createProject` (`backend/src/services/project/create.ts`) handles three creation paths
through one interface:

- **Fresh**: creates an empty directory and launches an immediate `coding` run. Fresh
  projects set `initGitAfterScaffold` so aidd initializes git (templates do their own).
- **Spernakit**: `runTemplateScaffold` executes the configured init script, which copies
  the template, installs dependencies, migrates the database, and runs `smoke:qc` before
  aidd takes control. Requires `web.spernakitInitScript`; if it is unset, creation fails
  with an error saying so.
- **Third-party template**: templates carrying `postCreate: 'ingest'` skip the coding run
  and instead launch the intake pipeline, treating the scaffold like an existing codebase.

A user-provided spec is copied to `.aidd/spec.md` **after** scaffolding so template files
can't overwrite it, and stale SQLite rows from any prior project at the same path are purged
before launch. See [recipes.md](../guides/recipes.md) and
[project-profile.md](../reference/project-profile.md).

## 2. Intake (existing codebase)

`recipes/project-intake.json` is a 10-step, **metadata-only** recipe: it writes to `.aidd/`
and never mutates application code, so production codebases can be onboarded without risk.
The steps build on each other: codebase analysis → interview → infer `project-profile.json`
→ check artifacts → reverse-engineer feature coverage → feature review → testing scenarios →
run applicable audits → triage findings → write `.aidd/reports/intake.md`. The profile
inferred in step 3 determines which audits apply downstream. See
[artifacts.md](../reference/artifacts.md).

## 3. Phase detection

`detectInitialPhase` (`shared/src/metadata/onboarding.ts`) classifies the project on disk,
checking conditions in order:

1. **`coding`**: `isOnboardingComplete` is true, meaning a `features/` directory with at least
   one `feature.json`, plus `.aidd/spec.md` and `.aidd/CHANGELOG.md`.
2. **`onboarding`**: otherwise, if the directory contains any non-ignored files (ignoring
   `.git`, `.aidd`, `node_modules`, etc.), it's an existing codebase needing analysis.
3. **`initializer`**: otherwise the project is empty and needs scaffolding.

Phase drives **work selection**: initializer and onboarding phases compile phase-specific
prompts instead of selecting features. The phase can advance mid-run; an initializer run
that creates the required metadata is detected as `coding` on the next iteration and switches
to feature-driven work.

## 4. Orchestration loop

`runOrchestrator` (`cli/src/orchestrator/orchestrator.ts`) is the bounded state machine that
drives every run. It creates a mode handler (`coding`, `audit`, `interview`, …) and loops:
`selectWork` → `buildPromptPlan` → `executeIteration` → `finalizeIteration` →
`handlePostIteration`. The loop ends when the mode signals completion, `maxIterations` is
reached, or an early exit fires (dirty tree, stop file, or fatal error). The full CLI path
(argv → `RunPlan` → mode handler → prompt compiler → backend → iteration artifacts) is
documented in [execution-flow.md](../reference/execution-flow.md).

## 5. Feature selection (coding mode)

`selectWork` (`cli/src/modes/coding.ts`) returns a phase prompt for initializer/onboarding
phases; otherwise it selects a feature. Before any feature is chosen it evaluates the roadmap
gate (see §8) and, if blocked, returns a no-work result. `selectNextFeature`
(`shared/src/metadata/features/query.ts`) then filters and sorts the backlog:

- **Filter**: drop features where `passes === true`, where `status === 'waiting_approval'`,
  or whose dependencies aren't all satisfied. Audit findings are excluded unless
  `includeAudit` is set (see §7).
- **Sort**: `in_progress` first (so started work resumes), then ascending numeric
  `priority` (default 999).

The first surviving feature wins. If none survive, the result explains why
(dependency-blocked vs. pending-approval). See
[feature-fields.md](../reference/feature-fields.md).

## 6. Completion and continuation

`processResult` (`cli/src/modes/coding.ts`) decides whether the run continues. It does **not
trust the agent's claim alone**: the `AIDD_RESULT` marker must name the selected feature with
`status: completed` / `passes: true`, **and** the on-disk `feature.json` must actually show
the same. If the marker claims completion but the metadata wasn't updated, the completion is
ignored and the run continues. It then computes a work breakdown (eligible, dependency-blocked,
pending-approval, remaining); when `eligible` is zero the run completes even if other features
remain, since they're all blocked or awaiting approval.

## 7. Audit and findings

`selectMode` (`cli/src/plan/resolve.ts`) returns `audit` mode for `--audit`, `--audit-all`,
or completion-audit settings. Findings are stored as ordinary `feature.json` files marked by
an optional `auditSource` field and an ID matching `FEATURE_ID_PATTERN`
(`shared/src/metadata/features/types.ts`); audit findings take the shape
`audit-<type>-<digits>-<slug>`. `isAuditFinding` (`shared/src/metadata/features/query.ts`)
classifies them by an ID-prefix regex, and normal coding excludes them so they don't
interrupt planned work; dedicated remediation recipes set `includeAudit` to make them
selectable. Reports are written under `.aidd/audit-reports/`. See
[audits.md](../guides/audits.md) and [audit-applicability.md](../reference/audit-applicability.md).

## 8. Roadmap gating

`evaluateRoadmapCodingGate` (`shared/src/metadata/roadmap.ts`) enforces milestone discipline
before any feature is selected. It **blocks all coding** if the roadmap is malformed: any
feature unmapped to a milestone (`unmapped_features`) or referencing a non-existent one
(`invalid_milestone_mapping`). When valid, `firstIncompleteMilestone` picks the active
milestone (the first in order with any feature where `passes !== true`) and only features in
that milestone are eligible. This makes progression sequential: a milestone must complete
before the next opens, and the gate enforces it in the orchestrator rather than via prompt
instructions. `roadmapScopedQuery` in coding mode wraps this gate.

## 9. Maturity ladder

`MATURITY_STAGES` (`shared/src/metadata/maturity.ts`) defines seven ordered stages by required
artifacts. The current stage is the highest one whose artifacts all exist and are fresh
(`MATURITY_STALE_DAYS = 30`); a gap at a lower stage caps the project there even if later
artifacts exist.

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

`MATURITY_INVOCATIONS` maps each artifact to **how to create it**: an `skill` (e.g.
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
       └─ StepExecutor.executeRecipeSteps()         iterate steps; advance currentStepIndex
            └─ executeStep()                         one step: pre-hook → retry/auto-fix → post-hook
                 └─ StepDispatcher.dispatch()        route by stepType
                      ├─ shell        → ShellStepHandler
                      ├─ recipe-ref   → RecipeRefHandler (recurses)
                      └─ aidd-cli /
                         skill   → ManagedStepHandler → launchRun + waitForRun
```

- **Step types** are `aidd-cli | skill | recipe-ref | shell` (`backend/src/types/pipeline.ts`).
  Managed steps (`aidd-cli`, `skill`) launch a detached CLI run and block until it reaches
  a terminal state; an `skill` step compiles the skill directive and runs it in
  `directive` mode.
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
  which re-attaches to still-running managed runs rather than restarting completed steps.

See [overview.md](./overview.md) (Web Control Panel) and [recipes.md](../guides/recipes.md).

# aidd

aidd (AI Development Director) is a Bun/TypeScript runtime that orchestrates coding-agent sessions
against a project-local `.aidd/` contract, plus a bundled single-user web control panel for
operating that runtime over a discovered fleet of projects.

## Language

### Runtime & orchestration

**CLI**:
A pluggable execution engine that runs an agent session: one of `native`, `ollama`, `lmstudio`,
`openai`, `claude-code`, `cline`, `opencode`, `kilocode`, `codex`, `grok`. Selected with
`--cli` / config `cli`.
_Avoid_: Backend (doc-only synonym; the code and flags say "cli"), agent, engine.

**Provider**:
The OpenAI-compatible API a CLI talks to (used by the in-process `native`/`ollama`/`lmstudio` CLIs).
_Avoid_: Backend, vendor.

**Model**:
The specific model id a CLI/provider runs (e.g. defaults `model`, `codeModel`, `auditModel`).

**Launch target**:
The effective CLI/model/reasoning-effort a Run will use, resolved by the single shared resolver
(`resolveEffectiveLaunchTarget`) with precedence: per-launch override → mode model
(`auditModel`/`codeModel`) → backend-scoped model → shared model → provider default. Launch
surfaces render a launch-target control and send overrides only.
_Avoid_: Backend selection, model picker.

**Run**:
One orchestrator invocation, identified by a single `runId`, that loops over one or more Iterations
until work is exhausted or `maxIterations` is reached. The same Run may be recorded in two places
(the project-local `.aidd/runs.jsonl` ledger and the web SQLite `runs` table), but it is one concept.
_Avoid_: Session, job, execution, "managed run", "detached run" (those describe how a Run is
launched/recorded, not a separate kind).

**Iteration**:
One pass inside a Run: select work → compile prompt → invoke the CLI once → write
`.aidd/iterations/NNN.{log,json}`. A Run contains many Iterations.
_Avoid_: Step (that word belongs to Recipes), turn.

**Mode** (`AiddMode`):
The kind of work a Run performs: `director`, `audit`, `interview`, `todo`, `validate`,
`directive`, `coding` (default), or the `triumvirate` wrapper.
_Avoid_: Command, task.

**Phase**:
The project lifecycle stage auto-detected from `.aidd/` state: `initializer`, `onboarding`, or
`coding`. Distinct from Milestone and from Mode.
_Avoid_: Stage, step.

**Directive**:
A Mode where a supplied/compiled prompt (`--directive`, `--prompt`, `--skill`)
replaces the base-mode prompt instead of being appended.

**Triumvirate**:
An opt-in Run wrapper where a primary planner and secondary planner produce plans in a scratch
mirror and an overseer decides whether an execution stage mutates the real project. An optional
executor runs the execution stage (defaults to the overseer).

### Work tracking

**Feature**:
A unit of tracked work, stored as `.aidd/features/<id>/feature.json`; the directory name must equal
`id`. Has `status` (`backlog` | `in_progress` | `completed` | `waiting_approval`) and `passes`.
_Avoid_: Ticket, issue, story.

**Audit finding**:
A Feature produced by an Audit, distinguished by an `audit-` id prefix plus `auditSource` and
`auditSeverity`. Skipped by normal `coding` selection.
_Avoid_: Bug, defect (use only inside `auditSource`).

**Remediation**:
A Feature capturing follow-up fix work, distinguished by a `remediation-` id prefix.

**Milestone**:
A named roadmap bucket defined in `.aidd/roadmap.json` that groups Features; every Feature
directory must map to one. Milestone names are internal planning labels (aidd's own roadmap uses
`MVP`, `v1.0`, `v2.0`, and `v3.0`), not product releases: only `v3.0` corresponds to a public
version. A roadmap axis, unrelated to Phase or Maturity stage.
_Avoid_: Release, sprint, phase.

**Dependency**:
A Feature id that must have `passes: true` before a dependent Feature may be selected.

### Project assessment (three independent axes)

**Phase**:
The runtime work-selection state auto-detected from `.aidd/` content: `initializer`, `onboarding`,
or `coding`. Decides what kind of work a Run selects. (Also see Directive/`--in-progress` as a
"phase modifier": a flag that retargets coding-like work, not a Phase value.)
_Avoid_: Stage, Maturity, Milestone.

**Maturity stage**:
One of seven ordered project-readiness steps (`specified → structured → mapped → planned → engaged →
audited → shipped`), computed per Project from artifact presence/freshness and surfaced as a UI badge with a
recommended next action.
_Avoid_: Phase, Milestone.

**Project Profile** (assurance profile):
`.aidd/project-profile.json` describing a Project across ten enums. Six say how exposed it is and
therefore how much hardening it needs (`bucket`, `authMode`, `criticality`, `dataSensitivity`,
`deployment`, `externalIntegrations`); four say what it produces and therefore which gates apply to
it at all (`shipsContainerImage`, `hasCliBinary`, `publishesReleaseArchives`,
`derivesFromTemplate`). Inferred from project signals until written explicitly via the Profile tab.
Drives audit applicability and risk posture (`requiresFullHardening`, `isLowExposureLocalProfile`);
only the six exposure enums move posture.
_Avoid_: Maturity, Director profile.

> Phase, Maturity stage, and Milestone are three orthogonal axes. Do not conflate them.

### Director

**Director**:
The fleet-level advisor persona. It runs Cycles that emit Suggestions and hosts **Director Chat**,
which orchestrates supervised work rather than only reading: see its own entry below. Configured by
a **Director profile**.
_Avoid_: Coordinator, planner, supervisor.

**Director profile**:
The saved configuration for the Director persona (CLI, model, reasoning effort, role, behavior
instructions). A distinct concept from the Project (assurance) Profile.

**Cycle**:
One Director run that analyzes the fleet and produces Suggestions. Scheduled automatic Cycles
can also launch eligible Suggestions when bounded auto-launch is enabled.
_Avoid_: Scan, sweep.

**Suggestion**:
A persisted Director recommendation, either project-scoped (launchable into a Run) or fleet-wide
(advisory, not directly launchable).
_Avoid_: Recommendation, tip, proposal.

**Director Chat**:
A persisted conversation with the Director that runs as an autonomous tool-calling agent: within
a turn it can inspect the fleet and orchestrate work (launch Runs, start Cycles, act on
Suggestions). By default it never edits project files itself (mutations flow through supervised
Runs), but an opt-in setting (`director.chat.allowFileEdits`) lets it edit files directly. Falls
back to a read-only, text-only turn when no tool-calling (OpenAI-compatible) provider is configured.

### Web control panel

**Control panel**:
The bundled single-user web surface (`--web`) for operating the runtime. Intentionally excludes any
multi-user auth/RBAC/tenancy surface.
_Avoid_: Dashboard (that's one page), app, portal.

**Fleet**:
The set of projects discovered under the configured application roots.
_Avoid_: Workspace, tenancy.

**Project**:
A discovered application directory with its own `.aidd/` metadata that aidd can drive.

**Creation lane**:
One of four project-intake paths on the Projects page: Create Fresh, From Template, From GitHub,
or Ingest Existing. From Template uses a registered scaffold; From GitHub starts from a GitHub
template repository with fresh history.
_Avoid_: Wizard, import (the lane is "Ingest Existing").

**Terminal pane**:
The embedded terminal docked at the bottom of the control panel (toggled with ``Ctrl+` ``),
backed by persistent PTY sessions that survive navigation; supports shell picker, restart,
resize, and maximize.
_Avoid_: Console, shell tab.

**Recipe**:
A file-backed multi-step template (`recipes/*.json`); its id is its filename. Steps are
`aidd-cli`, `skill`, `shell`, or `recipe-ref`.
_Avoid_: Workflow, script, macro.

**Pipeline Session**:
A persisted execution of a Recipe (one per launch, even for one-step recipes), recording per-Step
results and links to the Runs its steps spawn.
_Avoid_: Pipeline run, job.

**Skill**:
Catalog entries (`skills/`) that can be launched as a one-shot pipeline session or referenced
as Recipe Steps; each has usage telemetry. Bundled skills merge with managed imports from
`data/skills/`, which are persistent user state and execute identically.

**Audit**:
An audit definition in `audits/` describing a class of review (e.g. `SECURITY`, `DEAD_CODE`,
`TECHDEBT`). Running one in `audit` Mode produces Audit findings and an Audit report
(`.aidd/audit-reports/<AUDIT>-YYYY-MM-DD.md`).

**Interview**:
A Mode/flow that asks project-onboarding questions; answers persist to `.aidd/responses.md` /
`.aidd/responses/` (absent until answers exist).

**Direct AI**:
A config-gated capability (`directAi`) where the web backend calls an OpenAI-compatible Provider
in-process for lightweight "surfaces" (Director cycle, Chat, project recommendation) and returns
structured JSON instead of spawning a Run/CLI.
_Avoid_: Native (that's a CLI), inline AI.

## Relationships

- A **Run** contains one or more **Iterations**; each Iteration invokes one **CLI**.
- A **CLI** (native/ollama/lmstudio) talks to a **Provider** running a **Model**.
- A **Run** operates in exactly one **Mode**.
- A **Director** **Cycle** emits zero or more **Suggestions**; a project-scoped Suggestion
  launches a **Run**.
- A **Feature** belongs to exactly one **Milestone** and may depend on other **Features**.
- An **Audit finding** and a **Remediation** are both kinds of **Feature**.
- A **Recipe** launches one **Pipeline Session**; a Session runs ordered **Steps**, some of which
  spawn **Runs**.
- A **Fleet** is many **Projects**; each Project has its own `.aidd/` and its own Features.
- Each **Project** has one **Project Profile**, one computed **Maturity stage**, and an auto-detected
  **Phase**: three independent assessments.

## Example dialogue

> **Dev:** "When the **Director** finishes a **Cycle**, does it start work?"
> **Domain expert:** "A manually started Cycle produces **Suggestions** for you to review. A
> scheduled automatic Cycle can launch eligible project-scoped Suggestions when auto-launch is
> enabled, subject to its configured limits. Fleet-wide Suggestions remain advisory."
>
> **Dev:** "And one Run is one agent call?"
> **Domain expert:** "One **Run** is one orchestrator invocation. Inside it the orchestrator loops
> **Iterations**: each Iteration picks a **Feature**, compiles a prompt, and calls the **CLI**
> once. A Run can burn through several Features across several Iterations."
>
> **Dev:** "So `--cli native`: native is a CLI even though nothing spawns?"
> **Domain expert:** "Right. 'CLI' is the headword for the execution engine regardless of whether
> it spawns an external tool. native, ollama, and lmstudio run in-process against a **Provider**; the others
> shell out. Docs sometimes say 'backend'; same thing."

## Flagged ambiguities

- **CLI vs backend** - docs say "backend", flags/config say `cli`. Resolved: **CLI** is canonical;
  "backend" is a doc-only synonym.
- **Run** - overloaded across the CLI invocation, the `.aidd/runs.jsonl` ledger, and the SQLite
  `runs` table. Resolved: there is one concept, **Run** (the orchestrator invocation). The two
  ledgers are just recordings; "managed run" / "detached run" describe launch/recording mechanics,
  not separate kinds.
- **Phase** - Resolved: project-lifecycle **Phase** (initializer/onboarding/coding) is the canonical
  meaning; the prompt-compiler's "mode or phase prompt" reuses these values, and `--in-progress` is a
  "phase modifier" flag, not a Phase value.
- **Profile** - Resolved into two distinct entities: **Project Profile** (assurance) and
  **Director profile**. "Audit profile mapping" is not a third entity; it maps the Project
  Profile to applicable Audits.
- **Phase vs Maturity stage vs Milestone** - three orthogonal axes; explicitly not the same lifecycle
  at different resolutions.

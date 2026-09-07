# Glossary

The core vocabulary of aidd. These terms are used consistently throughout the control panel.

## Runtime and orchestration

CLI
: the execution engine that runs an agent session — `claude-code`, `cline`, `codex`, `grok`, `kilocode`, `lmstudio`, `native`, `ollama`, `openai`, or `opencode`. Chosen per run or by default.
Provider
: the compatible AI API used by the in-process engines and Direct AI. External CLI engines shell out to their own tools, which manage their provider connection.
Model
: the specific model id an execution engine or Direct AI call uses.
Run
: one orchestrator invocation, identified by a single run id, that loops over iterations until work is exhausted.
Iteration
: one pass inside a run: select work, compile a prompt, invoke the configured agent workflow, and record the result. Retries and Triumvirate stages can make more than one agent call within an iteration.
Mode
: the kind of work a run performs: `coding` (default), `audit`, `directive`, `director`, `interview`, `todo`, `triumvirate`, or `validate`.
Source
: which surface a run arrived through — `cli`, `director`, `scheduled`, or `web`. It says which door, not who opened it.
Initiator
: whether a person asked for a run, or aidd started it on its own — `operator` or `automatic`. Recorded at launch, never inferred afterwards; a run from before aidd recorded it reads as unknown rather than as either answer.
Triumvirate
: an opt-in run wrapper where primary and secondary planners work in a scratch mirror, an overseer selects the plan, and an execution agent applies it to the run's working tree.

## Work tracking

Feature
: a unit of tracked work with a status (`backlog`, `in_progress`, `completed`, `waiting_approval`).
Audit finding
: a feature produced by an audit, carrying its source and severity. Skipped by normal coding selection unless an audit-finding sweep is explicitly requested.
Remediation
: a feature capturing follow-up fix work.
Milestone
: a named roadmap bucket that groups features. A milestone name may resemble a version, but does not by itself prove that a product release was published.
Dependency
: a feature that must be complete before a dependent feature can be selected.

## Project assessment

Phase
: the auto-detected work-selection state: `initializer`, `onboarding`, or `coding`.
Maturity stage
: an ordered readiness step (`specified`, `structured`, `mapped`, `planned`, `engaged`, `audited`, `shipped`) computed from artifacts.
Project profile
: the assurance profile describing how much hardening a project needs; drives audit applicability.

These are independent assessments. Every project has a phase and a profile; maturity records the status of all seven stages, and has no current stage after every stage is complete.

## Director

Director
: the fleet-level advisor that runs cycles and hosts a chat.
Cycle
: one Director analysis pass that produces suggestions.
Suggestion
: a persisted recommendation, either project-scoped (launchable) or fleet-wide (advisory).

## Control panel

Fleet
: the set of projects discovered under your application roots.
Project
: a discovered application directory with its own `.aidd/` metadata.
Recipe
: an ordered workflow template containing one or more steps. Stored recipes use a JSON filename as their id; a one-shot skill launch uses a synthetic recipe.
Pipeline session
: one execution of a recipe, recording per-step results and links to the runs its steps spawn.
Skill
: a catalog entry runnable on its own or referenced as a recipe step.
Audit
: a definition describing a class of review that produces findings and a report.
Direct AI
: an opt-in capability where aidd calls a provider in-process for configured surfaces such as Director chat and cycles, project advice, or run summaries, instead of launching another agent run.

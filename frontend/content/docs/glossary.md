# Glossary

The core vocabulary of aidd. These terms are used consistently throughout the
control panel.

## Runtime and orchestration

- **CLI**: the execution engine that runs an agent session (for example
  `native`, `ollama`, `lmstudio`, `claude-code`, `cline`). Chosen per run or by default.
- **Provider**: the compatible API a CLI talks to. The in-process engines run
  against a provider; the others shell out to external tools.
- **Model**: the specific model id a CLI runs.
- **Run**: one orchestrator invocation, identified by a single run id, that
  loops over iterations until work is exhausted.
- **Iteration**: one pass inside a run: select work, compile a prompt, call
  the CLI once, record the result. A run contains many iterations.
- **Mode**: the kind of work a run performs: `coding` (default), `audit`,
  `interview`, `validate`, `directive`, and more.
- **Triumvirate**: an opt-in run wrapper where planners draft in a scratch
  mirror and an overseer decides whether the real project changes.

## Work tracking

- **Feature**: a unit of tracked work with a status (`backlog`,
  `in_progress`, `completed`, `waiting_approval`).
- **Audit finding**: a feature produced by an audit, carrying its source and
  severity. Skipped by normal coding selection.
- **Remediation**: a feature capturing follow-up fix work.
- **Milestone**: a named roadmap bucket that groups features.
- **Dependency**: a feature that must be complete before a dependent feature
  can be selected.

## Project assessment

- **Phase**: the auto-detected work-selection state: `initializer`,
  `onboarding`, or `coding`.
- **Maturity stage**: an ordered readiness step (`specified`, `structured`,
  `mapped`, `planned`, `engaged`, `audited`, `shipped`) computed from
  artifacts.
- **Project profile**: the assurance profile describing how much hardening a
  project needs; drives audit applicability.

These three are independent axes; a project has one of each at all times.

## Director

- **Director**: the fleet-level advisor that runs cycles and hosts a chat.
- **Cycle**: one Director analysis pass that produces suggestions.
- **Suggestion**: a persisted recommendation, either project-scoped
  (launchable) or fleet-wide (advisory).

## Control panel

- **Fleet**: the set of projects discovered under your application roots.
- **Project**: a discovered application directory with its own `.aidd/`
  metadata.
- **Recipe**: a file-backed, multi-step template; its id is its filename.
- **Pipeline session**: one execution of a recipe, recording per-step results
  and links to the runs its steps spawn.
- **Skill**: a catalog entry runnable on its own or referenced as a
  recipe step.
- **Audit**: a definition describing a class of review that produces findings
  and a report.
- **Direct AI**: an opt-in capability where the control panel calls a provider
  in-process for lightweight surfaces instead of spawning a run.

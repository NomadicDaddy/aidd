# Runs

A **run** is one orchestrator invocation against a project.

Inside a run, aidd loops over **iterations**: each iteration selects work, compiles a prompt, invokes the configured agent workflow, and records the result. A normal iteration usually makes one backend call, but corrective write-guard retries and Triumvirate planning stages can make several. This page launches and tracks standalone runs and **pipeline sessions** (recipe or skill launches), split into **Active** and **History** sections.

## Launching a run

1. Choose a target **project**.
2. Pick a **mode**: the default `coding` mode picks up tracked features, while other modes cover audits, todo sweeps, Triumvirate planning, and validation.
3. Optionally adjust the **launch target** (the engine, model, and reasoning effort resolved from your configured defaults) or pass extra arguments.
4. Launch.

## Modes at a glance

coding
: work through tracked features (the default).
audit
: run an audit definition and produce findings.
todo
: sweep TODO-style work items.
triumvirate
: plan with a primary and secondary planner plus an overseer before execution; configure all four roles in the dedicated panel.
validate
: verify the project against its contract.

Project interviews are answered on the project's **Interview** tab rather than launched from this page. Directive runs come from the global directive launcher, skills, and recipes.

## Launch target

Below the mode picker, the launch-target control shows the effective engine, model, and reasoning effort for this launch and where each came from (project or global config, mode default, or your override). Anything you change here applies to this launch only; leave a field untouched to follow your configured defaults.

## Live console

The live console streams output when the run has a readable log. That includes web-launched runs and CLI-launched runs whose heartbeat advertises a log path; older or CLI-only records without one remain visible but cannot show a transcript. Active runs also report liveness, so a healthy long-running run keeps showing progress. If a run appears stuck, you can **stop** it (graceful) or **kill** it (forced).

## Pipelines in the feed

Recipe and skill launches appear as **Pipeline** or **Skill** rows alongside runs. Expand a multi-step pipeline to see its steps; a step that spawned a run can stream into the live console, and the **Report** link opens the session's full step-by-step report. Runs that belong to a pipeline are shown inside their session rather than as separate top-level rows.

## Run history

History shows finished runs from the last 24 hours plus retained recipe and skill sessions. Run records persist in the control panel database, while project-local `.aidd/runs.jsonl` and iteration artifacts provide durable project evidence; both survive control-panel restarts. Search and the status, kind, mode, initiator, and project filters narrow the combined feed.

Some terminal runs offer **Continue** when they stopped at an initializer handoff or a wall-clock limit with work remaining. A manual continuation starts a new coding run under the same launch target and records **Operator**; an enabled auto-chain records the follow-up as **Automatic**.

## Who started a run

Every run records an **initiator** as well as a source. The source is which surface the run arrived through; the initiator is whether anybody asked for it. A run started by hand — from this page, the CLI, an MCP call, a request to the Director, or **Run now** on a scheduled task — is recorded as **Operator**. A run aidd started on its own — a scheduled occurrence the timer fired, a catch-up sweep, an automatic Director cycle, an auto-chained follow-up — is recorded as **Automatic**. The two are separate questions on purpose: a task you press **Run now** on arrives through the scheduler, which is the surface, and is still your work, which is the initiator. Each run row carries the badge, the toolbar filters on it, and the detail panel says it in a sentence, so "everything aidd did while I was away" is one selection.

A run with no recorded initiator shows **Unknown**. That is deliberate: the value was never written for that run, and guessing one from the shape of the record would put an invention into your run history.

## Triumvirate runs

The optional **Triumvirate** wrapper uses primary and secondary planners to draft plans in separate scratch mirrors. An overseer synthesizes the choice, and an execution role applies the selected plan. Only execution runs in the real project; when no execution role is configured, it falls back to the overseer's target. Configure the defaults in [Settings](/settings). <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

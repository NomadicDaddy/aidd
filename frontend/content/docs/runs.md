# Runs

A **run** is one orchestrator invocation against a project. Inside a run, aidd
loops over **iterations**: each iteration selects work, compiles a prompt,
calls the chosen CLI once, and records the result. This page launches runs and
tracks every execution — standalone runs and **pipeline sessions** (recipe
launches) alike — split into an **Active** section and a **History** section.

## Launching a run

1. Choose a target **project**.
2. Pick a **mode**: the default `coding` mode picks up tracked features, while other modes cover audits, todo sweeps, Triumvirate planning, and validation.
3. Optionally adjust the **launch target** (the engine, model, and reasoning effort resolved from your configured defaults) or pass extra arguments.
4. Launch.

## Modes at a glance

- **coding**: work through tracked features (the default).
- **audit**: run an audit definition and produce findings.
- **todo**: sweep TODO-style work items.
- **triumvirate**: plan with a primary and secondary planner plus an overseer before execution; configure all four roles in the dedicated panel.
- **validate**: verify the project against its contract.

Interviews are launched from project onboarding rather than this page, and
directive runs come from skills and recipes.

## Launch target

Below the mode picker, the launch-target control shows the effective engine,
model, and reasoning effort for this launch and where each came from
(project or global config, mode default, or your override). Anything you
change here applies to this launch only; leave a field untouched to follow
your configured defaults.

## Live console

While a run is active, the live console streams its output. Each run reports a
liveness signal; a healthy long-running run keeps reporting progress. If a run
appears stuck, you can **stop** it (graceful) or **kill** it (forced).

## Pipelines in the feed

Recipe launches appear as **pipeline** rows alongside runs. Expand a pipeline
to see its steps; a step that spawned a run can stream into the live console,
and the **Report** link opens the session's full step-by-step report. Runs that
belong to a pipeline are shown inside their session rather than as separate
top-level rows.

## Run history

Completed runs persist with their mode, timing, outcome, and links to any work
they produced. The history is metadata-backed, so it survives restarts of the
control panel.

## Triumvirate runs

The optional **Triumvirate** wrapper has a primary and secondary planner draft
plans in a scratch mirror, with an overseer deciding whether the real project
is changed. Configure its defaults in **Settings**.

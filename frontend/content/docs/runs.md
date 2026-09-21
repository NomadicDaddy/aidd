# Runs

A **run** is one orchestrator invocation against a project.

Inside a run, aidd loops over **iterations**: each iteration selects work, compiles a prompt, invokes the configured agent workflow, and records the result. A normal iteration usually makes one backend call, but corrective write-guard retries and Triumvirate planning stages can make several. This page launches and tracks standalone runs and **pipeline sessions** (recipe or skill launches), split into **Active** and **History** sections.

## Launching a run

1. Choose a target **project**.
2. Pick a **mode**: the default `coding` mode picks up tracked features, while other modes cover audits, todo sweeps, Triumvirate planning, and validation.
3. Optionally adjust the **launch target** (the engine, model, and reasoning effort resolved from your configured defaults) or pass extra arguments.
4. Launch.

If `web.maxConcurrentRuns` or `web.maxConcurrentRunsPerProject` is already full, the launch still succeeds and the new row shows as **Queued**. It starts automatically (oldest first) when a running managed launch finishes, is stopped, or is killed. Queued rows do not start a process, do not create a worktree, and do not occupy a ceiling slot. CLI-launched runs are outside this queue.

Stop on a queued row cancels it without spawning anything; the next eligible queued run is then admitted.

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

The live console streams output when the run has a readable log. That includes web-launched runs and CLI-launched runs whose heartbeat advertises a log path; older or CLI-only records without one remain visible but cannot show a transcript. A recent heartbeat shows that the run is still reporting liveness; check the console to see what it is doing. If a run appears stuck, you can **stop** it (graceful) or **kill** it (forced).

## Pipelines in the feed

Recipe and skill launches appear as **Pipeline** or **Skill** rows alongside runs. Expand a multi-step pipeline to see its steps; a step that spawned a run can stream into the live console, and the **Report** link opens the session's full step-by-step report. Runs that belong to a pipeline are shown inside their session rather than as separate top-level rows.

## Reviewing a result

Read the console or pipeline report alongside the file changes and validation output. For coding work, aidd checks the agent's completion result against the selected feature's recorded status and `passes` value. Recognized reports of blocked or skipped required verification can leave the feature in `waiting_approval`.

These checks do not independently prove that every required test ran or that the changes are correct. Review the evidence before accepting the work.

## Run history

History shows finished runs from the last 24 hours plus retained recipe and skill sessions. Run records persist in the control panel database, while project-local `.aidd/runs.jsonl` and iteration artifacts provide durable project evidence; both survive control-panel restarts. Search and the status, kind, mode, initiator, and project filters narrow the combined feed.

Some terminal runs offer **Continue** when they stopped at an initializer handoff or a wall-clock limit with work remaining. A manual continuation starts a new coding run under the same launch target and records **Operator**; an enabled auto-chain records the follow-up as **Automatic**.

## Who started a run

The **source** records where a run arrived from. The **initiator** records whether it was explicitly requested or started automatically:

Operator
: a launch from this page, the CLI, an MCP call, a request to the Director, or **Run now** on a scheduled task.
Automatic
: a timer-fired scheduled occurrence, a catch-up sweep, an automatic Director cycle, or an auto-chained follow-up.

For example, pressing **Run now** on a task records a scheduled source and an Operator initiator. The run row and detail panel show the initiator, and the toolbar lets you filter by it.

A run with no recorded initiator shows **Unknown**. aidd does not infer a missing value from other run details.

## Triumvirate runs

The optional **Triumvirate** wrapper uses primary and secondary planners to draft plans in separate scratch mirrors. An overseer combines the plans, and an execution role applies the selected plan in the run's working tree. When no execution role is configured, execution uses the overseer's target. Configure the defaults in [Settings](/settings). <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

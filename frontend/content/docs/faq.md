# FAQ

Answers to common questions about running and operating aidd.

## Why isn't my project showing up?

A folder is discovered only when it contains an `.aidd/` directory **and** lives under a configured application root. Open [Settings](/settings), confirm the root is <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> listed, check that your ignored-folders patterns don't match the project, and keep the project within the root's two-level discovery depth. You can also point an application root directly at a single project.

## Where is my data stored?

Run history, pipeline sessions, and telemetry live in the control panel's local database. Per-project work is recorded under each project's own `.aidd/` directory (features, run ledger, artifacts, audit reports). The panel is single-user and runs on your machine.

## A run looks stuck — what do I do?

Open [Runs](/runs) and check the run's liveness indicator. A healthy long run keeps <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> reporting progress. If it's genuinely stalled, use **stop** for a graceful end or **kill** to force it. Run history is preserved either way.

## What's the difference between a run and a pipeline session?

A **run** is one orchestrator invocation that loops iterations of agent work. A [pipeline session](/docs/pipelines) is one execution of a multi-step <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> [recipe](/docs/recipes); some of its steps may each spawn their own run. See the <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> [Glossary](/docs/glossary) for full definitions. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

## Can the Director change my code by itself?

Not by default. [Director chat](/docs/director) orchestrates work through supervised runs <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> rather than editing files directly. There is an opt-in setting that allows direct file edits if you explicitly want it.

## Do I need a model provider configured?

It depends on the execution engine. External CLI engines use that CLI's own authentication. The native-family engines call an OpenAI-compatible provider directly: configure credentials for a remote provider, or run the selected Ollama or LM Studio server and model locally.

**Direct AI** uses the provider settings in [Settings](/settings). Director chat uses <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> tool calling when that Direct AI surface has a compatible provider. Otherwise it makes a read-only, text-only turn through Direct AI when enabled, or through the Director profile's configured engine when Direct AI is disabled.

## How do I update aidd?

The control panel reports its version on the [About](/about) page. Update the aidd <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> source checkout by stopping the backend, pulling or checking out the desired tag, running `bun install`, and starting the backend again. For an archive install, extract the next tagged source archive and run `bun install` there. The panel serves the frontend build from the checkout you started.

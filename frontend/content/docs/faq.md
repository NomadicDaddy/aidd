# FAQ

Answers to common questions about running and operating aidd.

## Why isn't my project showing up?

A folder is discovered only when it contains an `.aidd/` directory **and** lives under a configured application root. Open [Settings](/settings), confirm the root is <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> listed, check that your ignored-folders patterns don't match the project, and keep the project within the root's two-level discovery depth. You can also point an application root directly at a single project.

## Where is my data stored?

Run history, pipeline sessions, and telemetry live in the control panel's local database. Per-project work is recorded under each project's own `.aidd/` directory (features, run ledger, artifacts, audit reports). The panel is single-user and runs on your machine.

Local storage does not mean every workflow stays offline. Prompts and relevant project content go to the AI backend you choose, which may use a remote provider. The optional Telegram integration exchanges messages with Telegram. aidd does not send usage telemetry to its maintainers or tracking services.

## What should I do if a run looks stuck?

Open [Runs](/runs) and check the liveness indicator and console output. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> A recent heartbeat tells you the run is still reporting, not whether it is making useful progress. If it's stalled, use **stop** for a graceful end or **kill** to force it. Run history is preserved either way.

## What's the difference between a run and a pipeline session?

A **run** is one orchestrator invocation that loops iterations of agent work. A [pipeline session](/docs/pipelines) is one execution of a <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> [recipe](/docs/recipes), which can have one or more steps. Some steps spawn their own run. See the <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> [Glossary](/docs/glossary) for full definitions. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

## Can the Director change my code by itself?

[Director chat](/docs/director) can launch supervised runs that change project files. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> Direct file and shell access from chat is a separate, off-by-default permission.

Unattended work is also opt-in. The built-in Director fleet cycle is paused by default, and **Suggestion Auto-Launch** is separately disabled. If you enable both, automatically scheduled cycles can launch eligible suggestions within your configured limits. Manual cycles, including **Run now**, do not auto-launch suggestions.

## Do I need a model provider configured?

It depends on the execution engine. External CLI engines use that CLI's own authentication. The native-family engines call an OpenAI-compatible provider directly: configure credentials for a remote provider, or run the selected Ollama or LM Studio server and model locally.

**Direct AI** uses the provider settings in [Settings](/settings). Director chat uses <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> tool calling when that Direct AI surface has a compatible provider. Otherwise it makes a read-only, text-only turn through Direct AI when enabled, or through the Director profile's configured engine when Direct AI is disabled.

## How do I update aidd?

The control panel reports its version on the [About](/about) page. Update the aidd <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> source checkout by stopping the backend, pulling or checking out the desired tag, running `bun install`, and starting the backend again. For an archive install, extract the next tagged source archive and run `bun install` there. The panel serves the frontend build from the checkout you started.

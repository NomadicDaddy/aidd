# FAQ

Common questions about running and operating the aidd control panel.

## Why isn't my project showing up?

A folder is discovered only when it contains an `.aidd/` directory **and** lives
under a configured application root. Open **Settings**, confirm the root is
listed, and check that your ignored-folders patterns don't match the project.

## Where is my data stored?

Run history, pipeline sessions, and telemetry live in the control panel's local
database. Per-project work is recorded under each project's own `.aidd/`
directory (features, run ledger, artifacts, audit reports). The panel is
single-user and runs on your machine.

## A run looks stuck - what do I do?

Open **Runs** and check the run's liveness indicator. A healthy long run keeps
reporting progress. If it's genuinely stalled, use **stop** for a graceful end
or **kill** to force it. Run history is preserved either way.

## What's the difference between a run and a pipeline session?

A **run** is one orchestrator invocation that loops iterations of agent work. A
**pipeline session** is one execution of a multi-step **recipe**; some of its
steps may each spawn their own run. See the **Glossary** for full definitions.

## Can the Director change my code by itself?

Not by default. The Director chat orchestrates work through supervised runs
rather than editing files directly. There is an opt-in setting that allows
direct file edits if you explicitly want it.

## Do I need an external provider configured?

For normal runs, your chosen CLI handles model access. The in-process **Direct
AI** capability and the Director chat's tool-calling turns need a compatible
provider configured in **Settings**; without one, those surfaces fall back to
read-only behavior.

## How do I update aidd?

The control panel reports its version on the **About** page. Update the aidd
package the same way you installed it; the panel serves the build that shipped
with the running version.

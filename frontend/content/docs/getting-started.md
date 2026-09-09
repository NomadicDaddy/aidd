# Getting started

Use the aidd control panel to manage agent work across your local projects. This guide takes you from an empty panel to your first run.

## What aidd does

aidd coordinates coding-agent sessions using each project's local `.aidd/` metadata: its tracked work, configuration, and supporting documents. The control panel lets you discover a **fleet** of projects, launch and monitor work, and review what the agents produced.

## 1. Point aidd at your code

Open [Settings](/settings) and add one or more **application roots**: the folders aidd <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> should scan for projects. Discovery checks directories up to two levels below each root for an `.aidd/` folder. You can also point a root directly at one project; aidd uses that root when it finds no child projects beneath it.

If a folder isn't showing up, confirm it lives under a configured root and isn't matched by your ignored-folders list (also in Settings).

## 2. Review your fleet

Open [Projects](/projects) to see everything aidd discovered. Each project shows its <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> maturity stage and a recommended next action. Click any project to open its detail view: features, run history, artifacts, and profile.

For a brand-new project, use **New Project** to create a fresh project or start from a template. **Stop before implementation** is enabled by default, so the creation flow stops after committing its scaffold, reviewed feature backlog, and roadmap for you to inspect before starting feature work. Use **Import Existing** to bring an existing codebase under aidd management through metadata-only intake.

## 3. Launch your first run

Open [Runs](/runs), pick a target project, choose a mode (the default `coding` mode <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> picks up tracked features), and launch. The live console streams output as the run loops through its iterations. You can stop or kill an active run at any time.

Before accepting the result, read the run output, review the file changes, and check the validation evidence. A completion status isn't a substitute for that review.

## 4. Let the Director advise you

Open [Director](/director) to run an analysis **cycle** across your whole fleet. It <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> emits **suggestions**, some launchable as recipe pipelines or supervised runs and some advisory. The Director chat can also inspect the fleet and orchestrate work for you.

## The terminal pane

Press {{kbd:Ctrl+`}} anywhere to toggle the docked terminal at the bottom of the panel. Sessions are backed by persistent PTYs, so a shell keeps running while you navigate between pages. The pane header lets you open tabs, choose the shell for new tabs, restart the active session, and maximize the pane. Drag the pane's top edge to resize it.

## Keyboard shortcuts

Press {{kbd:?}} on any page for the full cheatsheet. The essentials:

{{kbd:Ctrl+K}} / {{kbd:⌘+K}}
: open the command palette (Command+K on macOS).
{{kbd:Ctrl+`}}
: toggle the terminal pane.
{{kbd:g d}} / {{kbd:g p}} / {{kbd:g r}}
: go to Dashboard / Projects / Runs.
{{kbd:/}}
: focus the current page's search or filter.
{{kbd:r}}
: refresh the current page's data.
{{kbd:d}}
: open the directive launcher.
{{kbd:c}}
: open Director chat.

## Where to go next

- [Skills](/skills): reusable tasks you can launch on their own. [Recipes](/recipes) combine skills and other steps into workflows. <!-- check-docs-allow: app routes rendered by the panel, not files on disk; check-docs resolves link targets against the filesystem -->
- [Audits](/audits): structured reviews that turn findings into tracked work. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
- [Telemetry](/telemetry): usage trends across skills, recipes, and runs. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

Most pages have a **?** button in the header that opens focused help for that screen. A few simpler pages (**Docs** itself, which you're reading, plus the **Diary** and **About**) don't, because they're either reference views or this documentation. The [Glossary](/docs/glossary) explains the core terms, and the [FAQ](/docs/faq) covers <!-- check-docs-allow: app routes rendered by the panel, not files on disk; check-docs resolves link targets against the filesystem --> common questions.

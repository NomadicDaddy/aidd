# Getting started

Welcome to the aidd control panel, the web surface for operating the aidd
runtime across all of your local projects. This page walks you from an empty
panel to your first run.

## What aidd does

aidd orchestrates coding-agent sessions against a project's local `.aidd/`
contract. The control panel lets you discover a **fleet** of such projects,
launch and monitor work, and review what the agents produced, all from one
place on your own machine.

## 1. Point aidd at your code

Open [Settings](/settings) and add one or more **application roots**: the folders aidd <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
should scan for projects. Any directory containing an `.aidd/` folder under a
root is discovered automatically as a **project**.

If a folder isn't showing up, confirm it lives under a configured root and
isn't matched by your ignored-folders list (also in Settings).

## 2. Review your fleet

Open [Projects](/projects) to see everything aidd discovered. Each project shows its <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
maturity stage and a recommended next action. Click any project to open its
detail view: features, run history, artifacts, and profile.

For a brand-new project, aidd can run an **interview** to capture onboarding
answers, then move the project into its coding phase.

## 3. Launch your first run

Open [Runs](/runs), pick a target project, choose a mode (the default `coding` mode <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
picks up tracked features), and launch. The live console streams output as the
run loops through its iterations. You can stop or kill an active run at any
time.

## 4. Let the Director advise you

Open [Director](/director) to run an analysis **cycle** across your whole fleet. It <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
emits **suggestions**, some launchable as recipe pipelines or supervised runs and some advisory. The
Director chat can also inspect the fleet and orchestrate work for you.

## The terminal pane

Press **Ctrl+`** anywhere to toggle the docked terminal at the bottom of the
panel. Sessions are backed by persistent PTYs, so a shell keeps running while
you navigate between pages. The pane header lets you pick a shell, restart the
session, resize the pane, and maximize it.

## Keyboard shortcuts

Press **?** on any page for the full cheatsheet. The essentials:

- **Ctrl+K**: open the command palette.
- **Ctrl+`**: toggle the terminal pane.
- **g d** / **g p** / **g r**: go to Dashboard / Projects / Runs.
- **/**: focus the current page's search or filter.
- **r**: refresh the current page's data.
- **d**: open the directive launcher.
- **c**: open Director chat.

## Where to go next

- [Recipes](/recipes) and [Skills](/skills): reusable, multi-step automation. <!-- check-docs-allow: app routes rendered by the panel, not files on disk; check-docs resolves link targets against the filesystem -->
- [Audits](/audits): structured reviews that turn findings into tracked work. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
- [Telemetry](/telemetry): usage trends across skills, recipes, and runs. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->

Most pages have a **?** button in the header that opens focused help for that
screen. A few simpler pages (**Docs** itself, which you're reading, plus the
**Diary** and **About**) don't, because they're either reference views or this
documentation. The [Glossary](/docs/glossary) defines every core term, and the [FAQ](/docs/faq) covers <!-- check-docs-allow: app routes rendered by the panel, not files on disk; check-docs resolves link targets against the filesystem -->
common questions.

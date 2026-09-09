# Projects

Projects lists the managed application directories aidd discovered under your configured roots. The Spernakit template checkout can be hidden from this list through Settings. Projects is the entry point for inspecting and driving any single project.

## Discovery

A folder becomes a project when it contains an `.aidd/` directory and lives under an application root (set in [Settings](/settings)). Discovery is automatic; there <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem --> is no manual registration step.

## Project intake

The **New Project** and **Import Existing** buttons open a shared intake panel with four lanes:

Create Fresh
: scaffold a minimal project under a configured root and launch the initial aidd run.
From Template
: scaffold from a registered template (configured in Settings; Spernakit or any third-party generator), then run the golden path or metadata-only intake. aidd always synthesizes a built-in Spernakit entry when you have not registered one of your own, so this lane is always available.
From GitHub
: clone a GitHub repository as a template with fresh history, then run metadata-only intake.
Ingest Existing
: bring an existing directory under aidd management without scaffolding over it. **Ingest** creates the metadata skeleton and launches the metadata-only project-intake pipeline; **Register only** creates the skeleton without launching a pipeline or run.

## Maturity stage

Each project shows its progress through `specified`, `structured`, `mapped`, `planned`, `engaged`, `audited`, and `shipped`. The current stage is computed from which artifacts exist and how fresh they are, and it comes with a recommended next action. Once all seven stages are complete, the project has no current stage. The final `shipped` stage requires evidence: a deployment runbook, deploy configuration (when the project profile says the app leaves the local machine), and at least one tagged release.

## Project detail

Click a project to open its detail view. Its tabs:

Overview
: phase, maturity, and key counts.
Features
: the tracked units of work and their status.
Milestones
: the roadmap milestones and which features each one carries.
Dependencies
: the feature dependency graph.
Runs
: history of runs launched against this project.
History
: recent activity for the project.
Repository
: git status and branch information.
Code
: a searchable, read-only tree of git-tracked files with file previews. On narrow layouts, the tree starts collapsed.
Diary
: the project's development diary entries.
Notes
: a free-form markdown scratch pad saved to `.aidd/notes.md`.
Artifacts
: assertion-check health plus the broader inventory of maturity evidence.
Interview
: onboarding questions, outstanding responses, and captured answers.
Reports
: bug and feature reports filed from the panel.
Audits
: audit reports and findings for this project.
Profile
: the assurance profile that drives audit applicability.
Management
: project-level maintenance actions.

## Tips

- The maturity badge recommends the next action based on the project's recorded evidence.
- Use the project detail Runs tab to see history scoped to just that project, versus the global [Runs](/runs) page. <!-- check-docs-allow: app route rendered by the panel, not a file on disk; check-docs resolves link targets against the filesystem -->
- **Profile Matrix** (linked from the Projects page header) shows every project's assurance profile side by side.
- Toggle between card and table views from the page header.

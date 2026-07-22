# Projects

Projects lists every application directory aidd discovered under your
configured roots. It's the entry point for inspecting and driving any single
project.

## Discovery

A folder becomes a project when it contains an `.aidd/` directory and lives
under an application root (set in **Settings**). Discovery is automatic; there
is no manual registration step.

## Project intake

The **New Project** and **Import Existing** buttons open a shared intake panel
with up to three lanes:

- **Create Fresh**: scaffold a minimal project under a configured root and
  launch the initial aidd run.
- **From Template**: scaffold from a registered template (configured in
  Settings; Spernakit or any third-party generator), then run the golden path
  or metadata-only intake. This lane appears only when a template is
  registered.
- **Ingest Existing**: bring an existing directory under aidd management
  without scaffolding over it; onboarding generates the spec and feature
  backlog first.

## Maturity stage

Each project shows a maturity badge, one of `specified`, `structured`,
`mapped`, `planned`, `engaged`, `audited`, or `shipped`. The stage is computed
from which artifacts exist and how fresh they are, and it comes with a
recommended next action. The final `shipped` stage is evidence-based — a
deployment runbook, deploy configuration (when the project profile says the
app leaves the local machine), and at least one tagged release.

## Project detail

Click a project to open its detail view. Its tabs:

- **Overview**: phase, maturity, and key counts.
- **Features**: the tracked units of work and their status.
- **Dependencies**: the feature dependency graph.
- **Runs**: history of runs launched against this project.
- **History**: recent activity for the project.
- **Repository**: git status and branch information.
- **Code**: a browsable file tree (collapsed by default) with file previews.
- **Diary**: the project's development diary entries.
- **Artifacts**: generated documents and their freshness.
- **Interview**: onboarding answers, once captured.
- **Reports**: bug and feature reports filed from the panel.
- **Audits**: audit reports and findings for this project.
- **Profile**: the assurance profile that drives audit applicability.
- **Management**: project-level maintenance actions.

## Tips

- The maturity badge's recommended action is the fastest way to know what to do
  next for a given project.
- Use the project detail Runs tab to see history scoped to just that project,
  versus the global **Runs** page.
- **Profile Matrix** (linked from the Projects page header) shows every
  project's assurance profile side by side.
- Toggle between card and table views from the page header.

---
name: feature-coverage-audit
description: 'Audit implemented features for natural documentation and complete `.aidd` feature metadata. Use to check documentation and feature parity, backfill missing feature JSON, or assess whether the app can be reconstructed from its recorded artifacts.'
metadata:
    aidd-category: audit-remediation
    aidd-contracts: humanize-docs
---

# Feature Coverage Audit

Audit one project at a time to answer whether implemented functionality is covered by both
human-readable documentation and `.aidd/features/*/feature.json` blueprints.

This workflow is semantic and evidence-driven. It sits above `feature-review`, which reviews
existing backlog specs, and above aidd's own end-of-run feature-contract check, which validates
feature metadata syntax and roadmap contracts.

## Usage

```text
feature-coverage-audit [app-name-or-path]
feature-coverage-audit --report-only
feature-coverage-audit --apply
feature-coverage-audit --include-completed
```

## Modes

- Default: analyze one project, auto-fix only high-confidence safe gaps, and report ambiguous gaps.
- `--report-only`: do not write files. Produce the coverage report only.
- `--apply`: explicit alias for the default safe auto-fix behavior. It does not authorize risky changes.
- `--include-completed`: include completed and verified feature JSONs in spec-completeness review, not only coverage matching.

Never run a fleet sweep from this skill. For cross-app work, run this skill separately per app or create a dedicated sweep command.

## Phase 1: Resolve Target

1. Resolve the target from the argument, current directory, or `<applications-root>/AGENTS.md` app name.
2. Verify the target is local and contains `.aidd/features/`.
3. Read project-local instructions first: `AGENTS.md`, `CLAUDE.md`, `.aidd/project.md`, `docs/template/STACK.md`, and `docs/template/DEVELOPMENT.md` when present.
4. Capture baseline dirty state with `git status --short`. Dirty repos are allowed, but later report which files this workflow touched.

## Phase 2: Inventory Implemented Capabilities

Build a concise implementation inventory from code and app-owned docs. Prefer concrete artifacts over inferred product language.

Scan these surfaces when they exist:

- Frontend routes, pages, navigation, tabs, command palette entries, shared page components, stores, hooks, and API modules.
- Backend route files, route registration, services, guards/plugins, scheduled jobs, CLI commands, workers, and config loaders.
- Database schemas, migrations, seed data, and data access services.
- Existing app-specific docs that describe live behavior.

Group related artifacts into implemented capabilities. A capability should be user-facing,
operator-facing, or reconstruction-relevant. Do not count private helper functions as features
unless they expose a distinct app behavior through a route, screen, CLI, workflow, or documented contract.

For each capability, record:

- `capability`
- `implementationEvidence` with file paths, route paths, component names, command names, or schema tables
- `ownerSurface`: frontend, backend, data, CLI, workflow, docs-only, or mixed
- `confidence`: high, medium, or low

## Phase 3: Inventory Natural Documentation

Read likely maintained documentation surfaces:

- `README.md`, root `CHANGELOG.md`, and `docs/**`
- `.aidd/*.md`, especially `assertions.md`, `project-structure.md`, `screen-map.md`, `testing-scenarios.md`, `questions.md`, and `.aidd/CHANGELOG.md`
- `.aidd/roadmap.json` only as planning metadata, not natural documentation by itself

Natural documentation coverage means a careful human can understand what the capability does
without reading code. A changelog-only mention is partial coverage unless it describes current
behavior clearly enough for reconstruction.

## Phase 4: Inventory Feature JSONs

Read every `.aidd/features/*/feature.json`, including backlog, in-progress, completed, and verified features.

For each feature JSON, record:

- `id`, `title`, `description`, `category`, `status`, `passes`, `dependencies`, `spec`, `affectedFiles`, `notes`, and `spernakit_version`
- whether it is template-owned (`spernakit_version` present)
- whether the directory name matches `id`
- whether the spec is complete enough to reconstruct the implemented capability

Template-owned features are read-only. They can count as coverage, but must not be modified.

## Phase 5: Build Coverage Matrix

Create one row per implemented capability:

| Capability | Implementation Evidence | Natural Docs | Feature JSON | Spec Completeness | Confidence | Disposition |
| ---------- | ----------------------- | ------------ | ------------ | ----------------- | ---------- | ----------- |

Use exactly these dispositions:

- `covered`: implementation, natural docs, and feature JSON are aligned.
- `doc-gap`: implementation and feature JSON exist, but natural documentation is missing or too thin.
- `feature-json-gap`: implementation exists, but no matching feature JSON exists.
- `spec-gap`: matching feature JSON exists, but its description/spec/affected files are incomplete, vague, or stale.
- `stale-doc`: docs describe behavior that the current implementation contradicts or no longer exposes.
- `ambiguous`: boundaries or intent are unclear enough that automatic edits would be risky.

Matching rules:

- Match by behavior and artifacts first, not by title similarity alone.
- Treat frontend and backend halves as one capability when they form one end-to-end user path.
- Split rows only when capabilities can be documented and reconstructed independently.
- If one feature JSON covers several tightly coupled implementation artifacts, keep one row and list all evidence.

## Phase 6: Safe Auto-Fix Policy

In default mode and `--apply` mode, auto-fix only high-confidence gaps.

Safe feature JSON creation is allowed only when all are true:

- The capability is implemented and reachable through concrete code evidence.
- No existing feature JSON already covers the behavior.
- The feature boundary is clear.
- The created record can be marked `"status": "completed"` and `"passes": true` honestly.
- The spec can be written as concrete `Verify ...` statements using existing artifacts.

Use this minimum shape for new feature JSONs:

```json
{
	"affectedFiles": [],
	"category": "<detected category>",
	"createdAt": "<ISO timestamp>",
	"dependencies": [],
	"description": "<natural description of implemented behavior>",
	"id": "<clean-kebab-slug>",
	"notes": [
		"Backfilled by feature-coverage-audit from current implementation evidence on <YYYY-MM-DD>."
	],
	"passes": true,
	"priority": 3,
	"spec": "1. Verify ...",
	"status": "completed",
	"title": "<human title>",
	"updatedAt": "<ISO timestamp>"
}
```

Safe feature JSON tightening is allowed when the current behavior is directly evident from code or docs:

- Expand terse `description`, `summary`, `spec`, `affectedFiles`, `dependencies`, or `notes`.
- Preserve `id`, `createdAt`, `justFinishedAt`, `spernakit_version`, and template-owned fields.
- Do not change `status` or `passes` unless the existing feature JSON directly contradicts the implementation evidence and no product decision is needed.

Safe natural-doc updates are allowed only when appending a concise current-capability bullet to an existing maintained section such as `README.md` Features, Current Capabilities, or an equivalent project overview. Do not create new broad docs, rewrite large sections, or update changelogs for historical claims. Appended bullets and expanded description prose follow the humanize-docs style contract (`.aidd/skills/humanize-docs/SKILL.md`, staged; or `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo): plain natural language, no em-dashes, no AI filler (delve, leverage, robust, seamless), describe what the capability does rather than praising it.

Never auto-fix:

- ambiguous feature boundaries
- missing product intent
- contradictions between code and docs
- large documentation rewrites
- template-owned feature JSONs
- roadmap restructuring beyond mapping newly created feature IDs when `.aidd/roadmap.json` already exists

## Phase 7: Roadmap And Validation

If new feature JSON files are created and `.aidd/roadmap.json` exists:

1. Add each new feature ID to the current milestone, defined as the existing milestone with the highest numeric `priority`.
2. Preserve existing roadmap structure and feature assignments.
3. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace.

Do not shell into the aidd installation to validate. aidd re-validates every feature record when the run ends and reports any contract issues with the run. That covers the project this run targets; for another project, report the metadata as unvalidated instead of reaching outside the workspace.

## Phase 8: Report

Always report in markdown. When files are changed, also write:

```text
<target>/.aidd/reports/feature-coverage-audit-YYYY-MM-DD.md
```

Report these sections:

1. Coverage summary counts by disposition.
2. Auto-fixes applied, with file paths.
3. Remaining gaps requiring a product decision.
4. Ambiguous feature boundaries.
5. Roadmap assignments changed, and any record you could not make valid — aidd reports the roadmap-apply and feature-contract results itself with the run.
6. Recommended follow-up commands, usually `feature-review` for spec quality or `document-changes` for release documentation.

## Completion Criteria

- Every implemented capability in the inventory appears in the coverage matrix.
- All high-confidence safe gaps are fixed unless `--report-only` is set.
- Ambiguous or risky gaps are reported, not silently changed.
- Every feature record written reads back as valid JSON with the required fields.
- Final report names all files changed and any validation failures.

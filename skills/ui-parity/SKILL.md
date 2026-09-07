---
name: ui-parity
description: "Compare two versions of an application's UI and create a structured gap report plus feature.json entries for actionable regressions. Use when checking a redesign, migration, or rewrite for missing, degraded, or relocated behavior."
metadata:
    aidd-category: audit-remediation
---

# UI Parity Comparison

Compare a **reference** source (old version, backup, pre-rebuild snapshot, or documented
route/screenshot baseline) against the **current** codebase to identify UI feature gaps and generate
structured feature files.

## Usage

```
ui-parity
ui-parity <reference-path> <current-path>
```

## Inputs

When invoked, determine the two inputs to compare:

1. **Reference source**: the old/source-of-truth frontend tree or a documented route/screenshot
   baseline with enough page-level evidence to support findings
2. **Current codebase**: the version being audited for gaps

If paths are provided as arguments, use them directly. Otherwise:

- Check the current working directory for `.aidd/project.md` containing a
  `ui_parity_reference:` directive
- If not found, return a usage error requiring both paths

## Workflow

### Phase 1: Inventory Both Inputs

For **each** input, systematically catalog every supported UI surface. When the reference is a
route/screenshot baseline, identify the baseline artifacts and limit findings to behavior they
actually show.

#### Routes & Pages

- Find all route definitions (React Router, Next.js app/pages, etc.)
- For each route: path pattern, page component file, required auth/role

#### Per-Page Features

For each page, catalog:

- **Data display**: Tables, lists, cards (column definitions, pagination, virtual scroll)
- **Data interaction**: Search inputs, filter dropdowns, sort controls, favorites
- **Forms**: Create/edit modals, inline forms (field names, validation rules, dynamic fields)
- **Actions**: Buttons, bulk operations, import/export, confirmations
- **Visualizations**: Charts, graphs, metric cards, progress indicators
- **States**: Loading skeletons, empty states, error boundaries
- **Integration**: API endpoints called from the frontend
- **Access and input**: Role-based visibility, keyboard shortcuts, and accessibility behavior

#### Navigation & Layout

- Navbar/sidebar menu items and structure
- Tab navigation, breadcrumbs
- Layout modes (full-width, sidebar, responsive)

#### Shared Components

- Reusable components in `components/shared/`, `components/ui/`
- Which pages use each component

### Phase 2: Compare and Classify

For each item in the reference inventory, classify its status:

| Classification | Meaning                                             |
| -------------- | --------------------------------------------------- |
| **MISSING**    | Exists in reference, absent in current              |
| **DEGRADED**   | Exists in both but current is significantly reduced |
| **RELOCATED**  | Moved but functionally equivalent                   |
| **NEW**        | Exists only in current                              |

**DEGRADED** means the current version:

- Removed search/filter/sort capabilities
- Removed form fields or validation
- Replaced rich components with plain elements (chart → text, SQL editor → textarea)
- Removed interactive features (favorites, bulk operations)
- Removed role-based feature gating
- Removed keyboard or accessibility behavior

### Phase 3: Present Gap Summary

Output a structured markdown summary organized by priority:

```markdown
## UI Parity Gap Analysis

### High Priority (MISSING/DEGRADED - core features)

| Page | Gap | Classification | Severity |
| ---- | --- | -------------- | -------- |

### Medium Priority (MISSING/DEGRADED - enhancements)

| Page | Gap | Classification | Severity |
| ---- | --- | -------------- | -------- |

### Relocated (no action needed)

| Item | Old Location | New Location |
| ---- | ------------ | ------------ |

### New in Current (context only)

| Item | Description |
| ---- | ----------- |
```

### Phase 4: Select and Generate Features

Generate feature files for all High and Medium priority gaps by default. Honor any inclusion or
exclusion filters supplied in the invocation. Before creating a record, scan every existing
`.aidd/features/*/feature.json`; skip a gap already covered by an open record (`passes` is not
`true` and `status` is not `completed`).

### Phase 5: Generate Feature Files

For each selected gap, create a feature.json in `.aidd/features/`:

**Directory naming**: Use clean descriptive kebab-case slug: no prefix, no date stamp (e.g., `reports-search-filtering/`)

**Feature.json format**:

```json
{
	"affectedFiles": ["{project-relative paths supported by the comparison}"],
	"category": "{established project UI category, or UI when none exists}",
	"createdAt": "{ISO_TIMESTAMP}",
	"dependencies": ["{existing_feature_ids_if_applicable}"],
	"description": "{detailed description: what the old version had, what's missing in current}",
	"id": "{descriptive-slug}",
	"notes": ["UI parity source: {reference-path-or-baseline}"],
	"passes": false,
	"priority": 1,
	"spec": "1. Verify ...\n2. Verify ...\n...",
	"status": "backlog",
	"title": "{concise title}",
	"updatedAt": "{ISO_TIMESTAMP}"
}
```

Use the comparison severity to decide which gaps become records:

| Gap Severity                               | Default action                      |
| ------------------------------------------ | ----------------------------------- |
| Critical (core features, CRUD, workflows)  | Generate                            |
| High (search, filters, charts, parameters) | Generate                            |
| Medium (shared components, virtual scroll) | Generate                            |
| Low (polish, micro-interactions)           | Report only unless explicitly asked |

When a roadmap exists, `priority` mirrors the numeric priority of the assigned milestone; do not
rank the feature independently. Without a roadmap, use 1 for Critical/High, 2 for Medium, and 3 for
Low.

**Spec writing rules**:

- Numbered list of "Verify" statements
- Each statement = one testable behavior
- Be specific: element names, API endpoints, user interactions
- Include happy path and edge cases

**Dependency rules**:

- Link to existing page features (e.g., `reports-page`)
- Link to existing backend service features if API support needed
- Only reference features that actually exist in `.aidd/features/`

### Phase 6: Roadmap and Validate

If `.aidd/roadmap.json` exists in the current codebase, assign each generated feature to the
current milestone: the first incomplete milestone in ascending numeric priority, or the last
existing milestone when all are complete. Merge each mapping into `roadmap.features` without
discarding existing dependency data. Never create a new milestone for parity gaps.

Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace.

Do not shell into the aidd installation to validate. aidd re-validates every feature record when the run ends and reports any contract issues with the run. That covers the project this run targets; for another project, report the metadata as unvalidated instead of reaching outside the workspace. Read back every feature you generated and confirm it is valid JSON with the required fields.

## Example Session

```
User: ui-parity <applications-root>/<reference-app> <applications-root>/<current-app>

Skill: [Explores both codebases...]

Skill: ## UI Parity Gap Analysis

### High Priority
| Page | Gap | Classification | Severity |
|------|-----|---------------|----------|
| Reports | Search, filtering, favorites, tags | MISSING | High |
| Report Detail | Dynamic parameter form & execution results | MISSING | Critical |
| Tables | DDL viewer and sample data explorer | MISSING | High |
| Custom Query | SQL syntax highlighting & validation | MISSING | High |
...

Skill: [Creates feature.json files for all 11 High and Medium gaps, assigns roadmap metadata, and
reads every generated file back]
Created 11 features in .aidd/features/
Run-end metadata reconciliation reports validation and roadmap results.
```

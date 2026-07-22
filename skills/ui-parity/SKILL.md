---
name: ui-parity
description: "Compare two versions of an application's UI and create a structured gap report plus feature.json entries for actionable regressions. Use when checking a redesign, migration, or rewrite for missing, degraded, or relocated behavior."
metadata:
    aidd-category: audit-remediation
---

# UI Parity Comparison

Compare a **reference** codebase (old version, backup, or pre-rebuild snapshot) against the **current** codebase to identify UI feature gaps and generate structured feature files.

## Usage

```
ui-parity
ui-parity <applications-root>/myapp.old <applications-root>/myapp
```

## Inputs

When invoked, determine the two codebases to compare:

1. **Reference codebase**: the "old" or "source of truth" version
2. **Current codebase**: the version being audited for gaps

If paths are provided as arguments, use them directly. Otherwise:

- Check the current working directory for `/.aidd/project.md` containing a `ui_parity_reference:` directive
- If not found, return a usage error requiring both paths

## Workflow

### Phase 1: Inventory Both Codebases

For **each** codebase, systematically catalog every UI surface:

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

### Phase 3: Present Gap Summary

Output a structured markdown summary organized by priority:

```markdown
## UI Parity Gap Analysis

### High Priority (MISSING/DEGRADED - core features)

| Page | Gap | Classification | Priority |
| ---- | --- | -------------- | -------- |

### Medium Priority (MISSING/DEGRADED - enhancements)

| Page | Gap | Classification | Priority |
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
exclusion filters supplied in the invocation.

### Phase 5: Generate Feature Files

For each selected gap, create a feature.json in `/.aidd/features/`:

**Directory naming**: Use clean descriptive kebab-case slug: no prefix, no date stamp (e.g., `reports-search-filtering/`)

**Feature.json format**:

```json
{
	"category": "Frontend",
	"createdAt": "{ISO_TIMESTAMP}",
	"dependencies": ["{existing_feature_ids_if_applicable}"],
	"description": "{detailed description: what the old version had, what's missing in current}",
	"id": "{descriptive-slug}",
	"passes": false,
	"priority": 1,
	"spec": "1. Verify ...\n2. Verify ...\n...",
	"status": "backlog",
	"title": "{concise title}",
	"updatedAt": "{ISO_TIMESTAMP}"
}
```

**Priority mapping**:

| Gap Severity                               | Priority |
| ------------------------------------------ | -------- |
| Critical (core features, CRUD, workflows)  | 1        |
| High (search, filters, charts, parameters) | 1        |
| Medium (shared components, virtual scroll) | 2        |
| Low (polish, micro-interactions)           | 3        |

**Spec writing rules**:

- Numbered list of "Verify" statements
- Each statement = one testable behavior
- Be specific: element names, API endpoints, user interactions
- Include happy path and edge cases

**Dependency rules**:

- Link to existing page features (e.g., `reports-page`)
- Link to existing backend service features if API support needed
- Only reference features that actually exist in `/.aidd/features/`

### Phase 6: Roadmap and Validate

If `.aidd/roadmap.json` exists in the current codebase, assign each generated feature to the current milestone: the existing milestone with the highest numeric `priority`. Never create a new milestone for parity gaps. Then run from `<aidd-root>`:

```bash
bun run aidd-tools -- roadmap:apply --project-dir {current_codebase}
```

If aidd is available, run:

```bash
bun run start -- --project-dir {current_codebase} --check-features
```

Confirm all generated features are valid JSON with required fields.

## Example Session

```
User: ui-parity

Skill: I'll compare two codebases to find UI gaps. What are the paths?
  - Reference (old version): [path]
  - Current version: [path]

User: <applications-root>/<reference-app> and <applications-root>/<current-app>

Skill: [Explores both codebases...]

Skill: ## UI Parity Gap Analysis

### High Priority
| Page | Gap | Classification | Priority |
|------|-----|---------------|----------|
| Reports | Search, filtering, favorites, tags | MISSING | 1 |
| Report Detail | Dynamic parameter form & execution results | MISSING | 1 |
| Tables | DDL viewer and sample data explorer | MISSING | 1 |
| Custom Query | SQL syntax highlighting & validation | MISSING | 1 |
...

Generate feature.json for all 11 gaps? (High + Medium priority)

User: yes

Skill: [Creates 11 feature.json files, applies roadmap metadata, validates with aidd]
Created 11 features in .aidd/features/
All features validated successfully.
```

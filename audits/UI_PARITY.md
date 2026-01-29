---
title: 'UI Parity Comparison Audit'
last_updated: '2026-01-28'
version: '1.0'
category: 'Architecture'
priority: 'High'
estimated_time: '2-3 hours'
frequency: 'As needed (post-rebuild, migration, rewrite)'
---

# UI Parity Comparison Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.

This audit compares the current application's UI against a reference codebase (previous version, backup, or pre-rebuild snapshot) to identify missing, degraded, or relocated features. It produces a structured gap analysis and generates feature.json files for each actionable gap.

## Prerequisites

The target project's `/.automaker/project.txt` **must** include a `ui_parity_reference` directive specifying the absolute path to the reference codebase:

```
## UI Parity Reference
ui_parity_reference: d:/applications/myapp.old
```

If this directive is missing, document the issue in CHANGELOG.md and exit cleanly. Do not guess or assume a reference path.

## Audit Objectives

- Build a complete UI surface inventory for both **reference** and **current** codebases
- Compare inventories to identify gaps, degradations, and relocations
- Generate actionable feature.json files for MISSING and DEGRADED items
- Produce a structured audit report for human review

## Scope

### In Scope

- Frontend routes and page components
- Navigation structure (navbar, sidebar, menus)
- Forms, modals, and dialogs per page
- Data tables, lists, and their capabilities (search, filter, sort, pagination, virtual scroll)
- Charts, visualizations, and analytics widgets
- Reusable shared components (`components/shared/`, `components/ui/`)
- API endpoints called from the frontend
- Feature gating and role-based UI visibility
- Keyboard shortcuts and accessibility features

### Out of Scope

- Backend-only logic (covered by other audits)
- Database schema differences
- CSS/styling changes (unless functional: broken layouts, missing responsive behavior)
- Build tooling or configuration differences
- Test files and test infrastructure

## Methodology

### Step 1: Extract Reference Path

1. Read `/.automaker/project.txt`
2. Extract the line matching `ui_parity_reference:` (case-insensitive)
3. Validate the path exists and contains a frontend directory
4. If missing or invalid, abort with clear documentation

### Step 2: Inventory Reference App UI

Systematically catalog every UI surface in the **reference** codebase:

#### 2a. Routes & Pages

- Find all route definitions (React Router, Next.js pages, etc.)
- For each route, identify:
    - Path pattern (e.g., `/reports/:id`)
    - Page component file
    - Required authentication/role

#### 2b. Per-Page Feature Inventory

For each page, catalog:

- **Data display**: Tables, lists, cards, grids — note column definitions, virtual scroll, pagination
- **Data interaction**: Search inputs, filter dropdowns, sort controls, favorites/bookmarks
- **Forms**: Create/edit modals, inline forms — note field names, validation, dynamic fields
- **Actions**: Buttons, bulk operations, import/export, delete confirmations
- **Visualizations**: Charts, graphs, metrics cards, progress indicators
- **State management**: Loading skeletons, empty states, error boundaries

#### 2c. Navigation & Layout

- Menu items (navbar, sidebar, user menu)
- Breadcrumbs, tab navigation
- Layout modes (full-width, sidebar, responsive breakpoints)

#### 2d. Shared Components

- Reusable components in `components/shared/`, `components/ui/`
- Note which pages use each shared component

### Step 3: Inventory Current App UI

Perform the identical inventory (Steps 2a–2d) on the **current** codebase.

### Step 4: Compare and Classify

For each item in the reference inventory, classify its status in the current app:

| Classification | Meaning                                                       | Action                |
| -------------- | ------------------------------------------------------------- | --------------------- |
| **MISSING**    | Exists in reference, absent in current                        | Generate feature.json |
| **DEGRADED**   | Exists in both but current is significantly reduced           | Generate feature.json |
| **RELOCATED**  | Moved to different page/structure but functionally equivalent | Note in report only   |
| **NEW**        | Exists only in current (not in reference)                     | Note in report only   |

**DEGRADED criteria** — classify as degraded if the current version:

- Removed search/filter/sort capabilities
- Removed form fields or validation
- Replaced rich components with plain elements (e.g., chart → text, SQL editor → textarea)
- Removed interactive features (favorites, bulk operations, keyboard shortcuts)
- Removed role-based feature gating

### Step 5: Check for Existing Features

Before generating new feature.json files, scan `/.automaker/features/*/feature.json` for existing features that already cover the gap. Deduplicate by matching:

- Same page/component reference in description
- Same functional gap (e.g., "search on Reports page")

Skip generation if an existing feature with `"passes": false` already covers the gap.

### Step 6: Generate Feature Files

For each MISSING or DEGRADED item, create a feature.json in `/.automaker/features/`:

**Directory naming**: `audit-ui-parity-{unix_timestamp}-{descriptive-slug}/`

**Feature.json template**:

```json
{
	"category": "Frontend",
	"createdAt": "{ISO_TIMESTAMP}",
	"dependencies": ["{existing_feature_ids}"],
	"description": "{detailed description referencing what the old version had and what's missing}",
	"id": "feature-{YYYYMMDD}-{descriptive-slug}",
	"passes": false,
	"priority": 1,
	"spec": "1. Verify ...\n2. Verify ...\n...",
	"status": "backlog",
	"title": "{concise title}",
	"updatedAt": "{ISO_TIMESTAMP}"
}
```

**Priority mapping**:

| Gap Severity | Priority | Examples                                                  |
| ------------ | -------- | --------------------------------------------------------- |
| Critical     | 1        | Core page features, primary CRUD, key workflows           |
| High         | 1        | Search/filter/sort, parameter forms, chart visualizations |
| Medium       | 2        | Shared components, virtual scroll, caching toggles        |
| Low          | 3        | Minor polish, micro-interactions, optional shortcuts      |

**Dependency rules**:

- Link to existing page feature (e.g., reports-search-filtering → reports-page)
- Link to existing backend service feature if the gap requires API support
- Only reference features that exist (verify by checking features directory)

**Spec writing conventions**:

- Numbered list of "Verify" statements
- Each statement describes one testable behavior
- Be specific about element names, API endpoints, and user interactions
- Include both happy path and edge cases

### Step 7: Generate Audit Report

Write the report to `/.automaker/audit-reports/ui-parity-{timestamp}.md`:

```markdown
# UI Parity Audit Report — {YYYY-MM-DD}

## Reference

- **Reference codebase**: {path}
- **Current codebase**: {path}
- **Audit date**: {date}

## Executive Summary

- Total UI surfaces compared: {N}
- Missing: {N} | Degraded: {N} | Relocated: {N} | New in current: {N}
- Features generated: {N}

## Gap Analysis

### Critical & High Priority

| Page/Component | Classification | Gap Description | Feature ID  |
| -------------- | -------------- | --------------- | ----------- |
| ...            | MISSING        | ...             | feature-... |

### Medium Priority

| Page/Component | Classification | Gap Description | Feature ID  |
| -------------- | -------------- | --------------- | ----------- |
| ...            | DEGRADED       | ...             | feature-... |

### Relocated (No Action)

| Page/Component | Old Location | New Location | Notes |
| -------------- | ------------ | ------------ | ----- |
| ...            | ...          | ...          | ...   |

### New in Current (Context Only)

| Page/Component | Description |
| -------------- | ----------- |
| ...            | ...         |

## Recommendations

- Priority order for implementation
- Suggested dependency groupings
- Any architectural considerations

---

**Auditor**: AIDD Automated Audit
**Date**: {date}
**Audit Type**: UI_PARITY
```

### Step 8: Update Changelog

Add entry to `/.automaker/CHANGELOG.md`:

```markdown
## [{YYYY-MM-DD}] - UI_PARITY Audit

### Audit Results

- Compared against: {reference_path}
- Total gaps found: {N} ({critical} critical, {high} high, {medium} medium, {low} low)
- Feature files created: {N}
- Report: audit-reports/ui-parity-{timestamp}.md
```

## Audit Checklist

### Critical Checks 🚨

- [ ] All routes in reference app have corresponding routes in current app
- [ ] Core CRUD operations exist for all primary entities
- [ ] Primary user workflows are complete end-to-end
- [ ] Navigation exposes all major features

### High Priority Checks ⚠️

- [ ] Search and filtering capabilities match per page
- [ ] Form fields and validation match per form
- [ ] Chart/visualization components exist where reference had them
- [ ] Dynamic/parameterized features are preserved (e.g., report parameters)
- [ ] Role-based UI gating is consistent

### Medium Priority Checks 📋

- [ ] Shared/reusable components exist in current (DataTable, StatusBadge, etc.)
- [ ] Virtual scroll and performance optimizations preserved
- [ ] Caching and optimization toggles preserved
- [ ] Global search integration present

### Low Priority Checks 💡

- [ ] Keyboard shortcuts match
- [ ] Loading skeletons and empty states consistent
- [ ] Micro-interactions and animations preserved

## Report Template

See Step 7 above for the full report template.

---
title: 'UI Parity Comparison Audit'
last_updated: '2026-06-28'
version: '1.2'
category: 'Architecture'
priority: 'High'
estimated_time: '2-3 hours'
frequency: 'As needed (post-rebuild, migration, rewrite)'
lifecycle: 'migration'
---

# UI Parity Comparison Audit

> **Severity Reference**: See [SEVERITY_CLASSIFICATION.md](./SEVERITY_CLASSIFICATION.md) for issue prioritization.
> **Methodology gate**: See [AUDIT_METHODOLOGY.md](./AUDIT_METHODOLOGY.md) - read the enforcing implementation (cite file:line), falsify every "by design"/"N/A" rationale, never score from a green gate.

This audit compares the current application's UI against a reference codebase (previous version, backup, or pre-rebuild snapshot) to identify missing, degraded, or relocated features. It produces a structured gap analysis and generates feature.json files for each actionable gap.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Pre-Audit Setup](#pre-audit-setup)
3. [Audit Objectives](#audit-objectives)
4. [Scope](#scope)
5. [Methodology](#methodology)
6. [Audit Checklist](#audit-checklist)
7. [Report Template](#report-template)
8. [Deliverables](#deliverables)

## Prerequisites

The target project's `/.aidd/project.md` **must** include a `ui_parity_reference` directive specifying the absolute path to the reference codebase:

```
## UI Parity Reference
ui_parity_reference: /path/to/myapp.old
```

Acceptable reference sources are not limited to a sibling directory on disk. Any of the following may back the directive, as long as it resolves to a readable frontend tree or a documented route/screenshot baseline artifact:

- A local path to a previous version, backup, or pre-rebuild snapshot
- A checked-out git tag, branch, or worktree of an earlier release
- A prior release archive extracted to a temporary directory
- A screenshot/route baseline captured before the rebuild (used as the comparison reference when no source tree survives)

**No-reference outcome (required behavior)**: If the directive is missing - or the reference path cannot be resolved to a readable frontend or documented baseline - the audit MUST exit as a single clean **SKIPPED / not-applicable** result: record "Not applicable - no reference configured" in CHANGELOG.md and the report, and stop before route inventory, route-map validation, or current-app feature checks. In this case:

- Do **not** emit a numeric score or score-like value (no `100/100`, no `N/A` masquerading as a passing grade).
- Do **not** emit issue counts (`0 Critical`, `0 High`, etc.) or route-match commentary.
- Do **not** generate feature.json files or recommendations.
- Do **not** simulate the comparison. A parity comparison cannot be simulated - there is nothing to compare against - so simulated runs are forbidden for this audit.

Do not guess or assume a reference path.

## Pre-Audit Setup

Before comparing UI surfaces:

1. Read `/.aidd/project.md` and extract `ui_parity_reference:`.
2. Resolve the directive to one of these concrete reference types:
    - A source tree with readable route/page/component files.
    - A checked-out tag, branch, worktree, or extracted release archive with a readable frontend.
    - A route/screenshot baseline with enough page-level evidence to compare visible features.
3. If no concrete reference is available, write only the clean SKIPPED / not-applicable report and CHANGELOG entry described above.
4. If a screenshot/route baseline is used, identify the baseline files in the report and limit findings to gaps supported by those artifacts.

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

1. Read `/.aidd/project.md`
2. Extract the line matching `ui_parity_reference:` (case-insensitive)
3. Validate that the reference exists and is either a readable frontend tree or a documented route/screenshot baseline
4. If missing or invalid, abort with the clean SKIPPED / not-applicable result described in Prerequisites

### Step 2: Inventory Reference App UI

Systematically catalog every UI surface in the **reference** codebase:

#### 2a. Routes & Pages

- Find all route definitions (React Router; Next.js app/pages only for non-Spernakit reference apps)
- For each route, identify:
    - Path pattern (e.g., `/reports/:id`)
    - Page component file
    - Required authentication/role

> **Stack note**: The Spernakit v3 target stack (React 19 + Vite + React Router) has no Next.js - its routes are React Router definitions. The Next.js mention applies only when the _reference_ app is a non-Spernakit codebase.

#### 2b. Per-Page Feature Inventory

For each page, catalog:

- **Data display**: Tables, lists, cards, grids - note column definitions, virtual scroll, pagination
- **Data interaction**: Search inputs, filter dropdowns, sort controls, favorites/bookmarks
- **Forms**: Create/edit modals, inline forms - note field names, validation, dynamic fields
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

> **Stack note**: In the Spernakit stack, `components/ui/` holds shadcn/ui primitives imported directly (no barrel/index re-export) and `components/shared/` holds app-level reusable components - match this layout when inventorying the current app.

### Step 3: Inventory Current App UI

Perform the identical inventory (Steps 2a - 2d) on the **current** codebase.

### Step 4: Compare and Classify

For each item in the reference inventory, classify its status in the current app:

| Classification | Meaning                                                       | Action                |
| -------------- | ------------------------------------------------------------- | --------------------- |
| **MISSING**    | Exists in reference, absent in current                        | Generate feature.json |
| **DEGRADED**   | Exists in both but current is significantly reduced           | Generate feature.json |
| **RELOCATED**  | Moved to different page/structure but functionally equivalent | Note in report only   |
| **NEW**        | Exists only in current (not in reference)                     | Note in report only   |

**DEGRADED criteria** - classify as degraded if the current version:

- Removed search/filter/sort capabilities
- Removed form fields or validation
- Replaced rich components with plain elements (e.g., chart → text, SQL editor → textarea)
- Removed interactive features (favorites, bulk operations, keyboard shortcuts)
- Removed role-based feature gating

### Step 5: Check for Existing Features

Before generating new feature.json files, scan `/.aidd/features/*/feature.json` for existing features that already cover the gap. Deduplicate by matching:

- Same page/component reference in description
- Same functional gap (e.g., "search on Reports page")

Skip generation if an existing feature with `"passes": false` already covers the gap.

### Step 6: Generate Feature Files

For each MISSING or DEGRADED item, create a feature.json in `/.aidd/features/`:

**Directory naming**: Use a clean descriptive kebab-case slug - **no prefix, no date stamp** (e.g., `reports-search-filtering/`).

**Feature.json template**:

```json
{
	"category": "Frontend",
	"createdAt": "{ISO_TIMESTAMP}",
	"dependencies": ["{existing_feature_ids}"],
	"description": "{detailed description referencing what the old version had and what's missing}",
	"id": "{descriptive-slug}",
	"passes": false,
	"priority": 1,
	"spec": "1. Verify ...\n2. Verify ...\n...",
	"status": "backlog",
	"title": "{concise title}",
	"updatedAt": "{ISO_TIMESTAMP}"
}
```

**NOTE: The `id` field MUST be the plain descriptive slug and match the directory name (no `audit-` prefix, no timestamp).**

> **Formatting note**: The key order shown above is illustrative only. On-disk `feature.json` files are normalized with prettier sort-json (alphabetically sorted keys, tabs), not the runtime's id-first serializer. Run `prettier --write` on each generated file before commit; the displayed order does not need to be preserved by hand.

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

Write the report to `/.aidd/audit-reports/UI_PARITY-{YYYY-MM-DD}.md`. The pipeline prepends an `<!-- aidd:audit-report-meta ... -->` HTML comment to the generated file; preserve it if present and write the report body below it:

```markdown
# UI_PARITY Audit Report - {YYYY-MM-DD}

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

**Auditor**: aidd Automated Audit
**Date**: {date}
**Audit Type**: UI_PARITY
```

### Step 8: Update Changelog

Add entry to `/.aidd/CHANGELOG.md`:

```markdown
## [{YYYY-MM-DD}] - UI_PARITY Audit

### Audit Results

- Compared against: {reference_path}
- Total gaps found: {N} ({critical} critical, {high} high, {medium} medium, {low} low)
- Feature files created: {N}
- Report: audit-reports/UI_PARITY-{YYYY-MM-DD}.md
```

### Step 9: Validate Generated Features

Before completing the audit, confirm every generated `feature.json` is valid:

1. Verify the reference path was a readable frontend tree and `aidd.sh` (or the app's equivalent CLI) is available.
2. Normalize all generated files with `prettier --write` (sorted keys, tabs) and confirm with `prettier --check` on the `features/` directory.
3. Run feature validation:

    ```bash
    aidd.sh --project-dir {current} --check-features
    ```

4. Resolve any malformed-JSON or missing-required-field errors before marking the audit complete. Do not leave the backlog in an invalid state.

## Audit Checklist

### Critical Checks 🚨

- [ ] All routes in reference app have corresponding routes in current app
- [ ] Core CRUD operations exist for all primary entities
- [ ] Primary user workflows are complete end-to-end
- [ ] Navigation exposes all major features

### High Priority Checks

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

## Deliverables

### Required Outputs

1. UI parity gap report at `.aidd/audit-reports/UI_PARITY-YYYY-MM-DD.md` (or a clean "SKIPPED / not applicable - no reference configured" report when no reference is available)
2. Feature.json files for each MISSING or DEGRADED gap, validated via `--check-features` and normalized with prettier
3. CHANGELOG entry in `.aidd/CHANGELOG.md`

### Success Criteria

- [ ] A reference codebase or documented baseline was resolved, or the audit exited cleanly as SKIPPED / not-applicable with no score, issue counts, recommendations, or simulated comparison
- [ ] Every reference route/page/component was classified (MISSING/DEGRADED/RELOCATED/NEW)
- [ ] No duplicate feature.json files for gaps already covered by an existing `"passes": false` feature
- [ ] All generated feature.json files pass `--check-features` and are prettier-normalized
- [ ] Report written to the correct `UI_PARITY-YYYY-MM-DD.md` path and CHANGELOG updated

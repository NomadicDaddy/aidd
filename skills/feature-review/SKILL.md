---
name: feature-review
description: 'Review .aidd feature.json files against the target codebase for conflicts, contradictions, vagueness, and missing detail, then fix confirmed metadata issues. Use when validating feature quality before implementation or backlog planning.'
metadata:
    aidd-category: metadata
    aidd-contracts: prompt-guidelines
---

# Feature Review

Review all backlog feature.json files in `.aidd/features/` against the target codebase to ensure specs are explicit, consistent, conflict-free, and aligned with project conventions. Automatically rewrites problematic files.

## Usage

```
feature-review [app]
```

- `[app]` is an optional application name or path. Resolve names through the workspace application
  index; when omitted, use the current repository.
- The resolved project must contain `.aidd/features/` with feature.json files.

## Workflow

### Phase 1: Discover & Load

1. Resolve the target project, then find all `feature.json` files under
   `.aidd/features/*/feature.json`
2. **Separate template features**: Any feature with a `spernakit_version` field is template-owned. These are read-only in derived apps and must NOT be reviewed, modified, or auto-fixed. Include them in the dependency graph (step 4) but skip them for analysis. Report their count separately. Exception: when the target project is the Spernakit template repository itself, `spernakit_version` features ARE in scope for review; skip them only in derived apps.
3. Filter remaining features to those where `status` is `"backlog"` and `passes` is `false`
4. Parse each into memory; reject and report any with invalid JSON
5. Build a full dependency graph from all features (backlog AND completed, including template features) so cross-references can be resolved
6. Report: total features found, template features (skipped), total backlog, total completed

### Phase 2: Learn Codebase Conventions

Before judging any feature spec, learn the project's actual conventions by examining:

#### Project Structure

- Read `package.json` (root + workspace) for stack, scripts, runtime
- Read `AGENTS.md`, `DEVELOPMENT.md`, `STACK.md` if present (check `docs/template/` as well as root)
- Read `.aidd/project.md` if present for project-specific directives
- Detect ORM: Drizzle (`backend/src/db/schema/`), Prisma (`backend/prisma/schema.prisma`), or other
- Read ORM schema files for data model conventions

#### Backend Conventions

- Identify HTTP framework: Elysia, Express, Fastify, or other
- Identify route registration pattern:
    - Elysia: `create-api-app.ts` or `app.ts` with `.use()` chaining
    - Express: `config/routes.ts`, `app.ts`, or per-file registration
- Identify directory layout: `routes/`, `services/`, `plugins/`, `guards/`, `types/`, `utils/`
- Identify whether controllers exist:
    - If NO controller directory exists, the project uses **routes → services** (2-layer). Do NOT require controller files in specs.
    - If a controller directory exists, the project uses **routes → controllers → services** (3-layer)
- Identify handler extraction pattern: Are complex handlers extracted as named functions above route definitions? (Elysia pattern, NOT controller classes)
- Identify plugin/middleware stacking order (auth, authorization, validation, rate limiting)
- Identify RBAC tier names and hierarchy (e.g., SYSOP > ADMIN > MANAGER > OPERATOR > VIEWER)
- Identify response format helpers (e.g., `dataResponse()`, `successResponse()`, `success()`, `failure()`)
- Identify error handling patterns (e.g., `AppError` class, HTTP status constants)
- Identify soft-delete field conventions (e.g., `isDeleted`, `deletedAt`, `deletedBy`)
- Identify audit field conventions (e.g., `createdAt`, `updatedAt`, `createdBy`, `updatedBy`)
- Identify validation approach:
    - Elysia: TypeBox schemas via `t.Object()` in route body/query/params
    - Express: Joi, Zod, or express-validator
    - Config-only: Zod for configuration validation (not routes)
- Identify service organization pattern:
    - Flat files only (`services/settingsService.ts`)
    - Hybrid flat + subdirectory with facade (`services/authService.ts` + `services/auth/*.ts`)
- Identify export convention: named exports only vs mixed (check for `export default` usage)
- Identify configuration approach: JSON config (`config/{slug}.json`), `.env` files, or both

#### Frontend Conventions

- Identify page directory (`frontend/src/pages/`)
- Identify API client module location: `frontend/src/api/` vs `frontend/src/services/`
- Identify component organization (`frontend/src/components/{domain}/`)
- Identify hook naming and location (`frontend/src/hooks/`)
- Identify route registration file (`frontend/src/routes.tsx` or `frontend/src/App.tsx`)
- Identify auth protection pattern (e.g., `<ProtectedRoute>`, `requireAuth` wrapper)
- Identify state management: Zustand stores, React Context, Redux, or other
- Identify React optimization: React Compiler (automatic memoization) vs manual `React.memo`
- Identify navigation registration points: sidebar, command palette, layout tabs

#### Existing Functionality Inventory

Build an inventory of what the codebase already implements. This is used in Phase 3e to detect duplication.

- **Routes**: Scan route registration files and route directories for all existing API endpoints (method + path)
- **Services**: Scan service directories for all existing service files and their public methods
- **Pages/Views**: Scan frontend page directories for all existing pages and their route paths
- **Components**: Scan component directories for domain-specific components (e.g., `components/users/`, `components/backups/`)
- **Database Models**: Read ORM schema files (Drizzle `backend/src/db/schema/` or Prisma `backend/prisma/schema.prisma`) for all existing models and their fields
- **Plugins/Middleware**: Catalog existing plugins and middleware (auth, validation, rate-limiting, etc.)
- **Hooks**: Catalog existing frontend hooks and their purposes
- **Navigation**: Catalog all sidebar items, command palette entries, and settings/profile layout tabs

Produce a concise "Existing Functionality Map" organized by domain (e.g., users, backups, settings) listing the routes, services, pages, and models that already exist for each domain.

#### Completed Feature Patterns

- Read 3-5 completed features (passes: true) to establish the expected spec quality bar
- Note their spec format, level of detail, and field usage as the baseline

#### Prior Remediation Review

Check for `.aidd/remediation-review.md`. If present, read it in full. This file is a human-authored
critical review of issue features produced by the aidd-local `doc2feature` skill, containing
per-feature assessments with:

- **Strengths and concerns** for each feature (verified claims, unverified assumptions, spec gaps)
- **Shipping verdicts** (Ready, Requires product decision, Requires simplification, etc.)
- **Priority recalibrations** (e.g., a feature rated P2 that should be P3)
- **Cross-cutting observations** (undeclared dependencies, features that should be split or consolidated, product decisions required)
- **Recommended execution order** grouping features into implementation sessions

Build a lookup from feature ID to the review's assessment. This context is applied in Phase 3g and Phase 6.

Summarize conventions discovered. This context is used for all subsequent checks.

### Phase 3: Analyze Each Feature

For every backlog feature, run the following checks. Classify each issue found:

| Severity          | Meaning                                                                       |
| ----------------- | ----------------------------------------------------------------------------- |
| **CONFLICT**      | Blocks implementation - contradicts another feature or codebase reality       |
| **CONTRADICTION** | Risks incorrect implementation - spec says one thing, context implies another |
| **VAGUE**         | Underspecified - implementer must guess; likely to produce wrong output       |
| **MINOR**         | Style or convention nit - won't block but should be fixed                     |

#### 3a. Structural Validity

- **Required review contract**: `id`, `title`, `description`, `category`, `spec`, `status`,
  `passes`, `priority`, `dependencies`. The runtime schema is deliberately permissive for older
  records, but new and reviewed records use this complete operational shape.
- **ID format**: Standalone features use clean descriptive slugs (e.g., `run-console-page`,
  `approval-model`). Non-standalone findings that remediate an existing feature use
  `remediation-{YYYYMMDD}-{slug}` in any repository, derived applications included; the prefix
  records the kind of record, not who owns it. Audit findings use `audit-{type}-{timestamp}-{slug}`. A
  `feature-{YYYYMMDD}-{slug}` id is accepted but should be flagged as **MINOR** for renaming via
  the aidd-local `consolidate-features` skill.
- **Process-record ids in a derived app are a provenance question, not a naming one.** In a Spernakit-derived app (one whose `package.json` carries `spernakit_version`), an id matching `remediation-{YYYYMMDD}-{slug}` or `audit-{slug}-{digits}-{slug}` is worth examining, but the name alone does not make it a **CONFLICT**. Since 2026-08-26 `scripts/lib/template-features/resident.ts` uses the name only to choose which resident records it inspects, then judges each one on provenance: the template corpus carrying the same directory, or a `spernakit_version` stamp on the app's copy. Either signal means the record arrived from upstream, and that is the leak. A record the application authored itself — unstamped, with no counterpart in the template — passes `check:template-features` at every template version, whatever it is named.

    Report a **CONFLICT** when a resident process record carries `spernakit_version` or names a directory the template also has. That record belongs upstream, and `check:template-features` fails on it ahead of any version comparison, short-circuiting before a single durable record is compared — so one such directory hides all of that app's feature-record drift behind an unrelated error.

    Do not report an unstamped, app-authored process record at all. Those prefixes mark non-standalone process artifacts, and an application is entitled to author one: a bug or design-sweep finding it filed against itself is non-standalone whoever owns it, and `bug2feature`, `doc2feature`, and `ui-redesign-planner` all mint that name in derived apps by design. Flag it only against the ordinary criteria — a finding that has actually grown into standalone work is a **MINOR** for `promote-remediation`, on the same terms as anywhere else.

    Do not auto-fix a conflict by renaming or deleting. Move a template-owned finding upstream to Spernakit; preserve the record and report what the gate actually said until its ownership is decided.

    In the Spernakit template repository itself there is no resident-leak question at all: the process records there are the template's own.

- **Status value**: Must be one of `backlog`, `in_progress`, `completed`, `waiting_approval`
- **Priority**: Must be a number (1 = most urgent)
- **Timestamps**: If present, must be valid ISO 8601 with timezone
- **Dependencies**: Must be an array of strings

#### 3b. Spec Quality

Each spec line is evaluated against these rules:

- **Format**: Must be numbered list of statements starting with "Verify" (e.g., `1. Verify backupRoutes.ts exists at backend/src/routes/`). Audit-sourced features may use "Remediation steps:" format with action verbs; this is acceptable.
- **Specificity**: Each statement must include at least one concrete artifact: a file path, endpoint path, field name, component name, role name, or status value
- **Validation coverage** (prompt-guidelines pre-send rule): The spec must include at least one criterion checkable without implementer judgment - a runnable command (test, lint, build, HTTP call) with its expected result, or a directly observable artifact or state (file exists at path, route returns status, field present in schema). Flag as VAGUE when no line is mechanically checkable. Fix via rule 14.
- **Scope cohesion** (prompt-guidelines pre-send rule): Flag as MINOR any spec line delivering work unrelated to the feature's title and description (an "also" task, e.g., an unrelated refactor or doc update riding along). Report-only: recommend moving it to its own feature; auto-fix must not split features.
- **Ambiguity detection**: Flag statements containing vague qualifiers without concrete criteria:
    - "proper error handling" -> VAGUE (should specify: returns 400/404/500 with specific error format, logs via project logger)
    - "appropriate validation" -> VAGUE (should specify: validation schema with fields and constraints using the project's validation library)
    - "good UX" -> VAGUE (should specify: loading skeleton, error boundary, empty state)
    - "handles edge cases" -> VAGUE (should specify which edge cases)
    - "responsive design" -> acceptable only if project uses Tailwind/CSS framework with responsive defaults
- **Banned action verbs** (these are not implementable; flag as VAGUE):
    - "Evaluate whether" -> VAGUE (should specify: what to check and what the pass/fail criteria are; answer the question, then write the action)
    - "Consider whether" -> VAGUE (should specify: the decision and the criteria for choosing)
    - "Review and update" -> VAGUE (should specify: what to review for and what the expected update is)
    - "Ensure proper" / "Ensure appropriate" -> VAGUE (must specify what "proper" or "appropriate" means concretely)
    - "Add a unit test" -> CONTRADICTION if project does not use unit test frameworks (check package.json devDependencies for vitest/jest/@testing-library; if absent, flag). If project uses unit tests, this is acceptable but should specify what to test.
    - "Assess if" / "Determine if" -> VAGUE (these are analysis tasks, not remediation steps; the analysis should be done before creating the finding)
- **Cross-feature feedback-loop steps** -> NOT an issue; this is the intended mechanism. A spec step directing the implementer to amend a source feature's `spec`/`notes` so a fixed issue cannot be reintroduced during a feature-based rebuild is mandatory audit-finding text, and coding runs are explicitly permitted to write `spec`, `notes`, and appended `dependencies` on source features (see the coding prompt's Session 2+ scoped-write rule). **Never strip, neuter, or rewrite these steps into read-only verifications.** Flag only when the step is genuinely unexecutable, and then as VAGUE rather than CONFLICT: the named source feature does not exist under `.aidd/features/`, the step targets a source feature's `id`/`passes`/`status`, or the step directs deleting or weakening existing spec lines instead of amending additively. Also flag as VAGUE when every named source feature is template-owned (carries `spernakit_version`) in a derived app: the coding run cannot amend it locally and will park for upstream escalation, so the report must name the amendment the template needs. Fix via rule 13.
- **Completeness by category** (adapt to project's layer architecture discovered in Phase 2):
    - **Backend CRUD (2-layer: routes → services)**: Must verify route file, service file, each HTTP method + path, role requirements per method, route registration in app entry point, error handling approach, validation schema. Do NOT require controller files if the project doesn't use controllers.
    - **Backend CRUD (3-layer: routes → controllers → services)**: Must verify route file, controller file, service file, each HTTP method + path, role requirements per method, route registration, error handling approach, validation schema
    - **Frontend Page**: Must verify page component file, route registration in routes file, auth protection, navigation entry point (sidebar/tab/command palette), key UI elements, loading/error/empty states
    - **Database Model**: Must verify schema location, field list with types, relations, indexes, soft-delete fields, audit fields
    - **Backend Service**: Must verify service file location, each public method, return types, error scenarios
- **Anti-pattern detection** (based on project conventions from Phase 2):
    - If project uses named exports only: flag any spec referencing `export default`
    - If project uses React Compiler: flag any spec requiring manual `React.memo` (compiler handles this automatically)
    - If project uses handler extraction: flag specs with handlers >30 lines inline in route definitions
    - If project uses 2-layer architecture: flag any spec creating controller classes (breaks Elysia type inference if applicable)

#### 3c. Codebase Alignment

- File paths in spec match actual project directory structure (e.g., `backend/src/routes/` not `backend/routes/` or `src/routes/`)
- Role names in spec match the project's actual RBAC tiers
- Route patterns match project conventions (e.g., `/api/v1/{resource}` or `/api/{resource}`; match what the codebase actually uses)
- Plugin/middleware references match what actually exists
- Component paths match frontend directory conventions
- API module paths use the project's actual API directory (e.g., `frontend/src/api/` not `frontend/src/services/` if the project separates them)
- Referenced config files exist or are created by a dependency feature
- Validation references use the project's actual validation library (e.g., TypeBox `t.Object()` for Elysia routes, not Joi/Zod if those aren't used for routes)

#### 3d. Dependency Integrity

- Every ID in `dependencies` array corresponds to an actual feature directory under `.aidd/features/`
- No circular dependency chains (A depends on B depends on A)
- Frontend page features depend on their backing CRUD API features
- CRUD API features depend on their database model features
- Service features depend on the CRUD features they consume
- Dashboard/aggregate features depend on their widget/component features

#### 3e. Codebase Duplication

Using the Existing Functionality Map from Phase 2, check whether the feature attempts to reproduce functionality that already exists in the codebase:

- **Route duplication**: Feature specs an API endpoint (method + path) that already exists in the codebase route files
- **Service duplication**: Feature specs a service file or method that already exists with equivalent purpose (e.g., feature adds `backupService.create()` but `backupService.ts` already exports a `create` function)
- **Page duplication**: Feature specs a frontend page for a domain that already has a corresponding page (e.g., feature adds a "User List" page but `pages/users/UserListPage.tsx` already exists)
- **Model duplication**: Feature specs a database model that already exists in the schema
- **Domain overlap**: Feature's described purpose (title + description) substantially overlaps with an existing domain's implemented functionality; e.g., a feature titled "User Management CRUD" when full user CRUD routes, services, and pages already exist

Severity classification:

- **CONFLICT** if the feature would create files or routes that already exist with different behavior
- **CONTRADICTION** if the feature's purpose is already fully implemented; the feature is redundant
- **VAGUE** if partial overlap exists and the spec doesn't clarify what net-new functionality it adds beyond what's already present

When overlap is detected, the report must identify the specific existing files/routes/models that overlap and explain what (if anything) the feature adds beyond them.
Code presence alone does not prove the feature is accepted or complete: preserve its parity and
behavior criteria so the eventual implementation run verifies the existing surface rather than
silently treating scaffold overlap as completion.

#### 3f. Integration Completeness (Cathedral Detection)

Check whether the feature, if implemented, would create a "cathedral": all backend layers present but no user-facing entry point:

- If the feature adds a backend route + service but no corresponding frontend API module, page, or navigation entry: flag as **VAGUE** with recommendation to add frontend integration criteria or explicitly document as API-only
- If the feature adds a frontend page but no route registration or navigation link: flag as **VAGUE** with recommendation to add routing and navigation criteria
- If the feature adds a database model but no route or service to access it: flag as **VAGUE** with recommendation to add data access criteria

#### 3g. Remediation Review Cross-Check

If a remediation review was loaded in Phase 2, apply its findings to the current feature:

- **Unverified claims**: If the review flagged a spec claim as unverified (e.g., assumed a dependency exists, assumed a frontend component exists, referenced a script that doesn't exist), verify the claim now against the codebase. If the claim is false, flag as **CONTRADICTION** and note the review's original concern.
- **Spec gaps**: If the review identified missing specificity (e.g., "does not specify SIGTERM-then-SIGKILL escalation", "does not provide default values", "does not supply a grep pattern"), flag as **VAGUE** and include the review's suggested tightening.
- **Priority recalibrations**: If the review recommended a different priority than what the feature carries, flag as **MINOR** with the review's reasoning (e.g., "remediation-review recommends P3: production compose already works, only local dev file is broken").
- **Undeclared dependencies**: If the review identified implicit dependencies not declared in the feature's `dependencies` array, flag and add them.
- **Shipping verdicts**: If the review's verdict was anything other than "Ready" (e.g., "Requires product decision", "Requires simplification", "Requires scope decision"), add a **VAGUE** flag noting the unresolved gate and what decision is needed.
- **Scope concerns**: If the review flagged the feature as closer to a mini-feature than a remediation, or recommended splitting, note this in the report as a **MINOR** observation.

Do not invent concerns; only apply issues that the remediation review explicitly raised.

### Phase 4: Cross-Feature Analysis

After analyzing all features individually, check across features:

- **Route conflicts**: No two features define the same API endpoint with different specs
- **File conflicts**: No two features create the same file (e.g., two features both spec `backupService.ts` differently)
- **Field conflicts**: No two features define the same database model field with different types or constraints
- **Category consistency**: Features doing similar work should have consistent categories
- **Dependency completeness**: If feature A references an entity (e.g., "backup verification") that requires feature B, but A does not list B as a dependency, flag it
- **Missing features**: If a CRUD API exists but no corresponding list page or detail page exists in the backlog or completed set, flag the gap
- **Batch conflicts**: If two features have `BATCH WITH:` directives, verify they actually reference each other bidirectionally and that their overlapping files are consistent
- **Schema migration conflicts**: If multiple features modify the same database schema file, verify they can be applied together or flag the ordering requirement

### Phase 5: Report

Write the structured markdown report to `.aidd/feature-review-report.md` and present its findings:

```markdown
## Feature Review Report

**Project**: {project name}
**Stack**: {detected stack summary, e.g., "Elysia + Drizzle + React 19 (Spernakit v3)"}
**Features reviewed**: {count} backlog / {total} total
**Issues found**: {count} ({conflicts} conflicts, {contradictions} contradictions, {vague} vague, {duplications} duplications, {minor} minor)

### CONFLICTS (must fix before implementation)

#### {feature-title} (`{feature-id}`)

- {issue description with specific remediation}

### CONTRADICTIONS (risks incorrect implementation)

#### {feature-title} (`{feature-id}`)

- {issue description}

### VAGUE (underspecified - will expand)

#### {feature-title} (`{feature-id}`)

- {spec line number}: "{original text}" -> needs: {what's missing}

### MINOR (convention alignment)

#### {feature-title} (`{feature-id}`)

- {issue description}

### CODEBASE DUPLICATION (feature duplicates existing functionality)

#### {feature-title} (`{feature-id}`)

- {overlap description}: existing {file/route/model} at {path} already implements {what}
- Recommendation: {run separate acceptance review | clarify net-new functionality while preserving
  parity criteria | consolidate an accepted completed process record}

### CATHEDRAL RISKS (all layers but no user path)

#### {feature-title} (`{feature-id}`)

- {missing integration point}: {what's needed to make the feature reachable}

### REMEDIATION REVIEW FINDINGS (from prior manual review)

#### {feature-title} (`{feature-id}`)

- {review concern}: {what the remediation review flagged and current verification status}
- Shipping verdict: {review's verdict and any unresolved gates}

### Cross-Feature Issues

- {description of any inter-feature conflicts or gaps}
```

### Phase 6: Auto-Fix

After presenting the report, automatically rewrite every feature.json that has issues:

#### Fix Rules

1. **Missing required fields**: Add with sensible defaults derived from context. Set `priority` to
   the priority of the feature's assigned roadmap milestone; if the feature must first be mapped in
   Phase 6.5, use the milestone assigned there. Set `updatedAt` to the current timestamp on every
   modified record.
2. **Vague spec lines**: Rewrite with concrete artifacts based on codebase conventions discovered in Phase 2. Use the project's actual libraries and patterns:
    - `"Verify proper error handling"` -> `"Verify route returns 400 for invalid input, 404 for missing resource, 500 for unexpected errors using project error format"`
    - For Elysia/TypeBox projects: `"Verify appropriate validation"` -> `"Verify TypeBox body schema (t.Object) validates required fields: name (t.String, minLength: 1), type (t.Union([t.Literal('local'), t.Literal('cloud')]))"`
    - For Express/Joi projects: `"Verify appropriate validation"` -> `"Verify Joi schema validates required fields: name (string, 1-100 chars), type (enum: local|offsite|cloud)"`
3. **Missing spec lines**: Add verification items for aspects the category requires but the spec omitted (e.g., backend CRUD missing route registration check, frontend page missing navigation entry). For numbered criteria, continue from the number on the last numbered line in document order; later blocks may restart at `1`, so never use the global maximum.
4. **Incorrect file paths**: Correct to match project conventions
5. **Incorrect role names**: Correct to match project's RBAC tiers
6. **Missing dependencies**: Add dependency IDs that should be present based on the feature's references
7. **Description too terse**: Expand to include what the feature delivers and why, aligned with the spec
8. **Codebase duplication - full overlap**: Do not treat code presence as acceptance evidence and
   do not change `status` or `passes`. Report the exact files, routes, and observable behavior that
   appear to satisfy the feature, then leave it unchanged for a separate acceptance review. Existing
   scaffold or partial implementation can overlap every named artifact while still failing the
   intended behavior.
9. **Codebase duplication - partial overlap**: Preserve criteria covering the existing behavior as
   acceptance and regression checks, and clarify which criteria deliver net-new behavior. Do not
   remove parity criteria merely because matching files or routes exist. If the intended boundary
   remains uncertain, preserve the feature unchanged and report the unresolved boundary.
10. **Cathedral risk**: If a feature specs backend-only work with no frontend integration, add spec lines for frontend API module, page/component, and navigation entry, or add a note that the feature is intentionally API-only (if that matches the project's pattern for similar endpoints).
11. **V1 pattern references**: If the spec references patterns from a previous stack version (e.g., controller classes in a controllerless project, Prisma in a Drizzle project, Joi in a TypeBox project, `export default` in a named-exports-only project), rewrite to use the current stack patterns.
12. **Remediation review findings**: If a remediation review was loaded and flagged concrete spec improvements for a feature (missing defaults, unverified claims confirmed false, references to nonexistent scripts), apply those fixes directly. If the review recommended a priority change with clear reasoning, update the priority. Do not auto-fix items that require a product decision; leave those as report-only observations.
13. **Cross-feature feedback-loop steps** (from 3b): Leave them in place. The implementing coding run closes the loop, not this review - do NOT pre-apply the amendment, and do NOT rewrite the step into a read-only verification. Fix only the genuinely-unexecutable cases flagged in 3b: correct a misnamed source feature id to the real one, or narrow a step that targets a source feature's `id`/`passes`/`status` down to `spec`/`notes` (and appended `dependencies`). If no source feature can be identified at all, say so in the report and leave the step for the implementer to park on - an unclosed feedback loop is a blocker the run must surface, not one this review should silently resolve. Never touch template features. Itemize every such correction in the Auto-Fix Summary.
14. **Missing validation coverage** (from 3b): Append a spec line naming a mechanically checkable validation derived from Phase 2 conventions: the project's own quality-gate command(s) (test/lint/build scripts from package.json) scoped to the feature's files, or a concrete observable check (endpoint + expected status, file at path, schema field). Do not invent test frameworks or scripts the project lacks.

#### Fix Constraints

- **Normalize notes before every write**: missing/null becomes `[]`, a string becomes
  `[existingString]`, and an array is copied. Preserve every existing string, append the new entry,
  and persist an array.
- **Preserve all correct existing content**: only change what's broken
- **Maintain JSON formatting** with tabs for indentation (matching project convention)
- **Do not change**: `id`, `status`, `passes`, `createdAt`, `completedAt`, `justFinishedAt`,
  `spernakit_version`
- **Completed features are out of scope for fixes**, with no exception. Fix Rule 13 does NOT amend them: source-feature `spec`/`notes` amendments belong to the coding run that ships the fix, not to this review. If a backlog spec depends on a contract being recorded on a completed feature, leave the step in place and report it — do not pre-apply it.
- **Never modify template features**: Features with `spernakit_version` are template-owned and must not be auto-fixed in derived apps
- **Update `updatedAt`** to current ISO timestamp on any modified feature
- **Write valid JSON**: validate before writing

#### Output

After all fixes are applied, output a summary:

```markdown
## Auto-Fix Summary

| Feature | Issues Fixed | Changes                                                   |
| ------- | ------------ | --------------------------------------------------------- |
| {title} | {count}      | {brief list: expanded spec, added deps, fixed paths, ...} |

**Total**: {n} features modified, {m} issues resolved
```

### Phase 6.5: Roadmap Assignment Re-Assertion (mandatory)

Modifying a feature.json (even a spec-only rewrite) must leave the feature with a valid `.aidd/roadmap.json` assignment. This is an **idempotent re-assertion**: a feature already mapped to an existing milestone is left exactly as-is (no roadmap rewrite, no churn). Only features that are unmapped, or mapped to a milestone that no longer exists, are corrected. After Phase 6 auto-fix and before Phase 7:

1. Read `.aidd/roadmap.json` from the project root. If it does not exist, **create it first**: a single `v1.0` milestone (priority 1) mapping every existing feature directory, preserving each feature's dependencies (keyed by directory). This is the shape the coding runtime auto-creates on first run — roadmap and milestones apply to every project, so a missing file is created, never skipped — then continue with the re-assertion below.
2. For each feature modified in Phase 6, check `roadmap.features["{id}"].milestone`. If it is present **and** that milestone exists in `roadmap.milestones`, do nothing (idempotent; this is the common case and must not rewrite roadmap.json).
3. Only if a modified feature is unmapped or mapped to a missing milestone: assign it to the current milestone, defined as the existing milestone with the highest numeric `priority`. Do not create a new milestone. The owner may re-target afterward.
4. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace. If step 2 left every feature already correctly mapped, note `roadmap assignments already consistent` in the Phase 7 report.

### Phase 6.75: Validate

1. Read back every modified `feature.json` and `.aidd/roadmap.json` when changed. Confirm each file
   parses as JSON and every modified feature still satisfies the structural, dependency, and roadmap
   checks from Phases 3a and 3d.
2. Do not shell into a separate aidd installation to validate another project. When this skill runs
   under aidd, the runtime re-validates every feature record at the end of the run and reports any
   contract issues. When the resolved project is aidd itself, run its local validator:
   `bun run start -- --project-dir . --check-features`.
3. Re-read `.aidd/feature-review-report.md` and confirm its counts and changed-feature list match the
   final files. Do not report completion when JSON, dependency, roadmap, or report reconciliation
   fails.

### Phase 7: Post-Review Pipeline Handoff

After auto-fix completes:

1. **Count full-overlap candidates awaiting separate acceptance** (fix rule 8)
2. **If any full-overlap candidates exist**, recommend a separate acceptance review. Only after the
   owner accepts the implementation and the feature is recorded as `completed` with `passes: true`
   should the aidd-local `consolidate-features` skill fold redundant process records.
3. **Report final feature inventory health**: total features, backlog count, completed count, and
   full-overlap candidates awaiting acceptance
4. **If spec quality issues were widespread** (>30% of features had vague specs), recommend: `Run the aidd-local audit-review skill on the audit definitions that generated these findings to improve spec quality at the source`
5. **Report validation evidence**: files read back, validator result when run, and any validation
   delegated to aidd's end-of-run checks

## Anti-Patterns to Avoid

- Do not invent spec requirements that go beyond the feature's stated scope
- Do not change feature priorities without a cross-feature dependency reason
- Do not merge or split features; only fix the content within each
- Do not add fields that the project's feature.json files don't use
- Do not remove correct spec lines merely because the codebase already contains matching
  functionality; preserve them as acceptance and regression criteria (see fix rule 9)
- Do not reformat JSON fields into a different key order than the original file uses
- Do not hardcode assumptions about the tech stack; always use the conventions discovered in Phase 2

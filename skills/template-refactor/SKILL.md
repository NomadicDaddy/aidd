---
name: template-refactor
description: 'Assess and realign a derived application with the Spernakit template while preserving intentional domain differences and behavior. Use to remediate template drift or clean up unjustified divergence.'
metadata:
    aidd-category: spernakit-fleet
    spernakit-references: docs/template/STACK.md, docs/template/DEVELOPMENT.md
---

# Template-Based Refactor

Assess a derived application against the Spernakit template, identify all drift, generate a remediation plan, and execute refactoring to eliminate stylistic drift while preserving intentional domain-specific differences.

## Usage

```
template-refactor [appname]
template-refactor [appname] --pairs (explicit file pairs mode)
```

- **Full assessment mode** (default): Assess an entire derived app against Spernakit, generate a remediation plan and feature files, then execute.
- **Explicit pairs mode**: Provide specific template/target file pairs for targeted refactoring.

## Instructions

The extensive time requirement is known, understood, and planned for. You have as long as needed and breaks only impact the timeline negatively, so proceed until completed without breaks. This session has no time limits and no token limits.

When making decisions, bring the target application closer to compliance with:

```
.aidd/docs/template/STACK.md
.aidd/docs/template/DEVELOPMENT.md
```

These are staged into the project `.aidd/`; when running inside the Spernakit repository they are also at `<spernakit-root>/docs/template/`.

Drift must be meaningful, deliberate, and necessary for the derived application's functionality and domain -- not accidental or stylistic.

### Phase 0: Input Mode Detection

Determine the input mode based on user's request:

1. **Full assessment mode** (default):
    - User asks for the aidd-local `template-refactor` skill for an app or says "Refactor [appname]"
    - Proceed to Phase 1 (Codebase Assessment)

2. **Explicit pairs mode**:
    - User provides specific file pairs (template + target)
    - Skip to Phase 3 (Analyze Template)

### Phase 1: Codebase Assessment

Thoroughly assess the derived application against the Spernakit template. This is a byte-level comparison, not a cursory review.

0. **Quick drift scan**: Run `bun run check:drift` to get a fast overview of template drift. This identifies which pure template files have diverged and which branded files differ beyond branding substitutions. The drift checker dynamically enumerates all template-managed files from git, so you get comprehensive coverage. Use this output to prioritize the full assessment below.

1. **Identify the comparison scope**

    Read `spernakit/docs/template/STACK.md` and `spernakit/docs/template/DEVELOPMENT.md` to understand the canonical architecture, patterns, and conventions.

    The drift checker dynamically enumerates all template-managed files from git, including `docs/template/` (template documentation that must stay in sync across all derived apps) and `shared/src/` (shared type contract: pure template content, only `shared/package.json` name is branded). Use its report as the starting point for determining which files to assess.

    **Re-export shim files** (`backend/src/constants/errorCodes.ts`, `backend/src/types/roles.ts`, `frontend/src/api/types/common.ts`, `frontend/src/types/roles.ts`) re-export types from the app's shared package for backward compatibility. These are infrastructure files; they must import from the app-branded shared package (for example, `<app-name>-shared`) and re-export, not contain inline definitions.

2. **Byte-level comparison**

    For each template-managed file, compare the Spernakit version against the derived app version. Classify every difference as one of:

    | Classification      | Description                                                   | Action                    |
    | ------------------- | ------------------------------------------------------------- | ------------------------- |
    | **Identical**       | Files match byte-for-byte                                     | No action                 |
    | **Branding only**   | Only app name, slug, ports, cookie names differ               | No action (config-driven) |
    | **Stylistic drift** | Same functionality, different formatting/ordering/naming      | Fix: match template       |
    | **Domain-specific** | Intentional deviation for app's unique requirements           | No action (document why)  |
    | **Missing file**    | File exists in Spernakit but not in derived app               | Fix: copy from Spernakit  |
    | **Mixed drift**     | Both stylistic drift AND domain-specific changes in same file | Fix: selective refactor   |
    | **Enhancement**     | Derived app has a genuine improvement over template           | Evaluate for backport     |

3. **Document findings**

    For each file with drift, record:
    - File path (relative to app root)
    - Classification
    - Specific differences (line numbers, code snippets)
    - Whether the difference is justified (and why)

### Phase 2: Remediation Plan and Feature Generation

Based on the assessment findings, generate two outputs:

#### 2a. Remediation Plan

Write `{app}/REMEDIATION-PLAN.md` with the following structure:

```markdown
# Remediation Plan: {AppName}

Generated: {date}
Template version: {spernakit_version from package.json}
Current app version: {spernakit_version from derived app's package.json}

## Summary

- Files assessed: {N}
- Identical: {N}
- Branding only: {N}
- Stylistic drift: {N}
- Domain-specific (intentional): {N}
- Missing: {N}
- Mixed drift: {N}
- Enhancements to evaluate: {N}

## Drift Items

### 1. {file path} -- {classification}

**Differences:**
{description of what differs}

**Action:** {copy | refactor | selective refactor | no action}
**Justification:** {why this action}

### 2. ...

## Domain-Specific Deviations (Intentional)

Document each intentional deviation with justification so future audits
don't flag them as drift.

| File | Deviation | Justification |
| ---- | --------- | ------------- |
| ...  | ...       | ...           |

## Enhancements for Backport Evaluation

| File | Enhancement | Severity | Recommendation |
| ---- | ----------- | -------- | -------------- |
| ...  | ...         | ...      | ...            |
```

#### 2b. Feature Files

Group related drift items into logical remediation features. Create a feature directory for each group:

```
{app}/.aidd/features/remediation-{timestamp}-{slug}/feature.json
```

Where:

- `{timestamp}` is a compact timestamp (e.g., `20260209`)
- `{slug}` is a short kebab-case descriptor (e.g., `build-config`, `docker-alignment`, `frontend-layout`, `backend-infra`)

Each `feature.json` must comply with `aidd/docs/reference/feature-fields.md`:

```json
{
    "id": "remediation-{timestamp}-{slug}",
    "title": "Remediation: {descriptive title}",
    "category": "Remediation",
    "description": "Resolve template drift in {scope description}. Files affected: {list}. Changes: {summary of what will be fixed}.",
    "priority": {1-3},
    "status": "backlog",
    "spec": "{numbered acceptance criteria: 1. File X matches template byte-for-byte for shared sections\n2. File Y formatting normalized to template style\n...}",
    "affectedFiles": ["{file paths this remediation touches; may be empty initially}"],
    "dependencies": [],
    "createdAt": "{ISO timestamp}",
    "updatedAt": "{ISO timestamp}"
}
```

**Grouping heuristics:**

- Group by subsystem (build config, Docker, backend infra, frontend layout, etc.)
- Keep features small enough to be reviewable (3-8 files per feature)
- Order by priority: build/config drift first, then backend, then frontend
- Features that affect type checking or build should come before cosmetic fixes

**Present the remediation plan and feature list, then proceed directly to execution.**

### Phase 3: Analyze Template (For Each File Pair)

For each drifted file, run `diff --unified` to get precise differences. Do NOT read both files and compare mentally.

Read the template file and analyze:

1. **Structural Elements**
    - Import statements (exact order, grouping, formatting)
    - Export statements (default vs named, order)
    - Class/function/object definitions (formatting, ordering)
    - Type definitions (interfaces, types, enums)
    - Configuration objects (structure, property order)

2. **Syntax Patterns**
    - Indentation style (tabs vs spaces, amount)
    - Quotation marks (single vs double)
    - Semicolons (present or omitted)
    - Line breaks and spacing (between sections, around operators)
    - Comment style (single-line vs multi-line, placement)
    - Trailing commas (present or omitted)

3. **Code Organization**
    - Section ordering (imports -> types -> constants -> functions -> exports)
    - Grouping patterns (related code together)
    - Separator comments (section headers)
    - Naming conventions (camelCase, PascalCase, etc.)

4. **Technical Patterns**
    - Error handling approach
    - Async/await vs promises
    - Arrow functions vs function declarations
    - Object/array destructuring patterns
    - Type annotation style (inline vs separate)

### Phase 4: Analyze Target File

Read the target file and identify:

1. **Custom Logic**
    - Project-specific business logic
    - Unique functions or methods
    - Custom error messages or constants
    - Project-specific imports or dependencies
    - Custom type definitions

2. **Shared Elements**
    - Code that does the same thing as the template
    - Standard boilerplate (error handlers, health checks, etc.)
    - Common patterns (route setup, middleware, config)

3. **Differences**
    - What needs to change to match template
    - What must be preserved (custom logic)
    - What needs to be injected into the new structure

### Phase 5: Enhancement Detection (Bidirectional Analysis)

Before refactoring, check whether the target file contains improvements over the template that should be evaluated for backporting.

1. **Identify Potential Enhancements**

    For shared functionality, compare implementations and flag where target has:
    - Better error handling (more specific types, better recovery)
    - Stronger type safety (not just `any` or `unknown`)
    - Additional validation (input, boundary, null safety)
    - Performance improvements (better algorithms, caching)
    - Security improvements (sanitization, injection prevention)
    - Better observability (logging, error context, metrics)
    - Edge case handling (corner cases, graceful degradation)

2. **Categorize Each Difference**

    | Category             | Description                         | Action                |
    | -------------------- | ----------------------------------- | --------------------- |
    | **Project-specific** | Unique to this app                  | Preserve in target    |
    | **Stylistic drift**  | Same functionality, different style | Refactor to template  |
    | **Enhancement**      | Improved implementation             | Evaluate for backport |
    | **Bug fix**          | Corrects an issue in template       | Port back to template |

3. **Handle Enhancements**

    If enhancements are detected, apply the safe default: **port the enhancement to the template
    first**, then refactor (bidirectional flow), so the improved implementation is not lost. Report
    each enhancement and the action taken so the owner can re-target afterward.

### Phase 6: Create Refactoring Plan

Before making changes, create a detailed plan:

1. **Map shared structural elements** (imports, function/class names, config properties)
2. **Map custom logic injection points** (where domain-specific code fits in template structure)
3. **Define transformation rules**:
    - Byte-level identity for shared elements
    - Template syntax style for all code (including custom logic)
    - Preservation rules for domain-specific code
4. **Validation criteria**: same functionality, all custom logic preserved, exact template match for shared structure

### Phase 7: Execute Refactor

Before reading full files, run `diff --unified` to get the precise delta. This prevents missing subtle single-line changes.

1. **Create new file structure** following template exactly:
    - Start with template as base (including any ported enhancements)
    - Copy imports, types, function signatures with exact formatting

2. **Inject custom logic** into the new structure:
    - Insert custom imports (maintaining template's import organization)
    - Add custom type definitions (maintaining template's type organization)
    - Inject custom logic into functions/methods
    - Preserve custom constants, configurations, and kept enhancements

3. **Apply template syntax to ALL code**:
    - Exact indentation, quotation marks, line breaks, comment style, spacing
    - **If code does the same thing, it must look exactly like the template**
    - **Custom logic must adopt template's syntax style**
    - **No stylistic deviations allowed**

4. **For mixed-drift files** (selective refactor):
    - Replace stylistic sections with template equivalents
    - Preserve domain-specific sections verbatim
    - If sections overlap, preserve app-specific logic (conservative approach)

5. **For re-export shim files**: Preserve the re-export pattern; these files must import from the app's shared package and re-export, not contain inline type definitions. Match the template's shim structure exactly, substituting only the shared package name.

### Phase 8: Verification

After refactoring each file:

1. **Syntax check**: TypeScript compiles, no missing imports, types correct
2. **Functionality check**: Custom logic preserved, no features lost
3. **Style compliance**: Shared code is byte-level identical to template, custom code follows template syntax
4. **Quality gate**: Run `bun run smoke:qc` from the application root

### Phase 9: Summary

After processing all files:

1. **Summary report**:
    - Total files processed, successful refactors, issues encountered
    - Enhancements detected, ported, kept in target, or deferred

2. **Update feature status**:
    - Mark completed remediation features as `"status": "completed"`
    - Update `updatedAt` timestamps

3. **Update remediation plan**:
    - Mark completed items
    - Note any new drift discovered during execution

4. **Next steps**:
    - Run `bun run smoke:qc` to verify
    - Review git diff to confirm changes
    - If enhancements were ported to Spernakit, test Spernakit independently
    - Commit with descriptive message referencing remediation features

## Principles

1. **Byte-level identity for shared structure**: If it exists in the template, match it exactly
2. **Injection of custom logic**: Preserve all project-specific code
3. **No stylistic deviations**: If code does the same thing, it must look exactly like the template
4. **Functionality preservation**: Refactored file must maintain all original functionality
5. **Template as source of truth**: All syntax, formatting, and organization decisions come from template
6. **Bidirectional enhancement flow**: Improvements in derived apps should be identified and considered for template integration
7. **Enhancement preservation**: Never silently overwrite genuine improvements during refactoring
8. **User-driven decisions**: Always present enhancement options to user rather than making assumptions
9. **Assessment before execution**: Always generate a remediation plan before touching code
10. **Traceable features**: Every logical group of changes has a feature.json for tracking

## Notes

- `docs/template/` files are template-managed and must be propagated to all derived apps (they are NOT app-specific docs)
- This skill does NOT format code; it matches the template's format exactly
- This skill preserves ALL custom logic from the target file
- Enhancement detection is mandatory -- never skip Phase 5
- If custom versus shared ownership remains uncertain, preserve the target implementation, report
  the unresolved classification, and continue independent changes
- If enhancement evidence remains inconclusive, preserve the target implementation and report the
  unresolved classification
- Multiple file pairs can be processed in one command execution
- Each file pair is processed independently but follows the same methodology
- Track all enhancement decisions in the summary report
- Domain-specific deviations must be documented in REMEDIATION-PLAN.md so future audits understand them

---
name: spernakit-diff-sync
description: 'Compare targeted file pairs between Spernakit and a derived application, classify three-way template drift, and apply evidence-backed synchronization in the correct direction. Use for focused drift correction, backporting a proven derived-app fix, or adopting a small set of current template files; use spernakit-template-refactor for whole-application realignment.'
metadata:
    aidd-category: spernakit-fleet
---

# Synchronize Spernakit Drift

Compare targeted files between Spernakit and a derived application. Distinguish template
advancement, app-specific behavior, branding, and reusable fixes before changing either side.
Apply evidence-backed changes directly and keep affected feature metadata accurate.

## Relationship to Template Refactor

Use this skill for a specific fix, enhancement, or small file set. Use `spernakit-template-refactor` when
the goal is to assess and realign an entire derived application.

Map the two skills' classifications as follows:

| Diff sync                   | Template refactor                        |
| --------------------------- | ---------------------------------------- |
| Identical                   | Identical                                |
| Intentional or app-specific | Domain-specific or branding              |
| Minor code drift            | Stylistic drift                          |
| Template advancement        | Resolved through the baseline comparison |
| Reusable enhancement or fix | Enhancement or bug fix                   |
| App-only utility            | No equivalent; do not backport           |

## Usage

```
spernakit-diff-sync <app> <target...>
```

- `<app>` → derived application name or path.
- `<target...>` → one or more files, file pairs, features, or drift areas to compare.
- Resolve the Spernakit repository and the app's baseline version from the workspace and its
  `package.json`; do not require them as duplicate invocation arguments.

## Inputs and Preconditions

Resolve these values before comparing files:

- Spernakit repository path
- Derived application path
- Target file, feature, or drift area
- Derived application's `spernakit_version` from `package.json`
- Clean, independently confirmed Git status for both repositories

`spernakit_version` is stored without the `v` prefix used by Spernakit's release tags. Require the
corresponding tag to resolve to a commit:

```text
git -C <spernakit-root> rev-parse "v<spernakit_version>^{commit}"
```

If it does not resolve, continue only with a two-way comparison and state that direction has
lower confidence. Do not infer a baseline from package versions or dates.

## Workflow

### 1. Build the Worklist

Run `bun run check:drift` in the derived application. It compares the application with its recorded
template tag, so use it to establish pre-existing app drift and accepted overrides. It does not
report advancements made after that tag. Build the targeted worklist from the user's scope, then
confirm each path is template-managed at the recorded tag or current template using the drift
checker's dynamic enumeration and manifest classifications.

Limit the worklist to the user's target. Common comparable areas include:

- `backend/src/**/*.ts`
- `frontend/src/**/*.{ts,tsx}`
- `shared/src/**/*.ts`
- Root configuration files
- `docs/template/**/*.md`

Exclude generated output, dependencies, coverage, databases, and other untracked runtime data.
Treat `docs/template/`, `shared/src/`, and `shared/package.json` as template-managed pure copies
unless the manifest at the version being compared classifies a path otherwise.

### 2. Remove Branding Noise

Do not classify expected branding as drift. Use the exact branded-file classifications and
per-file normalizations implemented by the current drift checker, including application identity,
description, ports, cookie names, and database URLs where applicable. Do not invent branding
allowances for files or values the checker treats as pure.

Trust the drift checker's branded-file result when it says a file differs beyond branding. Do
not expand the branding allowance to hide behavioral changes.

### 3. Produce Unified Diffs

Run a unified diff for every file pair before reading surrounding code:

```text
git diff --no-index --unified <spernakit-file> <derived-file>
```

Do not use bare `diff`; PowerShell aliases it to `Compare-Object`. Skip pairs with no diff. For
changed pairs, classify every hunk rather than assigning one label to the entire file.

### 4. Determine Direction from the Baseline

Extract the baseline version of each changed template file:

```text
git -C <spernakit-root> show v<spernakit_version>:<relative-path> > <baseline-file>
```

Compare baseline to current Spernakit and baseline to the current derived application:

| Baseline to Spernakit | Baseline to app | Meaning       | Direction                                   |
| --------------------- | --------------- | ------------- | ------------------------------------------- |
| Unchanged             | Changed         | App diverged  | Restore app, or propose a reusable backport |
| Changed               | Unchanged       | App is behind | Adopt current Spernakit into the app        |
| Changed               | Changed         | Both evolved  | Present the conflict; do not auto-resolve   |
| Unchanged             | Unchanged       | No drift      | Skip                                        |

Never determine direction from which version looks newer or cleaner. Use the three-way evidence.

### 5. Classify Each Hunk

#### Identical

Take no action.

#### Intentional or app-specific

Preserve business logic, schema extensions, UI behavior, configuration, and branding that belong
only to the derived application.

#### Homogenization candidate

Consider aligning equivalent implementations when one side has a demonstrably better type,
validation, error-handling, import, or API pattern. Explain the concrete benefit; do not prefer a
pattern merely because it is in Spernakit or newer.

#### Template advancement

Adopt the Spernakit side into the derived application only when the baseline comparison shows that
Spernakit changed and the application did not.

#### App-only utility

Do not backport a helper export when the derived application has consumers but Spernakit does not.
Spernakit prohibits library code without an immediate consumer, and its dead-code gate will flag
unused exports. Backport both the capability and its real template consumer when both are within the
requested drift area; otherwise preserve them and report the scope boundary.

### 6. Present the Plan

Before editing, present every proposed change:

| File               | Evidence                      | Classification       | Direction        | Reason        |
| ------------------ | ----------------------------- | -------------------- | ---------------- | ------------- |
| `relative/path.ts` | Baseline/app/template summary | Template advancement | Spernakit to app | App is behind |

Call out preserved differences and unresolved conflicts, then apply every high-confidence change
directly. Preserve both sides of unresolved conflicts and continue independent changes.

### 7. Apply Changes

For each evidence-backed hunk:

1. Edit only the selected destination file.
2. Preserve unrelated local changes.
3. Keep backend routes, frontend callers, registrations, and consumers aligned in the same change.
4. Avoid app-only exports in Spernakit.
5. Review the resulting diff immediately.

Do not create compatibility layers, placeholders, or future-use abstractions. Do not commit or
push unless the user requests it.

### 8. Update Feature Metadata

When a Spernakit code change affects an existing `.aidd/features/*/feature.json`, update the
feature in the Spernakit repository so its `spec` describes the implementation accurately, and set
`updatedAt` to the current ISO timestamp. Never change the feature record's `spernakit_version`; it
records the version that introduced the record, not the version that last revised it. Never edit a
template-owned feature directly in a derived application; propagate it through Spernakit's template
feature sync workflow when that workflow's version-parity preconditions are met.

Do not change identity, status, priority, dependencies, or pass state unless the implementation
requires it within the requested drift area.

If `.aidd/roadmap.json` exists and feature metadata changed, preserve existing milestone
assignments. Assign newly mapped features to the existing milestone with the highest numeric
priority; do not create a milestone. Then run from aidd:

```text
bun run aidd-tools -- roadmap:apply --project-dir <app>
```

This skill is one of the two deliberate exceptions to "aidd applies the roadmap itself at run end".
It syncs repositories other than the one this run targets, and aidd only reconciles its own project;
those other apps have no other way to get propagated. Run it once per modified app, not for the run
target.

Update a derived application's `spernakit_version` only when it has actually adopted the
corresponding current template baseline and that baseline resolves in the Spernakit repository.

## Validation

Validate every modified repository independently:

1. Run `bun run check:drift` in each modified derived application.
2. Run `bun run smoke:qc` in Spernakit if Spernakit changed.
3. Run `bun run smoke:qc` in every modified derived application.
4. Run relevant targeted tests for the changed behavior.
5. Validate affected feature and roadmap metadata through the repository's documented commands.
6. Recheck Git status and review the final diff in both repositories.

Use the gates declared in each repository's `package.json` and `docs/template/TESTING.md`. Do not
invoke LTS policy files or gates that those sources do not declare. Do not bypass a cached
`smoke:qc` result.

## Output

Report:

- Files changed in Spernakit
- Files changed in the derived application
- Direction and justification for each change
- Intentional differences preserved
- Conflicts left unresolved
- Feature and roadmap metadata updated
- Validation commands and results
- Any degraded-confidence classification caused by a missing baseline

End with counts for patterns adopted from Spernakit, patterns backported from the derived app,
preserved differences, unresolved conflicts, and updated feature specifications.

## Rules

- Start every classification from a unified diff.
- Use the recorded baseline to determine direction.
- Present the plan before modifying either repository, then continue directly.
- Prefer the better supported pattern, not a preferred source.
- Preserve app-specific behavior and branding.
- Keep template-managed documentation and shared source synchronized.
- Backport only code with an immediate Spernakit consumer.
- Validate both repositories when both changed.

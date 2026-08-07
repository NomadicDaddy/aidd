---
name: changelog-rewrite
description: 'Rewrite a script-generated changelog into meaningful release history grouped by build phase, with aligned 0.x.y version references. Use when generated entries are noisy, repetitive, or carry inflated versions.'
metadata:
    aidd-category: metadata
    aidd-contracts: humanize-docs
---

# Changelog Rewrite

Replace a mechanically generated changelog (one version bump per feature/vertical) with a meaningful, phase-grouped changelog using proper `0.x.y` pre-release semver. Also corrects all version references across the project.

## Usage

```
changelog-rewrite [app]
```

## Inputs

When invoked, determine the target project:

1. If a path is provided as an argument, use it directly
2. Otherwise, use the current working directory

**Required files:**

- `docs/CHANGELOG.md`: the existing changelog to rewrite
- `package.json`: root package.json with version field

**Optional files (read for context if present; do not bump their versions):**

- `backend/package.json`
- `frontend/package.json`

If `docs/CHANGELOG.md` does not exist, create it from the available Git history.

## Instructions

### Phase 1: Gather Build History

1. **Read the existing changelog** to understand what the script produced:

    ```bash
    # Read existing changelog
    cat docs/CHANGELOG.md
    ```

2. **Get full commit history with dates:**

    ```bash
    git log --oneline --reverse --format="%h %ad %s" --date=short
    ```

3. **Count commits to understand scale:**

    ```bash
    git rev-list --count HEAD
    ```

4. **Read package.json files** to get current versions:

    ```bash
    cat package.json
    cat backend/package.json 2>/dev/null
    cat frontend/package.json 2>/dev/null
    ```

### Phase 2: Identify Build Phases

Analyze the commit history and existing changelog to identify logical build phases. A "phase" represents a cohesive milestone in development.

**Phase identification criteria:**

| Signal                 | Example                                         | Phase Type                                         |
| ---------------------- | ----------------------------------------------- | -------------------------------------------------- |
| Initial project setup  | "feat: scaffold app", "chore: initial commit"   | Template scaffold (0.0.0)                          |
| Domain model creation  | "feat: add Task model", "feat: add User schema" | Core models                                        |
| Backend infrastructure | "feat: add auth routes", "feat: CRUD for tasks" | API layer                                          |
| Frontend foundation    | "feat: add layout", "feat: dashboard page"      | UI foundation                                      |
| Feature verticals      | Multiple commits around "reports", "scheduling" | Feature module                                     |
| UI polish/widgets      | "feat: add stats widget", "feat: navbar"        | UI enhancements                                    |
| Bug fixes grouped      | Multiple "fix:" commits after a feature         | Should stay with their feature, not separate phase |

**Phase grouping rules:**

1. **Group related commits**: don't create a phase per commit
2. **Merge small features**: 2-3 related commits belong in one phase
3. **Separate large features**: a 20-commit feature vertical is its own phase
4. **Keep fixes with features**: bug fixes belong with the feature they fix
5. **One phase = one minor version bump**: `0.1.0`, `0.2.0`, etc.

**Extract phase dates:**

For each phase, use the date of the last commit in that phase:

```bash
# Get date of specific commit
git show -s --format=%ad --date=short <commit-hash>
```

### Phase 3: Plan Changelog Structure

Before writing, create a phase outline:

```
Phase 0: Template scaffold (0.0.0), {date of first commit}
Phase 1: {description} (0.1.0), {date of last commit in phase}
Phase 2: {description} (0.2.0), {date}
...
Phase N: {description} (0.N.0), {date} (current)
```

**Determine target version:**

The target version is `0.{N}.0` where N is the number of the highest phase (excluding Phase 0).

### Phase 4: Write Changelog

Write `docs/CHANGELOG.md` following this structure:

```markdown
# Changelog

All notable changes to {AppName} are documented in this file.

Based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).
This project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.N.0] - YYYY-MM-DD

{Optional 1-2 line context for significant milestones only.}

### Added

- {Concise, human-readable entry}
- {Group related items logically}

## [0.N-1.0] - YYYY-MM-DD

### Added

- ...

## [0.0.0] - YYYY-MM-DD

### Added

- Initial project scaffold from template
```

**Writing guidelines:**

| Pattern      | Example                                                    |
| ------------ | ---------------------------------------------------------- |
| Model/entity | `Card model (priority, due dates, story points, metadata)` |
| CRUD API     | `Task CRUD API (routes, controller, service)`              |
| Service      | `Report service with execution orchestration`              |
| Page         | `Tasks page with CRUD, search, pagination, cron editing`   |
| Widget       | `Dashboard statistics widget`                              |
| Auth         | `JWT authentication with refresh tokens`                   |
| Config       | `Environment configuration with validation`                |

**Entry rules:**

- One line per entry, describe WHAT not HOW
- Use parenthetical context for technical details
- Group related items under one entry when possible
- Each restored/parity feature gets its own entry
- Never dump raw feature.json descriptions
- Never use "### Changed" for new widgets; they're "### Added"

**Prose style:** all changelog prose follows the humanize-docs style contract
(`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo); read it before drafting. Minimum bar if
it is unavailable: plain natural language, no em-dashes, no AI filler (delve, leverage, robust,
seamless, comprehensive), no marketing adjectives - describe what the change does, not how
impressive it is.

### Phase 5: Update Version References

Update the version in the root `package.json` only (read it first to confirm it exists):

1. `package.json`: root `"version"` field

Do NOT bump `backend/package.json` or `frontend/package.json`; version lives in the root `package.json` only; child bumps are an anti-pattern (see the document-changes skill).

### Phase 6: Verify Changes

1. **Check file was written correctly:**

    ```bash
    head -50 docs/CHANGELOG.md
    ```

2. **Verify root version:**

    ```bash
    grep '"version"' package.json
    ```

3. **Show git status:**

    ```bash
    git status --short
    ```

### Phase 7: Present Summary

Output a summary table:

```
| Version | Phase | Date |
|---------|-------|------|
| 0.0.0   | Template scaffold | YYYY-MM-DD |
| 0.1.0   | {description} | YYYY-MM-DD |
| ...     | ... | ... |
| 0.N.0   | {description} (current) | YYYY-MM-DD |
```

Report:

- Consolidation ratio (e.g., "54 versions → 9 phases")
- Files updated
- Any anomalies found (missing commits, unclear groupings)

## Example Transformation

**Before (mechanical changelog):**

```markdown
## [1.47.0] - 2024-01-15

- feat(dashboard): add stats widget

## [1.46.0] - 2024-01-15

- feat(dashboard): add navbar component

## [1.45.0] - 2024-01-14

- feat(dashboard): add layout shell
```

**After (phase-grouped changelog):**

```markdown
## [0.5.0] - 2024-01-15

### Added

- Dashboard layout with navigation and statistics widget
- Responsive navbar with user menu
```

## Anti-Patterns to Avoid

| Anti-Pattern              | Why It's Wrong                      | Correct Approach                     |
| ------------------------- | ----------------------------------- | ------------------------------------ |
| Raw feature descriptions  | Unreadable, too technical           | Rewrite in concise human language    |
| Starting at 1.0.0         | 1.0.0 = first stable public release | Pre-release apps use `0.x.y`         |
| "### Changed" for widgets | New widgets are additions           | Use "### Added"                      |
| Grouping by first word    | Creates artificial categories       | Group by build phase                 |
| Patch versions per commit | e.g., `1.32.1`, `1.32.2`, `1.32.3`  | Multiple commits → one minor version |
| Keeping mechanical dates  | Every commit has same date          | Use phase completion date            |
| Phase per commit          | 47 commits ≠ 47 phases              | Group related work into phases       |

## Troubleshooting

| Issue                              | Solution                                         |
| ---------------------------------- | ------------------------------------------------ |
| No docs/CHANGELOG.md               | Create it from git history                       |
| No git history                     | Return a blocker with the missing evidence       |
| Unclear phase boundaries           | Use conservative chronological groupings         |
| Existing changelog is already good | Report "No rewrite needed" and exit              |
| Root version differs from computed | Update root package.json to the computed version |

## Notes

- this skill is for **pre-release apps**; if the app is already at 1.x.y, consult the user before downgrading
- Patch versions (0.x.**1**, 0.x.**2**) are reserved for bug fix releases, not features
- Each phase should represent meaningful progress a user would care about
- When in doubt about phase boundaries, prefer fewer, larger phases over many small ones

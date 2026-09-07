---
name: commit-archaeology
description: "Analyze an application's Git history for reversions, flip-flops, repeated rework, and unstable patterns. Use when investigating churn, indecision, or recurring refactors."
metadata:
    aidd-category: runtime
    aidd-contracts: humanize-docs
---

# Commit Archaeology

Thoroughly review a repository's commit history for recurring patterns: changes introduced,
reverted, and reintroduced; flip-flops in logic or implementation; repeated refactors; and other
signs of indecision or systemic rework.

## Usage

```
commit-archaeology [app] [--since <date>] [--path <path>]
```

- **app** _(optional)_: Application name or path. If omitted, use the current repository.
- **--since** _(optional)_: How far back to look (default: `6 months ago`). Accepts any `git log --since` format.
- **--path** _(optional)_: Limit analysis to a repository-relative subdirectory or file (e.g.,
  `backend/src/routes`, `frontend/src/pages/dashboard`).

## Instructions

### Phase 1: Gather History

1. **Resolve the app directory** from the explicit name or path, or use the current repository when
   no app is supplied. Resolve names under the configured or instructed application roots. Verify
   that the result is a Git worktree. If the target is missing, ambiguous, or is not a Git worktree,
   return a usage error instead of guessing.

    Treat `--path` as relative to the resolved worktree. Reject a path that escapes it. In the Git
    commands below, omit the final `-- "{PATH}"` when no path scope was supplied.

2. **Collect the full commit log** for the time range:

    ```bash
    git -C "{APP_DIR}" log --since="{SINCE}" --format="%H %ad %s" --date=short -- "{PATH}"
    ```

3. **Collect commit diffs** for pattern detection. For each commit in the range, capture the stat and patch:

    ```bash
    git -C "{APP_DIR}" log --since="{SINCE}" --stat --patch --reverse -- "{PATH}"
    ```

    For large histories (500+ commits), break this into batches of ~50 commits to avoid context overflow.
    When `--path` names one file that was renamed during the range, make a separate pass with
    `git log --follow` for that file so its earlier name is included. Do not use `--follow` with a
    directory or multiple paths.

4. **Collect revert commits** explicitly:

    ```bash
    git -C "{APP_DIR}" log --since="{SINCE}" --grep="[Rr]evert" --format="%H %ad %s" --date=short -- "{PATH}"
    ```

5. **Collect files with high churn** (many commits touching the same file):

    ```bash
    git -C "{APP_DIR}" log --since="{SINCE}" --format="" --name-only -- "{PATH}"
    ```

    Count the non-empty path lines, sort by count descending, and retain the top 30. Use the active
    shell's native tools or perform the count during analysis; do not assume Unix pipeline commands
    are available.

### Phase 2: Detect Patterns

When the active backend supports independent workers, assign up to three bounded history analyses in
parallel, one for each pattern category below. Give every worker the Phase 1 evidence and required
output format. Otherwise perform the same analyses sequentially. Do not require a provider-specific
agent name or worker type.

#### Agent 1: Revert/Reintroduce Cycles

Search for sequences where:

- A change is introduced in commit A
- The same change (or the file/function it touched) is reverted in commit B
- A similar change is reintroduced in commit C

Detection strategies:

- Explicit `Revert "..."` commits paired with later commits touching the same files
- Diff content that adds lines, later removes them, then adds them again (or semantically equivalent code)
- Functions or components that are created, deleted, then recreated
- Configuration values that toggle between states across commits

For each cycle found, report:

- The commit chain (A → B → C) with SHAs, dates, and messages
- The specific code or config that flip-flopped
- Whether the final state matches the original introduction or is a third variant

#### Agent 2: Logic and Implementation Flip-Flops

Search for patterns where implementation approach oscillates:

- Switching between two libraries or approaches for the same problem (e.g., fetch → axios → fetch)
- Toggling boolean logic or conditional branches back and forth
- Renaming/restructuring that gets undone
- API endpoint patterns that change and change back (REST → different REST shape → original shape)
- Database schema columns or tables added then removed then re-added
- Feature flags or environment checks that toggle

Detection strategies:

- Files with high churn (many commits) relative to their age
- Commits with opposing diffs on the same lines/functions
- Import statements that appear, disappear, and reappear
- Schema migration files that undo previous migrations

For each flip-flop found, report:

- The file(s) and function(s) affected
- The sequence of changes with commit SHAs and dates
- The two (or more) states being alternated between
- The current state

#### Agent 3: Procedural and Structural Oscillation

Search for broader patterns:

- File/directory structure that gets reorganized then reorganized back
- Build or config changes that are introduced then rolled back
- Coding style or convention changes that don't stick (e.g., switching naming conventions back and forth)
- Dependencies added then removed then re-added
- Route registration patterns that change approach
- Test strategy changes (e.g., mocking approach toggling)

Detection strategies:

- `package.json` diff history showing dependencies that appear and disappear
- Config file changes that revert previous config changes
- Directory moves followed by reverse moves (tracked via rename detection in `git log --follow`)
- Linting rule changes that oscillate

For each pattern found, report:

- What oscillated and between which states
- The commit sequence with SHAs and dates
- The current state and whether it appears stable

### Phase 3: Consolidate and Analyze

After all agents complete:

1. **Deduplicate findings:** the same flip-flop may be detected by multiple agents from different angles.

2. **Classify each finding by severity**:

    | Severity   | Criteria                                                                                     |
    | ---------- | -------------------------------------------------------------------------------------------- |
    | **High**   | 3+ cycles on the same code, or the pattern is still active (last oscillation within 30 days) |
    | **Medium** | 2 cycles, or the pattern involves architectural/structural decisions                         |
    | **Low**    | Single revert/reintroduce, or the pattern appears resolved (stable for 60+ days)             |

3. **Identify root causes** where the history, tests, or repository documentation supports them.
   Label an evidence-backed interpretation as likely; use `Unknown` rather than assigning a cause
   from commit messages alone:
    - Missing architectural decision record → the same debate replays
    - No tests covering the behavior → regressions trigger reverts
    - Multiple contributors with different preferences → style wars
    - External dependency instability → forced oscillation
    - Incomplete understanding of requirements → trial and error

4. **Check current stability:** for each finding, determine whether the code is currently in a stable state or still actively oscillating.

### Phase 4: Report

Set `{RUN}` to `YYYY-MM-DD-HHmmss`, using the local date and time when the analysis starts. Generate
a report at `{APP_DIR}/.aidd/reports/commit-archaeology-{RUN}.md`. Never overwrite an existing
report; if the path already exists, add a short unique suffix.

Create the reports directory with the active environment's native filesystem operation if it does
not exist.

#### Report Structure

```markdown
# Commit Archaeology Report: {APP_NAME}

**Date:** {YYYY-MM-DD}
**Range:** {SINCE} to present
**Scope:** {PATH or "entire repository"}
**Commits analyzed:** {N}

## Executive Summary

{1-3 sentences: how many patterns found, overall stability assessment, most concerning finding}

## High Severity

### {Finding title}

**Pattern:** {revert-cycle | logic-flip-flop | structural-oscillation}
**Files:** {list of affected files}
**Commits:**

| #   | Date   | SHA         | Message   | Action       |
| --- | ------ | ----------- | --------- | ------------ |
| 1   | {date} | {short-sha} | {message} | Introduced   |
| 2   | {date} | {short-sha} | {message} | Reverted     |
| 3   | {date} | {short-sha} | {message} | Reintroduced |

**What flip-flopped:** {specific description of what changed back and forth}
**Current state:** {description + whether it appears stable}
**Likely root cause:** {analysis}
**Recommendation:** {what to do about it}

---

## Medium Severity

{Same structure per finding}

## Low Severity

{Same structure per finding}

## Recommendations

{Prioritized list of actions to stabilize the codebase and prevent future oscillation}

## Statistics

| Metric                         | Value |
| ------------------------------ | ----- |
| Commits analyzed               | {N}   |
| High-churn files (10+ touches) | {N}   |
| Revert commits found           | {N}   |
| Revert/reintroduce cycles      | {N}   |
| Logic flip-flops               | {N}   |
| Structural oscillations        | {N}   |
| Currently unstable patterns    | {N}   |
```

Write the report's narrative prose (summary, root-cause analysis, recommendations) to the
humanize-docs skill's style contract (apply the humanize-docs skill to the drafted text before
saving): plain factual language, no em-dashes, no AI filler (delve, leverage, robust, seamless),
state findings without dramatizing them. The tables stay as specified.

### Phase 5: Present Findings

After saving the report:

1. Print the path to the saved report
2. Present the executive summary and high-severity findings inline
3. If there are recommendations, highlight the top 3 actionable items

## Guidance

- **Semantic awareness matters.** Treat a function rewritten with different variable names but identical logic as the same code reintroduced.
- **Not all reverts are flip-flops.** A revert followed by a better implementation is healthy iteration. Only flag it if the replacement closely resembles the original pre-revert state.
- **Co-authored commits count.** AI-assisted commits (Co-Authored-By lines) are common in this codebase. Treat them as normal commits and analyze them the same way.
- **Respect the time range.** Don't flag ancient history unless the pattern is still active. The default 6-month window exists to focus on recent instability.
- **Be specific.** Vague findings like "this file changed a lot" are useless. Show the exact lines, values, or logic that oscillated.

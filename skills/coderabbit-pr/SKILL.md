---
name: coderabbit-pr
description: 'Pull and remediate CodeRabbit feedback from a GitHub pull request, validate fixes, and commit without pushing. Use when addressing CodeRabbit findings on an existing PR.'
metadata:
    aidd-category: runtime
---

# CodeRabbit PR Remediation

Fetch the review feedback the CodeRabbit GitHub App left on a pull request, triage it, fix what
is real, and commit the fixes. This is the second half of the PR review loop: the GitHub App
reviews pushed PRs in the cloud; this skill brings that feedback back into the working tree
and addresses it.

## Usage

```
coderabbit-pr [appname] [pr]
```

If `[appname]` is omitted, infer from the current working directory. If `[pr]` is omitted, use
the open pull request for the current branch.

## Setup

1. Check that the GitHub CLI is available and logged in:
    - `gh --version`
    - `gh auth status`
2. If either fails, STOP and report what is missing: install from cli.github.com, then
   `gh auth login` (interactive; the user must do this themselves).
3. Confirm the repository has a GitHub remote (`gh repo view --json nameWithOwner`). If not,
   stop and say so.

## Workflow

### Step 1: Resolve the pull request

- Use the `[pr]` argument if provided; otherwise `gh pr view --json number,headRefName,state`
  for the current branch.
- If no PR exists, report that and stop. If the PR's head branch does not match the current
  branch, check out the head branch first (stop instead if the working tree is dirty).

### Step 2: Collect CodeRabbit feedback

CodeRabbit posts on three surfaces; gather all of them, filtering to comments authored by
`coderabbitai[bot]`:

```bash
gh api repos/{owner}/{repo}/pulls/<pr>/comments --paginate   # inline review comments
gh api repos/{owner}/{repo}/pulls/<pr>/reviews --paginate    # review summaries
gh pr view <pr> --json comments                              # conversation comments
```

(`gh api` resolves the `{owner}/{repo}` placeholders itself.) If CodeRabbit has left nothing,
report "no CodeRabbit feedback on PR #N" and stop. That usually means the GitHub App is not
installed on the repository.

### Step 3: Triage every finding

Judge each finding against the actual code (read the file; excerpts in comments may be stale):

- **Real**: the issue exists and matters. Queue it for a fix.
- **False positive, stale, or not applicable**: dismiss it with a one-line justification.
- **Needs human judgment** (product decisions, tradeoffs the code cannot settle): list it for
  the operator; do not guess.

### Step 4: Fix the real findings

Apply the smallest change that resolves each finding. Do not refactor beyond a finding's scope.

### Step 5: Quality gate and commit

- If the project's package.json defines a `smoke:qc` script, run `bun run smoke:qc`; otherwise
  run the project's own build and lint scripts.
- Commit the fixes following the repository's commit conventions (message style, scope).
- Do NOT push and do NOT reply to or resolve the PR threads: pushing is an outward-facing action
  left to the operator or the surrounding pipeline.

### Step 6: Summary

Report:

- Findings fixed (file, one-line description each) and the commit that contains them
- Findings dismissed, each with its justification
- Findings needing human judgment
- Quality-gate result, and a reminder that the branch has not been pushed

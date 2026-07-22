---
name: ship-pr
description: "Publish local work as a GitHub pull request: group changes into commits, create or push a branch, and open a labeled PR. Use for 'ship it', commit-and-PR, or open-PR requests; excludes amend, force-push, and existing-PR workflows."
metadata:
    aidd-category: runtime
---

# Ship a Pull Request

Turn a dirty working tree into a reviewable GitHub pull request. Invoking this skill authorizes its
commit, push, and pull-request publication steps. Preserve the user's work and never force-push.

## Preconditions

- Confirm `git rev-parse --show-toplevel` and work from that repository.
- Confirm `gh auth status` before relying on GitHub CLI operations.
- Stop if the working tree is clean and there are no local commits to publish.
- Use another workflow when the request concerns an existing pull request, an amended commit, or a
  force-push.

## Workflow

### 1. Inventory the repository

Collect these facts without changing state:

```text
git status --short
git diff --stat
git diff --cached --stat
git log -5 --oneline
git branch --show-current
git remote -v
git remote show origin
gh label list --limit 200 --json name,description
gh issue list --state open --limit 50 --json number,title,labels,body
```

Record any pre-staged paths separately and preserve them as their own bundle. Do not unstage,
regroup, or combine them with other work.

### 2. Scan risk

Inspect the complete diff, including untracked files that the user placed in scope. Flag:

- secrets, credentials, private keys, and environment files;
- migrations, destructive schema changes, and generated artifacts;
- authentication, authorization, payments, or public API changes;
- binaries or unexpectedly large files; and
- missing tests or failed repository gates.

Stop before staging if a secret or material uncertainty appears.

### 3. Plan commits

Read [references/grouping-heuristics.md](references/grouping-heuristics.md) unless three or fewer
changed files form one obvious unit. Group by behavior and dependency, not by file count or directory.
Keep implementation with its tests. Merge groups when splitting would create a non-buildable commit
or imply intent the evidence does not support.

Present the proposed groups, paths, order, and commit subjects, then apply them directly. Preserve
pre-staged work as one bundle. When two boundaries are equally plausible, prefer the broader
buildable group.

### 4. Choose the branch

If currently on the base branch, create a branch named `<type>/<short-slug>`, where type is one of
`feat`, `fix`, `chore`, `refactor`, `docs`, or `perf`. Keep it at most 50 characters. Otherwise
retain the current branch.

Determine whether publication requires `git push -u origin <branch>` or `git push`, but do not push
yet. Never force-push. Surface non-fast-forward failures for the user to resolve.

### 5. Commit groups

For each group:

1. Stage only its exact paths or evidence-backed hunks.
2. Inspect `git status --short` and `git diff --cached --stat`.
3. Compose an imperative subject matching recent repository history.
4. Commit without bypassing hooks.
5. Confirm the working tree changed by exactly that group.

Run state-changing commands separately so a failed command cannot hide behind a later command. If a
hook fails, fix the cause, restage the affected paths, and create the intended commit. Do not use
`--no-verify`, amend an existing commit, or stage with `git add .` or `git add -A`.

### 6. Draft the pull request

Read both references:

- [references/pr-description-template.md](references/pr-description-template.md) for structure and
  tone;
- [references/label-and-issue-matching.md](references/label-and-issue-matching.md) for labels and
  issue links.

Synthesize from `git diff <base>...HEAD`, using three-dot diff semantics.

- Keep the title at most 70 characters, imperative, and without a trailing period.
- Describe behavior and motivation at a high level.
- Select only labels returned by `gh label list`.
- Use closing keywords only when the user explicitly states that the pull request fixes an issue.
- Mark the pull request as draft when requested, when commits identify work in progress, or when the
  test plan cannot yet be completed.
- Do not add provider, tool, or third-party attribution unless the user or repository explicitly
  requires it.

### 7. Preview publication

Show one preview block containing:

- branch and push command;
- commit list;
- pull-request title and full body;
- labels and issue links; and
- draft status.

Continue directly to publication. The skill invocation explicitly authorizes the push and pull
request described by this workflow.

### 8. Publish

1. Push with the command shown in the previous step.
2. Create the pull request with the previewed title, body, labels, and draft status.
3. Capture the pull-request URL.
4. Verify `gh pr view --json url,title,state,isDraft,labels`.

If creation fails because a label disappeared, remove that label, report the adjustment, and retry.
Never create repository labels as part of this workflow.

## Output

Report the pull-request URL, branch, commits created, labels applied, linked issues, draft status, and
any validation or publication warnings.

## Guardrails

- Preserve pre-existing staged work as its own bundle.
- Do not use `git stash`, `git reset --hard`, `git add .`, `git add -A`, `--no-verify`, or force-push.
- Do not invent commit intent, issue relationships, labels, test results, or motivation.
- Do not publish from a workflow whose description does not explicitly promise publication.
- Do not require behavior or attribution specific to one aidd backend.

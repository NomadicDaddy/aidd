---
name: spirit
description: 'Judge whether the change under review satisfies the spirit and intent of the task and the solution is complete. Reviews pending work when the tree is dirty and the commits that produced the change when it is clean. Use for a completeness or intent check, not just line-level review.'
metadata:
    aidd-category: runtime
---

# Spirit

Judge whether the current changes satisfy the task's intent, not merely its literal wording.

## Inputs

Accept an optional base ref, commit range, path, or review focus. When none is supplied, resolve
the change set with the rules below.

## Resolving the change set

A clean working tree does not mean there is nothing to review. This skill usually runs as a step
after a coding run that already committed its work, so committed work is in scope. Apply the rules
below in order and stop at the first one that yields a non-empty change set:

1. An explicitly supplied ref, range, or path.
2. Uncommitted work — unstaged changes, staged changes, and untracked files — together with any
   commits rule 3 identifies from the same unit of work. Dirty work sitting on top of the commits
   that produced it is one change set, not two.
3. The commits this session's unit of work produced. Identify them from the newest
   `.aidd/CHANGELOG.md` entry, the most recently touched `.aidd/features/*/feature.json`, and
   recent commit times (`git log -n 10 --format='%h %cr %s'`). Take the consecutive run of commits
   belonging to that unit of work, not only `HEAD`.
4. Only when rule 3 finds nothing: commits on the current branch absent from its upstream or
   default base (`git log @{upstream}..HEAD`, otherwise `main..HEAD` or `master..HEAD`).

Rule 4 is a last resort and is not automatically in scope. A long-lived branch routinely sits many
commits ahead of its upstream, and unrelated accumulated history is not the change under review.
When that range is larger than the work this session was launched for, narrow it to the unit of
work and say which commits you dropped.

State the resolved boundary — the ref range, commit list, or file set — at the top of the review.
Report "nothing to review" only when every rule above is empty, and never on the basis of a clean
working tree alone.

## Workflow

1. Resolve the original request, acceptance criteria, and repository constraints.
2. Resolve the change set as above and state the boundary — the ref range, commit list, or file
   set — at the top of the review.
3. Inspect the complete diff for that boundary and the surrounding implementation.
4. Trace the changed behavior end to end, including callers, consumers, tests, and documentation.
5. Identify omissions, scope drift, shortcuts, regressions, and technically passing changes that
   miss the intended outcome.
6. Fix the gaps you identified, smallest change first. aidd decides whether this run may write — a
   review-only run forbids edits outright, turning this step into naming the fixes the work still
   needs.

## Output

State whether the work satisfies the spirit and intent. Support the conclusion with concrete
evidence, remaining gaps, and the validation still required. Name the reviewed boundary so the
next step knows exactly what was covered.

---
name: spirit
description: 'Judge whether unstaged changes satisfy the spirit and intent of the task and the solution is complete. Use for a completeness or intent check on work-in-progress, not just line-level review.'
metadata:
    aidd-category: runtime
---

# Spirit

Judge whether the current changes satisfy the task's intent, not merely its literal wording.

## Workflow

1. Resolve the original request, acceptance criteria, and repository constraints.
2. Inspect the complete working-tree diff and the surrounding implementation.
3. Trace the changed behavior end to end, including callers, consumers, tests, and documentation.
4. Identify omissions, scope drift, shortcuts, regressions, and technically passing changes that
   miss the intended outcome.
5. Keep the review read-only unless the user explicitly requests fixes.

## Output

State whether the work satisfies the spirit and intent. Support the conclusion with concrete
evidence, remaining gaps, and the validation still required.

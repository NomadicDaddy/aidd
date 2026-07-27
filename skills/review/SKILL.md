---
name: review
description: 'Review pending changes for correctness, security, maintainability, and stack compliance, then apply confirmed in-scope fixes. Use for routine code-review and pre-commit review requests; use deepreview for an exhaustive multi-perspective audit.'
metadata:
    aidd-category: runtime
---

# Review Changes

Review the requested change set, report actionable findings with evidence, and apply confirmed
in-scope fixes directly. Keep this workflow focused. Use `deepreview` when the user requests an
exhaustive, pre-merge, or independent multi-perspective review.

## Inputs

Accept an optional base ref, commit range, path, or review focus. When none is supplied, inspect all
tracked and untracked changes in the current repository.

A clean working tree does not mean there is nothing to review. When no uncommitted work exists,
review the commits that produced the change under review: the ones belonging to the unit of work
this session was launched for, identified from the newest `.aidd/CHANGELOG.md` entry, the most
recently touched `.aidd/features/*/feature.json`, and recent commit times. Fall back to the
branch's upstream or default-base range only when that fails to identify them, and only for the
part of it that is plausibly the same unit of work — a long-lived branch routinely sits many
commits ahead of its upstream, and unrelated accumulated history is out of scope. State the
resolved boundary in the report, and report "nothing to review" only when both the working tree
and those commits are empty.

## Workflow

### 1. Establish scope

1. Confirm the repository root and read its local instructions.
2. Inspect `git status --short`, the relevant diff, and untracked files.
3. Read the package manifest, stack documentation, and quality scripts needed to evaluate the
   change accurately.
4. Preserve unrelated user changes. Do not reset, discard, or rewrite them.

If the requested range is unclear, review the complete pending working-tree and branch diff so
material work is not omitted. State the selected boundary in the report.

### 2. Review the change

Inspect the changed code and the minimum surrounding context needed to verify behavior. Evaluate:

1. **Stack compliance:** unsupported APIs, wrong runtime assumptions, dependency or configuration
   drift, invalid framework patterns, and repository-rule violations.
2. **Correctness:** broken control flow, invalid state transitions, contract mismatches, missing edge
   handling, concurrency defects, and incomplete end-to-end wiring.
3. **Security:** authentication and authorization gaps, injection risks, data exposure, unsafe input
   handling, secret leakage, and insecure defaults.
4. **Maintainability:** duplication, dead code, misleading names, unnecessary complexity, and
   abstractions without immediate consumers.
5. **Verification:** missing or inadequate coverage at the boundary where the change ships.

Use repository evidence rather than generic preferences. Do not report speculative risks as defects.

If the active backend supports independent workers and delegation materially improves coverage,
delegate bounded review perspectives by capability. Otherwise perform the same checks inline. Do not
require a provider-specific agent name, tool name, or worker type.

### 3. Report findings

Lead with findings ordered by severity. For each finding, include:

- a concise title and severity;
- the exact file and line;
- the observed behavior or violated contract;
- why it matters; and
- the smallest appropriate remediation.

Separate confirmed defects from questions. If there are no findings, say so and identify any
verification gaps or residual risks.

### 4. Report findings

Present the complete findings list before editing, then apply every confirmed in-scope fix. Preserve
question-only findings as reported uncertainties instead of converting them into changes.

### 5. Apply confirmed fixes

Apply confirmed remediations in severity order and avoid overlapping concurrent edits.
Use independent workers only when their file scopes are disjoint and the active backend supports
them; otherwise fix sequentially in the main session.

After each fix, re-read the affected diff and confirm that it resolves the finding without widening
scope.

### 6. Verify

Run the repository's documented quality gate. Prefer `bun run smoke:qc` when it exists. Otherwise
run the relevant build, typecheck, lint, format, and test scripts defined by the repository. Do not
invent script names or bypass cached gates.

Report:

- findings confirmed, unresolved, and fixed;
- files changed;
- validation commands and outcomes; and
- remaining risks or blocked checks.

## Guardrails

- Do not apply question-only or unsupported findings.
- Do not fix unrelated pre-existing issues unless the user expands the scope.
- Do not treat style preference as a defect when the repository has no supporting convention.
- Do not claim success when the repository's required quality gate fails.
- Do not require capabilities unique to one supported aidd backend.

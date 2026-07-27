---
name: deepreview
description: 'Perform an exhaustive, multi-perspective review of pending changes for correctness, security, maintainability, architecture, and stack compliance, then apply confirmed in-scope fixes. Use for deep, high-risk, release, or pre-merge reviews.'
metadata:
    aidd-category: runtime
    aidd-references: audits/SEVERITY_CLASSIFICATION.md
---

# Deep Review

Perform an exhaustive review of the requested change set, reconcile independent perspectives, and
apply confirmed in-scope fixes directly. Prefer `review` for a routine focused pass.

## Inputs

Accept an optional base ref, commit range, path, or focus area. When none is supplied, review all
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

### 1. Establish scope and rules

1. Confirm the repository root and read all applicable local instructions.
2. Inspect `git status --short`, the relevant diff, and untracked files.
3. Read the package manifest, stack documentation, architecture guidance, and quality scripts.
4. Read `audits/SEVERITY_CLASSIFICATION.md` from the staged aidd references and use its severity
   definitions.
5. Record unrelated user changes and preserve them.

If the requested range is ambiguous, review the complete pending working-tree and branch diff so
material work is not omitted. State the selected boundary in the report.

### 2. Build the review map

Map changed files to their consumers and runtime boundaries. Identify routes, callers, schemas,
configuration, persistence, authorization, rendered output, and validation affected by each change.
Read enough surrounding code to determine whether the implementation is wired end to end.

### 3. Run five review perspectives

Evaluate the same change set from five bounded perspectives:

1. **Stack compliance:** runtime and framework compatibility, repository rules, dependency policy,
   configuration drift, and invalid platform assumptions.
2. **Security:** authentication, authorization, input validation, injection, data exposure, secrets,
   cryptography, dependency risk, and unsafe defaults.
3. **Correctness:** control flow, state transitions, API and schema contracts, concurrency, error
   paths, boundary conditions, and incomplete wiring.
4. **Maintainability:** duplication, dead code, misleading naming, excessive complexity, poor
   cohesion, and abstractions without immediate consumers.
5. **Architecture and verification:** layer boundaries, ownership, route/page registration,
   persistence placement, testing strategy, and coverage at the real shipping boundary.

When the active backend supports independent workers, assign one perspective to each available
worker with the same diff, repository rules, and evidence requirements. Run any remaining
perspectives inline. When independent workers are unavailable, perform all perspectives
sequentially. Never depend on a provider-specific agent name, tool name, or worker type.

Require every perspective to return only evidence-backed findings with file and line references.
Discard speculative concerns and generic best-practice commentary that is not tied to the repository.

### 4. Reconcile findings

Deduplicate overlapping findings and resolve disagreements by inspecting the cited code. Order the
result by the severity classification reference. For each finding, include:

- a concise title and severity;
- the exact file and line;
- the observed behavior or violated contract;
- the affected caller, user path, or runtime boundary;
- why it matters; and
- the smallest complete remediation.

Separate confirmed defects from questions. If there are no findings, say so and identify any
verification gaps or residual risks.

### 5. Report findings

Present the reconciled findings before editing, then apply every confirmed in-scope fix. Preserve
question-only findings as reported uncertainties instead of converting them into changes.

### 6. Apply confirmed fixes

Apply confirmed remediations in severity order. Use independent workers only for disjoint
file scopes; serialize overlapping changes and all final integration work. Do not require a named
agent profile.

After each remediation, re-read the diff, verify the affected consumer path, and confirm that the
change resolves the finding without introducing compatibility code or unrelated cleanup.

### 7. Verify

Run the repository's documented quality gate. Prefer `bun run smoke:qc` when present. Otherwise run
the relevant build, typecheck, lint, format, and test scripts defined by the repository. Exercise any
specific runtime boundary implicated by a finding. Do not invent commands or bypass cached gates.

Report:

- findings confirmed, unresolved, and fixed;
- files changed;
- validation commands and outcomes;
- perspectives completed inline or by independent workers; and
- remaining risks or blocked checks.

## Guardrails

- Do not apply question-only or unsupported findings.
- Do not fix unrelated pre-existing issues unless the user expands the scope.
- Do not use concurrent workers on overlapping files.
- Do not treat style preference as a defect without a repository convention.
- Do not claim success when the required quality gate fails.
- Do not require capabilities unique to one supported aidd backend.

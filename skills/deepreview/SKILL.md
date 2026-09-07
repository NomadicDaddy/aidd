---
name: deepreview
description: 'Review pending changes from multiple perspectives for correctness, security, maintainability, architecture, and stack compliance, then apply confirmed in-scope fixes. Use for code review of any depth, from a routine pre-commit pass to a high-risk, release, or pre-merge review.'
metadata:
    aidd-category: runtime
    aidd-references: audits/SEVERITY_CLASSIFICATION.md
---

# Deep Review

Perform an exhaustive review of the requested change set, reconcile independent perspectives, and
apply confirmed in-scope fixes directly. Scale the pass to the change set: a small, low-risk diff
earns a focused single pass, while a release, a security-sensitive surface, or a pre-merge check
earns the full multi-perspective treatment below.

## Usage

```
deepreview [boundary] [focus]
```

- Zero args → review the current unit of work using the resolution rules below.
- `[boundary]` → base ref, commit, commit range, or path.
- `[focus]` → optional review emphasis stated in plain language.

## Inputs

Accept an optional base ref, commit range, path, or focus area. When none is supplied, resolve the
change set in this order:

1. Review uncommitted work: unstaged changes, staged changes, and untracked files, together with
   commits identified by rule 2 when they belong to the same unit of work.
2. Review the commits this session's unit of work produced. Identify them from the newest
   `.aidd/CHANGELOG.md` entry, the most recently touched `.aidd/features/*/feature.json`, and recent
   commit times. Take the consecutive run of commits belonging to that work, not only `HEAD`.
3. Only when rule 2 finds nothing, inspect commits on the current branch absent from its upstream or
   default base. Narrow a long-lived or accumulated branch range to the plausible unit of work and
   state which commits were excluded.

A clean working tree does not mean there is nothing to review. State the resolved boundary in the
report, and report "nothing to review" only when every rule above is empty.

## Workflow

### 1. Establish scope and rules

1. Confirm the repository root and read all applicable local instructions.
2. Inspect `git status --short`, the relevant diff, and untracked files.
3. Read the applicable package or build manifests, stack documentation, architecture guidance, and
   quality scripts when present.
4. Read `.aidd/audits/SEVERITY_CLASSIFICATION.md` from the staged aidd references, or
   `audits/SEVERITY_CLASSIFICATION.md` when reviewing aidd itself, and use its severity definitions.
5. Record unrelated user changes and preserve them.

If the requested boundary is ambiguous, apply the resolution order above and state the selected
boundary in the report. Do not widen the review to unrelated accumulated branch history.

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

For a small, low-risk diff, cover all five perspectives in one focused inline pass. For a high-risk
change set, when the active backend supports independent workers, assign one perspective to each
available worker with the same diff, repository rules, and evidence requirements. Run any remaining
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

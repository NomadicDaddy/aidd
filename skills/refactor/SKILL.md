---
name: refactor
description: 'Safe, context-aware code refactoring with impact analysis and validation. Use to refactor a specific file, function, or component with the change checked against its call sites and tests.'
metadata:
    aidd-category: runtime
---

# Safe Refactoring

Restructure existing code without changing its externally observable behavior unless the request
explicitly includes a behavior or contract change.

## Usage

```
refactor [target]
```

If no target is specified, infer it from the request and current diff. If no unique target exists,
return a usage error listing the candidate files or symbols.

## Instructions

1. **Identify the target and goal**:
    - Resolve the argument to the exact file, symbol, component, or module.
    - State the requested outcome: extract, rename, move, simplify, optimize, or another concrete
      structural change.
    - If either the target or intended outcome remains ambiguous and different interpretations
      would produce materially different edits, stop and ask for direction.

2. **Impact analysis**:
    - Read applicable repository instructions, architecture guidance, manifests, and quality
      scripts.
    - Find the target's imports, exports, callers, consumers, tests, routes, schemas, persistence,
      configuration, and documentation as applicable.
    - Map the files that must change and identify unrelated files that must remain untouched.
    - Identify public API, data, behavior, type-safety, security, and performance risks.

3. **Historical pattern learning**:
    - Inspect relevant git history when it can reveal established boundaries, prior refactors, or
      reverted approaches.
    - Prefer patterns already used successfully by neighboring code.

4. **Establish the baseline**:
    - Capture `git status` and the relevant staged and unstaged diffs. Never use `git stash`, stage
      files, or discard existing work unless the user explicitly requests that operation.
    - Identify the repository's documented quality gate and focused checks from its real scripts;
      do not assume TypeScript, Bun, or specific script names.
    - Run the documented pre-change gate when required by repository guidance. Honor an explicit,
      still-valid verified-baseline waiver supplied by the active workflow.
    - Record baseline failures before editing. Unrelated dirty files do not block the refactor, but
      overlapping edits with unclear ownership do.

5. **Execute refactoring** (choose appropriate type):
    - **Extract method/function**: Extract a cohesive block with a precise name, preserve types and
      behavior, and update every caller.
    - **Rename safely**: Update definitions, imports, callers, tests, and user-facing documentation
      that names the changed surface.
    - **Move code**: Relocate it to the established owner and update every import, registration, and
      consumer.
    - **Simplify logic**: Reduce duplication or complexity while preserving edge cases and error
      behavior.
    - **Optimize performance**: Measure the relevant path before and after; do not trade correctness
      or clarity for an unverified optimization.
    - Keep the change narrow and complete. Do not add compatibility layers, speculative
      abstractions, or unused helpers.

6. **Incremental validation** (during refactoring):
    - After each coherent change, run the smallest relevant type, lint, compile, or test check.
    - Re-read all changed call sites and verify registrations, imports, and contracts remain intact.
    - Add or update tests when structure, seams, or requested behavior changed in a way existing
      coverage does not exercise.

7. **Post-refactoring verification**:
    - Run focused tests for the affected behavior.
    - Run the repository's documented full quality gate once the implementation is coherent;
      prefer its aggregate or cached gate instead of redundantly invoking constituent scripts.
    - Compare performance measurements for an optimization refactor.
    - Inspect the final diff against the captured baseline and verify that only intended files and
      behavior changed.
    - If a required gate fails, distinguish failures introduced by the refactor from confirmed
      baseline or out-of-scope failures. Fix in-scope regressions; report unresolved failures and do
      not claim completion.

8. **Report completion**:
    - Summarize the structural change and the behavior preserved or intentionally changed.
    - List all affected files.
    - Report each validation command and its actual result, plus skipped or blocked checks.
    - Report any remaining compatibility, performance, or verification risk.

## Completion criteria

- The requested refactor is complete across every caller and consumer.
- The repository's applicable quality gate and affected tests pass.
- No unrequested public API, persisted-data, security, or observable behavior change was introduced.
- Optimization claims are supported by measurements.
- Existing staged, unstaged, untracked, and ignored work remains preserved.

Do not report the refactor as complete while a required gate or affected runtime boundary remains
unverified or failing.

---
name: refactor
description: 'Safe, context-aware code refactoring with impact analysis and validation. Use to refactor a specific file, function, or component with the change checked against its call sites and tests.'
metadata:
    aidd-category: runtime
---

# Safe Refactoring

Perform safe, context-aware code refactoring with comprehensive impact analysis and validation.

## Usage

```
refactor [target file/function/component]
```

If no target is specified, infer it from the request and current diff. If no unique target exists,
return a usage error listing the candidate files or symbols.

## Instructions

1. **Identify refactoring target**:
    - Parse the argument for target code (file path, function name, or component)
    - Document refactoring goal: extract method, rename, move, simplify, optimize, etc.

2. **Impact analysis**:
    - Analyze all dependencies and usage patterns of the target
    - Identify integration points and side effects
    - Assess type safety implications
    - Map all files that will be affected
    - Assess breaking change risk

3. **Historical pattern learning**:
    - Review git history for previous refactoring of this code
    - Identify proven patterns to apply
    - Note past issues to avoid

4. **Pre-refactoring validation**:
    - Run build; it must pass
    - Run lint; it must pass
    - Run tests; document current results
    - **Do NOT run `git stash`.** Capture the baseline diff and preserve all existing changes.
      Proceed through relevant dirty files when their intent is clear. Return a blocker only when
      overlapping edits cannot be distinguished safely; unrelated dirty files never block the
      refactor.

5. **Execute refactoring** (choose appropriate type):
    - **Extract Method/Function**: Identify reusable blocks, extract with clear name, update call sites, preserve types
    - **Rename Safely**: Update across entire codebase, maintain consistency, update docs
    - **Move Code**: Relocate to appropriate location, update all imports and references
    - **Simplify Logic**: Reduce complexity, remove duplicates, improve readability
    - **Optimize Performance**: Improve algorithms, optimize queries, reduce memory usage

6. **Incremental validation** (during refactoring):
    - After each significant change, run build
    - Check for type errors immediately
    - Run affected tests
    - Verify no regressions introduced

7. **Post-refactoring verification**:
    - Run build; it must pass
    - Run lint; it must pass
    - Run tests; they must pass
    - Compare performance benchmarks if optimization refactoring
    - Verify no breaking changes introduced

8. **Report completion**:
    - Summarize refactoring changes
    - List all affected files
    - Confirm all quality gates passed
    - If rollback is needed, instruct the user to revert via `git restore` / `git reset` themselves. Do not run destructive git commands automatically.

## Quality Gates (all must pass)

- Zero TypeScript errors
- Zero lint errors
- All tests passing
- Build successful
- No performance regressions
- No breaking changes (unless intentional and documented)

**NEVER** complete refactoring if any quality gate fails.

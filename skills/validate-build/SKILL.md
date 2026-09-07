---
name: validate-build
description: 'Run the project build gate and intelligently fix failures attributable to the current changes. Use when validating changes after implementation or before a commit.'
metadata:
    aidd-category: runtime
---

# Validate and Fix the Build

Run the project's authoritative build or quality gate and intelligently fix failures based on what
changed.

## Instructions

**Run one build at a time.** Builds contend for file locks on `node_modules/`, `dist/`, and
incremental caches such as `.tsbuildinfo` and `.turbo/`. If a command appears slow, wait for it or
inspect its live output through the active backend's process capability. When a long-running command
must be detached, start one process, monitor that process, and never launch a duplicate.

1. **Resolve the gate.** Read the target project's `package.json` scripts and its repository
   instructions. If it defines `smoke:qc`, use that authoritative quality gate and trust its cache;
   do not add a force or cache-bypass flag. Allow enough time for the command to finish:

    ```bash
    bun run smoke:qc
    ```

    Otherwise, if the project defines `build`, run the plain build:

    ```bash
    bun run build
    ```

    If neither script exists, use the build command documented by the repository. If the project
    deliberately has no build surface, report the build as not applicable instead of inventing a
    command.

2. **If the gate succeeds**, report the exact command and success. When `smoke:qc` reports cached
   steps, preserve that distinction rather than claiming every step executed, then stop.

3. **If the gate fails**, analyze the failures:
    - Note the exact failed step or command and its error messages
    - Check for TypeScript compilation errors, missing dependencies, or configuration issues
    - Inspect `git status --short` before editing so staged, unstaged, and untracked work remains
      distinct
    - Resolve the default branch dynamically with
      `git symbolic-ref --quiet --short refs/remotes/origin/HEAD`; if that ref is unavailable,
      inspect the repository's branches and instructions rather than assuming `main` or `master`
    - Review both the diff and commits relative to the resolved branch, substituting the branch
      name reported above:

    ```bash
    git diff <resolved-default-branch>
    git log --oneline <resolved-default-branch>..HEAD
    ```

    Also inspect relevant untracked files separately because `git diff` does not include them.

4. **Determine the nature of the failure**:
    - **If the failure is attributable to the current changes** and the intended behavior is
      corroborated by the request, specification, implementation, and surrounding tests:
        - Fix any TypeScript type errors introduced by the changes
        - Update build configuration if needed (e.g., tsconfig.json, vite.config.mts)
        - Ensure dependencies already declared by the change are installed with Bun
        - Fix import paths or module resolution issues

    - **If the failure is a regression** (broken imports, missing files, configuration errors):
        - Fix the source code to restore the build
        - Check for accidentally deleted files or broken references
        - Verify build configuration files are correct

    - **If the failure is pre-existing, unrelated, or outside the invoked scope**:
        - Do not absorb unrelated work into the fix
        - Report the exact unresolved failure and return non-success

5. **Common build issues to check**:
    - **TypeScript errors**: Fix type mismatches, missing types, or incorrect imports
    - **Missing dependencies**: Run `bun install` when declared dependencies are not installed;
      do not add, remove, upgrade, or downgrade package versions without evidence and authorization
    - **Import/export errors**: Fix incorrect import paths or missing exports
    - **Build configuration**: Check tsconfig.json, vite.config.mts, or other build configs
    - **Package build order**: If the repo builds multiple packages, ensure prerequisite package
      builds complete before dependent apps

6. **How to decide if it's intentional vs regression**:
    - Treat the git diff and commit messages as context, not proof of intended behavior
    - If corroborating evidence shows deliberate new code needs correction, fix that code
    - If the change broke established functionality, fix the regression
    - When intent remains ambiguous, preserve established behavior, report the unresolved failure,
      and return non-success rather than guessing

7. **After making fixes**, re-run the same authoritative gate. Do not substitute a narrower check
   for the command that failed.

8. **Report summary** with the files changed, what was fixed, the exact validation command, and its
   actual result. Include any skipped checks or unresolved blockers.

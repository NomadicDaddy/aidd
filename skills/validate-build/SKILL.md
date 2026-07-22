---
name: validate-build
description: 'Run the project build and intelligently fix any failures based on what changed. Auto-triggers after code changes or before commits as a quality gate.'
metadata:
    aidd-category: runtime
---

# Validate and Fix the Build

Run all builds and intelligently fix any failures based on what changed.

## Instructions

**Run one build at a time.** Builds contend for file locks on `node_modules/`, `dist/`, and
incremental caches such as `.tsbuildinfo` and `.turbo/`. If a command appears slow, wait for it or
inspect its live output through the active backend's process capability. When a long-running command
must be detached, start one process, monitor that process, and never launch a duplicate.

1. **Run the build.** If package.json defines `smoke:qc`, prefer it for Spernakit and derived apps;
   it is the full quality gate for types, lint, build, formatting, and dependency versions:

    ```bash
    bun run smoke:qc
    ```

    Otherwise run the plain build:

    ```bash
    bun run build
    ```

2. **If the build succeeds**, report success and stop.

3. **If the build fails**, analyze the failures:
    - Note which build step failed and the error messages
    - Check for TypeScript compilation errors, missing dependencies, or configuration issues
    - Diff against the repo's default branch to see what code has changed (resolve it dynamically; these repos typically use `master`, not `main`):

        ```bash
        DEFAULT_BRANCH=$(git rev-parse --abbrev-ref origin/HEAD | sed 's|^origin/||')
        git diff "$DEFAULT_BRANCH"
        ```

4. **Determine the nature of the failure**:
    - **If the failure is due to intentional changes** (new features, refactoring, dependency updates):
        - Fix any TypeScript type errors introduced by the changes
        - Update build configuration if needed (e.g., tsconfig.json, vite.config.mts)
        - Ensure all new dependencies are properly installed
        - Fix import paths or module resolution issues

    - **If the failure appears to be a regression** (broken imports, missing files, configuration errors):
        - Fix the source code to restore the build
        - Check for accidentally deleted files or broken references
        - Verify build configuration files are correct

5. **Common build issues to check**:
    - **TypeScript errors**: Fix type mismatches, missing types, or incorrect imports
    - **Missing dependencies**: Run `bun install` if packages are missing
    - **Import/export errors**: Fix incorrect import paths or missing exports
    - **Build configuration**: Check tsconfig.json, vite.config.mts, or other build configs
    - **Package build order**: If the repo builds multiple packages, ensure prerequisite package builds complete before dependent apps

6. **How to decide if it's intentional vs regression**:
    - Look at the git diff and commit messages
    - If the change was deliberate and introduced new code that needs fixing -> fix the new code
    - If the change broke existing functionality that should still build -> fix the regression
    - When intent remains ambiguous, preserve established behavior, report the unresolved failure,
      and return non-success rather than guessing

7. **After making fixes**, re-run the build to verify everything compiles successfully.

8. **Report summary** of what was fixed (TypeScript errors, configuration issues, missing dependencies, etc.).

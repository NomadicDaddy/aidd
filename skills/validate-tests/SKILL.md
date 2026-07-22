---
name: validate-tests
description: 'Run all project tests and intelligently fix any failures based on what changed. Auto-triggers after code changes or before commits as a quality gate.'
metadata:
    aidd-category: runtime
---

# Validate and Fix Tests

Run all tests and intelligently fix any failures based on what changed.

## Instructions

**Run one test suite at a time.** Tests contend for database locks, ports, fixtures, and dependency
state. If a command appears slow, wait for it or inspect its live output through the active backend's
process capability. When a long-running suite must be detached, start one process, monitor that
process, and never launch a duplicate.

1. **Detect and run the repository's actual test entry.** Read the `scripts` block of package.json
   and use the test script defined there, such as `bun run test`, `bun run test:all`, or
   `bun run test:e2e`. Do not assume a script name.

    **If no test suite exists** (no test script, no test framework in devDependencies): run the
    repository's documented gate, such as `bun run smoke:qc` or crawltest, and report unit tests as
    not applicable. Spernakit-derived apps have no unit-test frameworks by policy.

2. **If all tests pass**, run the coverage-depth check below before reporting success.

    **Coverage-depth check (green is necessary, not sufficient).** A suite can stay fully green
    while the layer the change actually ships is broken. For example, a formatter-mangled server-side
    template that 500s every page while the render-helper tests it never touches keep passing.
    Diff the changed files (against the default branch, as in step 3) and, for any change that
    ships a rendered or served artifact, confirm at least one passing test exercises that
    artifact's real compile/render/serve boundary rather than only the helper functions behind it:
    - **Server-side templates** (Pode `.pode`, EJS, Handlebars, Jinja-style): a test must
      compile/render the shipped templates through the framework's own template pipeline, the way
      it happens at request time.
    - **SSR/JSX/components**: a test must render the component or hit the page, not just the
      functions it calls.
    - **String-built HTML/markup**: a test must parse or serve the assembled output, not just the
      fragments.
    - **SQL/query builders and serializers**: a test must execute the built query against the real
      engine or round-trip the payload through the real parser, not only assert on the string.

    If every test covering such an artifact stops at helper level, report the gap as a coverage
    failure by naming the artifact and missing boundary instead of reporting success. Add the
    missing boundary test when the fix is within scope. Pure-logic changes with no rendered or
    served artifact are exempt; do not flag them.

3. **If any tests fail**, analyze the failures:
    - Note which tests failed and their error messages
    - Diff against the repo's default branch to see what code has changed (resolve it dynamically; do not assume `main`):

        ```bash
        DEFAULT_BRANCH=$(git rev-parse --abbrev-ref origin/HEAD | sed 's|^origin/||')
        git diff "$DEFAULT_BRANCH"
        ```

4. **Determine the nature of the change**:
    - **If the logic change is intentional** (new feature, refactor, behavior change):
        - Update stale expectations only when the request, specification, implementation, and
          surrounding tests provide corroborating evidence for the new behavior
        - Diff contents and commit messages alone are insufficient evidence; do not launder a
          regression into a passing suite
        - If intent remains ambiguous, leave the expectation unchanged, report the unresolved
          failure, and return non-success

    - **If the logic change appears to be a bug** (regression, unintended side effect):
        - Fix the source code to restore the expected behavior
        - Do not modify the tests; they are catching a real bug

5. **How to decide if it's a bug vs intentional change**:
    - Look at the git diff and commit messages to form a hypothesis
    - If corroborating evidence establishes that expectations are outdated -> update the tests
    - If the change broke existing functionality that should still work -> fix the code
    - When intent remains ambiguous -> preserve the expectation and return non-success

6. **After making fixes**, re-run the tests to verify everything passes.

7. **Report summary** of what was fixed (tests updated vs code fixed).

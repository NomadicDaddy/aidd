---
name: commit-bundles
description: "Split an aidd-managed app's dirty working tree into coherent commit bundles and commit only validated, documented changes. Use to commit a messy working tree, group changes into logical commits, or ship pending work for an aidd app."
metadata:
    aidd-category: runtime
---

# Commit Bundles

Review the dirty tree for an aidd-managed application, split related work into coherent commit bundles, and commit only validated, documented changes.

## Usage

```
commit-bundles <app-name-or-path>
commit-bundles <app-name-or-path> --dry-run
```

## Arguments

- `<app-name-or-path>` - Target app from `<applications-root>/AGENTS.md` or an explicit project path.
- `--dry-run` - Group and describe bundles without committing.

## Workflow

1. Resolve the target to a local app directory and verify it contains `.aidd/`.
2. Run `git status --short` and `git diff --stat` in the target. Do not use `git stash`.
3. Group changes by user-facing outcome or metadata workflow. Keep unrelated generated files out of a bundle unless they were produced by that bundle's validation.
4. For each bundle, confirm documentation and aidd metadata are accurate:
    - update affected `.aidd/features/*/feature.json` when behavior changed;
    - update `.aidd/CHANGELOG.md` only when the app's workflow expects it;
    - run `bun run aidd-tools -- roadmap:apply --project-dir <app-dir>` from `<aidd-root>` if roadmap assignments changed.
5. Validate before committing:
    - `bun run format` in the target when available;
    - `bun run start -- --project-dir <app-dir> --check-features` from `<aidd-root>` when feature metadata changed;
    - targeted tests for code changes;
    - `bun run smoke:qc` before claiming the app is working.
6. Commit each evidence-backed bundle with a concise imperative message. After every commit, re-run `git status --short` and continue until only unrelated user-owned changes remain.

## Output

Report each bundle, commit hash, validation commands, and any remaining dirty files that were intentionally left alone.

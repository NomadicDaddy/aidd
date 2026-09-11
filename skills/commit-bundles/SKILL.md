---
name: commit-bundles
description: "Split a Git repository's dirty working tree into coherent commit bundles and commit only validated, documented changes. Use to commit a messy working tree, group changes into logical commits, or ship pending work."
metadata:
    aidd-category: runtime
---

# Commit Bundles

Review the dirty tree for a local Git repository, split related work into coherent commit
bundles, and commit only validated, documented changes.

## Usage

```
commit-bundles <app> [--dry-run]
```

## Arguments

- `<app>` - Application name beneath an applicable applications root, or an explicit project path.
- `--dry-run` - Inspect, group, and describe bundles without modifying files, staging, or committing.

## Workflow

1. Resolve the target to a local Git repository. Read its applicable `AGENTS.md` files and
   repository-native validation scripts before acting. Check whether `.aidd/` exists; its absence
   does not block bundling or committing, and this workflow does not require creating it.
2. Inspect `git status --short`, unstaged and staged diffs, and untracked files in the target. Keep
   the existing index intact until each bundle's exact paths are ready. Do not use `git stash`.
3. Group changes by user-facing outcome or metadata workflow. Keep unrelated, generated, runtime,
   and user-owned files out of a bundle unless they belong to that outcome.
4. For each bundle, confirm the repository's documentation is accurate. When `.aidd/` exists,
   also follow its metadata workflow:
    - update affected existing `.aidd/features/*/feature.json` when behavior changed;
    - update `.aidd/CHANGELOG.md` only when present and the app's workflow expects it;
    - check whether each metadata path is tracked or ignored; commit tracked metadata with its
      related work, but never force-add ignored metadata or edit `.gitignore` to make it committable;
    - when executing under aidd, leave roadmap propagation to it: after the run, it applies milestone
      priorities and resolved dependencies and reports reconciliation errors. Otherwise use the
      repository's documented metadata workflow. Do not shell into the aidd installation.
5. Validate each bundle using the target's native workflow:
    - run `bun run format` when available, then inspect the resulting diff and keep only files that
      belong to a bundle;
    - run targeted tests and the available fast quality gate before committing;
    - when `.aidd/` exists, use the repository's feature-contract validation if available; when
      executing under aidd, leave that validation to it, since it validates every record after each
      iteration and reports failures;
    - stage only the bundle's exact tracked paths and verify `git diff --cached --stat` and
      `git diff --cached --check` before committing.
6. Commit each evidence-backed bundle with a concise Conventional Commit message. Never bypass
   hooks. After each commit, re-run `git status --short` and continue until only intentionally
   excluded changes remain.
7. Run `bun run smoke:qc` once after the commits when the target defines it, or the repository's
   equivalent full gate. If it fails, fix the bundle, repeat the fast checks, and amend only a commit
   created during this run; then rerun the full gate. Do not claim the app is working while it fails.
8. Do not push unless the user explicitly requested it.

## Output

Report each bundle and commit hash, validation commands with their results, skipped checks, and any
remaining dirty files intentionally left alone. For `--dry-run`, report the proposed bundle paths
and validation plan instead of hashes.

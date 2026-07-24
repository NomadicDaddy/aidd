---
name: ui-playground-sync
description: 'Create or safely update a standalone sibling *-ui-playground from a site frontend, with source provenance, fixture-backed APIs, isolated in-memory mutations, and every live development port incremented by 2. Use when creating a designer playground, refreshing one from a newer site commit, reconciling site changes without erasing pending design work, or advancing its recorded source baseline after UI changes return to the site.'
metadata:
    aidd-category: runtime
---

# Synchronize a UI Playground

Create or update a fixture-backed design playground without changing the source site. Preserve
the site's frontend structure so reviewed designer work can return as a scoped diff.

## Inputs

Resolve:

- Source site repository, defaulting to the current repository
- Playground repository, defaulting to the source's sibling `<site-name>-ui-playground`
- Source ref, defaulting to the source `HEAD`
- Copied paths, normally `frontend/` plus workspace packages required to build it

Accept either the source or playground path from the user. When given a playground, read
`playground/source.json` to resolve the source. Report all resolved paths and the mode, `create` or
`update`, before changing files.

## Invariants

- Keep the source repository read-only.
- Require an exact source commit; never record an uncommitted source worktree.
- Confirm Git status independently. Do not use `git stash`.
- Copy only tracked files from the selected source commit.
- Keep fixture servers, alternate build configuration, launchers, and tests outside copied paths.
- Never read live application data, execute fixture terminal commands, or persist fixture mutations.
- Map every playground service port to its corresponding live port plus 2.
- Fail when a mapped port exceeds `65535`, duplicates another mapped port, overlaps a live port, or
  is already occupied by an unrelated process.
- Never replace an existing playground tree blindly. Preserve committed designer changes through a
  three-way update and stop on unresolved conflicts.
- Do not configure or push a Git remote.

## Port Mapping

Discover ports from runtime configuration, package scripts, environment examples, Vite
configuration, backend listeners, and container configuration. Distinguish actual listeners from
documentation examples.

Run the bundled helper with all live development ports:

```text
bun .aidd/skills/ui-playground-sync/scripts/port-map.ts <port> [port...]
```

When invoking from the canonical catalog, use
`skills/ui-playground-sync/scripts/port-map.ts`. Apply the returned mappings consistently to the
playground launcher, fixture server, Vite proxy, tests, and displayed URLs. Environment overrides
may remain supported, but defaults must use the mapped ports.

## Provenance Contract

Store playground-only provenance at `playground/source.json`:

```json
{
	"copiedPaths": ["frontend", "shared"],
	"portMap": [
		{ "live": 3210, "playground": 3212 },
		{ "live": 3211, "playground": 3213 }
	],
	"repository": "D:\\applications\\example",
	"schemaVersion": 1,
	"sourceCommit": "<full commit sha>",
	"sourceSubject": "<commit subject>"
}
```

Accept the earlier contract without `schemaVersion` or `portMap` when updating, then migrate it
after successful validation. Keep path values native to the host platform.

## Create Workflow

1. Read applicable repository instructions and inspect the source architecture, package manager,
   workspaces, scripts, routes, API clients, WebSocket clients, and development ports.
2. Require a clean source worktree and resolve the requested source ref to a full commit.
3. Require the destination to be absent or empty. Do not overwrite another repository.
4. Determine copied paths from actual frontend imports and workspace dependencies. Do not copy a
   backend merely because it shares the monorepo.
5. Extract tracked files from the source commit with `git archive` or equivalent Git object
   operations. Do not copy from a potentially changing worktree.
6. Verify every copied file's Git blob against the source commit and reject unexpected files in the
   copied trees.
7. Add the smallest root Bun workspace needed to install, type-check, lint, format, test, and build
   the copied frontend using the source versions and conventions.
8. Add a fixture server that mirrors every endpoint needed by navigable and representative detail
   screens. Seed representative list and detail records, safe in-memory create/update/launch/stop/
   delete mutations, and matching WebSocket invalidation events.
9. Simulate administrative, process, filesystem, app-launch, and terminal operations. Never access
   source data or execute commands. Restarting the fixture server must reset all state.
10. Add one launcher that starts frontend and fixtures and terminates both children cleanly.
11. Add route smoke coverage at desktop and mobile viewports. Fail on page errors, console errors,
    unexpected failed APIs, and non-loopback network requests.
12. Install with Bun, verify a frozen install, and run the full quality gate.
13. Initialize `main`, commit the complete baseline, and create an annotated
    `<site-name>-<source-short-sha>-baseline` tag only after all checks pass.

## Update Workflow

1. Read provenance and require both repositories to be clean. Designer work must be committed
   before synchronization.
2. Verify the recorded source commit exists in the recorded source repository.
3. Resolve the new source ref and inspect changes from recorded commit to new commit, limited to
   copied paths.
4. Compare three states: recorded source, current playground, and new source. Classify non-
   overlapping upstream changes, already-adopted changes, designer-only changes, and conflicts.
5. If copied paths already match the new source, advance provenance without replaying a patch.
6. Otherwise create a binary Git patch from old source to new source for copied paths and apply it
   to the playground with three-way index support. Preserve designer-only changes. Stop and report
   conflicting files rather than choosing a side.
7. Reconcile fixtures only when source API or WebSocket contracts changed. Keep all fixture changes
   outside copied paths.
8. Update provenance only after copied-tree checks and the full playground quality gate pass.
9. Commit the synchronization. Create a new baseline tag only when copied paths exactly match the
   new source; otherwise retain provenance as the comparison authority.

Use a temporary directory for patch artifacts and remove it after inspection. On Windows, keep
recursive file operations in PowerShell and verify resolved paths before any removal.

## Validation

Require:

- Byte-level copied-tree verification against the appropriate source state
- Fixture endpoint, mutation, reset, and WebSocket tests
- Desktop and mobile route crawl
- No non-loopback browser traffic
- Bun install followed by frozen install
- Root `smoke:qc`, or all equivalent declared gates when absent
- Clean final playground status
- Clean source status unchanged from the initial snapshot

Do not claim the playground works unless its complete quality gate passes.

## Output

Report:

- Resolved source, source commit, playground, and copied paths
- Create or update mode
- Live-to-playground port mappings
- Designer changes preserved and conflicts, if any
- Fixture contract changes
- Validation results
- Commit and baseline tag, when created
- Final Git status of both repositories

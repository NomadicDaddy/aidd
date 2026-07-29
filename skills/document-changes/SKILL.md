---
name: document-changes
description: "Document a Spernakit/aidd project's changes by updating its changelog, internal version, and feature metadata, then commit logical bundles without pushing or tagging. Use for change documentation, release notes, or version recording."
metadata:
    aidd-category: metadata
    aidd-contracts: humanize-docs
---

# Document Changes

Review everything that changed in a project since its last release, then bring every
documentation artifact into agreement with the code: the changelog, the internal version, and the
per-feature `feature.json` records. Documentation must be comprehensive and written in natural,
human-readable language; never raw diff or commit dumps.

This skill **documents** existing change and then commits the documentation + tracked changes in
logical bundles. It does not modify product code, and it does not push or tag.

## Usage

```
document-changes
document-changes <aidd-root>
```

## Inputs

Resolve the target project:

1. If a path argument is given, use it.
2. Otherwise use the current working directory.

The target must contain a root `package.json`. Read, if present:

- `package.json` (root): `version` field (authoritative; version lives in root only)
- `VERSION`: plain-text version file (bump in lockstep with `package.json` when it exists)
- The project changelog (see detection order in Phase 1)
- `.aidd/features/<id>/feature.json`: existing feature records
- `docs/reference/feature-fields.md`: the feature.json field contract (read it if present; aidd has it)

Never run `git stash`. A dirty working tree is the expected input to this skill; its changes are
part of what gets documented. Do not stash, reset, or discard anything.

## Instructions

### Phase 1 - Resolve target and detect artifacts

1. Confirm the target project root and read root `package.json` `version` and `VERSION` (if it
   exists). These define the current version.

2. Detect the project changelog, in this order, and record which exist:
    - `docs/CHANGELOG.md` (semver / Keep a Changelog style: `## [x.y.z] - YYYY-MM-DD`)
    - `docs/template/CHANGELOG.md` (Spernakit template)
    - `.aidd/CHANGELOG.md` (date-headed per-change style: `## [YYYY-MM-DD] - Title`)
    - `CHANGELOG.md` (root)

    A project may have **both** a semver changelog and a date-headed `.aidd/CHANGELOG.md` (aidd
    does). In that case the semver changelog is the version-bearing project changelog; the
    `.aidd/CHANGELOG.md` is the per-change log. Update whichever exist and are actively maintained
    (have recent entries), and **match each file's existing format exactly**; read the top ~40
    lines of each before writing.

3. If no changelog exists, create one in Keep a Changelog format.

### Phase 2 - Determine the change surface

4. Establish the "since last release" baseline:
    - The newest version tag (`git tag --list 'v*' --sort=-v:refname | head -1`), or
    - The topmost version/date header in the detected changelog if no usable tag exists.

5. Gather all changes since that baseline **and** uncommitted work:

    ```bash
    git -C <target> status --short
    git -C <target> diff --stat
    git -C <target> diff --staged --stat
    git -C <target> log --oneline --no-merges <baseline>..HEAD
    git -C <target> diff <baseline>..HEAD --stat
    ```

    Read the actual diffs for non-trivial changes; understand what each change _does_ for a user
    or operator, not just which files moved.

6. If the working tree is clean **and** there are no commits since the baseline, report "Nothing
   to document since <baseline>" and stop.

### Phase 3 - Review and classify

7. For every meaningful change, classify it:
    - **Added**: net-new feature or functionality that did not exist in the codebase before
    - **Changed**: modification to existing behavior, UX, or contracts
    - **Fixed**: bug fix
    - **Security**: security-relevant hardening or fix

8. Separate **net-new functionality** (no matching `feature.json` under `.aidd/features/`) from
   **modifications to existing features** (a matching `feature.json` exists). Match by feature
   intent and affected files, not just by name.

9. Exclude from the user-facing changelog: pure refactors with no behavior change, test-only
   changes, formatting, dependency lockfile churn, version-bump commits, and merge commits. These
   may still warrant a revision note inside a relevant `feature.json` if they materially affect a
   tracked feature.

### Phase 4 - Determine the internal version bump

10. Compute the new version from the current root version:
    - **Minor** (`+0.1.0`) if any net-new user-facing feature or functionality was added.
    - **Patch** (`+0.0.1`) if changes are only fixes, internal changes, or non-feature
      modifications.
    - Stay within the current major unless the invocation explicitly requests a major bump. For
      pre-1.0 apps, never infer a jump to `1.0.0`.

11. The new version is tracked in three places, all of which must agree after Phase 7: root
    `package.json` `version`, the `VERSION` file (if it exists), and the new changelog section.
    Per-feature records also stamp it (Phase 5).

### Phase 5 - Draft feature.json create/update

Follow the field contract in `docs/reference/feature-fields.md` if present; otherwise use the standard
contract: required `id`, `title`, `description`, `category`, `dependencies`, `status`, `passes`;
common optional `priority`, `spec`, `affectedFiles`, `summary`, `notes`, `createdAt`,
`updatedAt`.

12. **Net-new functionality without a feature.json**: create
    `.aidd/features/<clean-slug>/feature.json`:
    - `id` is a clean descriptive kebab slug (e.g. `run-console-page`), NOT `feature-YYYYMMDD-…`.
      The directory name must equal `id`. Honor the accepted ID shapes in `feature-fields.md`.
    - **Add the feature to `.aidd/roadmap.json` in the same edit** (create the roadmap — a single
      `v1.0` milestone at priority 1 mapping every feature — if it is somehow absent; roadmap and
      milestones apply to every project). The validator rejects a feature with no milestone, so a new
      record that only exists under `.aidd/features/` fails `--check-features`. Give it the milestone
      its nearest sibling uses (the feature it depends on, or the one it extends) rather than
      inventing one.
    - `title` / `description`: clear human prose describing the behavior delivered.
    - `spec`: acceptance criteria, phrased as verifiable statements ("1. Verify …\n2. Verify …"),
      matching the style of existing aidd feature files in the project.
    - `category`, `dependencies` (present even if `[]`), `affectedFiles` from the diff.
    - `status: "completed"` and `passes: true` only if the work is actually shipped and verified;
      otherwise `status: "in_progress"` / `passes: false`. Never set `passes: true` with
      `status: "backlog"`.
    - `createdAt` / `updatedAt`: current ISO timestamp.
    - Add a revision note (see step 14).

13. **Modified existing feature**: update its `feature.json` in place:
    - Refresh `description`/`spec` only if the behavior contract genuinely changed; keep prose
      natural.
    - Set or refresh `summary` with a concise human description of the current state.
    - Refresh `affectedFiles` to reflect this revision's diff: union the existing paths with the
      files this run touched (project-root-relative), dropping any that no longer exist. Never
      leave it empty when the feature is `completed` / `passes: true`.
    - Update `updatedAt` to the current ISO timestamp.
    - Leave template-owned `spernakit_version` untouched. Do not rename IDs or directories.

    Any feature reaching `status: "completed"` / `passes: true` in this run, whether newly
    created (step 12), modified here, or flipped from `backlog` / `in_progress` to completed, must
    carry a non-empty `affectedFiles` derived from the diff. `--check-features` emits a (non-blocking)
    warning for completed features missing it.

14. **Revision detail + version stamp** (both create and update): append a structured entry to
    the feature's `notes` array (create the array if absent), and stamp the shipped version:

    ```
    "notes": [
      …existing notes…,
      "Revision <newVersion> (<YYYY-MM-DD>): <specific, concrete description of what changed in this revision>."
    ],
    "shippedVersion": "<newVersion>"
    ```

    `shippedVersion` records the internal version this feature's current state shipped in. If a
    feature is touched again in a later run, append a new revision note and update
    `shippedVersion` to the newer version. Revision detail must be specific (what behavior/area
    changed), not a generic "updated".

    **Milestone follows shipped version**: after stamping `shippedVersion` on a completed
    feature, check its entry in `.aidd/roadmap.json` (`features.<dir>.milestone`). A completed
    feature belongs in the milestone whose `v<major>.<minor>`-named bound is the greatest one at
    or below the shipped version (the last such milestone is open-ended upward). Only pull the
    feature BACK: if its current milestone sits ahead of that target in priority order, rewrite
    `features.<dir>.milestone` and mirror the new milestone's `priority` into the feature's
    `priority` field. Never move a feature forward out of an earlier milestone (`shippedVersion`
    records the latest revision, not original delivery — an MVP feature revised in 1.4 stays in
    MVP), and leave the mapping untouched when no milestone name parses as `v<major>.<minor>`.
    The web panel's Milestones tab "Auto-place features" repair applies the same rule as a
    safety net for anything missed here.

### Phase 6 - Draft the changelog entry

All prose written in this phase (and any refreshed `description`/`summary`/`spec` prose in Phase 5)
follows the humanize-docs style contract (`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo);
read it before drafting. Minimum bar if it is unavailable: plain natural language, no em-dashes,
no AI filler (delve, leverage, robust, seamless, comprehensive), and describe what changed for the
user rather than praising the change.

15. Write the entry in the **detected file's existing format**:

    **Semver / Keep a Changelog** (`docs/CHANGELOG.md`, `docs/template/CHANGELOG.md`): add a new
    top section above the previous one:

    ```markdown
    ## [<newVersion>] - <YYYY-MM-DD>

    ### Added

    - <one line per item: WHAT changed for the user, not HOW; group related items>

    ### Changed

    - …

    ### Fixed

    - …

    ### Security

    - …
    ```

    Omit empty sections. One line per entry, natural language, parenthetical for technical
    context. Never paste raw `feature.json` text or commit subjects.

    **Date-headed** (`.aidd/CHANGELOG.md`): match the existing structure, typically:

    ```markdown
    ## [<YYYY-MM-DD>] - <Concise Title>

    ### Added / Changed / Fixed

    - <human description; reference feature IDs the way existing entries do>

    ### Verification

    - <how the change was verified, mirroring existing entries' verification notes>
    ```

16. If both a semver and a date-headed changelog are active, put the version bump and grouped
    release notes in the semver changelog, and a per-change dated entry in `.aidd/CHANGELOG.md`,
    consistent with how the project already uses each.

### Phase 7 - Apply

17. Write:
    - Changelog file(s)
    - Root `package.json` `version` → new version (root only; never child package.json files)
    - `VERSION` file → new version (only if it exists)
    - All `feature.json` create/update operations

18. Normalize and validate (best effort, non-fatal; report failures, do not auto-"fix" code):
    - If a formatter exists, run it on touched files (e.g. `bun run format`).
    - If the project is aidd or exposes the feature validator, run
      `bun run start -- --project-dir . --check-features` and confirm it reports all feature
      files valid.
    - Verify version consistency:

        ```bash
        grep '"version"' <target>/package.json
        cat <target>/VERSION 2>/dev/null
        ```

        and confirm the new changelog section uses the same version.

19. Leave the working tree ready for the commit phase. Do **not** tag or push at any point.

### Phase 8 - Commit

20. Group the uncommitted changes into coherent bundles. Typical groups for a documentation run:
    - **docs**: changelog file(s) + root `package.json` version + `VERSION` file (one bundle;
      these must move together so the version line in the changelog matches the manifest).
    - **features**: `.aidd/features/**/feature.json` create/update batch (one bundle, or split
      per major feature area if the set is large and naturally separable).
    - **code**: any product code changes the user already had in the dirty tree. Group these by
      concern the same way `commit-bundles` would; do not lump unrelated work into one commit.

    **A project that ignores `.aidd/` has no features bundle, and that is correct.** A repository
    with its own push remote hides `.aidd/` wholesale (aidd and Spernakit both do), so the feature
    records and `.aidd/CHANGELOG.md` are written and never staged. Write them anyway because they are
    the project's own metadata, and expect the tracked changelog to carry the release notes alone. Do
    not "fix" this by force-adding them.

    If `bun run format` was not already run in Phase 7 (step 18), run it now before staging.

    For each bundle, stage only that bundle's files, write a commit message in the project's
    existing style (read recent `git log --oneline -20` first), and commit. Do not use
    `git add -A` across bundles. Never run `git stash`. Never push, force-push, tag, or amend
    a published commit. Never pass `--no-verify`.

    **Stage the bundle, then commit with no path arguments.** `git commit <paths>` re-reads those
    paths from the working tree and discards whatever is staged for them, including a
    `git update-index --chmod=+x`. Under `core.fileMode=false` (Windows) that silently records an
    executable hook as `100644`, which POSIX git then refuses to run. It also cannot express an
    index-only removal: `git rm --cached` leaves the file on disk, so a path-scoped commit records
    it as present again.

    If a pre-commit hook fails, fix the underlying issue and create a NEW commit; do not
    `--amend` the failed attempt.

### Phase 9 - Summary

21. Report:
    - Version: `<old>` → `<new>` (bump type and why)
    - Changelog file(s) updated and the section header added
    - feature.json: N created, M updated (list IDs)
    - All files written
    - Commits created: N (list short SHA + subject for each)
    - Any anomalies (ambiguous feature matches, unclassifiable changes, validator warnings)

## Anti-Patterns to Avoid

| Anti-Pattern                                   | Correct Approach                                                      |
| ---------------------------------------------- | --------------------------------------------------------------------- |
| Pasting commit subjects / diffs into changelog | Rewrite as concise, user-facing natural language                      |
| `feature-YYYYMMDD-slug` IDs for new base work  | Clean descriptive slug; directory name equals `id`                    |
| Bumping child `package.json` versions          | Version lives in root `package.json` only (plus `VERSION` if present) |
| Jumping to `1.0.0` / a new major unprompted    | Stay within the current major                                         |
| `git stash` to "clean" the tree                | The dirty tree is the input; never stash, reset, or discard           |
| Generic "updated" revision notes               | Specific: what behavior/area changed in this revision                 |
| New `feature.json` with no roadmap entry       | Add it to `.aidd/roadmap.json` too (create the roadmap if absent)     |
| `git commit <paths>` for a staged bundle       | Stage the bundle, then `git commit` with no paths                     |
| Tagging or pushing from this skill             | Commit bundles only; tagging and pushing remain the user's call       |
| Inventing a new changelog format               | Match the detected file's existing format exactly                     |
| Documenting refactors/tests as user features   | Exclude from changelog; note in feature.json only if material         |

## Notes

- Comprehensive **and** natural: every artifact should read as if a careful human wrote it for
  the next reader, not as machine output.
- Net-new = did not exist in the codebase before. Such functionality must get a `feature.json`,
  not just a changelog line.
- "Internal version bump" = the project's own semver in root `package.json` (+ `VERSION`),
  surfaced in the changelog and stamped per-feature via `shippedVersion`.
- If feature/diff matching is ambiguous, preserve existing metadata and report the unresolved match.

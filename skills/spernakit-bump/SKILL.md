---
name: spernakit-bump
description: 'Ship a new Spernakit template version from <spernakit-root>: validate the template, update template metadata, and publish the release tag. Use to cut, bump, or release a new Spernakit template version.'
metadata:
    aidd-category: spernakit-fleet
    aidd-contracts: document-changes, humanize-docs
---

# Release Spernakit

Ship a new Spernakit template version from `<spernakit-root>`, validate the template, update template metadata, and publish the release tag.

## Usage

```
spernakit-bump [bump-hint]
```

- Zero args → infer the bump from commits since the previous tag.
- `[bump-hint]` → `+0.0.1` or `+0.1.0`. The hint overrides automatic sizing but does not skip
  validation or publication.

## Target

Spernakit template codebase:

<spernakit-root>/

**Run each command once from the same context.** Do not launch a parallel copy of
`bun run supertest`, `bun run smoke:screenshots`, or any `bun run smoke:*` command when the first
appears slow. A second copy can run `smoke:reset`, terminate the first process, and cascade
`ERR_CONNECTION_REFUSED` through the run. If a long-running command must be detached, start one
process and monitor it through the active backend's process capability.

- **First, check whether the `document-changes` skill already ran.** It bumps the root
  `package.json`, writes `docs/template/CHANGELOG.md`, and commits that release-accounting work.
  When the version, the changelog's top section, and `git log` already agree on the new version,
  skip the duplicate bump and changelog work. Do not add a second empty `vX.X.X` commit on top of
  it. The current-version claims, fleet manifest, and other doc reviews below still run and may
  produce tracked changes that need their own commit. Everything else in this skill still runs:
  supertest (which produces the screenshot artifact), smoke:qc, and tagging. Releases v3.25.0
  through v3.28.2 shipped without a release-time screenshot artifact because "pick up at
  validation" was read as "skip to tagging"; never do that.
- review all changes made since previous tagged release (including staged but not yet committed changes)
- determine bump size (+0.0.1 or +0.1.0) and bump version
- update package.json with new version (version field lives in root only). **The bump must land
  before supertest runs**: `smoke:screenshots` writes to `screenshots/v{package.json version}/`, so
  a pre-bump run both mislabels the new UI as the old version and overwrites the previous release's
  archived screenshots. Bump first, then validate.
- **Update all six current-version claims, not just `package.json`.** `check:version-refs`, which
  `smoke:qc` runs, requires every one of them to agree, and `scripts/check-version-refs.ts` holds the authoritative
  list in its `CLAIM_SITES` array: the `README.md` title, its "is the current template baseline"
  sentence, its "is a full-stack" overview sentence, the "as it ships today" sentence in
  `docs/template/README.md`, the `**Spernakit vX.Y.Z** - See [CHANGELOG.md]` line in
  `docs/template/STACK.md`, and the newest `## [X.Y.Z]` heading in `docs/template/CHANGELOG.md`.
  Only the changelog heading is scoped to its first match; every other site is checked at every
  occurrence, so a second copy of one of those sentences has to be updated too. A site whose pattern
  matches nothing fails as "pattern is stale" rather than passing silently, so a reworded README
  needs the pattern updated in the same change. The README title and baseline sentences sat at
  v3.29.0 across seven releases before this check existed, and the STACK.md line was the one this
  skill kept omitting. Historical prose, support floors, and provenance stamps are deliberately
  exempt and stay frozen. Never touch `spernakit_version` in feature records; it is an origin
  marker, not a release version.
- include `bun run smoke:docker-local` in the non-capture validation below when the release touches
  runtime, Docker, or dependencies. CI runs the docker-local crawl and a Trivy scan for that half;
  `smoke:qc` does not cover it.
- run `bun run fleet-manifest:sync` from `<spernakit-root>` now that `package.json` carries the new
  version. Run this even when `document-changes` performed the bump before this skill started. The
  command restates `spernakit.psd1` from every app's tracked `package.json` and runtime
  `config/<slug>.json`, including the template self-entry. It must run before the release commit,
  not after `bun run check:fleet-manifest` has already failed. A refusal means the fleet is not
  fully verifiable; fix the reported app instead of editing the ignored manifest by hand.
- update docs/template/CHANGELOG.md with all changes appropriately grouped/formatted; changelog and doc prose follows the humanize-docs style contract (`.aidd/skills/humanize-docs/SKILL.md`, staged into this workspace; or `<aidd-root>/skills/humanize-docs/SKILL.md` in the aidd repo): plain natural language, no em-dashes, no AI filler, describe what changed rather than praising it
- update .aidd/project-structure.md (as needed)
- update .aidd/spec.md (as needed)
- update docs/template/STACK.md (as needed)
- update scripts/template-manifest.json if template-managed files were added, removed, or reclassified
- **Validate `scripts/template-manifest.json` against the filesystem** before staging. Confirm each
  path in the `branded`, `buildCriticalBranded`, and `infrastructure` arrays exists under
  `<spernakit-root>`, confirm every build-critical path is also branded, and remove stale entries.
  Scan for files that differ per app, including `config/example.json`,
  `frontend/public/og-image.svg`, and new `docker-compose*.yml` files, and confirm they appear in
  `branded`. Treat the manifest as the source of truth for every derived app's drift checker.
- based on changes made, ensure any other unspecified docs need to be updated
- bun run format
- run all non-capture validation while the prepared version and documentation changes are still
  uncommitted. This includes `bun run smoke:qc` and, when applicable, `bun run smoke:docker-local`.
  Fix every failure before proceeding. Do not run `bun run supertest` or
  `bun run smoke:screenshots` in this dirty state: release capture deliberately rejects a build
  whose source is not a clean commit.
- review `git status --short` and classify every modified/untracked file: stage ONLY files that belong to this release. Never sweep unrelated WIP into the release commit; exclude such files and flag them to the user instead
- **skim `git log` since the previous tag before tagging.** `scripts/release-notes.ts` builds the
  published notes from conventional-commit subjects, not from the commit message you just wrote.
  `feat`, `fix`, `perf`, `refactor`, and `docs` are published; `build`, `chore`, `ci`, `style`, and
  `test` are counted but omitted; a subject that does not parse appears under `Other changes`. A
  release whose squash subject uses an omitted type can publish no change section, and the tag
  cannot be redone.
  The squash step below collapses the release branch into one subject, so read the next section
  before deciding what that subject should say.
- present the staged file list, new version, and tag name, then run the commit, capture, PR, and tag
  sequence directly; invoking this release skill authorizes publication
- **do not push to `main`, and do not create or push the tag yet**

## Commit and capture the release-branch candidate

**`main` rejects a direct push.** The `Default branch safety` ruleset (id 19563485) covers
`~DEFAULT_BRANCH` with **zero bypass actors** and requires the `Quality Checks` and
`Runtime Verification` contexts, so pushing the release commit straight to `main` fails with `GH013`
and the local commit is left stranded. Every release ships through a branch and a pull request.
Confirm the current rules rather than trusting this paragraph if a push is refused for some other
reason:

```text
gh api repos/{owner}/{repo}/rulesets/19563485 --jq '{bypass: .bypass_actors, rules: [.rules[].type]}'
```

Create the release branch before committing, then commit only the prepared release changes:

```text
git switch -c release/vX.Y.Z
git commit -m vX.Y.Z
```

If `document-changes` already committed the bump and the remaining preparation produced no tracked
changes, do not create an empty commit. The release branch can start at that existing commit.

Confirm `git status --short` is clean, then run `bun run supertest`. `supertest` ends with
`smoke:screenshots`, and `captureReleaseBuild` verifies that the served production build and the
working directory both identify this clean committed candidate. Do not weaken or bypass that clean
source check.

Confirm `screenshots/v<new>/` contains the full page capture (normally 20+ PNGs) and that its
authoritative `crawl-result.json` reports a passed crawl for the current commit and tree. The
gitignored directory is local release evidence. Files on disk are not the same as a passed crawl,
and an older branch capture cannot serve as evidence for a later commit.

If validation, supertest, or review finds a problem that requires a tracked fix, repeat the candidate
cycle before the next push:

1. Apply the fix and rerun `bun run format`, the affected non-capture checks, and
   `bun run smoke:qc` while the fix is dirty.
2. Commit the tracked fix and confirm the working tree is clean.
3. Run `bun run supertest` again and verify that the new authoritative screenshot capture passed for
   the new commit and tree.

Never reuse a capture from before a tracked fix. Run `bun run smoke:screenshots` separately only when
the full `supertest` was already completed for the same clean commit but its capture was not. Do not
launch either command twice: a second copy can reset the first run.

## Ship through a release branch

Only after the clean release-branch candidate has a passing capture, push it and open the PR:

```text
git push -u origin release/vX.Y.Z
gh pr create --base main --title '<published-type>(release): vX.Y.Z - <summary>' --body '<details>'
```

The ruleset requires the two status contexts but **no approving review**, so the PR becomes eligible
to merge once both are green. Still read the review comments before merging: CodeRabbit posts
advisory findings while reporting a pass, and a re-review after pushing fixes will flag gaps outside
the diff that the first pass could not see.

**The PR title controls the squash commit's release-note entry.** The repository allows squash merges only
(`allow_merge_commit` and `allow_rebase_merge` are both false) with
`squash_merge_commit_title: COMMIT_OR_PR_TITLE`, so a multi-commit release branch lands on `main`
under the PR title alone. `release-notes.ts` then parses that one subject. Title the PR with one of
the published types (`feat`, `fix`, `perf`, `refactor`, or `docs`) and a specific summary. Do not use
`chore(release)`: `chore` is deliberately omitted from the notes. A bare `vX.Y.Z` title lands under
`Other changes` but provides no useful release summary, and the tag cannot be redone.

```text
gh pr checks <number> --watch
gh pr merge <number> --squash --delete-branch
git switch main
git pull
```

If a PR check or review requires a tracked change, do not merge yet. Apply the release-candidate cycle
above, push the newly captured clean commit, and wait for the replacement PR checks. After the merge,
confirm the pull leaves local `main` clean and at the remote squash commit. The branch commit and its
capture no longer qualify because the squash commit has a different identity.

## Wait for main CI and capture the squash commit

`release.yml` triggers on the tag push and then polls `actions/runs` for a successful CI run against
that exact commit: 20 attempts, 30 seconds apart, then it fails with "Timed out after 10 minutes
waiting for CI". It refuses outright if CI concluded anything other than success. Tagging before CI
is green therefore burns the tag on a release run that cannot publish.

The PR's own checks ran against the branch head, which is a different SHA from the squash commit, so
they do not satisfy this poll. Record `git rev-parse HEAD`, find the CI run whose `headSha` is that
exact main commit, and wait for it to succeed:

```text
git rev-parse HEAD
gh run list --branch main --workflow CI --commit <main-sha> --limit 1 --json databaseId,headSha,conclusion
gh run watch <main-ci-run-id>
```

After CI succeeds, confirm `main` is still clean and still at `<main-sha>`, then run
`bun run smoke:screenshots`. This final capture is mandatory even though the release branch was
captured: it must identify the exact clean squash commit and tree that will be tagged. Verify the
authoritative `crawl-result.json` is passed and that both `candidate` and `build.source` match
`git rev-parse HEAD` with `clean: true`.

Only then create `vX.X.X` on that main commit and push it:

```text
git tag vX.X.X
git push origin vX.X.X
```

The pre-push guards run here. The history guard blocks a push carrying `.aidd/` history (strip the
offending commits rather than bypassing it), and the screenshot guard verifies the full capture,
clean source, production build, route inventory, and exact tag commit. Never bypass either guard.

## Watch the release, then verify it

**No second CI run appears for the tag.** Tags are deliberately not built: a duplicate run on a
byte-identical tree would contend with CodeQL and cancel its scan. Only `Release` runs, so an
absent CI run for the tag is the expected state and not a failure to chase.

```text
gh run list --workflow Release --limit 3
gh run watch <release-run-id>
gh release view vX.Y.Z
```

Confirm the release is marked Latest and that its notes match `docs/template/CHANGELOG.md`. Nothing
publishes a container image and nothing should: `check:image-publication` enforces that the template
has no publish path at all.

## Rollback

Fix forward. Never move, delete, or retag a published version: derived apps pin template versions
and resolve their sync source from the tag, so deleting it breaks their upgrade path retroactively.

```text
gh release edit vX.Y.Z --prerelease          # or --draft; drops the Latest badge
gh release edit v<previous-good> --latest    # re-point Latest
```

Ship the fix as `vX.Y.(Z+1)`; it becomes Latest on its own. Leave the broken tag as a prerelease.
When a template fix requires retagging mid-dance, resync the apps already upgraded and restore the
prior release tag before running `document-changes`.

---
name: cut-release
description: 'Cut a versioned release of a standalone repository: document the changes, run the gates, capture screenshots, land on main directly or through a pull request, tag, publish, and verify. Use to cut a release, ship a version, tag and publish, or release an app. Excludes the Spernakit template and its derived apps, which release through the dance.'
metadata:
    aidd-category: runtime
    aidd-contracts: document-changes, humanize-docs
---

# Cut a Release

Take a repository from "the work is committed" to "the version is published and verified". One
command covers every repository whose release differs only in which optional steps apply:
screenshots, a pull request, an automated release workflow, a package publish. The skill probes for
each capability rather than being told, so the same invocation is correct in a headless CLI and in a
full web app.

Invoking this skill authorizes its commit, push, tag, release, and publish steps.

## Usage

```
cut-release
cut-release <repo-path>
cut-release <repo-path> --dry-run
```

`--dry-run` runs Phase 0 and prints the plan, then stops. Nothing is written, pushed, or tagged.

## Out of scope

- **The Spernakit template.** It releases through `spernakit-bump`, which the dance drives. Abort if
  the repository is the template.
- **Spernakit-derived apps.** Their `package.json` carries a `spernakit_version` origin marker; they
  are bumped and tagged by the dance's D3 phase against the template version they synced from.
  Abort and say so — cutting one by hand outside a dance detaches it from its propagation record.

Everything else with a version manifest and a git remote is in scope.

## Phase 0 - Preflight and capability probe

Collect every fact first, print the resulting plan, then execute it. A probe that errors is not a
"no"; resolve it before continuing.

### Identity

```text
git rev-parse --show-toplevel
git branch --show-current
git remote get-url origin
gh auth status
```

Work from the toplevel. Confirm the current branch is the repository's default branch before
starting; a release cut from a stale feature branch tags the wrong tree.

### Repo-local deviations

Read `docs/guides/releasing.md`, `RELEASING.md`, or `CONTRIBUTING.md` if present. A repository that
documents its own release contract outranks this skill on every point where they disagree. Say which
document you followed in the final report.

### Working tree

Run `git status --short`. A dirty tree is expected: Phase 1 documents and commits it. Never run
`git stash` in any form. If the tree holds changes that are not part of this release, stop and ask
the owner rather than sweeping them into a release commit or setting them aside.

### Version state

Discover the version manifest by role, using the same table `document-changes` uses (`package.json`,
`pyproject.toml`, `Cargo.toml`, `*.csproj`, `*.psd1`, `mix.exs`, `*.gemspec`, `VERSION`). Record
which exist and which one the repository's own tooling reads. Then:

```text
git describe --tags --abbrev=0
git tag --list 'v*' --sort=-creatordate | head -5
git ls-remote --tags origin
```

Establish the previous version and confirm the target tag exists neither locally nor on the remote.
A tag that already exists means a prior cut got partway; resume from the phase after it rather than
re-running from the top.

### Capabilities

| Capability            | Probe                                                                                            | Effect                                                        |
| --------------------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------- |
| Canonical gate        | a `smoke:qc` script in the manifest                                                              | Phase 2 runs it; otherwise assemble the gate from what exists |
| Extra release gate    | a `release:check` script                                                                         | Phase 2 runs it after `smoke:qc`                              |
| Screenshots           | a `smoke:screenshots` script                                                                     | Phase 3 runs, after the bump                                  |
| Pull request required | `gh api repos/{owner}/{repo}/branches/{branch}/protection --jq '.required_pull_request_reviews'` | Phase 4 takes the pull request path                           |
| Release automation    | a workflow under `.github/workflows/` triggered by `push: tags:` or `workflow_run:`              | Phase 6 watches it instead of creating the release by hand    |
| Publish automation    | a workflow that runs a publish command                                                           | Phase 7 watches CI instead of publishing locally              |
| Local publish         | manifest is not `private: true` and declares `bin`, `files`, or `publishConfig`                  | Phase 7 publishes from the checkout                           |

**Reading the protection probe.** `404 Branch not protected` means classic branch protection is
absent and pushes to the default branch are allowed: take the direct path. A returned object means a
pull request is required, even when `required_approving_review_count` is `0` — the review count
governs approvals, not whether a pull request is needed. Rulesets are a separate mechanism that this
endpoint does not report, so also run `gh api repos/{owner}/{repo}/rules/branches/{branch} --jq
'[.[].type]'`; a `pull_request` entry there requires the pull request path too. Entries like
`deletion` and `non_fast_forward` do not.

**A missing `screenshots/` root is not the same as a missing capability.** The pre-push guard treats
an absent root as an opted-out repository and passes, so a repository whose first release predates
its first capture will not be caught by the guard. Trust the `smoke:screenshots` script as the
capability signal, not the directory.

### Plan

Print the target version, the previous version, and the phase list with each optional phase marked
included or skipped and why. With `--dry-run`, stop here.

## Phase 1 - Document the changes

Invoke `Skill: document-changes` against the repository. It reviews everything since the last
release, brings the changelog, the version manifest, and the `.aidd/features/*/feature.json` records
into agreement with the code, and commits the result in logical bundles. It does not push or tag,
which is why this phase can be delegated wholesale.

When `document-changes` reports the work was already done — version, changelog top section, and
`git log` already agree on the new version — that is a pass, not a failure. Do not add a second
commit on top of it. Everything after this phase still runs.

Before leaving this phase, verify the lockstep by hand: every manifest that carries a version, the
`VERSION` file if one exists, and the top `## [X.Y.Z]` changelog heading must all read the same. A
repository with a `release:check`-style script enforces this in Phase 2 as well, but catching it here
saves a full gate run.

Changelog and doc prose follows the humanize-docs contract: plain natural language, no em-dashes, no
AI filler, describe what changed rather than praising it.

## Phase 2 - Gates

Run the canonical gate and read its output. Never report a gate as green from an exit code you did
not see.

```text
bun run smoke:qc
bun run release:check      # only if the script exists
```

When there is no `smoke:qc`, assemble the equivalent from the scripts the repository does have —
format check, lint, typecheck, tests, build — and name the substitution in the report. A repository
whose gate is a chain of other scripts still gets one line in the report, not seven.

Fix failures. Do not narrow the gate, mark a step as expected-to-fail, or proceed with a red result.

## Phase 3 - Screenshots

Skip when the repository has no `smoke:screenshots` script. Headless repositories — CLIs, libraries,
services with no UI — have nothing to capture and no guard to satisfy.

Otherwise:

```text
bun run smoke:screenshots
```

**This runs after the bump, never before.** The capture writes to `screenshots/v<version>/` using the
version in the manifest, so a pre-bump run files the new UI under the previous version and, worse,
overwrites that release's archived capture. `screenshots/` is gitignored, so this is the only visual
record the version will ever have and it cannot be rebuilt once the tag is public.

**Single-instance rule.** Never start a second smoke run while one is active. The second copy resets
shared state and terminates the first process, cascading connection failures through both runs.

Confirm the artifact before moving on: the directory exists, holds at least five PNGs, and its
`crawl-result.json` records a passing crawl. Files on disk are not the same as a clean crawl — a run
that fails on its last page still leaves a full-looking directory behind. The pre-push guard checks
all three at tag time; fix the crawl rather than reaching for `--no-verify`.

## Phase 4 - Land on the default branch

### Direct path (no pull request required)

```text
git push origin main
```

### Pull request path (protection or a ruleset requires one)

```text
git checkout -b release/X.Y.Z
git push -u origin release/X.Y.Z
gh pr create --base main --title "<Project> X.Y.Z" --body "<one line; point at the changelog>"
gh pr checks --watch
gh pr merge --rebase --delete-branch
```

A trailing "not possible to fast-forward" from the merge is expected on a rebase merge and is cured
by the next step, which is **not optional**:

```text
git checkout main
git fetch origin --prune
git reset --hard origin/main
```

A rebase merge rewrites the commits, so the local `main` still points at the pre-merge SHAs. Tagging
before this resync tags a commit that is not what landed.

### Both paths

Wait for CI to go green on the merged commit before tagging:

```text
gh run watch $(gh run list --branch main --limit 1 --json databaseId --jq '.[0].databaseId')
```

This is not politeness. A release workflow that gates on a successful run for the tagged SHA will
refuse to publish without one, and will give up rather than wait indefinitely.

## Phase 5 - Tag

```text
git tag -a vX.Y.Z -m "<Project> vX.Y.Z - <summary>"
git push origin vX.Y.Z
```

The push runs the repository's pre-push guards. Where the shared hook set is installed, that is the
aidd history guard (no `.aidd/` history in the pushed range) and the screenshot guard. Both are
telling you about a real omission. Strip the offending commits or generate the missing capture;
`--no-verify` is reserved for historical tags that predate a guard.

## Phase 6 - Release

**Automated.** When a workflow is triggered by the tag push or by a completed run on the tag, it
creates the release. Watch it; do not create the release by hand, and do not upload assets manually.

```text
gh run list --limit 5
gh run watch <release-run-id>
```

Some repositories deliberately do not build on tags and instead have the release workflow poll for a
green run on that exact SHA. In that case no new CI run appears for the tag and only the release
workflow does — an absent CI run is expected there, not a failure.

**Manual.** When nothing automates it, extract this version's changelog section and publish from it
rather than retyping the notes:

```powershell
$v = 'X.Y.Z'
Remove-Item release-notes.md -ErrorAction Ignore
(Get-Content CHANGELOG.md -Raw) -split '(?m)^## \[' | Where-Object { $_ -like "$v]*" } |
  ForEach-Object { '## [' + $_.TrimEnd() } | Set-Content release-notes.md
if (-not (Test-Path release-notes.md)) { throw "no CHANGELOG section matched $v" }
gh release create "v$v" --title "<Project> $v" --notes-file release-notes.md
Remove-Item release-notes.md
```

Adjust the changelog path to the one the repository actually uses. The `throw` matters: a silent
empty match publishes a release with no notes.

## Phase 7 - Publish

Skip when the manifest is `private: true`, or when it declares no `bin`, `files`, or
`publishConfig` — nothing is meant to leave the repository.

When a workflow publishes, watch it and do not publish locally; two publishes race for the same
version and the loser is a hard error.

Otherwise publish from the checkout:

```text
npm login        # only when not already authenticated
bun publish
```

## Phase 8 - Verify

```text
gh release view vX.Y.Z
```

Confirm it is marked Latest, that the notes match the changelog section, and that every expected
asset is attached. Where the release ships a checksum file, download an asset and compare its hash
against the recorded one rather than assuming the upload was faithful.

Where Phase 7 published a package, verify it from outside the checkout — a package that only works
in the directory that built it is the classic packaging failure:

```text
cd $env:TEMP
npx --yes <package>@X.Y.Z --help
```

## Rollback

Fix forward. Never move, delete, or re-point a published tag: derived work and pinned dependents
resolve against it, and deleting it breaks them retroactively.

```text
gh release edit vX.Y.Z --prerelease            # or --draft; drops the Latest badge
gh release edit v<previous-good> --latest      # re-point Latest
gh release delete-asset vX.Y.Z <asset>         # only if the asset is actively harmful
```

Then ship the fix as `vX.Y.(Z+1)` through the flow above; it becomes Latest on its own. Leave the
broken tag in place as a prerelease.

## Output

Report:

- the repository, the previous version, and the version cut;
- each phase with its outcome — ran, skipped with the reason, or failed;
- the gate commands actually run and their results;
- the screenshot artifact path and PNG count, or the reason there is none;
- the pull request number and merge commit, where that path was taken;
- the tag, the release URL, and the published package version, where each applies;
- any file left dirty on purpose, named individually.

A phase that was skipped is reported as skipped with its probe result. Silence reads as "done" and is
the one failure mode this skill exists to prevent.

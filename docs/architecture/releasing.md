# Releasing aidd

How a maintainer cuts a release, and how to roll one back if something goes wrong. aidd releases are
**tag-driven and automated**: pushing a `vX.Y.Z` tag runs CI, and on success the `Release` workflow
renders the notes and creates the GitHub release. Release assets require no manual upload;
local production builds are still required to verify the candidate.

> This describes the steady-state flow, which assumes `main` already exists publicly and grows
> linearly. It does **not** cover the initial 3.0.0 cut, which publishes a parentless root commit
> instead of the repository's development history. The maintainer owns a private
> `launch-runbook.md`; its location is recorded in the local release punchlist, not shipped with
> this repository. It governs the
> initial cut: do not push development main before constructing and proving the final root.
> From 3.0.1 onward this document is authoritative.

aidd ships source rather than prebuilt assets, so a release is a **tag plus notes**. The Release
workflow does not package or upload built files. GitHub generates the `Source code (zip)` and
`Source code (tar.gz)` archives from the tag itself, and those archives are what
[the install instructions](../reference/deployment.md#install) point downloaders at. They contain
the tracked source without `frontend/dist`; `bun install` runs the root `postinstall` hook, which
builds `frontend/dist` before the control panel starts.

## Release checklist

Copy this into the release PR or tracking issue and tick as you go:

```markdown
- [ ] Changelog + version bumped (VERSION, package.json, docs/CHANGELOG.md all agree) via
      /document-changes or by hand; feature records stamped
- [ ] Release notes claim only what is proven: capability claims are fine, but do not state that
      a backend, provider, or endpoint is covered by live testing unless a live gate actually
      ran — the `lmstudio`, `native`, `ollama`, and `openai` smoke rows are simulation rows
- [ ] Release-preparation changes committed; intended tree clean
- [ ] Local gates green: `bun run smoke:qc`, `bun run test`, and `bun run check:source-install`
- [ ] Version parity: `bun run check:version-parity`
- [ ] Production frontend rebuilt and screenshots captured from the final clean candidate;
      `screenshots/vX.Y.Z/release-run.json` selects a passing immutable run for that commit
- [ ] main pushed; CI green on main
- [ ] Annotated tag `vX.Y.Z` created and pushed
- [ ] CI green on the tag; Release workflow succeeded
- [ ] Release is marked Latest; release notes match the changelog
- [ ] `Source code (zip)` downloads and `bun install` succeeds from the extracted tree
```

### 1. Prepare

Bump the internal version in lockstep and write the changelog entry. The `/document-changes` skill
does this (and stamps feature records), or do it by hand. `VERSION`, root `package.json` `version`,
and the top `## [x.y.z]` heading in `docs/CHANGELOG.md` **must all match** — `check:version-parity`
enforces this, and the Release workflow re-checks it before publishing. Minor bump for net-new
functionality, patch for fixes only.

Commit the intended release-preparation files first and require a clean working tree. Then run
the gates locally so CI doesn't fail the tag (CI runs the same gate on Linux):

```powershell
bun run smoke:qc
bun run test
bun run check:version-parity
bun run check:source-install
```

`check:source-install` examines the current committed `HEAD`. It exports the tracked tree with
`git archive`, confirms that the source export does not already contain `frontend/dist`, and runs
`bun install --frozen-lockfile` in that clean export with the build opt-outs cleared. The root
`postinstall` hook must then build `frontend/dist`, including `index.html` and every asset it
references. Run the gate after the release-preparation changes are committed, before creating the
tag; the Release workflow repeats it against the exact commit that CI validated.

`bun run test` is the canonical full-suite wrapper; focused `bun test <file>` commands are useful
diagnostics but do not replace it. `smoke:qc` also runs that wrapper using its normal cache.

Capture screenshots from the final committed candidate after rebuilding its production frontend:

```powershell
bun run stop:web
bun run build:frontend           # embeds the current clean commit and tree in release-build.json
bun run start:web                # serves frontend/dist through the backend
bun run smoke:screenshots --viewport desktop
bun run stop:web
```

For screenshot captures, `--viewport desktop` applies **2250 × 1309** CSS pixels; it is also the
default. Do not add unsupported `--width` or `--height` flags. `--base-url http://host:port` overrides
both the readiness probe and crawl target; otherwise both use the configured web URL. The wrapper
waits up to 60 seconds for `/api/v1/health`, includes `--404`, and forwards supported crawler
options. `--page`, `--start-from`, and mobile viewport presets produce diagnostic evidence and
cannot satisfy the release guard. A development server cannot substantiate a release capture.
The wrapper still runs the vitals analyzer for diagnostics; a narrow crawl can exit nonzero for
missing metric samples even when its page assertions pass. Inspect its report for the reason.

`screenshots/` is gitignored; preserve it locally. Each attempt writes a unique `runs/<run-id>/`
directory. `release-run.json` selects the latest full attempt, including failed or interrupted
attempts; a later diagnostic does not replace it. The selected directory contains `crawl-result.json`,
the immutable `report.json`, and PNGs. The guard reads `.screenshot-capture` from the tagged tree
and verifies the exact clean commit/tree, production build, analyzer verdict, full required route
coverage, viewport, and report/image hashes. Loose PNGs or the old top-level crawl result do not
qualify. Inspect the selected run, not an earlier successful attempt.

Any new commit, amendment, or parentless-root construction invalidates the previous capture even
when file contents are unchanged. Rebuild the production frontend and recapture on the final SHA;
do not edit evidence to rebind it. Repeat the authoritative gates on that candidate as well.

### 2. Cut the tag

```powershell
git push origin main
git tag -a vX.Y.Z -m "aidd vX.Y.Z — <summary>"
git push origin vX.Y.Z
```

The tag push runs the pre-push guards: the history guard (no `.aidd/` in the pushed range) and the
screenshot guard (the selected immutable capture proves the tagged candidate). If the screenshot
guard fires, resolve the reported failure, rebuild and recapture as above, and retry. Do not bypass
it or move an already published tag.

Pushing the tag triggers CI on the tag. On success, `.github/workflows/release.yml` runs
`release:notes` (which re-asserts version parity, then writes `dist/release/release-notes.md`). It
then runs `check:source-install`: the gate exports the exact tagged source with `git archive`,
rejects an export that already contains built frontend files, performs a clean frozen install, and
requires the install-time `postinstall` build to produce a complete `frontend/dist` asset graph.
Only after that source-integrity check passes does the workflow run
`gh release create --notes-file`. The job runs on `ubuntu-latest`; building the portable web
frontend from source does not impose a platform-specific runner requirement.

Because the tag is the artifact, **the release content is whatever the tagged commit contains**.
`.gitignore` keeps `node_modules/`, `dist/`, and `frontend/dist/` out of the tree, so GitHub's
source archives carry first-party code only — downloaders resolve dependencies themselves with
`bun install`.

### 3. Verify the published release

```powershell
gh release view vX.Y.Z            # marked Latest? notes match the changelog?
```

Then prove the install path a downloader actually takes:

```powershell
gh release download vX.Y.Z --archive=zip -O aidd-vX.Y.Z.zip
Expand-Archive .\aidd-vX.Y.Z.zip -DestinationPath .\aidd-release-check
cd .\aidd-release-check\aidd-X.Y.Z
bun install
bun run start:web
```

Confirm the panel comes up, then confirm `releases/latest` resolves to the new tag.

> GitHub's source archives are generated on demand and are **not byte-stable** — the same tag can
> produce zips with different hashes over time. Do not publish a checksum manifest for them; verify
> by extracting and installing, as above.

## Rollback plan

If a released version is broken, fix **forward**: never move or delete a published tag people may
already have. The goal of rollback is to stop new users landing on the bad release, then ship a patch.

1. **Pull it from "latest".** Mark the bad release as a prerelease (or draft) so it loses the Latest
   badge and `releases/latest` stops pointing at it:

    ```powershell
    gh release edit vX.Y.Z --prerelease        # or --draft to hide it entirely
    ```

2. **Re-point Latest at the last good release** so the download link works again:

    ```powershell
    gh release edit v<previous-good> --latest
    ```

3. **Ship the fix as a patch.** Commit the fix, then cut `vX.Y.(Z+1)` through the normal flow above.
   The new tag becomes Latest automatically once its Release workflow succeeds.

There is no asset-withdrawal step: the source archives are derived from the tag, so the only way to
withdraw them is to delete the tag — which breaks anyone who already pinned it. Keep the broken
tag and release in place (as prerelease) for the record.

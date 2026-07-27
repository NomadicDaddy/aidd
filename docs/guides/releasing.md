# Releasing aidd

How a maintainer cuts a release, and how to roll one back if something goes wrong. aidd releases are
**tag-driven and automated**: pushing a `vX.Y.Z` tag runs CI, and on success the `Release` workflow
packages the standalone on a Windows runner and uploads the assets. You never build or upload by
hand.

## Release checklist

Copy this into the release PR or tracking issue and tick as you go:

```markdown
- [ ] Changelog + version bumped (VERSION, package.json, docs/CHANGELOG.md all agree) via
      /document-changes or by hand; feature records stamped
- [ ] Local gates green: format:check, lint, typecheck, check:max-lines, check:feature-integration,
      and `bun test`
- [ ] Artifact integrity: `bun run release:check -- --target bun-windows-x64-modern --skip-command-gates`
- [ ] Screenshot artifact captured **after** the bump: `bun run smoke:screenshots` wrote
      `screenshots/vX.Y.Z/` (the pre-push guard blocks the tag without it)
- [ ] Version-bump commit landed on main
- [ ] main pushed; CI green on main
- [ ] Annotated tag `vX.Y.Z` created and pushed
- [ ] CI green on the tag; Release workflow succeeded
- [ ] Release is marked Latest; zip + SHA256SUMS.txt + release-notes.md attached
- [ ] Downloaded zip's SHA-256 matches SHA256SUMS.txt; release notes match the changelog
```

### 1. Prepare

Bump the internal version in lockstep and write the changelog entry. The `/document-changes` skill
does this (and stamps feature records), or do it by hand. `VERSION`, root `package.json` `version`,
and the top `## [x.y.z]` heading in `docs/CHANGELOG.md` **must all match** (`release:check` enforces
this). Minor bump for net-new functionality, patch for fixes only.

Run the gates locally so CI doesn't fail the tag (CI runs on Linux, so mirror it):

```powershell
bun run format:check; bun run lint; bun run typecheck
bun run check:max-lines; bun run check:feature-integration; bun test
bun run release:check -- --target bun-windows-x64-modern --skip-command-gates
```

Capture the release's screenshot artifact **after** the version bump, so the crawl lands in the
directory named for the version being shipped:

```powershell
bun run smoke:screenshots        # writes screenshots/vX.Y.Z/ from package.json's version
```

`screenshots/` is gitignored, so this directory is the only visual record of the release — it
cannot be reconstructed later. Capturing before the bump would file the new UI under the previous
version and overwrite that release's archive. The pre-push screenshot guard
(`.githooks/screenshot-guard.sh`) refuses to push a `vX.Y.Z` tag when `screenshots/vX.Y.Z/` is
missing, nearly empty, or holds a `crawl-result.json` that does not record a passing crawl — the
crawl must exit 0, not merely produce files.

### 2. Cut the tag

```powershell
git add VERSION package.json docs/CHANGELOG.md
git commit -m "chore(release): X.Y.Z — <summary>"
git push origin main
git tag -a vX.Y.Z -m "aidd vX.Y.Z — <summary>"
git push origin vX.Y.Z
```

The tag push runs the pre-push guards: the history guard (no `.aidd/` in the pushed range) and the
screenshot guard (`screenshots/vX.Y.Z/` exists with the page captures and a passing crawl result).
If the screenshot guard fires, run `bun run smoke:screenshots`, fix whatever the crawl reports, and
push the tag again — do not bypass it.

Pushing the tag triggers CI on the tag. On success, `.github/workflows/release.yml` (on
`windows-latest`) runs `release:package` + `release:check`, then `gh release create` uploads the zip,
`SHA256SUMS.txt`, and `release-notes.md` with `--notes-file`.

> The packaging job **must** run on Windows: the standalone `aidd-web` binary is compiled with
> `--windows-hide-console`, which Bun only allows when compiling on Windows.

### 3. Verify the published release

```powershell
gh release view vX.Y.Z            # marked Latest? all three assets attached?
# download the zip and confirm its hash matches the manifest:
gh release download vX.Y.Z -p "aidd-v*.zip" -p SHA256SUMS.txt
(Get-FileHash .\aidd-vX.Y.Z-bun-windows-x64-modern.zip -Algorithm SHA256).Hash
Get-Content .\SHA256SUMS.txt
```

Confirm the release notes match the changelog and that `releases/latest` resolves to the new tag.

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

3. **(Optional) withdraw the assets** if they're actively harmful:

    ```powershell
    gh release delete-asset vX.Y.Z aidd-vX.Y.Z-bun-windows-x64-modern.zip
    ```

4. **Ship the fix as a patch.** Commit the fix, then cut `vX.Y.(Z+1)` through the normal flow above.
   The new tag becomes Latest automatically once its Release workflow succeeds.

Keep the broken tag/release in place (as prerelease) for the record. Deleting a published tag breaks
anyone who already pinned it.

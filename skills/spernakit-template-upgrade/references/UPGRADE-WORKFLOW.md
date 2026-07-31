# Template Upgrade

Upgrade a derived application from its current Spernakit template version to a target version by applying the template delta (new files, changed files, removed files, dependency updates, and breaking changes) while preserving all domain-specific code.

## Contents

- [Usage](#usage)
- [Instructions](#instructions)
- [Version discovery](#phase-0-version-discovery)
- [Changelog analysis](#phase-1-changelog-analysis)
- [Template delta](#phase-2-template-delta-computation)
- [Upgrade plan](#phase-3-upgrade-plan-generation)
- [Dependency update](#phase-4-dependency-update)
- [Template overrides](#phase-45-load-template-overrides)
- [Manifest synchronization](#phase-46-manifest-sync-mandatory)
- [File synchronization](#phases-5-7-file-sync---file-by-file-merge)
- [Breaking changes](#phase-8-breaking-change-adaptations)
- [Schema and features](#phase-9-schema-sync)
- [Verification](#phase-10-version-stamp-and-verification)
- [Summary report](#phase-11-summary-report)
- [Principles](#principles)
- [Related skills](#relationship-to-other-commands)

## Usage

```
spernakit-template-upgrade [appname]
spernakit-template-upgrade [appname] --to [version]
```

- **Default target**: Latest Spernakit version (from `spernakit/package.json`)
- **Explicit target**: Specify `--to 2.5.1` to upgrade to a specific version

## Instructions

When making decisions, bring the target application closer to compliance with:

```
.aidd/docs/template/STACK.md
.aidd/docs/template/DEVELOPMENT.md
```

These are staged into the project `.aidd/`; when running inside the Spernakit repository they are also at `<spernakit-root>/docs/template/`.

### Phase 0: Version Discovery

1. **Read source version** from `{app}/package.json` → `spernakit_version` field (e.g., `"2.4.0"`)
2. **Read target version** from `spernakit/package.json` → `version` field, or from `--to` argument
3. **Validate versions**:
    - Source version must exist as a git tag `v{source}` in `<spernakit-root>`
    - Target version must exist as a git tag `v{target}` in `<spernakit-root>`
    - Target must be newer than source
4. **Display upgrade path**: `{appname}: spernakit v{source} → v{target}`
5. **Run `bun run check:drift`** to establish the current drift baseline before upgrading. The drift checker now covers all template-managed files. Note any drifted files; these will need careful three-way merging in Phase 7c.
6. **Generate a read-only sync packet** from the template repo when the target app already declares a concrete `spernakit_version`: `bun run template:sync-plan -- --app ../<app> --to <target-version>`. Review `upgrade-review/<app>/summary.md`, `pure-copy.txt`, `branded-copy.txt`, `infrastructure-review.txt`, `infrastructure-diffs/`, and `blocked-app-owned.txt` before applying any file changes.
7. **Capture override baselines** for every `.templateoverrides` path, including whether each path
   exists, before changing files. Store the snapshots in the OS temp directory and use them for
   exact restoration; never restore with a destructive working-tree command.

If the derived app has no `spernakit_version` field, compare template-managed files against available
tags and select the latest uniquely matching source tag. If no unique source can be established,
return a blocker with the candidate evidence instead of guessing.

### Phase 1: Changelog Analysis

Read `spernakit/docs/template/CHANGELOG.md` and extract all entries between the source and target versions (inclusive of target, exclusive of source).

Produce a structured summary:

1. **Breaking changes**: These require derived app code to adapt. Flag each one prominently.
2. **Security changes**: Must be applied; not optional.
3. **Added**: New files, features, components, hooks, endpoints. May require new domain wiring.
4. **Changed**: Modified behavior in existing template-managed code.
5. **Removed**: Files or features deleted from the template.
6. **Improved**: Enhancements to existing infrastructure.
7. **Dependencies**: Package version bumps with `old → new` format.

Present this summary, call out breaking changes, and continue directly.

### Phase 2: Template Delta Computation

Compute the actual file-level delta between the two template versions:

```bash
git -C <spernakit-root> diff --name-status v{source}..v{target}
```

Classify each changed file into:

| Status           | Meaning                    | Handling                                    |
| ---------------- | -------------------------- | ------------------------------------------- |
| **A** (Added)    | New file in template       | Copy to derived app if template-managed     |
| **M** (Modified) | Changed file in template   | Merge changes into derived app              |
| **D** (Deleted)  | Removed file from template | Remove from derived app if template-managed |
| **R** (Renamed)  | File moved/renamed         | Rename in derived app                       |

**Filter to template-managed files only.** Domain-specific files changed in Spernakit (routes with Spernakit-specific logic, Spernakit-specific pages, etc.) are not relevant to derived apps. The drift checker dynamically enumerates all template-managed files from git, including `docs/template/` (template documentation that must stay in sync across all derived apps).

For files NOT in the template-managed list, note them in the report as "template-internal changes (no action needed)."

### Phase 3: Upgrade Plan Generation

Generate `{app}/UPGRADE-PLAN.md`:

```markdown
# Upgrade Plan: {AppName}

Generated: {date}
Upgrade path: spernakit v{source} → v{target}

## Breaking Changes

{List each breaking change with required adaptation steps}

## Upgrade Sequence

### Step 1: Dependencies

{package.json changes: new dependencies, version bumps, removed dependencies}

### Step 2: File Additions

{New template-managed files to copy}

### Step 3: File Removals

{Template-managed files to delete}

### Step 4: File Updates (Config)

{Build config, Docker, scripts changes}

### Step 5: File Updates (Backend Infrastructure)

{Backend plugins, guards, utils, config changes}

### Step 6: File Updates (Frontend Infrastructure)

{Frontend components, hooks, stores, lib changes}

### Step 7: File Updates (Frontend Entry)

{App.tsx, routes.tsx, main.tsx, tailwind.css changes}

### Step 8: Breaking Change Adaptations

{Domain-specific code that must change due to breaking changes}

### Step 9: Schema Changes

{Any database schema template changes: seed data and new template tables}

## Files Changed Summary

| File | Status | Classification | Action |
| ---- | ------ | -------------- | ------ |
| ...  | M/A/D  | template/skip  | ...    |

## Domain-Specific Attention Required

{Files where template changes may conflict with domain customizations}
```

**Present the upgrade plan, then proceed directly to execution.**

### Phase 4: Dependency Update

Execute dependency changes first; everything else may depend on updated packages.

1. **Update workspace structure** if the template delta adds or removes workspace directories:
    - If a new workspace directory exists in the template (e.g., `shared/`), add it to the derived app's root `package.json` `workspaces` array
    - Add workspace dependencies (e.g., `"spernakit-shared": "workspace:*"`) to backend and frontend `package.json` files, renaming the package to match the derived app's convention (e.g., `<app-name>-shared`)
    - Copy the new workspace directory as a unit (see Phase 5 for file handling)
2. **Update `package.json`** at root and in `backend/` and `frontend/` workspaces:
    - Bump versions for changed dependencies
    - Add new dependencies
    - Remove deleted dependencies
    - Preserve app-specific dependencies that don't exist in the template
3. **Run `bun install`** from the app root to update the lockfile
4. **Verify** `bun install` completes without errors

Do NOT touch the app's own `version` field; only dependency versions and `scripts`/`engines` sections.

### Phases 5-7: File Sync - File-by-File Merge

Apply Phases 5-7 file by file rather than through a bulk copy. Domain extensions such as
`routeDetail` in `responseExamples.ts`, `seedBuiltInRecipes` in `seed/index.ts`, app-specific store
fields, and layout component props require individual three-way review.

The cherry-pick path is deterministic and zero-risk when the review packet and drift output are read before edits. Plan for ~3-5 minutes per app for small deltas (<20 files), longer for large deltas. The drift checker (`bun run check:drift`) is the source of truth for sync status; read its output before starting Phase 5.

Continue to **Phase 4.5** (load template overrides), then proceed through Phases 5, 6, and 7 in order.

### Phase 4.5: Load Template Overrides

Check for `.templateoverrides` in the derived app's root directory. This file declares app-specific exclusions that prevent template syncs from undoing intentional app-level changes.

```bash
# Check for overrides file
cat {app}/.templateoverrides 2>/dev/null
```

**Format** (lines starting with `#` are comments, blank lines are ignored):

```
# .templateoverrides: App-specific template sync exclusions
# Format: ACTION  PATH  # REASON
#
# Actions:
#   DELETED: App intentionally deleted this template file; do not recreate
#   SKIP: Do not sync this file from template (app intentionally diverges)
#   KEEP: Keep app version during upgrade; ignore template changes to this file

DELETED  frontend/src/components/shared/DataTable/index.tsx    # App uses custom table component
DELETED  backend/src/routes/health.ts                          # App uses system/ routes instead
SKIP     frontend/src/components/layout/Sidebar.tsx            # Heavily customized navigation
KEEP     backend/src/plugins/rateLimit.ts                      # App-specific rate limit config
```

If the file does not exist, proceed normally (no exclusions). Load all entries into memory for use in Phases 5-7.

### Phase 4.6: Manifest Sync (mandatory)

`scripts/template-manifest.json` must be byte-identical to Spernakit's at the target tag. The manifest is fleet-wide ground truth; branded/infrastructure classifications never differ per app, only per-app file _content_ differs.

```bash
cp "<spernakit-root>/scripts/template-manifest.json" "<applications-root>/{app}/scripts/template-manifest.json"
```

Do this before Phase 5 so subsequent classification lookups in Phases 5-7 use the up-to-date manifest. If the derived app's `.templateoverrides` declared `KEEP scripts/template-manifest.json`, halt and surface; there is no legitimate reason for an app to diverge on the manifest, and that override is almost certainly a mistake.

### Phase 5: File Additions

For each status-A file reported by `git diff --name-status v{source}..v{target}` in Spernakit:

1. **Check `.templateoverrides`**. If the file path matches a `DELETED`, `SKIP`, or `KEEP` entry, **SKIP** the addition and log accordingly. (For `DELETED`: app deliberately removed this file. For `SKIP`/`KEEP`: app explicitly diverges.) An addition that lands behind any of these three actions is the same outcome: don't create the file.
2. **Copy the file directly** from Spernakit at the target tag:
    ```bash
    mkdir -p "$(dirname "<applications-root>/{app}/{path}")"
    cp "<spernakit-root>/{path}" "<applications-root>/{app}/{path}"
    ```
3. **Inspect for branding substitutions**: if the file is in the `branded` list of `scripts/template-manifest.json`, grep for Spernakit-specific identifiers (slug, app name, cookie names, ports) and replace by hand. Most new template files are `pure` (no branding) and copy cleanly.
4. **Verify** no domain conflict: if the destination file already exists, the diff must show "template adds to existing file" or "renames it"; investigate before copying.

**Workspace directories** (e.g., `shared/`): Copy as a unit: `package.json`, `tsconfig.json`, `src/` files. The workspace `package.json` `name` field must be branded (e.g., `spernakit-shared` → `<app-name>-shared`). Source files in `shared/src/` are pure template content; no branding substitution needed.

Log each copied file in a running list for the summary report.

### Phase 6: File Removals

For each status-D file reported by `git diff --name-status v{source}..v{target}`:

1. **Check `.templateoverrides`**: respect `KEEP` and `SKIP` entries by leaving the file in place
2. **Check** if the file exists in the derived app; if not, skip (nothing to remove)
3. **Diff against the Spernakit v{source} version** to check for local modifications:

    ```bash
    diff "<applications-root>/{app}/{path}" <(git -C <spernakit-root> show v{source}:{path})
    ```

    - If the diff is empty or branding-only → safe to delete
    - If the diff contains domain extensions → **preserve the file** (do not delete) and report it in the run summary for later review. This skill runs unattended and never blocks on a deletion decision.

4. **Delete with `rm`** and then **grep for imports/references** of the deleted file across `backend/src/`, `frontend/src/`, `scripts/`, and `shared/src/`. Remove orphaned imports.
5. **Run `bun run smoke:qc`** after removals to catch any missed reference before moving on.

### Phase 7: File Updates

For each modified file (status `M`) that is template-managed, first check `.templateoverrides`:

- If the file matches a `SKIP` entry: **SKIP** the update entirely and log: `"Skipped update: {path} (app override: SKIP; {reason})"`
- If the file matches a `KEEP` entry: **Keep** the app's version, do not apply the template delta, and log: `"Kept app version: {path} (app override: KEEP; {reason})"`
- Otherwise, classify the file and apply the appropriate strategy from the sections below.

#### 7a.0. Ignore Files (`.gitignore`, `.prettierignore`): scaffold-sourced, NEVER root

**Do not `cp` these from `<spernakit-root>/`.** Spernakit's own root ignore files carry the **local-only** profile: Spernakit has a published remote, so it hides `.aidd/` wholesale with a blanket `/.aidd/` rule and a `# release excludes` (`docs/internal/`) block. Derived apps are the opposite. They have no remote, so their `.aidd/` blueprint must be **tracked and co-versioned** with the code under a managed **denylist**. Copying Spernakit's root `.gitignore` into a derived app is precisely what reverted managed apps to blanket `/.aidd/` and hid their blueprints. This mirrors `init.ps1`, which already excludes both files from the root copy and seeds them from `scaffolding/`.

**The template source for these two files is `<spernakit-root>/scaffolding/`, not the repo root.** The managed `.aidd` denylist block in `scaffolding/.gitignore` is a projection of aidd's artifact catalog (only the runtime/generated/secret rows are ignored; every durable blueprint is committed).

**Strategy: three-way merge that preserves app-specific rules:**

1. The app's `.gitignore` legitimately carries app-specific rules (`data/`, `benchmarks/`, `config/*.json`, app databases, etc.). Never clobber them. Do **not** `cp scaffolding/.gitignore` over the app file.
2. Reconcile only the **aidd block** and any general template hygiene rules. Replace the app's `# aidd / agent-generated artifacts` block with the current `scaffolding/.gitignore` aidd block verbatim, leaving all app-specific sections intact.
3. **Forbidden in a derived app:** if the merge would introduce either, drop it:
    - A blanket `/.aidd/` (or unanchored `.aidd/`) rule. It hides durable blueprints and defeats co-versioning.
    - The `# release excludes` / `docs/internal/` block. That is Spernakit's own publish-time exclusion and has no meaning in a derived app.
4. Apply the same reconciliation to `.prettierignore` against `scaffolding/.prettierignore`.
5. After merging, verify from aidd:
    ```bash
    bun run --cwd <aidd-root> check:fleet-aidd-entries
    ```
    It must report zero problems for this app: every committed-class `.aidd/` entry tracked, every runtime/generated/secret entry ignored. Stage any newly-visible durable blueprints (`git add` the Track-class files; never the ignored ones).

If `scaffolding/` does not exist at the target tag, use the current aidd artifact catalog
(`<aidd-root>/docs/reference/artifacts.md`) as the source of truth for the denylist. Never introduce
a blanket rule.

#### 7a. Pure Template Files (no domain customization expected)

Files that should be identical to the template except branding:

- Build configs, Docker configs, tsconfig files, `.prettierrc`, `bunfig.toml`
- `frontend/vite-plugins/`, `frontend/components.json`
- `scripts/*.ts`, `scripts/smoke.json`
- Other root config files (`bunfig.toml`, `.prettierrc`, etc.), **but NOT `.gitignore` or `.prettierignore`; see 7a.0**
- `docs/template/`: all template documentation files (STACK.md, DEVELOPMENT.md, CHANGELOG.md, etc.)
- `shared/src/*.ts`: shared type contract source files (no branding needed; only `shared/package.json` name is branded)
- UI primitives (`frontend/src/components/ui/*`)

**Strategy**: Diff against `v{source}` first to detect silent domain extensions. If the only differences are template-vs-template (no app additions), copy the template file directly:

```bash
cp "<spernakit-root>/{path}" "<applications-root>/{app}/{path}"
```

**Override check is mandatory before each `cp`**: even though the Phase 7 preamble checks `.templateoverrides`, restate the check here because pure-copy is the most destructive Phase 7 path. If the file matches `SKIP` or `KEEP`, skip the copy. If it matches `DELETED`, the file should not exist in the app; do not recreate it via copy.

If domain extensions exist (e.g., `responseExamples.ts` with custom helpers like `routeDetail`, `seed/index.ts` with extra re-exports), treat as infrastructure and hand-merge instead.

#### 7b. Branded Template Files

Files that contain app-specific identifiers (slug, app name, cookie names, ports):

- `Dockerfile`, `docker-compose*.yml`
- `README.md`
- `package.json`, `frontend/package.json`, `backend/package.json` (scripts and engines only, never the `version` field)
- Anything else listed in the `branded` array of `scripts/template-manifest.json`

**Strategy**: Copy verbatim from Spernakit, then reapply branding by substituting Spernakit's slug, name, ports, and cookie names with the derived app's equivalents from its `config/*.json` and `package.json`.

#### 7c. Infrastructure Files (may have domain extensions)

Files that have a template base but derived apps almost always add domain-specific code:

- `backend/src/app.ts` (route registrations differ per app)
- `frontend/src/App.tsx`, `frontend/src/routes.tsx` (routes differ per app)
- `frontend/src/main.tsx` (may have app-specific providers)
- `frontend/src/tailwind.css` (may have app-specific styles)
- `frontend/src/components/layout/*` (nav items differ per app)
- `frontend/src/components/shared/*` (apps may have modified or extended these)
- `frontend/src/stores/*` (may have app-specific stores)
- `frontend/src/hooks/*` (may have app-specific hooks)
- `frontend/src/api/*` (app-specific API modules alongside template ones)
- `frontend/src/lib/*` (may have app-specific utilities)
- Re-export shim files (import from the app's shared package and re-export for backward compatibility):
    - `backend/src/constants/errorCodes.ts`
    - `backend/src/types/roles.ts`
    - `frontend/src/api/types/common.ts`
    - `frontend/src/types/roles.ts`
- **Plus any "pure" file that turns out to carry silent domain extensions**: always diff against `v{source}` first; if extensions exist, the file is effectively infrastructure for this app:
    - `backend/src/constants/responseExamples.ts`: apps may add helpers like `routeDetail`
    - `backend/src/db/seed/index.ts`: apps may add domain seed re-exports
    - Any file whose current content differs from the `v{source}` template by more than branding

**Strategy**: Three-way diff and hand-merge. Do **not** `cp`.

```bash
git -C <spernakit-root> show v{source}:{path} > /tmp/base.txt
git -C <spernakit-root> show v{target}:{path} > /tmp/new.txt
diff -u /tmp/base.txt /tmp/new.txt                         # = the template delta
diff -u /tmp/base.txt "<applications-root>/{app}/{path}"       # = the app's divergence
```

Read both diffs, then hand-apply the template delta to the app file using Edit operations. Preserve every line that appears in the app's divergence diff unless the template explicitly replaces it. If a template change conflicts with domain-specific code, flag for user review.

#### 7d. Backport Detection (during three-way merge)

While performing the three-way merge for infrastructure files, watch for cases where the derived app's file contains improvements over BOTH the source and target template versions in shared (non-domain-specific) code. These are backport candidates.

For each potential backport, record:

- **File**: The file path
- **Improvement**: What the derived app does better (stronger types, better error handling, security hardening, performance optimization, etc.)
- **Scope**: Whether the improvement is app-specific or would benefit all derived apps

Do NOT execute backports during the upgrade. Log them for the summary report and recommend a follow-up aidd-local `spernakit-diff-sync` session.

#### 7e. Verification cadence

After each copy or hand-merge, run `bun run typecheck` to surface any immediate contract drift. Fix missing exports, renamed types, and import cleanup before moving to the next file. Don't accumulate broken state across many files; small batches keep the diagnosis cheap.

#### 7f. Override Verification Gate (mandatory)

After Phases 5-7 complete and before moving on to Phase 8, run a mechanical override-violation check. Even with per-phase override checks in place, a single missed call can silently undo intentional app divergence; this gate is the safety net.

```bash
# 1. Capture the staged + unstaged set of files this upgrade touched
git -C "<applications-root>/{app}" diff --name-only HEAD > /tmp/upgrade-touched.txt

# 2. Extract SKIP and KEEP paths from .templateoverrides (ignore comments/blanks)
awk '/^[[:space:]]*(SKIP|KEEP)[[:space:]]/ { print $2 }' "<applications-root>/{app}/.templateoverrides" > /tmp/overrides-protected.txt

# 3. Intersect; any line in both is a violation
grep -F -x -f /tmp/overrides-protected.txt /tmp/upgrade-touched.txt > /tmp/override-violations.txt
```

Then check `DELETED` entries separately, files that should not exist:

```bash
awk '/^[[:space:]]*DELETED[[:space:]]/ { print $2 }' "<applications-root>/{app}/.templateoverrides" \
    | while read -r path; do
        [ -f "<applications-root>/{app}/$path" ] && echo "RECREATED: $path"
    done > /tmp/override-recreated.txt
```

**If `/tmp/override-violations.txt` or `/tmp/override-recreated.txt` is non-empty**, restore every
offending path to its exact pre-upgrade state, preserve the override entry, report the protected
paths, and rerun the gate before Phase 8. Never discard pre-existing user edits.

This gate runs unconditionally, even when no overrides exist (the intersect simply returns empty). If the app has no `.templateoverrides` file, both intersect inputs are empty and the gate passes trivially.

### Phase 8: Breaking Change Adaptations

For each breaking change identified in Phase 1:

1. **Search the derived app** for code affected by the breaking change
2. **Apply the required adaptation** as described in the changelog
3. **If the adaptation is ambiguous**, preserve current domain behavior while matching the new
   contract when evidence supports one path. Otherwise record the unresolved blocker, leave that
   code unchanged, and continue independent adaptations.

This phase touches domain-specific code: the app's own routes, pages, services, and components that need to adapt to template API changes.

**Type renames** (e.g., `PaginatedResult` → `PaginatedResponse`): Search the entire derived app codebase for all usages of the old name and update them. These won't be caught by file-level diffing; they're in domain-specific code that imports the renamed type.

### Phase 9: Schema Sync

If the template delta includes changes to `backend/src/db/seed/` or `backend/src/db/schema/` template tables:

1. **Update seed files** to match the template (preserving app-specific seed data)
2. **Update template schema tables** (users, audit_logs, notifications, settings, etc.)
3. **Run `bun run --cwd backend db:push`** if in development mode
4. **Note**: Do NOT touch app-specific schema files, only template-managed tables

### Phase 9a: Template Feature Sync

Copy Spernakit's feature records (`.aidd/features/<dir>/feature.json` plus `.aidd/roadmap.json`) into the derived app. This phase is now a script, not a judgment call — do not hand-copy directories, and do not decide ownership by reading `spernakit_version`. Run it from the **Spernakit checkout**, in push mode: the app has not been re-stamped yet (that is Phase 10), and the pull form deliberately skips on version mismatch.

```bash
# from <spernakit-root>
bun run template:sync-features -- --app ../{app} --check   # plan first, always
bun run template:sync-features -- --app ../{app}           # write
```

Then, from `<aidd-root>`:

```bash
bun run aidd-tools -- roadmap:apply --project-dir <applications-root>/{app}
```

Report its updated / unchanged / errors summary. `roadmap:apply` is what rebuilds the dependency graph from the roadmap the sync just wrote; the sync never shells into aidd. This is the other deliberate exception to "aidd applies the roadmap itself at run end": the standalone tool serializes records through Prettier and aidd's run-end reconciler does not, so only this path can leave `check:aidd-format` at zero changed files — and the app being synced is usually not the project this run targets. Afterwards, **`bun run check:aidd-format` in the app must report zero changed files** — records are serialized through Prettier's API against the app's own config precisely so that holds. A non-zero count is a bug in the sync, not something to fix by reformatting.

**Three classes are blockers.** The write run refuses all three on its own — it applies the rest of the plan and exits 1 — so a non-zero exit here is not a failed sync. Record each as an unresolved blocker in the phase report, with the entries that were applied:

- **`adopted-with-loss`** — an app copy of a template record carries authored text the template never received. Overwriting destroys the only record it existed. Either backport the text to Spernakit first (then re-run the sync), or record the difference as an app-owned feature whose `notes` begin `DEVIATES: <template-dir> — …` and which lists that directory in its roadmap dependencies. `--adopt` forces the overwrite and is a deliberate discard.
- **`prune-blocked`** — a stale record whose directory holds more than `feature.json`. Deleting it would take those files with it, so the sync refuses. Report the directory and what it holds; it keeps failing `check:template-features` until the contents are dealt with.
- **`updated` entries whose changed fields include `spec`, `notes`, `description` or `summary`** — same question as `adopted-with-loss`, on a marked record. `--check` prints them under `APP TEXT AT RISK` and the write run lists them under `NOT OVERWRITTEN`, having left them exactly as the app had them. `--overwrite-app-text` discards the app's text and is a deliberate discard; do not reach for it to make a run go green.

Everything else (`added`, `adopted`, `pruned`, `unchanged`, and `updated` on machine fields) is applied directly.

Do not restate the sync's rules from memory — the script is the definition, and `docs/template/DEVELOPMENT.md` § Template Feature Sync is the prose. Two properties are worth knowing because they contradict the old hand-run instructions this phase used to carry:

- **Process records never sync.** `remediation-<date>-…` and `audit-<slug>-<digits>-…` are findings from the template's own development. Their content reaches apps by being folded into a durable feature upstream; the finding itself is deleted once folded. A copy of one found in an app is pruned. The pattern is narrower than a bare `audit-` prefix on purpose — `audit-logs` is a durable capability record.
- **Ownership is decided by the template corpus, not by the app copy's marker.** A directory present upstream is template-owned whether or not the app's copy carries `spernakit_version`; the marker only separates `updated` from `adopted`. App-owned records are the ones absent from the template corpus, and the sync never touches them.

**Report** (the script prints it; carry the counts into the phase summary):

- durable template records considered, and the per-action counts (`added` / `updated` / `adopted` / `adopted-with-loss` / `pruned` / `prune-blocked` / `unchanged`)
- whether `roadmap.json` changed, and the milestone rung used for any newly created roadmap entry
- `roadmap:apply` result — a dry run reporting `updated: 0` immediately after a sync is the sharpest evidence the merge was correct

### Phase 10: Version Stamp and Verification

1. **Update `spernakit_version`** in `{app}/package.json` to the target version
2. **Run `bun run fleet-manifest:sync` from `<spernakit-root>`**, before the upgrade commit. It
   restates the app's `spernakit.psd1` entry from `{app}/package.json` and
   `{app}/config/<slug>.json` rather than leaving the manifest to be edited by hand. Run it for
   every app the dance touches. A refusal means an app cannot be read or verified; fix that app
   instead of skipping the step or editing the ignored manifest directly.
3. **Run `bun run smoke:qc`** from the application root
4. **Fix any failures**; iterate until the quality gate passes
5. **Run a targeted crawl test** if UI-facing changes were made:
    ```bash
    bun scripts/crawltest.ts --page /settings
    bun scripts/crawltest.ts --page /dashboard
    ```
6. **Run `bun run check:drift`** to verify no accidental drift was introduced during the upgrade. The report should show fewer or equal drifted files compared to the pre-upgrade baseline from Phase 0.

### Phase 10.5: Template Override Staleness Check

If `.templateoverrides` exists, verify each entry is still relevant:

1. **For `DELETED` entries**: Confirm the file still does not exist in the app (if it was somehow recreated, warn)
2. **For `SKIP` entries**: Log a reminder to review whether the divergence is still needed; diff the app version against the new template version and note significant delta
3. **For `KEEP` entries**: Diff the app version against the new template version; if the delta is significant (>20 lines changed in template), flag for user attention
4. **Stale entries**: If an override references a file that no longer exists in the template at the target version, recommend removing the override entry

Include the staleness check results in the summary report.

### Phase 11: Summary Report

Produce a final summary:

```markdown
# Upgrade Summary: {AppName}

Upgraded: spernakit v{source} → v{target}
Date: {date}

## Changes Applied

### Dependencies

- {N} packages updated, {N} added, {N} removed

### Files

- {N} files added
- {N} files removed
- {N} files updated (overwrite)
- {N} files updated (three-way merge)
- {N} files skipped (template-internal)

### Breaking Changes Addressed

- {description of each breaking change and how it was resolved}

### Backport Candidates

{List improvements found in derived app that could benefit the template}

| File | Improvement | Scope |
| ---- | ----------- | ----- |
| ...  | ...         | ...   |

Recommended follow-up: aidd-local `spernakit-diff-sync` skill for {appname} and the files listed above.

### Template Override Status

{If .templateoverrides exists}

- {N} DELETED overrides: {all valid / N stale}
- {N} SKIP overrides: {review status for each}
- {N} KEEP overrides: {delta summary for each}

{If .templateoverrides does not exist}

- No .templateoverrides file found. If app-specific files were deleted during this upgrade, consider creating one to prevent re-addition in future upgrades.

### Domain Attention Items

- {any unresolved items and their evidence}

## Verification

- smoke:qc: {PASS/FAIL}
- crawltest: {PASS/FAIL/SKIPPED}
```

Clean up `UPGRADE-PLAN.md`: either delete it or move it to `docs/` as a record.

## Principles

1. **Delta-driven**: Only apply what changed between template versions, not a full resync
2. **Sequence matters**: Dependencies → additions → removals → updates → breaking changes → schema → verify
3. **Three-way merge for shared files**: Use the source version as the common ancestor to distinguish template changes from domain customizations
4. **Breaking changes are explicit**: Apply breaking changes directly (the skill runs unattended), but always explain each one in the run summary; never apply silently
5. **Domain code is sacred**: Never overwrite domain-specific logic. When template and domain
   changes collide, preserve the domain code, skip the overwrite, report the conflict, and continue
   independent changes
6. **Version stamp last**: Only update `spernakit_version` after the quality gate passes
7. **Changelog is the roadmap**: The template changelog drives the upgrade, not just the file diff

## Relationship to Other Commands

Three commands work together to keep derived apps and the template in sync:

| Command                       | Direction                      | Scope                                  | Backports                                                      |
| ----------------------------- | ------------------------------ | -------------------------------------- | -------------------------------------------------------------- |
| `spernakit-template-upgrade`  | Template → App (version delta) | What changed between template versions | Detects only: logs candidates and can generate a review packet |
| `spernakit-template-refactor` | Template → App (full audit)    | All drift from current template        | Detects and offers to execute                                  |
| `spernakit-diff-sync`         | Bidirectional                  | Specific file pairs                    | Primary tool for executing backports                           |

**Typical workflow:**

1. Run the aidd-local `spernakit-template-upgrade` skill to absorb a new template version
2. Run the aidd-local `spernakit-template-refactor` skill (optional) to fix pre-existing drift not covered by the upgrade
3. Run the aidd-local `spernakit-diff-sync` skill to backport any improvements flagged by either of the above

**Shared infrastructure:** All three commands use the same template-managed file list for classification.

## Notes

- This skill requires the Spernakit repository to have git tags for both source and target versions
- Multi-version upgrades (e.g., 2.3.0 → 2.5.1) are applied as a single delta, not stepped; the changelog entries for all intermediate versions are reviewed
- If `bun run smoke:qc` fails after the upgrade, fix issues iteratively before stamping the version
- The three-way merge approach (Phase 7c) is critical; without the common ancestor, you can't distinguish "the app customized this" from "the app just hasn't been updated yet"
- Branding substitutions are derived from the app's `config/*.json` (app name, slug) and `package.json` (name), not hardcoded
- `docs/template/` files are template-managed and must be propagated during every upgrade; they are NOT app-specific docs
- If a derived app is missing `docs/template/` entirely, copy the full directory from Spernakit as a file addition

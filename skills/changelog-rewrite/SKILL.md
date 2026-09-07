---
name: changelog-rewrite
description: 'Rewrite a noisy generated changelog into meaningful release history grouped by build phase while preserving published releases and aligning active version claims. Use when generated entries are repetitive, overly granular, or carry inflated unpublished versions.'
metadata:
    aidd-category: metadata
    aidd-contracts: humanize-docs
---

# Changelog Rewrite

Replace a mechanically generated changelog (for example, one version per feature) with concise,
phase-grouped release history. This is a history-cleanup workflow. Use `document-changes` when the
goal is to document the next ordinary release rather than repair an existing changelog.

## Usage

```
changelog-rewrite [app]
```

- `[app]` -> application name or path. If omitted, use the current repository.

## Safety Boundary

Rewriting unpublished generated history is allowed. Published releases are immutable evidence:
never delete, combine, renumber, or move an entry represented by a pushed tag or published release.
Preserve its version, date, and boundary even when its prose needs cleanup.

Assign a new `0.x.y` sequence only when all of the following are true:

- the application is still pre-release;
- the entries being replaced are not represented by published tags or releases; and
- the requested cleanup clearly includes replacing inflated mechanical versions.

If the current version is `1.x.y` or later, publication status is uncertain, or renumbering would
cross a published boundary, preserve the versions and rewrite the prose only. Ask before any
downgrade or destructive history rewrite.

## Inputs

1. Resolve the target repository from `[app]` or the current working directory.
2. Detect the version-bearing changelog in this order:
    - `docs/CHANGELOG.md`
    - `docs/template/CHANGELOG.md`
    - `CHANGELOG.md`
3. Read `.aidd/CHANGELOG.md` for context if present, but preserve its date-headed per-change format;
   do not convert it into a semver changelog.
4. Discover the authoritative root version manifest from the project's build and release tooling.
   Common examples are `package.json`, `pyproject.toml`, `Cargo.toml`, `Directory.Build.props`, a
   root `*.csproj`, a root `*.psd1`, `mix.exs`, and `*.gemspec`. Read `VERSION` too when present.
5. Find project-specific version claim sites and validation commands. Checked-in release scripts
   and parity gates are authoritative. Do not assume the manifest is the only current-version
   claim.

If no changelog exists, create the highest-priority applicable path from Git history and match the
project's documentation conventions. A repository with no version manifest is still in scope; in
that case the newest changelog heading is the version of record. Never create a manifest as a side
effect of this workflow.

Do not add version fields to child manifests or bump workspace package versions merely to mirror
the root. Preserve template provenance such as `spernakit_version`, dependency versions, support
floors, historical examples, and other numbers that are not active application-version claims.

## Process

### 1. Gather Evidence

Read the existing changelog fully, then inspect the repository without changing it:

```bash
git status --short
git log --reverse --format="%h %ad %s" --date=short
git rev-list --count HEAD
git tag --list --sort=version:refname
```

Also inspect release tooling, release documentation, the current version declarations, and the
history of the changelog itself. Use local release metadata or the repository host to distinguish
published tags from local or abandoned tags when that distinction matters. Do not infer that an
entry is unpublished merely because no local tag is visible.

Read the `humanize-docs` style contract before drafting. Commit subjects and generated entries are
evidence, not prose to copy.

### 2. Mark Immutable Release Boundaries

Create a chronological inventory of changelog entries, tags, published releases, and version
declarations. Mark every published version as fixed. Record unclear gaps or entries that cannot be
matched to Git evidence instead of inventing an explanation.

### 3. Identify Build Phases

Group only the rewriteable history into cohesive milestones:

| Signal                 | Example                                         | Likely phase      |
| ---------------------- | ----------------------------------------------- | ----------------- |
| Initial project setup  | `feat: scaffold app`, `chore: initial commit`   | Template scaffold |
| Domain model creation  | `feat: add Task model`, `feat: add User schema` | Core models       |
| Backend infrastructure | `feat: add auth routes`, `feat: CRUD for tasks` | API layer         |
| Frontend foundation    | `feat: add layout`, `feat: dashboard page`      | UI foundation     |
| Feature verticals      | Related reports or scheduling commits           | Feature module    |
| UI polish              | Related layout, navigation, and widget commits  | UI enhancements   |

Grouping rules:

1. Group related commits; do not create a phase per commit.
2. Merge small related changes into the nearest meaningful milestone.
3. Keep fixes with the phase they corrected unless they shipped later as a published patch.
4. Give a large, independently useful feature vertical its own phase.
5. Prefer fewer, larger phases when the evidence does not support a sharper boundary.

Use the published release date for a preserved release. For an unpublished reconstructed phase,
use the date of its last supporting commit.

### 4. Map Versions

For preserved releases, keep the existing versions exactly.

For an explicitly authorized pre-release renumbering, use:

```text
Phase 0: Template scaffold (0.0.0), date of first supporting commit
Phase 1: First meaningful milestone (0.1.0), phase completion date
Phase 2: Next milestone (0.2.0), phase completion date
...
```

Feature phases take minor versions. Patch versions are for fixes or internal changes released after
their feature phase. The number of reconstructed phases determines the new `0.x.0` sequence only in
this unpublished pre-release case; it must never override a preserved version line.

Before writing, prepare the complete old-to-new mapping and confirm the newest mapped version will
agree with the project's active version declarations.

### 5. Write the Changelog

Preserve the detected changelog's title, introduction, link references, and established release
format where they remain accurate. When creating a new changelog, use Keep a Changelog headings:

```markdown
# Changelog

All notable changes to {AppName} are documented in this file.

## [0.2.0] - YYYY-MM-DD

### Added

- {Concise user-facing capability}

### Fixed

- {Observable correction}
```

Use only the sections supported by the evidence: `Added`, `Changed`, `Fixed`, and `Security`.
Describe what changed for a user or operator, not the implementation steps. Group related work,
keep useful technical context in parentheses, and never paste raw commit subjects or feature record
descriptions. A new widget or capability belongs under `Added`, not `Changed`.

### 6. Align Active Version Claims

If the rewrite changes the newest version, update the authoritative root manifest, `VERSION` when
present, and every current-version claim required by the project's release tooling. Do not perform a
repository-wide string replacement: historical release notes, support floors, migration examples,
and provenance stamps may intentionally retain older versions.

If the newest version does not change, leave version declarations alone. Historical heading cleanup
does not justify an unrelated version bump.

### 7. Verify

1. Re-read the complete changelog and compare every rewritten entry to its commits and release
   evidence.
2. Confirm headings are ordered newest first, dates are credible, published entries remain intact,
   and no replacement version is duplicated.
3. Read back every active version claim changed by the workflow and confirm parity with the newest
   changelog heading.
4. Run the repository's targeted version/changelog gate when one exists, such as
   `check:version-parity` or `check:version-refs`.
5. Format only the files changed by this workflow, then inspect `git diff` and `git status --short`.
   Do not stage, commit, tag, push, or discard unrelated work unless the invocation separately
   authorizes it.

## Output

Report:

- whether the changelog was rewritten, created, or already accurate;
- the old-to-new version and phase mapping;
- which releases were preserved as published history;
- the consolidation ratio;
- every file updated and validation command run; and
- anomalies such as missing commits, uncertain publication status, or unclear phase boundaries.

## Troubleshooting

| Issue                               | Response                                                        |
| ----------------------------------- | --------------------------------------------------------------- |
| No changelog                        | Create the detected canonical path from Git history             |
| No usable Git history               | Return a blocker; do not invent release history                 |
| Published mechanical entries        | Preserve their versions and boundaries; rewrite prose only      |
| Current version is `1.x.y` or later | Preserve versions unless the user explicitly approves a rewrite |
| Unclear phase boundaries            | Use conservative chronological groupings                        |
| Targeted version gate fails         | Fix every active claim identified by the gate                   |
| Existing changelog is already good  | Report `No rewrite needed` and exit                             |

Each phase should represent progress a user would recognize. When the evidence is incomplete,
preserve the historical record and report the uncertainty.

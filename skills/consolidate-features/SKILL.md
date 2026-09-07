---
name: consolidate-features
description: "Consolidate any aidd-managed application's `.aidd/features` by folding completed audit and remediation findings into their source features and removing redundant finding files. Use for feature cleanup, deduplication, or sprawl reduction."
metadata:
    aidd-category: metadata
---

# Feature Consolidation

Analyze, consolidate, and clean up feature files for an application. Fold completed audit and remediation findings back into the original features that generated the issues, then remove the standalone finding features.

## Applicability

**This skill applies to every aidd-managed project**, whatever its stack — Astro sites, CLIs, libraries, Python services, and Spernakit-derived apps alike. The only requirement is a `.aidd/features/` corpus; nothing here reads application source code or assumes a framework.

The Spernakit rules below (template provenance, `spernakit_version`, upstreaming) are **conditional, not a precondition**. They engage only for features that actually carry a `spernakit_version` field. A project whose features carry none — the common case — simply has zero template features: every feature is app-owned and modifiable, and consolidation proceeds normally. Absence of Spernakit is never a reason to skip a consolidation run or report it as out of scope.

## Usage

```
consolidate-features [app] [--dry-run]
```

## Arguments

- `appname`: Name of the application directory under `<applications-root>/`
- `--dry-run`: Optional flag to only report what would change without modifying files

## Instructions

The goal is to ensure every fix, audit finding, and remediation spec is represented in the base feature files for the application, not in standalone remediation/audit features. After consolidation, if the original features were ever re-executed, they would produce correct output without needing a separate remediation pass.

### Phase 1: Discovery

1. **Locate all feature files** in `.aidd/features/*/feature.json`

    **Normalize optional `notes` before manipulating records.** The corpus contains all three
    valid shapes: a missing `notes` field, a single string, and an array of strings. Read and
    preserve those shapes without assuming array methods are available. If consolidation appends
    a note, normalize only at the write boundary: missing/null becomes `[]`, a string becomes
    `[existingString]`, and an array is copied as-is; then append the new note. Never drop or split
    an existing string while normalizing. Any helper script that maps, filters, spreads, or pushes
    `notes` must apply this normalization first.

2. **Classify features** into four buckets:

    | Type                     | Pattern                           | Description                                                                                                        |
    | ------------------------ | --------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
    | **Template features**    | Has `spernakit_version` field     | Template-owned features copied from Spernakit; **READ-ONLY in derived apps**. Count is 0 in non-Spernakit projects |
    | **Base features**        | Everything else (clean slugs)     | App-specific features that describe functionality to build                                                         |
    | **Remediation features** | `remediation-*`                   | Drift fixes and template alignment corrections                                                                     |
    | **Audit findings**       | `auditSource` or runtime audit ID | Issues discovered during code audits                                                                               |

    A bare `audit-*` prefix is **not** the test: `audit-logs` is a durable capability feature, and apps carry app-owned records such as `audit-change-history`. Follow aidd's live `isAuditFinding` contract: a non-empty `auditSource` marks a finding, and `/^audit-[a-z][a-z0-9-]*-\d+-/` is the fallback for older or hand-authored records that lack the marker. A generated example is `audit-performance-1784357475-slow-queries`. Spernakit's template sync deliberately uses a narrower six-or-more-digit predicate only to keep the template's process records out of derived apps; do not use that sync filter as the general finding classifier.

    **Template features** are identified by the presence of a `spernakit_version` field in their feature.json. Check for the field; do not infer the bucket from the project's stack or name. When no feature carries it, this bucket is empty and the rest of this subsection does not apply — report `Template features: 0` and continue. These features originate from the Spernakit template and are synced to derived apps during template upgrades. In derived apps, they must NEVER be modified, renamed, deleted, or have remediations folded into them. Any fix that belongs in a template feature must be upstreamed to the Spernakit repository and applied there via the aidd-local `consolidate-features` skill.

    **In the Spernakit repository itself**, template features ARE modifiable; remediations can be folded into them and specs can be updated. **Do not bump `spernakit_version` when the spec changes.** It records the template version that _introduced_ the record — an origin marker, not a revision stamp — and every record in the corpus is maintained that way. Bumping it would make the record read as hand-edited to Spernakit's own gates and to the app-side feature-drift check, both of which compare the field exactly. Record the change in the feature's revision notes instead.

    **In Spernakit, folding is a precondition of sync, not optional housekeeping.** `bun run template:sync-features` never copies a `remediation-<date>-…` or `audit-<slug>-<digits>-…` record to a derived app — process records from the template's own development stay in the template, permanently and by design. Content reaches apps only by being folded into a durable feature, which then syncs. A completed finding left standing in Spernakit's corpus is therefore a fix that will never reach a single app, however carefully it was written. Fold it, delete the finding record, and remove its `roadmap.json` entry in the same pass (an orphan roadmap entry is a hard error in roadmap reconciliation, which blocks the whole pass).

    Base features use clean descriptive slugs (e.g., `run-console-page`, `approval-model`, `director-api-client`). They do NOT use a `feature-` prefix or date stamp. Any base-feature directory starting with `feature-` is a **poorly named** base feature that should be renamed during consolidation (see Phase 4a). This includes both dated names like `feature-20260414-director-api-client` and generic names like `feature-run-launcher`.

3. **Filter to actionable items**: Only process remediation/audit features with
   `"status": "completed"` and `"passes": true`. The current status contract has exactly
   `backlog`, `in_progress`, `waiting_approval`, and `completed`; `verified`, `pending`, `running`,
   and `failed` are invalid values, not compatibility aliases. Leave every non-completed or
   non-passing record alone because it represents unfinished work.

4. **Report discovery summary**:
    - Total features found
    - Template features count (read-only in derived apps; modifiable in Spernakit itself)
    - Base features count
    - Completed remediation features to fold (list each with ID and title)
    - Completed audit findings to fold (list each with ID and title)
    - Non-completed remediation/audit features to skip (list each)

### Phase 2: Trace Origins

For each completed remediation/audit feature, determine which base feature(s) it relates to. Use these signals:

1. **Spec content analysis**: Read the remediation feature's `spec` and `description` fields. They describe what was fixed; match this to base features that would have generated the problematic code.

2. **File path overlap**: If the remediation mentions specific files (e.g., `knip.json`, `defaults.json`, `frontend/index.html`), find base features whose specs reference those same files or the subsystem they belong to.

3. **Category matching**: Remediation features often share the same conceptual category as their source (e.g., a remediation fixing ESLint config likely maps to the ESLint/Prettier configuration feature).

4. **Dependency chains**: Check if the remediation feature lists any `dependencies`; those may point to the originating feature.

5. **Naming conventions**: Feature directory names often hint at the relationship (e.g., `remediation-20260311-build-config` relates to build/config features).

**Important**: A single remediation feature may map to multiple base features (if it fixed issues across several), and multiple remediation features may map to the same base feature. Build the full mapping before proceeding.

**If a remediation feature cannot be mapped to any base feature**, preserve it and report the
unresolved mapping rather than silently deleting it.

**Template feature protection (derived apps only)**: If a remediation maps to a feature that has `spernakit_version` and the target app is NOT `spernakit`, do NOT fold the remediation into it. Instead, flag it as "**UPSTREAM**: remediation targets template-owned feature `{id}`; fold this fix in the Spernakit repository via the aidd-local `consolidate-features` skill, then sync to derived apps via the aidd-local `spernakit-template-upgrade` skill." The remediation feature is left in place until the upstream fix lands.

### Phase 3: Fold Specifications

For each base feature that has mapped remediation/audit findings:

1. **Read the base feature's current `spec`** field (the numbered acceptance criteria).

    **Continue the final numbered block, not the global maximum.** Specs may contain later sections
    such as `COVERAGE AUDIT` that restart numbering at `1`. When appending criteria, inspect numbered
    lines in document order and increment the number on the **last numbered line**. Do not use the
    maximum number found anywhere in the spec: an earlier block may have a higher number and using
    it creates artificial jumps in the final block. Preserve existing numbering in every block.

2. **Analyze what the remediation fixed**: read the remediation feature's `spec` and understand the corrective action.

3. **Update the base feature's `spec`** to incorporate the fix as a requirement. The goal is that if the feature were re-implemented from scratch using only the spec, the remediation issue would not recur.

    **Examples of good spec updates:**
    - Before: `"1. Create knip.json with workspace entries for frontend and backend"`
    - After: `"1. Create knip.json with workspace entries for frontend and backend (do NOT include empty arrays like \"ignore\": [])"`

    - Before: `"3. Create defaults.json with database connection settings"`
    - After: `"3. Create defaults.json with database connection settings including ssl section: { \"enabled\": false, \"rejectUnauthorized\": true }"`

    - Before: `"2. Add theme detection script to index.html"`
    - After: `"2. Add theme detection script to index.html using explicit theme allowlist validation (var validThemes = ['ocean', 'forest', ...]; if (t && validThemes.indexOf(t) !== -1)). Do NOT use a loose truthy check like if (t && t !== 'default')"`

4. **Preserve the base feature's structure**: modify the `spec` field and `updatedAt`, plus `notes`
   only when recording the required Spernakit template-feature revision note described in Phase 1.
   Do not change `id`, `category`, `title`, `status`, `priority`, or other fields.

5. **Update `updatedAt`** to current ISO timestamp.

### Phase 4: Remove Standalone Features

After successfully folding all specs:

1. **Delete the remediation/audit feature directories** that were fully folded. Remove the entire directory (e.g., `rm -rf .aidd/features/remediation-20260311-build-config/`).

2. **Do NOT delete** remediation/audit features that:
    - Are not completed and passing (`status` is not `completed` or `passes` is not `true`)
    - Could not be mapped to any base feature (flagged in Phase 2)
    - Were flagged as UPSTREAM (target is a template-owned feature in a derived app)

### Phase 4a: Rename Poorly Named Features

Base features should use clean descriptive slugs, NOT a leading `feature-` prefix. Scan all remaining feature directories for names matching either pattern:

- `feature-{8 digits}-{rest}` (dated feature names)
- `feature-{rest}` (generic prefixed feature names)

**Skip features with `spernakit_version`**; template-owned features must not be renamed in derived apps. Their names are controlled by the template.

For each poorly named directory:

1. **Compute the clean slug**:
    - For `feature-YYYYMMDD-slug`, strip `feature-YYYYMMDD-`. Example: `feature-20260414-director-api-client` → `director-api-client`
    - For `feature-slug`, strip `feature-`. Example: `feature-run-launcher` → `run-launcher`
2. **Check for collisions**: if a directory with the clean slug already exists, preserve both and
   report the unresolved collision
3. **Update the `id` field** inside `feature.json` to match the new directory name
4. **Update `updatedAt`** to current ISO timestamp
5. **Rename the directory** (use `mv`, not copy+delete)
6. **Update cross-references**:
    - Update all other `feature.json` files that reference the old ID in `dependencies`
    - Update project artifacts that track feature IDs, especially `.aidd/roadmap.json`, `.aidd/screen-map.md`, and any other current `.aidd/*.md` artifact that is not historical run output
    - Do not rewrite historical logs such as `.aidd/runs.jsonl`; use judgment before rewriting changelog history

**Report all renames** in the final summary:

```markdown
### Renamed Features ({count})

| Old Name                             | New Name            |
| ------------------------------------ | ------------------- |
| feature-20260414-director-api-client | director-api-client |
| feature-run-launcher                 | run-launcher        |
```

### Phase 5: Intelligent Consolidation

Beyond remediation folding, look for consolidation opportunities among base features:

1. **Duplicate detection**: Merge exact or high-confidence duplicates by preserving the union of
   requirements and references. Preserve both files when boundaries remain ambiguous and report the
   unresolved overlap; never pause the rest of the consolidation.

2. **Dependency cleanup**: Check all `dependencies` arrays. Remove references to feature IDs that no longer exist (e.g., deleted remediation features that were listed as dependencies).

3. **Orphaned references**: If any feature's `dependencies` array referenced a now-deleted remediation feature, remove that dependency entry.

4. **Artifact reference cleanup**: Search current project artifacts for deleted or renamed feature IDs. At minimum check `.aidd/roadmap.json` and `.aidd/screen-map.md`. Remove or replace references to folded remediation/audit features and renamed base features so these artifacts only point at existing feature IDs. Historical audit reports and run logs may retain old names.

### Phase 5b: Roadmap Assignment (mandatory)

Phase 4a and Phase 5 already scrub deleted/renamed IDs out of `.aidd/roadmap.json`. This phase makes the **positive** assignment of every surviving and renamed feature an explicit, required check: a feature that exists on disk but has no `roadmap.features` entry is a consolidation defect, not an acceptable end state.

1. Read `.aidd/roadmap.json`. If it does not exist, **create it first**: a single `v1.0` milestone (priority 1) mapping every existing feature directory, preserving dependencies (keyed by directory). This is the shape the coding runtime auto-creates on first run — roadmap and milestones apply to every project, so a missing file is created, never skipped — then continue with the assignment below.
2. **Renamed base features** (`feature-*` → clean slug, Phase 4a): the `roadmap.features` key must have **moved** old→new verbatim (preserving `milestone` and `dependencies`). Verify the new id is present and the old id is gone.
3. **Folded-away remediation/audit features** (Phase 4): their `roadmap.features` entries must be deleted (stale-entry cleanup). Verify none remain.
4. **Every surviving feature directory** must have a `roadmap.features["{directory}"]` entry whose `milestone` exists in `roadmap.milestones`. Roadmap keys are directory names, which can differ from persisted feature IDs for template records. For any surviving feature still unmapped, assign its milestone based on its kind:
    - **Remediation/audit features** (`remediation-*` or `audit-*`): assign to the **current milestone**: the highest-priority released or active milestone. These fix existing issues and must ship in the current version, not be deferred.
    - **Base features** (clean slug): assign to the **current milestone** by default. Only use a future milestone if the feature is explicitly scoped to a future release. Never auto-create a new milestone; if no suitable milestone exists, use the current one.

    Already-mapped features are left untouched (idempotent; no churn). The owner may re-target afterward.

5. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace. Nothing is propagated on a `--dry-run` pass, because nothing was written.

### Phase 6: Validation

1. **Format changed artifacts**: Run Prettier against the changed feature tree and related artifacts before validation. Typical command from the target app root:

    ```powershell
    bunx prettier --ignore-path <empty-file> --write .aidd/features .aidd/roadmap.json .aidd/screen-map.md
    ```

    The explicit `--ignore-path` override (pointed at any empty file) is required: most apps list `/.aidd/` in `.prettierignore`, so an unqualified `prettier --write` on those paths matches zero files and exits 0, formatting nothing. If one of the listed paths does not exist in the target app, omit that path rather than creating a placeholder.

2. **Validation**: Do not shell into the aidd installation to validate. aidd re-validates every feature record when the run ends and reports any contract issues with the run. That covers the project this run targets; for another project, report the metadata as unvalidated instead of reaching outside the workspace. Do not run `bun run start` from the target app root either: that resolves to the target's own `start` script (a dev server in most stacks), which will happily look like it worked.

3. **Verify results**: Read back every record you wrote and confirm it is valid JSON with the required fields, so aidd's end-of-run check has nothing left to report.

4. **If validation fails**: Fix the issues (common problems: missing required fields, invalid JSON, broken dependency references) and re-validate.

5. **Check consistency**:
    - Every feature directory name should match its `feature.json` `id`
    - Every `dependencies` entry should point to an existing feature ID
    - Every appended criterion continues from the last numbered line in the pre-edit spec, not the
      highest number elsewhere in the document
    - Every edited `notes` value is an array that preserves all pre-existing note content; untouched
      missing/string/array shapes remain untouched
    - No current roadmap or screen-map entry should point to a deleted folded finding or renamed old ID
    - Every surviving feature directory has a `roadmap.features["{directory}"]` entry whose `milestone` exists in `roadmap.milestones` (Phase 5b invariant; roadmap.json is always present — Phase 5b creates it when missing)
    - `git diff --check -- .aidd` should pass

6. **Report final state**:
    - Features before consolidation: N
    - Remediation/audit features folded: N
    - Features renamed (`feature-*` → clean slug): N
    - Features after consolidation: N
    - Base features updated: N (list each with ID)
    - Unmapped findings preserved: N (list each)
    - Validation: PASS/FAIL

### Phase 7: Commit

Consolidation is a source-of-truth maintenance operation. When changes were made and validation passed, commit the finished bundle before reporting completion unless the user explicitly requested `--dry-run` or explicitly said not to commit.

1. Review `git status --short` and `git diff --stat`.
2. Stage only the consolidation outputs for the target app. Include:
    - Modified base feature files
    - Deleted folded remediation/audit feature directories
    - Renamed feature directories
    - Updated `.aidd/roadmap.json`, `.aidd/screen-map.md`, or equivalent current artifacts
3. Do not stage unrelated dirty files. If unrelated dirty files block a clean commit, commit only the intended paths.
4. Use a conventional commit message, typically:

    ```text
    chore(features): consolidate feature metadata
    ```

5. After commit, run `git status --short` and report any remaining unrelated dirty files.

### Phase 8: Summary

Present a concise summary:

```
Consolidation Complete: {appname}

Template features: {N} ({read-only in a derived app | source records in Spernakit}; {touched status})
Folded: {N} remediation features into {M} base features
Removed: {N} standalone remediation/audit directories
Renamed: {N} feature-* directories to clean slugs
Updated: {list of base feature IDs that were modified}
Upstream: {list of remediations targeting template features; need the aidd-local consolidate-features skill for Spernakit}
Skipped: {list of any unmapped or non-completed findings}
Validation: PASS
Commit: {commit hash or "not committed: reason"}
```

## Principles

1. **Traceability over speed**: Every remediation fix must be traceable to a base feature before deletion.
2. **Conservative deletion**: Never delete a finding that can't be mapped. Flag it instead.
3. **Spec completeness**: Updated specs should be self-sufficient: a developer reading only the spec should produce correct code without needing remediation.
4. **Validation gate**: Never finish leaving a record you wrote unreadable — aidd's end-of-run feature-contract check is what reports it, and a failure there is your failure.
5. **Formatting gate**: Format changed feature artifacts before validation and before committing.
6. **Commit gate**: If consolidation changed files and the run was not `--dry-run`, commit the completed, validated bundle before final reporting unless the user explicitly opts out.
7. **No data loss**: Base feature semantics must be preserved. Only append/refine spec content, never remove existing requirements.
8. **Dry-run safety**: When `--dry-run` is specified, report everything but modify nothing.
9. **Template provenance**: Features with `spernakit_version` are template-owned. In derived apps, never modify, rename, delete, or fold into them. Fixes to template features must be upstreamed to the Spernakit repository. This principle is inert when no feature carries the field.
10. **Stack independence**: Never decline a consolidation because of the target's stack, framework, or lack of Spernakit provenance. The corpus is the input; if `.aidd/features/` exists, the skill runs. If it genuinely does not exist, say so plainly instead of reporting a scope restriction.

## Notes

- This skill works on one application at a time. To consolidate multiple apps, invoke it multiple times.
- If `--dry-run` is passed, run Phases 1-2 only and report the mapping without making changes.
- Remediation features from any date should be processed, not just the current session's.
- The `updatedAt` timestamp should use the current date in ISO format (e.g., `2026-03-11T00:00:00.000Z`).
- This skill complements the aidd-local `spernakit-template-refactor` skill; run consolidation after refactoring to clean up.

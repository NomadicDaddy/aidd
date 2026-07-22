---
name: consolidate-features
description: "Consolidate a Spernakit application's `.aidd/features` by folding completed audit and remediation findings into their source features and removing redundant finding files. Use for feature cleanup, deduplication, or sprawl reduction."
metadata:
    aidd-category: metadata
---

# Feature Consolidation

Analyze, consolidate, and clean up feature files for a Spernakit-derived application. Fold completed audit and remediation findings back into the original features that generated the issues, then remove the standalone finding features.

## Usage

```
consolidate-features [appname]
consolidate-features [appname] --dry-run (analysis only, no changes)
```

## Arguments

- `appname`: Name of the application directory under `<applications-root>/`
- `--dry-run`: Optional flag to only report what would change without modifying files

## Instructions

The goal is to ensure every fix, audit finding, and remediation spec is represented in the base feature files for the application, not in standalone remediation/audit features. After consolidation, if the original features were ever re-executed, they would produce correct output without needing a separate remediation pass.

### Phase 1: Discovery

1. **Locate all feature files** in `{app}/.aidd/features/*/feature.json`

2. **Classify features** into four buckets:

    | Type                     | Pattern                              | Description                                                                  |
    | ------------------------ | ------------------------------------ | ---------------------------------------------------------------------------- |
    | **Template features**    | Has `spernakit_version` field        | Template-owned features copied from Spernakit; **READ-ONLY in derived apps** |
    | **Base features**        | Everything else (clean slugs)        | App-specific features that describe functionality to build                   |
    | **Remediation features** | `remediation-*`                      | Drift fixes and template alignment corrections                               |
    | **Audit findings**       | `audit-*` (with `auditSource` field) | Issues discovered during code audits                                         |

    **Template features** are identified by the presence of a `spernakit_version` field in their feature.json. These features originate from the Spernakit template and are synced to derived apps during template upgrades. In derived apps, they must NEVER be modified, renamed, deleted, or have remediations folded into them. Any fix that belongs in a template feature must be upstreamed to the Spernakit repository and applied there via the aidd-local `consolidate-features` skill.

    **In the Spernakit repository itself**, template features ARE modifiable; remediations can be folded into them, specs can be updated, and `spernakit_version` should be bumped when the spec changes.

    Base features use clean descriptive slugs (e.g., `run-console-page`, `approval-model`, `director-api-client`). They do NOT use a `feature-` prefix or date stamp. Any base-feature directory starting with `feature-` is a **poorly named** base feature that should be renamed during consolidation (see Phase 4a). This includes both dated names like `feature-20260414-director-api-client` and older generic names like `feature-web-v2-run-launcher`.

3. **Filter to actionable items**: Only process remediation/audit features with `"status": "completed"` or `"status": "verified"`. Features still in `backlog`, `pending`, `running`, or `failed` should be left alone; they represent unfinished work.

4. **Report discovery summary**:
    - Total features found
    - Template features count (read-only, will not be modified)
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

**Template feature protection (derived apps only)**: If a remediation maps to a feature that has `spernakit_version` and the target app is NOT `spernakit`, do NOT fold the remediation into it. Instead, flag it as "**UPSTREAM**: remediation targets template-owned feature `{id}`; fold this fix in the Spernakit repository via the aidd-local `consolidate-features` skill, then sync to derived apps via the aidd-local `template-upgrade` skill." The remediation feature is left in place until the upstream fix lands.

### Phase 3: Fold Specifications

For each base feature that has mapped remediation/audit findings:

1. **Read the base feature's current `spec`** field (the numbered acceptance criteria).

2. **Analyze what the remediation fixed**: read the remediation feature's `spec` and understand the corrective action.

3. **Update the base feature's `spec`** to incorporate the fix as a requirement. The goal is that if the feature were re-implemented from scratch using only the spec, the remediation issue would not recur.

    **Examples of good spec updates:**
    - Before: `"1. Create knip.json with workspace entries for frontend and backend"`
    - After: `"1. Create knip.json with workspace entries for frontend and backend (do NOT include empty arrays like \"ignore\": [])"`

    - Before: `"3. Create defaults.json with database connection settings"`
    - After: `"3. Create defaults.json with database connection settings including ssl section: { \"enabled\": false, \"rejectUnauthorized\": true }"`

    - Before: `"2. Add theme detection script to index.html"`
    - After: `"2. Add theme detection script to index.html using explicit theme allowlist validation (var validThemes = ['ocean', 'forest', ...]; if (t && validThemes.indexOf(t) !== -1)). Do NOT use a loose truthy check like if (t && t !== 'default')"`

4. **Preserve the base feature's structure**: only modify the `spec` field (and `updatedAt`). Do not change `id`, `category`, `title`, `status`, `priority`, or other fields.

5. **Update `updatedAt`** to current ISO timestamp.

### Phase 4: Remove Standalone Features

After successfully folding all specs:

1. **Delete the remediation/audit feature directories** that were fully folded. Remove the entire directory (e.g., `rm -rf {app}/.aidd/features/remediation-20260311-build-config/`).

2. **Do NOT delete** remediation/audit features that:
    - Are not yet completed (`status` is not `completed` or `verified`)
    - Could not be mapped to any base feature (flagged in Phase 2)
    - Were flagged as UPSTREAM (target is a template-owned feature in a derived app)

### Phase 4a: Rename Poorly Named Features

Base features should use clean descriptive slugs, NOT a leading `feature-` prefix. Scan all remaining feature directories for names matching either pattern:

- `feature-{8 digits}-{rest}` (dated legacy feature names)
- `feature-{rest}` (generic prefixed feature names)

**Skip features with `spernakit_version`**; template-owned features must not be renamed in derived apps. Their names are controlled by the template.

For each poorly named directory:

1. **Compute the clean slug**:
    - For `feature-YYYYMMDD-slug`, strip `feature-YYYYMMDD-`. Example: `feature-20260414-director-api-client` → `director-api-client`
    - For `feature-slug`, strip `feature-`. Example: `feature-web-v2-run-launcher` → `web-v2-run-launcher`
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
| feature-web-v2-run-launcher          | web-v2-run-launcher |
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

1. Read `<applications-root>/{app}/.aidd/roadmap.json`. If it does not exist, skip this phase and note `no roadmap.json; assignment skipped` in the Phase 6 report.
2. **Renamed base features** (`feature-*` → clean slug, Phase 4a): the `roadmap.features` key must have **moved** old→new verbatim (preserving `milestone` and `dependencies`). Verify the new id is present and the old id is gone.
3. **Folded-away remediation/audit features** (Phase 4): their `roadmap.features` entries must be deleted (stale-entry cleanup). Verify none remain.
4. **Every surviving feature directory** must have a `roadmap.features["{id}"]` entry whose `milestone` exists in `roadmap.milestones`. For any surviving feature still unmapped, assign its milestone based on its kind:
    - **Remediation/audit features** (`remediation-*` or `audit-*`): assign to the **current milestone**: the highest-priority released or active milestone. These fix existing issues and must ship in the current version, not be deferred.
    - **Base features** (clean slug): assign to the **current milestone** by default. Only use a future milestone if the feature is explicitly scoped to a future release. Never auto-create a new milestone; if no suitable milestone exists, use the current one.

    Already-mapped features are left untouched (idempotent; no churn). The owner may re-target afterward.

5. Run `bun run aidd-tools -- roadmap:apply --project-dir <applications-root>/{app}` from `<aidd-root>` to propagate milestone priority + resolved dependency IDs into the surviving/renamed feature.json files. Report the updated / unchanged / errors summary. Skip this step only when `--dry-run` was passed.

### Phase 6: Validation

1. **Format changed artifacts**: Run Prettier against the changed feature tree and related artifacts before validation. Typical command from the target app root:

    ```powershell
    bunx prettier --write .aidd/features .aidd/roadmap.json .aidd/screen-map.md
    ```

    If one of those files does not exist in the target app, omit that path rather than creating a placeholder.

2. **Run validation**: Execute the current aidd validator from the target app root:

    ```powershell
    bun run start -- --project-dir . --check-features
    ```

    If running from outside the target app root, use
    `--project-dir <applications-root>/{app}` with the current runtime at `<aidd-root>`.

3. **Verify results**: All features must pass validation (0 invalid files).

4. **If validation fails**: Fix the issues (common problems: missing required fields, invalid JSON, broken dependency references) and re-validate.

5. **Check consistency**:
    - Every feature directory name should match its `feature.json` `id`
    - Every `dependencies` entry should point to an existing feature ID
    - No current roadmap or screen-map entry should point to a deleted folded finding or renamed old ID
    - Every surviving feature directory has a `roadmap.features["{id}"]` entry whose `milestone` exists in `roadmap.milestones` (Phase 5b invariant), unless the app has no `roadmap.json`
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

Template features: {N} (read-only, untouched)
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
4. **Validation gate**: Never finish without passing `--check-features`.
5. **Formatting gate**: Format changed feature artifacts before validation and before committing.
6. **Commit gate**: If consolidation changed files and the run was not `--dry-run`, commit the completed, validated bundle before final reporting unless the user explicitly opts out.
7. **No data loss**: Base feature semantics must be preserved. Only append/refine spec content, never remove existing requirements.
8. **Dry-run safety**: When `--dry-run` is specified, report everything but modify nothing.
9. **Template provenance**: Features with `spernakit_version` are template-owned. In derived apps, never modify, rename, delete, or fold into them. Fixes to template features must be upstreamed to the Spernakit repository.

## Notes

- This skill works on one application at a time. To consolidate multiple apps, invoke it multiple times.
- If `--dry-run` is passed, run Phases 1-2 only and report the mapping without making changes.
- Remediation features from any date should be processed, not just the current session's.
- The `updatedAt` timestamp should use the current date in ISO format (e.g., `2026-03-11T00:00:00.000Z`).
- This skill complements the aidd-local `template-refactor` skill; run consolidation after refactoring to clean up.

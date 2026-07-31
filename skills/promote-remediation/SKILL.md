---
name: promote-remediation
description: 'Convert a misclassified aidd remediation record into net-new feature work while preserving provenance and dependency references. Use when a remediation should be promoted or converted to a feature.'
metadata:
    aidd-category: audit-remediation
---

# Promote Remediation to Feature

The `bug2feature` skill creates `remediation-*` feature.json files for `kind: 'bug'` submissions. Sometimes a submission was filed as a bug but is really a feature request: the affected code doesn't exist yet, the spec describes a new capability rather than a defect. The triage-time gate in `bug2feature` (section 3a-bis) catches most of these at ingest. This skill handles the residuals: cases discovered later, after the remediation directory already exists.

A promotion has four mechanical effects:

1. The directory is renamed from `remediation-{YYYYMMDD}-{slug}` to `{slug}` (a clean descriptive slug: no prefix, no date stamp; or a new slug if you specify one via `--new-slug`)
2. The `id` field inside `feature.json` is updated to match the new directory name
3. The `title` field is reframed (the "Remediation:" prefix, if present, is dropped and replaced with a forward-looking name)
4. The `notes` field is appended with a provenance line so the original bug context isn't lost

Cross-references in OTHER features' `dependencies` arrays are also updated so the promoted feature is still reachable by its new ID.

The script also warns about (or applies) any cleanup the user should know about; e.g., if the remediation was PARTIAL (some of the original spec already landed in code), the agent suggests narrowing the scope to only the still-pending half.

## Usage

```
promote-remediation {app}/{remediation-slug}
promote-remediation {app}/{remediation-slug} --new-slug {feature-slug}
promote-remediation {app}/{remediation-slug} --reason "<one-line provenance reason>"
promote-remediation --all-blocked  (promote every remediation whose notes contain "BLOCKED")
```

### Arguments

| Argument                    | Required                        | Description                                                                                                                                                                                                                                                                                                 |
| --------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `{app}/{remediation-slug}`  | One of these or `--all-blocked` | Path-like locator: app name + remediation directory name. Example: `<app-name>/remediation-YYYYMMDD-inventory-dashboard`.                                                                                                                                                                                   |
| `--all-blocked`             | One of these or a slug          | Sweep mode: promote every remediation whose `notes` field contains the literal string "BLOCKED", across every aidd-managed app (any stack; see Phase 1). The flag authorizes the complete discovered batch.                                                                                                 |
| `--new-slug {feature-slug}` | Optional                        | Override the target slug. By default the date and slug are preserved (only the prefix changes). Use this when the remediation is being scope-narrowed and the new slug should reflect the narrower scope (e.g., `homework-datetime-and-milestones` → `homework-milestones` after the datetime half landed). |
| `--reason "<text>"`         | Optional                        | Reason text inserted into the provenance note. If omitted, defaults to "promoted because affected area does not exist (bug filed against missing capability)".                                                                                                                                              |

## Workflow

### Phase 0: Git State Sanity Check (MANDATORY)

**Before resolving any BLOCKED flag from a prior session, verify it is still valid against the current git state.** Prior-session reports are point-in-time observations, not current-state facts. Between the session that filed the flag and the session that resolves it, a parallel workstream may have already implemented, reverted, or otherwise superseded the work.

For every app the skill will touch (single mode: the one app; sweep mode: every app with candidate remediations):

1. **Run `git log --oneline -20`** in the app directory. Scan for commits that mention keywords
   from the BLOCKED feature's title, ID, or description. Pay particular attention to work from other
   authors or concurrent sessions because the feature may have shipped outside the current workstream.
2. **Run `git status --short`** to see the working tree state. If there are uncommitted or staged files that overlap with the BLOCKED feature's scope, the current resolution may conflict with someone's in-flight work; STOP and report to the user.
3. **Run `git log --oneline --all -- .aidd/features/{slug}/feature.json`** on the specific remediation's feature.json file. If its `passes` field was ever flipped to `true` in a commit you don't recognize, that's a strong signal the feature has been implemented since the flag was filed.
4. **Spot-check the codebase** for the key artifact(s) the feature's spec would introduce: grep for a distinctive filename, schema, route path, or component name. If the spec says "Add `backend/src/db/schema/gameHistory.ts`" and that file already exists in the working tree, the feature is already shipped.

If any of these checks turns up **evidence the feature has already been implemented**:

- STOP the promotion.
- Report to the user: "remediation-{slug} was shipped as commit {hash} on {date}. A remediation that no longer describes pending work cannot be promoted."
- Suggest the correct action instead: delete the stale remediation feature.json (if it still says `passes: false`) OR update it to `passes: true, status: completed` (if the implementation is validated), then reconcile any scope artifacts (`spec.md` Out-of-Scope sections, `testing-scenarios.md` assertions) with the shipped reality.
- Do NOT proceed with the promotion in sweep mode either; skip the stale candidate and continue with the rest, reporting the skip in the final summary.

The same discipline applies to any workflow that picks up a BLOCKED/scope flag from a prior session report, not just the aidd-local `promote-remediation` skill. If you're resolving a flag manually (editing a spec file, deleting a feature directory, amending `spec.md`, etc.) from a session report you didn't produce yourself, run the same four checks before touching anything. The flag was true when it was filed; it may not still be true.

### Phase 1: Resolve target(s)

1. **Single mode** (`{app}/{slug}` argument): verify the directory exists at `<applications-root>/{app}/.aidd/features/{slug}/` and contains a `feature.json`. If the slug doesn't start with `remediation-`, error out; only remediations can be promoted. If the feature.json has a `spernakit_version` field, error out; template-owned features cannot be promoted (they are managed by the spernakit repo).
2. **Sweep mode** (`--all-blocked`): discover candidate apps from `<applications-root>/AGENTS.md`, then filter to roots that actually contain a `.aidd/features` tree; exclude `.old` directories. This is the same discovery the aidd-local `feature-review-all` skill uses, and it is **deliberately not** the Spernakit fleet manifest: a blocked remediation is an aidd feature record, so any aidd-managed project can hold one regardless of stack or template provenance. For each app, list every directory under `.aidd/features/` that:
    - Starts with `remediation-`
    - Has a `feature.json` whose `notes` field contains the substring "BLOCKED" (case-insensitive)

    Present the candidate list, then promote the complete batch directly. Report how many roots were
    scanned and how many were skipped for having no `.aidd/features`, so a short candidate list is
    visibly a real result rather than a narrow scan.

### Phase 2: For each target, validate and dry-run

For each remediation directory that will be promoted:

1. **Read** `feature.json`
2. **Compute** the new id:
    - Default: strip the `remediation-{YYYYMMDD}-` prefix to get a clean slug. Example: `remediation-20260413-sysop-impersonate-user` → `sysop-impersonate-user`
    - With `--new-slug` override: use the provided slug directly as the new id
3. **Detect collisions**: if a directory with the new name already exists in the same
   `.aidd/features/` directory, preserve both directories, report the collision, and continue other
   sweep candidates. If the existing feature has `spernakit_version`, note that template-owned
   features cannot be overwritten.
4. **Detect partial-resolution**: read the `notes` field. If it contains `PARTIAL`, `RESOLVED`,
   `already applied`, or similar language, preserve the current scope unless `--new-slug` supplied an
   explicit narrower scope. Report the half-landed evidence without pausing.
5. **Find cross-references**: grep across `<applications-root>/{app}/.aidd/features/**/feature.json` for any `dependencies` arrays containing the old ID. Note them for Phase 4.

If any validation fails, report and stop (single mode) or skip and continue (sweep mode).

### Phase 3: Apply changes to feature.json (in place, before rename)

Edit the source `feature.json` BEFORE renaming the directory, so file paths stay valid throughout:

1. **`id` field**: replace with the new id
2. **`title` field**: if it starts with "Remediation:" or "Bug:" or "Fix:", strip the prefix and reframe as a forward-looking feature name. Examples:
    - `Remediation: Budgets do not roll up Expenses or Bills` → `Budgets roll up Expenses and Bills via categories`
    - `Remediation: SYSOP impersonate user from /settings/users` → `SYSOP impersonate user from /settings/users` (already forward-looking, just drop the prefix)
    - `Fix: VIEWER can edit dashboards` → `VIEWER read-only dashboard enforcement`
3. **`notes` field**: append a provenance line in this exact shape:
    ```
    Promoted from {old-id} on {YYYY-MM-DD}: {reason}
    ```
    Concatenate with " | " separator so the original bug-report metadata stays at the front of the notes string.
4. **`status` field**: leave as `backlog` unless the user explicitly says otherwise. The promotion doesn't change implementation status, only classification.
5. **`passes` field**: leave as-is (almost always `false` for a backlog feature).
6. **`updatedAt` field**: refresh to today's date in ISO format.

### Phase 4: Rename the directory

Use a filesystem rename (mv on Unix-like, Move-Item on PowerShell, depending on the runtime). Do NOT copy + delete; that loses file timestamps and is slower. Verify the rename succeeded before proceeding to Phase 5.

### Phase 5: Update cross-references

For each cross-reference noted in Phase 2.5:

1. Read the referencing `feature.json`
2. Update the `dependencies` array entry from the old id to the new id
3. Write back

If a cross-reference was inside the remediation being promoted itself (e.g., the original bug declared a self-referential dependency), it's already updated by Phase 3; skip it here.

### Phase 5b: Move the roadmap assignment (mandatory)

A promotion renames the feature's directory, so its `.aidd/roadmap.json` key is now stale. The roadmap entry must **move**, not be recreated; milestone targeting is preserved across the rename. For each promoted feature, in its app:

1. Read `<applications-root>/{app}/.aidd/roadmap.json`. If it does not exist, **create it first**: a single `v1.0` milestone (priority 1) mapping every existing feature directory, preserving dependencies (keyed by directory). The promoted directory already carries its new id after Phase 5, so it maps directly. Roadmap and milestones apply to every project, so a missing file is created, never skipped — then apply the key move below.
2. If `roadmap.features["{old-id}"]` exists, move it to `roadmap.features["{new-id}"]` **verbatim** (preserve its `milestone` and any `dependencies`), then delete the old key. If no old entry exists, assign the new id to the current milestone: the existing milestone with the highest numeric `priority`. Do not create a new milestone during promotion.
3. Also update any `roadmap.features[*].dependencies` arrays that referenced `{old-id}` to `{new-id}` (mirror of the Phase 5 feature.json cross-reference update).
4. Do not shell into the aidd installation to propagate this. aidd applies the roadmap itself when the run ends — milestone priority and resolved dependency IDs land in the feature.json files, and the `updated / unchanged / errors` summary is reported with the run. That covers the project this run targets; if you changed assignments in another project, report it as needing a separate pass instead of reaching outside the workspace. In sweep mode, name every app touched in the Phase 7 report.

### Phase 6: Verification

After all changes are applied:

1. Run `bun run aidd-tools -- features:status --pending --type remediation --application {app}` from `<aidd-root>` and confirm the promoted entries no longer appear
2. Run `bun run aidd-tools -- features:status --pending --type feature --application {app}` from `<aidd-root>` and confirm they now appear under feature
3. Grep `.aidd/features/` for any remaining references to the old IDs (should only be inside the promoted features themselves, in the `notes` provenance line, which is intentional)

If anything looks off, report it. Do not silently revert.

### Phase 7: Report

Output a structured summary:

```
# Promote Remediation Result

Targets: N
Promoted: M
Skipped: K (with reasons)
Failed: F (with reasons)

## Promoted entries
| Old ID | New ID | App | Title (after rename) |
|---|---|---|---|
| remediation-YYYYMMDD-inventory-dashboard | inventory-dashboard | <app-name> | Inventory dashboard |
...

## Cross-references updated
| Referencing feature | Old dependency | New dependency |
|---|---|---|
| gifts-integration | remediation-20260413-savings-goal | savings-goal |

## Verification
- features:status remediation count (after): N
- features:status feature count (after): M
- Stale references found in grep: 0 (or list)

## Notes
<anything weird, partial-resolution warnings the user opted past, etc.>
```

## Don'ts

- **Don't promote `feature-*` to `remediation-*`.** this skill is one-way. If a feature was misclassified as a remediation, demote manually; there's no symmetric command because misclassifications go in one direction (bug-flow over-eager) far more often than the other.
- **Don't add a date to the new id.** Base features use clean slugs without dates or prefixes. The creation date is preserved in `createdAt`.
- **Don't auto-resolve PARTIAL remediations.** If the remediation's notes say half the scope already landed, the agent should warn but not narrow the scope automatically. The user knows what to keep and what to split.
- **Don't delete the original directory** before the rename succeeds. Use atomic rename, not copy + delete.
- **Don't promote without a reason.** If `--reason` is omitted, use the default ("promoted because affected area does not exist") but log a warning that a more specific reason is preferred for traceability.
- **Don't run `bun run smoke:qc` or any build/test gate.** Promotions don't change code; they only relocate metadata. Quality gates are wasted effort here. (Roadmap propagation still has to happen, but aidd does it at run end — it is not a gate you run.)
- **Don't open or modify any files outside `.aidd/`.** This is purely a metadata operation. The only files in play are `.aidd/features/**/feature.json` and `.aidd/roadmap.json` (the Phase 5b roadmap key move); nothing else.

## Examples

### Single-target promotion

```
promote-remediation <app-name>/remediation-YYYYMMDD-inventory-dashboard --reason "net-new feature work, not bug remediation"
```

Renames the directory to `inventory-dashboard` (clean slug: no prefix or date), updates the id,
drops "Remediation:" from the title, and appends the provenance note.

### Single-target with scope narrowing

```
promote-remediation <app-name>/remediation-YYYYMMDD-inventory-dashboard-export --new-slug inventory-dashboard --reason "export scope already landed; only the dashboard remains"
```

Renames to `inventory-dashboard` (clean slug from `--new-slug`), updates the id to match, and
appends the provenance note. The user is responsible for narrowing the spec text in feature.json
after the promotion if needed; the skill does not auto-edit specs.

### Sweep mode

```
promote-remediation --all-blocked
```

Lists every remediation across every app whose notes contain "BLOCKED", then promotes the complete batch.

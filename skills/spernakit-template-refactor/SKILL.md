---
name: spernakit-template-refactor
description: 'Assess and realign a derived application with the Spernakit template while preserving intentional domain differences and behavior. Use to remediate whole-application template drift or clean up unjustified divergence; use spernakit-diff-sync for a focused file set.'
metadata:
    aidd-category: spernakit-fleet
    spernakit-references: docs/template/STACK.md, docs/template/DEVELOPMENT.md
---

# Template-Based Refactor

Assess a complete derived application against its released Spernakit baseline and remove unjustified
drift while preserving branding, domain behavior, and reusable improvements.

## Usage

```
spernakit-template-refactor <app>
```

- `<app>` is a derived application name or path.
- This skill owns a whole-application assessment. Use `spernakit-diff-sync` for a specific fix,
  enhancement, drift area, or small file set.

## Authoritative Inputs and Preconditions

Resolve and verify these inputs before comparing files:

- The derived application root and its `package.json` `spernakit_version`.
- The Spernakit root and the matching immutable `v<spernakit_version>` tag. Do not infer a
  baseline from dates, the app's own version, or the Spernakit working tree.
- The staged `.aidd/docs/template/STACK.md` and `.aidd/docs/template/DEVELOPMENT.md`; when they were
  not staged, read the same paths under `<spernakit-root>`.
- The application's specification, project instructions, domain constraints, and
  `.templateoverrides` when present.
- Git status and diffs in both repositories. Preserve unrelated local and staged changes.

The app must already be on the release being audited. If the app's `spernakit_version` differs from
the released template version it is meant to adopt, run `spernakit-template-upgrade` first. Do not
turn a full refactor into an undeclared version upgrade.

## Phase 1: Build the Worklist

1. Run `bun run check:drift` from the derived application. It dynamically enumerates the files
   managed by the app's recorded template tag, including scaffold-mapped files. A `[SKIP]` is an
   unverifiable result, not a clean result; resolve the missing template root, tag, manifest, or
   version before continuing.
2. Start from all of the checker's results, including warnings and suppressed paths:

    | Drift category                | Live gate meaning                                                         |
    | ----------------------------- | ------------------------------------------------------------------------- |
    | `pure`                        | Must be byte-identical; residual drift fails.                             |
    | `branded`                     | Compared after the checker's per-file branding normalization; fails.      |
    | `infrastructure`              | Domain extension is expected; drift is advisory and needs hunk review.    |
    | `security-infrastructure`     | Security-critical; drift or removal fails unless explicitly suppressed.   |
    | `suppressed`                  | An override acknowledges divergence; its reason still needs verification. |
    | missing template-managed file | Restore unless the application's documented behavior justifies removal.   |

3. Do not expand the worklist with arbitrary files that merely look similar. The drift checker's
   tagged enumeration, scaffold path mapping, manifest classifications, and security set define
   template ownership.
4. Read each `.templateoverrides` reason against the actual hunk. An override is evidence of intent,
   not proof that the current difference is still necessary or that its reason is complete.

`check:drift` compares the app with its recorded tag. It does not discover unreleased template
advancement, and without `--target-version` it does not report paths removed by a later release.
Those belong to `spernakit-template-upgrade`, not this same-version refactor.

## Phase 2: Classify Every Hunk

For every differing pair, produce a unified diff before reading surrounding code:

```text
git -C <spernakit-root> show v<spernakit_version>:<template-path> > <baseline-file>
git diff --no-index --unified -- <baseline-file> <app-file>
```

Do not use bare `diff` in PowerShell; it aliases `Compare-Object`. For `git diff --no-index`, exit 1
means differences were found, not that the comparison failed. The template operand must be the
content extracted from the recorded tag, not an unreleased working-tree copy. Resolve
scaffold-mapped paths through the drift tool's template mapping.

Classify each hunk independently:

| Classification  | Evidence                                                          | Action                                          |
| --------------- | ----------------------------------------------------------------- | ----------------------------------------------- |
| Identical       | No content delta after the applicable normalization               | None                                            |
| Branding        | Exact normalization supported by the live checker                 | Preserve                                        |
| Stylistic drift | Equivalent behavior with unjustified syntax or organization drift | Align app to baseline                           |
| Domain-specific | Required by documented app behavior or integration                | Preserve and document                           |
| Missing file    | Baseline owns a file absent from the app                          | Restore unless removal is justified             |
| Enhancement     | Reusable improvement with a real Spernakit consumer               | Backport to Spernakit first                     |
| Bug fix         | Derived app corrects a demonstrated template defect               | Fix Spernakit first, then align the app         |
| Unresolved      | Ownership or behavior cannot be established confidently           | Preserve, report, and continue independent work |

The drift category and hunk classification are different facts. For example, an
`infrastructure` warning may contain both required domain code and unjustified stylistic drift, and
a suppressed security file may contain template changes its override reason does not mention.

For each hunk, record the relative path, baseline location, classification, evidence, direction,
and whether an override must be added, rewritten, or removed.

## Phase 3: Detect Enhancements

Compare shared behavior in both directions. A potential enhancement must have concrete evidence,
such as stronger validation or types, safer error handling, improved security, useful
observability, a measured performance improvement, or coverage of a real edge case.

- Preserve app-only behavior in the app.
- Never add a Spernakit export, service, or abstraction without an immediate template consumer.
- Port a high-confidence reusable enhancement or bug fix to Spernakit before aligning the app, so
  the better implementation is not overwritten.
- Present the backport in the plan. Preserve unresolved candidates on both sides and continue with
  independent, high-confidence corrections.

When Spernakit changes, update any affected template-owned feature specification in Spernakit.
Never edit a template-owned feature in the derived app, and never change a feature record's
`spernakit_version`; it records origin, not the latest revision.

## Phase 4: Write the Plan and Tracking Features

If the classified worklist contains no actionable discrepancy, create neither a remediation plan
nor tracking features; report the explicit no-op instead.

Write `{app}/REMEDIATION-PLAN.md` with:

- The app and recorded template versions.
- Counts by drift category and hunk classification.
- One item per differing path, with hunk evidence, direction, and action.
- Intentional domain deviations and their `.templateoverrides` state.
- Enhancements or bugs to backport and unresolved conflicts.
- Validation required for each logical change group.

Group actionable app changes into small, app-owned features, normally three to eight files per
subsystem. Create each at `.aidd/features/{clean-slug}/feature.json` and comply with
`<aidd-root>/docs/reference/feature-fields.md`.

```json
{
	"affectedFiles": ["{project-root-relative paths}"],
	"category": "Template Alignment",
	"createdAt": "{ISO timestamp}",
	"dependencies": [],
	"description": "{specific verified drift and intended correction}",
	"id": "{clean-slug}",
	"notes": ["Created by spernakit-template-refactor from verified drift on {YYYY-MM-DD}."],
	"passes": false,
	"priority": 1,
	"spec": "{numbered, observable acceptance criteria}",
	"status": "in_progress",
	"title": "{descriptive title}",
	"updatedAt": "{same ISO timestamp as createdAt}"
}
```

Rules for generated records:

- Use clean, unique, kebab-case IDs. Apply the process-record guard: do not use an audit or process
  record name, and do not add `spernakit_version`; the record is owned by the derived application.
- Use `in_progress` only for work this run will execute. Use `backlog` for a deferred group and
  keep `passes: false`.
- Preserve all existing feature records and roadmap milestone names.
- When `.aidd/roadmap.json` exists, assign every new feature to an existing milestone and run from
  the aidd root:

    ```text
    bun run aidd-tools -- roadmap:apply --project-dir <app>
    ```

Present the plan and feature list, then continue directly with every high-confidence correction.

## Phase 5: Apply the Refactor

For each file, review the unified diff again immediately before editing.

1. **Pure and branded files**: restore shared content from the tagged baseline, applying only the
   branding transformations the live checker recognizes. First verify that the app did not add
   domain behavior to a nominally pure file; if it did, treat the affected hunks conservatively as
   infrastructure rather than overwriting them.
2. **Infrastructure files**: hand-apply only the justified shared structure. Preserve app routes,
   schemas, navigation, integrations, and other domain extensions.
3. **Security-infrastructure files**: preserve intentional security policy only when supported by
   current application requirements and a precise override reason. Never use an override merely to
   make the gate green.
4. **Mixed files**: replace unjustified shared hunks with baseline equivalents and preserve
   domain-specific hunks. If they overlap and the merge is uncertain, preserve the app behavior and
   report the conflict.
5. **Re-export shims**: keep these as thin imports/re-exports from the app-branded shared package,
   not inline duplicate definitions:
    - `backend/src/constants/errorCodes.ts`
    - `backend/src/types/roles.ts`
    - `frontend/src/api/types/common.ts`
    - `frontend/src/types/roles.ts`

Apply the template's established syntax and organization to changed shared code and new custom
code. Do not alter unrelated content, add compatibility layers, or introduce future-use utilities.
Keep backend routes, frontend callers, and their registrations aligned whenever a behavioral change
crosses that boundary.

If the run is review-only, do not edit. Report the exact changes the apply branch would make.

## Phase 6: Verify

After each logical group:

1. Review its diff and confirm all domain logic and app-authored consumers remain.
2. Run the narrow type, lint, format, and behavioral checks relevant to that group.
3. Re-run `bun run check:drift`; investigate every remaining failure, warning, and suppression.
   A green drift result proves baseline alignment, not functional correctness.
4. If Spernakit changed, validate it independently with its targeted checks and
   `bun run smoke:qc`.
5. Validate the derived application with targeted tests and `bun run smoke:qc`.
6. Validate feature metadata from the aidd root:

    ```text
    bun run start -- --project-dir <app> --check-features
    ```

7. If roadmap metadata changed, rerun `roadmap:apply`; an immediate dry run should produce no
   additional changes.

Do not claim the application works unless its full quality gate passes. Do not bypass a cached
quality-gate result.

## Phase 7: Close Tracking and Report

For each fully implemented and validated feature:

- Set `status` to `completed` and use the exact JSON field `"passes": true`.
- Set `completedAt` and `updatedAt` to the current ISO timestamp.
- Append a dated resolution to `notes`, normalizing missing/null to `[]`, a string to
  `[existingString]`, and an array to a copy before appending.
- Keep `affectedFiles` complete and project-root-relative.

Leave an incomplete feature in `backlog` with `passes: false` and a precise blocker in `notes`.
Update `REMEDIATION-PLAN.md` to distinguish completed, preserved, deferred, and unresolved items.

Report:

- Files changed in Spernakit and in the derived application.
- App drift removed, intentional differences preserved, enhancements backported, and conflicts left
  unresolved.
- Overrides added, rewritten, removed, or retained.
- Feature and roadmap metadata changed.
- Validation commands and their results.

Do not stage, commit, or push unless the user explicitly requests it.

## Principles

1. The recorded release tag is the comparison baseline.
2. The live drift checker defines template ownership, path mapping, and file categories.
3. Classify hunks, not just whole files.
4. Preserve all documented domain behavior and unresolved work.
5. Align unjustified shared structure exactly with the baseline.
6. Backport only reusable improvements with an immediate Spernakit consumer.
7. Keep app-owned tracking records unstamped and template-owned records upstream.
8. Validate every modified repository independently.

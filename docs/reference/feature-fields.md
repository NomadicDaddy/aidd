# Feature Fields

aidd tracks planned and completed work with project-local feature files:

```text
.aidd/features/<feature-id>/feature.json
```

The directory name must match `id`. The validator reports an issue when a base feature's `id`
differs from its directory name, and audit findings (those carrying `auditSource`) are validated
the same way. Keeping them aligned keeps filters, roadmap mapping, and web views predictable.

## Required Fields

The runtime accepts permissive JSON, but these fields are the operational contract for base
features:

| Field          | Type       | Purpose                                                                  |
| -------------- | ---------- | ------------------------------------------------------------------------ |
| `id`           | `string`   | Stable feature identifier. Prefer clean slugs such as `run-console`.     |
| `title`        | `string`   | Human-readable summary used in prompts and UI lists.                     |
| `description`  | `string`   | Short explanation of the intended behavior or fix.                       |
| `category`     | `string`   | Grouping for status summaries and dashboard views.                       |
| `dependencies` | `string[]` | Feature IDs that must have `passes: true` before this feature is picked. |
| `status`       | `string`   | Work state. See status values below.                                     |
| `passes`       | `boolean`  | Whether the feature has been implemented and verified.                   |

`dependencies` should be present even when empty. Some older files omit optional fields, but new
features should use the full contract above.

## Accepted ID Shapes

The live validator (`shared/src/metadata/features/types.ts` defines the ID pattern;
`shared/src/metadata/features/validation.ts` implements the checks) accepts these ID forms:

| Shape                          | Use                                                             |
| ------------------------------ | --------------------------------------------------------------- |
| `clean-descriptive-slug`       | Preferred base-feature format.                                  |
| `feature-<digits>-<slug>`      | Legacy dated feature format. Consolidate to a clean slug later. |
| `spernakit-<digits>-<slug>`    | Template-originated feature IDs.                                |
| `remediation-<slug>`           | Remediation work without a date stamp.                          |
| `remediation-<digits>-<slug>`  | Dated remediation work.                                         |
| `audit-<type>-<digits>-<slug>` | Audit findings generated from an audit run.                     |

Avoid generic `feature-` prefixes for new base features. Consolidation should rename prefixed base
features to clean slugs.

## Status and Passes

Current valid statuses are:

| Status             | Meaning                                                              |
| ------------------ | -------------------------------------------------------------------- |
| `backlog`          | Approved work that an agent may select.                              |
| `in_progress`      | Work already started; selected before normal backlog items.          |
| `completed`        | Implemented and verified; should have `passes: true`.                |
| `waiting_approval` | Blocked on a human decision; agents skip it during normal selection. |

Validation rejects `passes: true` with `status: "backlog"`. Completed audit findings and
remediations with `passes: true` must also carry a non-empty `notes` resolution explaining how
the issue was closed. Completion requires both metadata and the selected agent's final structured
result to agree.

When `.aidd/roadmap.json` exists, every feature directory must be assigned to a defined milestone.
The `--check-features` gate reports unmapped feature directories and stale roadmap references.

## Common Optional Fields

The schema passes through extra fields so features can carry richer context. Common fields include:

| Field                 | Type               | Purpose                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priority`            | `number \| string` | Lower values sort earlier during selection.                                                                                                                                                                                                                                                                                                                       |
| `spec`                | `string`           | Acceptance criteria or remediation steps.                                                                                                                                                                                                                                                                                                                         |
| `affectedFiles`       | `string[]`         | Files affected by the work, project-root-relative. Optional while open; expected once `completed` (stamped from the diff by `document-changes`, and a duplicate-detection key for audit findings and `doc2feature`).                                                                                                                                              |
| `model`               | `string`           | Model hint or provenance.                                                                                                                                                                                                                                                                                                                                         |
| `summary`             | `string`           | Completion summary or short result note.                                                                                                                                                                                                                                                                                                                          |
| `createdAt`           | `string`           | ISO timestamp for creation.                                                                                                                                                                                                                                                                                                                                       |
| `updatedAt`           | `string`           | ISO timestamp for last feature metadata change.                                                                                                                                                                                                                                                                                                                   |
| `branchName`          | `string`           | Optional branch hint for the work.                                                                                                                                                                                                                                                                                                                                |
| `skipTests`           | `boolean`          | Legacy hint; verification should still be explicit.                                                                                                                                                                                                                                                                                                               |
| `reasoningEffort`     | `string`           | Native/Codex-style reasoning effort hint.                                                                                                                                                                                                                                                                                                                         |
| `thinkingLevel`       | `string`           | Claude-style reasoning hint.                                                                                                                                                                                                                                                                                                                                      |
| `requirePlanApproval` | `boolean`          | Whether a generated plan needs human approval.                                                                                                                                                                                                                                                                                                                    |
| `planSpec`            | `object`           | Stored generated plan metadata.                                                                                                                                                                                                                                                                                                                                   |
| `spernakit_version`   | `string`           | Marks template-owned features in Spernakit repos.                                                                                                                                                                                                                                                                                                                 |
| `shippedVersion`      | `string`           | Internal project version this feature's current state shipped in. Stamped by the `document-changes` skill alongside a dated revision note in `notes`. The milestone auto-place repair backfills it on completed features that never got stamped, using the app's current `package.json` version — inferred provenance, recorded as such in a dated `notes` entry. |

Legacy field names such as `acceptance_criteria` and `file_locations` may appear in older derived
apps. Prefer `spec` and `affectedFiles` for new aidd v2 feature files.

The schema is passthrough, so other context fields are valid too;
[sample-feature-full.json](./sample-feature-full.json) additionally exercises `assignedTo`,
`complexity`, `imagePaths`, `tags`, `textFilePaths`, and `notes` (where completed
audit/remediation work records its resolution).

## Audit Finding Fields

Audit findings are feature files with additional metadata:

| Field           | Type     | Purpose                                                        |
| --------------- | -------- | -------------------------------------------------------------- |
| `auditSource`   | `string` | Audit name such as `SECURITY`, `DEAD_CODE`, or `TECHDEBT`.     |
| `auditSeverity` | `string` | Severity label such as `Critical`, `High`, `Medium`, or `Low`. |

When `auditSource` is present, the feature ID must start with `audit-` and match the directory name.
Normal coding mode skips audit findings unless a mode or filter explicitly includes them.

## Validation

Run the live validator from the target project root:

```powershell
bun run start -- --project-dir . --check-features
```

For aidd's own repository, this should report every `feature.json` as valid before metadata changes
are committed.

Validation distinguishes hard issues from warnings. Warnings never fail the gate; they flag
conventions worth following. Two warnings exist today:

- A `completed` feature with `passes: true` missing a non-empty `affectedFiles`: the changed
  files are knowable from the diff at completion time, so completed work should carry them.
- Open features (`backlog`, `in_progress`, `waiting_approval`) whose normalized titles duplicate
  each other: they likely represent the same item and should be consolidated.

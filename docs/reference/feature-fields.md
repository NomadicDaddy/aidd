# Feature Fields

aidd tracks planned and completed work with project-local feature files:

```text
.aidd/features/<feature-id>/feature.json
```

The directory name must match `id`. The validator reports an issue when a base feature's `id`
differs from its directory name, and audit findings (those carrying `auditSource`) are validated
the same way. Keeping them aligned keeps filters, roadmap mapping, and web views predictable.

`directory` is not an on-disk field. The loader stamps it with the containing directory name after
reading, and the writer strips it again before serializing, so it appears in API payloads and
in-memory records but never in `feature.json`. Writes preserve the formatting a record already had:
a file the project keeps in its prettier-canonical form (sorted keys, tabs) is rewritten that way,
and one that was never formatted keeps 2-space JSON.

## Required Fields

The runtime accepts permissive JSON, but these fields are the operational contract for base
features:

| Field          | Type       | Purpose                                                                                                                                                |
| -------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `id`           | `string`   | Stable feature identifier. Prefer clean slugs such as `run-console`.                                                                                   |
| `title`        | `string`   | Human-readable summary used in prompts and UI lists.                                                                                                   |
| `description`  | `string`   | Short explanation of the intended behavior or fix.                                                                                                     |
| `category`     | `string`   | Grouping for status summaries and dashboard views.                                                                                                     |
| `dependencies` | `string[]` | Refs that must be `completed` with `passes: true` before this feature is picked. A ref resolves against either a feature's `id` or its directory name. |
| `status`       | `string`   | Work state. See status values below.                                                                                                                   |
| `passes`       | `boolean`  | Whether the feature has been implemented and verified.                                                                                                 |

`dependencies` should be present even when empty. Some older files omit optional fields, but new
features should use the full contract above.

## Accepted ID Shapes

The live validator (`shared/src/metadata/features/types.ts` defines the ID pattern;
`shared/src/metadata/features/validation.ts` implements the checks) accepts these ID forms:

| Shape                          | Use                                                      |
| ------------------------------ | -------------------------------------------------------- |
| `clean-descriptive-slug`       | Preferred base-feature format.                           |
| `feature-<digits>-<slug>`      | Dated feature format. Consolidate to a clean slug later. |
| `spernakit-<digits>-<slug>`    | Template-originated feature IDs.                         |
| `remediation-<slug>`           | Remediation work without a date stamp.                   |
| `remediation-<digits>-<slug>`  | Dated remediation work.                                  |
| `audit-<type>-<digits>-<slug>` | Audit findings generated from an audit run.              |

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

Validation rejects `passes: true` on any status other than `completed`. Completed audit findings and
remediations with `passes: true` must also carry a non-empty `notes` resolution explaining how
the issue was closed. Completion requires both metadata and the selected agent's final structured
result to agree.

When `.aidd/roadmap.json` exists, every feature directory must be assigned to a milestone the
roadmap defines. `--check-features` raises a hard issue for a feature directory that is unmapped or
that names a milestone the roadmap does not define, and a warning when the roadmap references a
feature directory that no longer exists.

## Common Optional Fields

The schema passes through extra fields so features can carry richer context. Common fields include:

| Field                 | Type                 | Purpose                                                                                                                                                                                                                                                                                                                                                           |
| --------------------- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `priority`            | `number \| string`   | Lower values sort earlier during selection. A missing `priority` sorts as 999.                                                                                                                                                                                                                                                                                    |
| `spec`                | `string`             | Acceptance criteria or remediation steps.                                                                                                                                                                                                                                                                                                                         |
| `affectedFiles`       | `string[]`           | Files affected by the work, project-root-relative. Optional while open; expected once `completed` (stamped from the diff by `document-changes`, and a duplicate-detection key for audit findings and `doc2feature`).                                                                                                                                              |
| `model`               | `string`             | Model hint or provenance.                                                                                                                                                                                                                                                                                                                                         |
| `notes`               | `string \| string[]` | Resolution or revision history. Readers accept a single string; writes produce arrays.                                                                                                                                                                                                                                                                            |
| `summary`             | `string`             | Completion summary or short result note.                                                                                                                                                                                                                                                                                                                          |
| `blockingContext`     | `object`             | Why the feature was parked as `waiting_approval`: `commands`, `outputExcerpt`, `parkedAt`, `reason`, and optional `outcomeStatus`. Written at parking time for the decision queue and the next run's agent; a fresh park overwrites the previous one.                                                                                                             |
| `createdAt`           | `string`             | ISO timestamp for creation.                                                                                                                                                                                                                                                                                                                                       |
| `updatedAt`           | `string`             | ISO timestamp for last feature metadata change.                                                                                                                                                                                                                                                                                                                   |
| `completedAt`         | `string`             | ISO timestamp for entry into `completed`. Stamped by `writeFeature` (and by the orchestrator for the on-disk flip the agent performs itself), cleared on reopen. Distinct from `updatedAt`, which is the last metadata write of any kind and drifts days past the finish.                                                                                         |
| `branchName`          | `string`             | Optional branch hint for the work.                                                                                                                                                                                                                                                                                                                                |
| `skipTests`           | `boolean`            | Advisory hint; verification should still be explicit.                                                                                                                                                                                                                                                                                                             |
| `reasoningEffort`     | `string`             | Native/Codex-style reasoning effort hint.                                                                                                                                                                                                                                                                                                                         |
| `thinkingLevel`       | `string`             | Claude-style reasoning hint.                                                                                                                                                                                                                                                                                                                                      |
| `requirePlanApproval` | `boolean`            | Whether a generated plan needs human approval.                                                                                                                                                                                                                                                                                                                    |
| `planSpec`            | `object`             | Stored generated plan metadata.                                                                                                                                                                                                                                                                                                                                   |
| `spernakit_version`   | `string`             | Marks a feature as template-owned. Preserve it in derived copies: it records the release where ownership originated, not the latest template version. App-owned features and remediation records must not add it.                                                                                                                                                 |
| `shippedVersion`      | `string`             | Internal project version this feature's current state shipped in. Stamped by the `document-changes` skill alongside a dated revision note in `notes`. The milestone auto-place repair backfills it on completed features that never got stamped, using the app's current `package.json` version — inferred provenance, recorded as such in a dated `notes` entry. |

`notes` is optional on ordinary base features. Before appending, normalize missing/null to `[]`, a
string to `[existingString]`, and an array to a copy; preserve every existing string and persist the
result as an array. Readers must accept both persisted shapes because synced corpora contain both.

Alternate field names such as `acceptance_criteria` and `file_locations` may appear in derived
apps. Prefer `spec` and `affectedFiles` for new feature files.

The schema is passthrough, so other context fields are valid too;
[sample-feature-full.json](./sample-feature-full.json) additionally exercises `assignedTo`,
`complexity`, `imagePaths`, `tags`, `textFilePaths`, and `notes` (where completed
audit/remediation work records its resolution).

## Audit Finding Fields

Audit findings are feature files with additional metadata:

| Field           | Type     | Purpose                                                                                                                                                                                                                                                                                                           |
| --------------- | -------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auditSource`   | `string` | Audit name such as `SECURITY`, `DEAD_CODE`, or `TECHDEBT`.                                                                                                                                                                                                                                                        |
| `auditSeverity` | `string` | Severity label such as `Critical`, `High`, `Medium`, or `Low`.                                                                                                                                                                                                                                                    |
| `fingerprint`   | `string` | Content fingerprint of the finding: `f1-` followed by 64 lowercase hex characters, derived from the audit name, title, and `affectedFiles`. Recognizes the same finding across audit runs; a finding needs both `fingerprint` and a non-empty `auditSource` to be dismissed or to append a findings-ledger event. |

When `auditSource` is present, the feature ID must start with `audit-` and match the directory name.
Normal coding mode skips audit findings unless a mode or filter explicitly includes them.

## Validation

Run the live validator from the target project root:

```powershell
bun run start -- --project-dir . --check-features
```

For aidd's own repository, this should report every `feature.json` as valid before metadata changes
are committed.

Validation distinguishes hard issues from warnings. Only issues fail the gate.

Beyond the per-field contract above, the collection-level checks that raise hard issues are:

- Two feature directories persisting the same `id`.
- A dependency ref matching no feature on disk, where the declaring feature is not yet complete:
  the ref can never resolve, so the feature can never be selected.
- A dependency cycle in which no member passes: every member is permanently unselectable.

Warnings never fail the gate; they flag conventions worth following. Six exist today:

- A `completed` feature with `passes: true` missing a non-empty `affectedFiles`: the changed
  files are knowable from the diff at completion time, so completed work should carry them.
- Open features (`backlog`, `in_progress`, `waiting_approval`) whose normalized titles duplicate
  each other: they likely represent the same item and should be consolidated.
- A literal `\n` in `title`, `description`, `spec`, or `notes` where a newline was meant: the text
  was escaped twice on its way into the JSON, so numbered criteria render as one unbroken line.
- A dependency ref matching no feature on disk where the declaring feature already passes: a stale
  reference rather than a live blocker.
- A dependency cycle with a passing member: selection still drains, but the declared edges
  contradict each other.
- A `roadmap.json` entry naming a feature directory that no longer exists.

# Project Reports

Project reports let an operator file a bug or feature request from the web UI. Rather than
going into a separate table, a report is written into the project's backlog as a
`feature.json` record carrying `aiddReport` metadata, so it flows through the normal feature,
roadmap, and run machinery from the moment it is submitted
(`backend/src/services/projectReports.ts`).

## Submitting

Reports are filed from the report dialog (`ProjectReportDialog`, opened by `ProjectReportButton`), which sits in the sidebar
rail on every page (`frontend/src/components/layout/AppLayout.tsx`) and behind the **File
report** button on a project's Reports tab
(`frontend/src/pages/projects/detail/ReportsTab.tsx`). The tab itself is a list view over
already-filed reports, with kind and text filters; it is not the form.

The dialog has three fields: a **Report type** segmented control (Bug or Feature), a
**Project** picker, and a **Description** textarea. Browser context is not asked for: the
dialog attaches `pathname`, `url`, `userAgent`, and `viewport` to every submission itself. The
project picker uses the lightweight `GET /api/v1/projects/names` endpoint rather than the full
metadata listing, and preselects the current project when the dialog is opened from a project
page, otherwise the project named or pathed `aidd`
(`frontend/src/components/layout/project-report-target.ts`).

| Endpoint                            | Purpose                                                                                 |
| ----------------------------------- | --------------------------------------------------------------------------------------- |
| `GET /api/v1/projects/:id/reports`  | List reports: `{ bugs: [...], lastUpdated }`.                                           |
| `POST /api/v1/projects/:id/reports` | Submit `{ kind, description, metadata? }`; returns `{ report }` with the created entry. |

`kind` is required and must be `bug` or `feature`; `description` must be 1-5000 characters
(`backend/src/routes/projects.schemas.ts`). Submissions to one project are serialized through
a per-project lock, so concurrent reports do not race on `roadmap.json` or the git index.

## Classification

A `feature` submission is always filed as a feature. A `bug` submission runs through the
wording heuristic in `classification.ts`, which can reclassify it:

- **Feature** when the description uses request wording ("no way to", "need a way to",
  "should be able to", "missing", "add", "allow", "let me", "want") and no breakage wording.
- **Bug** otherwise. Either the description contains breakage wording ("broken", "error",
  "crash", "cannot", "not working", "does not", "fail", "stuck", "wrong", and similar), or it
  matched neither list.

Breakage wording wins: a description carrying both stays a bug. The chosen kind and the reason
are stored on the record (`createdFeatureKind` and `classificationReason`).

## Generated feature record

`submitProjectReport` writes `.aidd/features/<featureId>/feature.json`. The id depends on
kind, and an 8-character uuid fragment is appended on collision (`uniqueFeatureId`):

| Kind    | Id shape                        |
| ------- | ------------------------------- |
| Bug     | `remediation-<YYYYMMDD>-<slug>` |
| Feature | `<slug>`                        |

The slug is the description's first six non-stop-words, and the title is its first line
capitalized and clipped to 80 characters (`slugFromDescription`, `titleFromDescription`).

The record is a standard feature (`status: 'backlog'`, `passes: false`, `priority: 3`,
`category: 'UI'`, with a generated `spec` and `notes`) plus an `aiddReport` block:

| `aiddReport` field     | Meaning                                    |
| ---------------------- | ------------------------------------------ |
| `createdAt`            | Submission time.                           |
| `createdFeatureKind`   | `bug` or `feature` after classification.   |
| `originalKind`         | The kind the operator selected.            |
| `classificationReason` | Why it was classified that way.            |
| `reportedBy`           | `{ username: 'aidd-web' }`.                |
| `source`               | `'aidd-web-report'`.                       |
| `metadata`             | The submitted browser context, if present. |

If the project has a `roadmap.json` that reads back with at least one milestone, the new
feature is assigned a milestone (`roadmapMilestones.ts`). A bug goes to the active milestone,
the first in priority order that still has unfinished features; a feature request goes to the
milestone after it, falling back to the active one when it is the last.

The feature file, plus `roadmap.json` when a milestone was written, is then prettier-formatted
and committed as `chore(aidd): add <remediation|feature> <featureId> from web report`. Both
steps are best-effort: the metadata is already on disk, so a project that is not a git repo
still returns a successful submission.

## Report status

The list view derives a report `status` from the underlying feature
(`featureMapping.ts`):

| Report status | Feature state                                                         |
| ------------- | --------------------------------------------------------------------- |
| `resolved`    | `feature.status === 'completed'`, or `passes === true` at any status. |
| `in_progress` | `feature.status === 'in_progress'`.                                   |
| `open`        | Everything else, including `backlog` and `waiting_approval`.          |

Only features whose `aiddReport.source` is `aidd-web-report` and whose report metadata parses
appear in the list; every other feature in the backlog is skipped.

Because reports are ordinary features, see [feature-fields.md](./feature-fields.md) for the
full record schema and [artifacts.md](./artifacts.md) for where they sit in the `.aidd/`
artifact set.

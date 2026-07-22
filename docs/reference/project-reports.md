# Project Reports

Project reports let an operator file a bug or feature request from the web UI. Rather than
going into a separate table, a report is written into the project's backlog as a
`feature.json` record carrying `aiddReport` metadata, so it flows through the normal feature,
roadmap, and run machinery from the moment it is submitted
(`backend/src/services/projectReports.ts`).

## Submitting

The Reports tab on a project's detail page
(`frontend/src/pages/projects/detail/ReportsTab.tsx`) opens a form: a **kind** (Bug or
Feature), a **description**, and optional metadata. The project picker uses the lightweight
`GET /api/v1/projects/names` endpoint rather than the full metadata listing.

| Endpoint                            | Purpose                                       |
| ----------------------------------- | --------------------------------------------- |
| `GET /api/v1/projects/:id/reports`  | List reports: `{ bugs: [...], lastUpdated }`. |
| `POST /api/v1/projects/:id/reports` | Submit `{ kind, description, metadata? }`.    |

## Classification

If the kind is not given explicitly, `classification.ts` infers it heuristically:

- **Feature** when the description uses request wording ("need a way to", "should be able
  to", "add", "allow") without breakage wording.
- **Bug** when it uses breakage wording ("broken", "error", "crash", "not working", "does
  not") without strong request wording.

The chosen kind and the reason are stored on the record (`classificationReason`).

## Generated feature record

`submitProjectReport` writes `.aidd/features/<featureId>/feature.json`. The id depends on
kind, and a uuid suffix is appended on collision (`uniqueFeatureId`):

| Kind    | Id shape                        |
| ------- | ------------------------------- |
| Bug     | `remediation-<YYYYMMDD>-<slug>` |
| Feature | `<slug>`                        |

The record is a standard feature plus an `aiddReport` block:

| `aiddReport` field     | Meaning                                  |
| ---------------------- | ---------------------------------------- |
| `createdAt`            | Submission time.                         |
| `createdFeatureKind`   | `bug` or `feature` after classification. |
| `originalKind`         | The kind the operator selected (if any). |
| `classificationReason` | Why it was classified that way.          |
| `reportedBy`           | `{ username: 'aidd-web' }`.              |
| `source`               | `'aidd-web-report'`.                     |
| `metadata`             | Optional echo of the submitted metadata. |

If the project has a usable `roadmap.json`, the new feature is assigned a milestone
(`roadmapMilestones.ts`).

## Report status

The list view derives a report `status` from the underlying feature
(`featureMapping.ts`):

| Report status | Feature state                                 |
| ------------- | --------------------------------------------- |
| `open`        | New / backlog.                                |
| `in_progress` | `feature.status === 'in_progress'`.           |
| `resolved`    | `feature.status === 'completed'` or `passes`. |

Because reports are ordinary features, see [feature-fields.md](./feature-fields.md) for the
full record schema and [artifacts.md](./artifacts.md) for where they sit in the `.aidd/`
artifact set.

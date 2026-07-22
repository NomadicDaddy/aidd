# Project Detail Page: Data Sources and Refresh

Page: `/projects/:id`, rendered by `frontend/src/pages/projects/ProjectDetailPage.tsx`

## Primary Data

The page loads one core project detail query. Most tabs consume data from this single response.

### Project Detail

| Field               | Value                                                   |
| ------------------- | ------------------------------------------------------- |
| **Source**          | `GET /api/v1/projects/:id` → `getProject(id)`           |
| **Query key**       | `['project', id]`                                       |
| **staleTime**       | 30 s (default)                                          |
| **Polling**         | None                                                    |
| **WS invalidation** | Reconnect only                                          |
| **Reconnect**       | Yes; `useRealtimeInvalidation` re-fetches `['project']` |

The response is a `ProjectDetail` containing: `features`, `featureStats`, `metadata` (roadmap,
ports, artifact check, local runs/iterations, profile, sync state), `maturityDetail`,
`artifactHealth`, `phase`, `priorityHealth`, and `featureStatus`.

---

## Banner Components

### Active Runs Banner

Shown above the tab bar whenever a run for this project is active.

| Field               | Value                                                         |
| ------------------- | ------------------------------------------------------------- |
| **Source**          | `GET /api/v1/runs` (filtered by `projectPath`) → `listRuns()` |
| **Query key**       | `['runs', projectPath]`                                       |
| **staleTime**       | 30 s (default)                                                |
| **Polling**         | **15 s** while any run for this project is `running`          |
| **WS invalidation** | `run_status`, `suggestion_status`                             |
| **Reconnect**       | Yes                                                           |

### App Launch Control (header)

Start/Stop button in the page header.

| Field               | Value                                                                   |
| ------------------- | ----------------------------------------------------------------------- |
| **Source**          | `GET /api/v1/app-launcher/status/:id` → `getAppLaunchStatus(projectId)` |
| **Query key**       | `['app-launch', projectId]`                                             |
| **staleTime**       | 30 s (default)                                                          |
| **Polling**         | None                                                                    |
| **WS invalidation** | `app_launch` event                                                      |
| **Reconnect**       | Yes                                                                     |

---

## Tab Data Sources

### Overview Tab

All data comes from the primary `['project', id]` query; no additional fetches.

| Section                                            | Source                                                                                          |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **Maturity Overview**                              | `detail.maturityDetail`                                                                         |
| **Feature Progress / Lifecycle / Artifact Health** | `detail.featureStats`, `detail.phase`, `detail.artifactHealth`, `detail.metadata.artifactCheck` |
| **Metadata grid**                                  | `detail.metadata` (ports, stack, versions, roadmap, sync)                                       |
| **Recent Activity**                                | `detail.metadata.localRuns`, `detail.metadata.localIterations`                                  |

### Features Tab

Data primarily from the primary query. Supplements with a runs query for active-run detection.

| Element                   | Source                               | Query Key               | Refresh                                  |
| ------------------------- | ------------------------------------ | ----------------------- | ---------------------------------------- |
| **Feature list**          | `detail.features` from primary query | `['project', id]`       | 30 s stale; reconnect                    |
| **Active run detection**  | `GET /api/v1/runs` (filtered)        | `['runs', projectPath]` | 15 s poll while running; WS `run_status` |
| **Feature detail dialog** | `detail.features` (no extra fetch)   | -                       | -                                        |

Mutations (each invalidates `['project', id]` + `['projects']` on success):

| Action                       | Mutation                                                                        |
| ---------------------------- | ------------------------------------------------------------------------------- |
| **Approve feature**          | `POST /api/v1/projects/:id/features/:featureId/approval`                        |
| **Delete feature**           | `DELETE /api/v1/projects/:id/features/:featureId`                               |
| **Update feature status**    | `PUT /api/v1/projects/:id/features/:featureId/status`                           |
| **Update feature milestone** | `PUT /api/v1/projects/:id/features/:featureId/milestone`                        |
| **Update feature metadata**  | `PATCH /api/v1/projects/:id/features/:featureId/metadata`                       |
| **Launch coding run**        | `POST /api/v1/runs` (invalidates `['runs']`, `['project', id]`, `['projects']`) |

### Dependencies Tab

| Element                  | Source                                   | Query Key                   | Refresh                      |
| ------------------------ | ---------------------------------------- | --------------------------- | ---------------------------- |
| **Graph data**           | Built client-side from `detail.features` | `['project', id]`           | Inherited from primary query |
| **Active run detection** | `GET /api/v1/runs` (filtered)            | `['runs', projectPath]`     | 15 s poll while running      |
| **Launch run from node** | `POST /api/v1/runs`                      | Same as Features tab launch | -                            |

### Runs Tab

| Element               | Source                                                                            | Query Key               | Refresh                                  |
| --------------------- | --------------------------------------------------------------------------------- | ----------------------- | ---------------------------------------- |
| **Recent runs**       | `GET /api/v1/runs` (filtered by `projectPath`)                                    | `['runs', projectPath]` | 15 s poll while running; WS `run_status` |
| **Local run history** | `detail.metadata.localRuns`, `detail.metadata.localIterations` from primary query | `['project', id]`       | 30 s stale; reconnect                    |

### History Tab

All data comes from the primary query; no additional fetches.

| Element             | Source                                                                                                   |
| ------------------- | -------------------------------------------------------------------------------------------------------- |
| **Timeline events** | Built client-side from `detail.features`, `detail.metadata.localRuns`, `detail.metadata.localIterations` |

### Artifacts Tab

All data derived from the primary query, plus maturity skip mutations.

| Element                  | Source                                                                      | Query Key                                                | Refresh               |
| ------------------------ | --------------------------------------------------------------------------- | -------------------------------------------------------- | --------------------- |
| **Artifact groups**      | `detail.metadata.artifactCheck`, `detail.maturityDetail` from primary query | `['project', id]`                                        | 30 s stale; reconnect |
| **Toggle maturity skip** | `POST /api/v1/projects/:id/maturity/skip` (body `{ skip: string[] }`)       | Invalidates `['project', id]`, `['projects']` on success | -                     |

### Interview Tab

| Element                 | Source                                          | Query Key                                                                  | Refresh               |
| ----------------------- | ----------------------------------------------- | -------------------------------------------------------------------------- | --------------------- |
| **Interview questions** | `GET /api/v1/projects/:id/interview`            | `['project-interview', id]`                                                | 30 s stale; reconnect |
| **Submit answer**       | `POST /api/v1/projects/:id/interview/responses` | Invalidates `['project-interview', id]`, `['project', id]`, `['projects']` | -                     |

### Reports Tab

| Element         | Source                             | Query Key                 | Refresh               |
| --------------- | ---------------------------------- | ------------------------- | --------------------- |
| **Bug reports** | `GET /api/v1/projects/:id/reports` | `['project-reports', id]` | 30 s stale; reconnect |

### Audits Tab

This tab has its own dedicated queries.

| Element              | Source                                            | Query Key                                                                                    | Refresh               |
| -------------------- | ------------------------------------------------- | -------------------------------------------------------------------------------------------- | --------------------- |
| **Project audits**   | `GET /api/v1/audits/project/:projectId`           | `['audits', 'project', projectId]`                                                           | 30 s stale; reconnect |
| **Audit overrides**  | `GET /api/v1/audits/project-overrides/:projectId` | `['audits', 'project-overrides', projectId]`                                                 | 30 s stale; reconnect |
| **Update overrides** | `PUT /api/v1/audits/project-overrides/:projectId` | Invalidates `['audits', 'project-overrides', id]`, `['audits', 'project', id]`, `['audits']` | -                     |
| **Launch audits**    | `POST /api/v1/audits/launch`                      | Invalidates `['runs']`, `['director', 'fleet']`, `['audits', 'project', id]`                 | -                     |

### Profile Tab

Data from primary query, with save mutation.

| Element             | Source                                       | Query Key                                     | Refresh    |
| ------------------- | -------------------------------------------- | --------------------------------------------- | ---------- |
| **Profile display** | `detail.metadata.profile` from primary query | `['project', id]`                             | 30 s stale |
| **Save profile**    | `PUT /api/v1/projects/:id/profile`           | Invalidates `['project', id]`, `['projects']` | -          |

### Management Tab

Data from primary query plus settings/recipes queries for move and delete operations.

| Element              | Source                           | Query Key                                                                          | Refresh    |
| -------------------- | -------------------------------- | ---------------------------------------------------------------------------------- | ---------- |
| **Settings (roots)** | `GET /api/v1/settings/config`    | `['settings-config']`                                                              | 30 s stale |
| **Recipes**          | `GET /api/v1/recipes`            | `['recipes']`                                                                      | 30 s stale |
| **Delete project**   | `DELETE /api/v1/projects/:id`    | Invalidates `['project', id]`, `['projects']`, `['runs']`, `['director', 'fleet']` |
| **Move project**     | `POST /api/v1/projects/:id/move` | Invalidates `['project', id]`, `['projects']`, `['runs']`, `['director', 'fleet']` |

---

## Refresh Trigger Summary

| Trigger                   | Queries invalidated                                                                                          |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| TanStack staleTime (30 s) | All (auto-refetch on mount after stale)                                                                      |
| Polling (15 s)            | `['runs', projectPath]`, only while any run is `running`                                                     |
| WS `run_status`           | `['runs']`, `['telemetry']`, `['diary']`                                                                     |
| WS `app_launch`           | `['port-status']`, `['app-launch', id]`, `['app-launch-all']`                                                |
| WS `director_cycle`       | `['director-cycles']`, `['runs']`, `['run-output']`, `['suggestions']`, `['director', 'fleet']`              |
| WS `suggestion_status`    | `['suggestions']`, `['runs']`, `['director', 'fleet']`                                                       |
| WS reconnect              | `['project', id]`, `['projects']`, `['runs']`, `['port-status']`, `['app-launch-all']`, `['app-launch', id]` |
| Tab mutations             | Each invalidates relevant keys on success (see per-tab tables above)                                         |

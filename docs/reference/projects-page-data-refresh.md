# Projects List Page: Data Sources and Refresh

Page: `/projects` (`frontend/src/pages/projects/ProjectsPage.tsx`)

## Primary Data

### Project List

The entire page is driven by a single query.

| Field               | Value                                                    |
| ------------------- | -------------------------------------------------------- |
| **Source**          | `GET /api/v1/projects` → `listProjects()`                |
| **Query key**       | `['projects']`                                           |
| **staleTime**       | 30 s                                                     |
| **Polling**         | None                                                     |
| **WS invalidation** | `suggestion_status` (indirect via mutation handlers)     |
| **Reconnect**       | Yes: `useRealtimeInvalidation` re-fetches `['projects']` |
| **Manual refresh**  | "Discover" button calls `projects.refetch()`             |

The response provides `projects`, `skippedRoots`, and `initFailures`. All three lists are rendered
directly from this single query.

---

## Inline Sub-Components

These components render inside the project list rows/cards and issue their own queries.

### App Launch Status (per-card / per-row)

| Field               | Value                                                           |
| ------------------- | --------------------------------------------------------------- |
| **Source**          | `GET /api/v1/app-launcher/status` → `getAllAppLaunchStatuses()` |
| **Query key**       | `['app-launch-all']`                                            |
| **staleTime**       | 30 s (default)                                                  |
| **Polling**         | None                                                            |
| **WS invalidation** | `app_launch` event                                              |
| **Reconnect**       | Yes                                                             |

### Port Status (per-card / per-row)

| Field               | Value                                                  |
| ------------------- | ------------------------------------------------------ |
| **Source**          | `GET /api/v1/projects/port-status` → `getPortStatus()` |
| **Query key**       | `['port-status']`                                      |
| **staleTime**       | 15 s                                                   |
| **Polling**         | None                                                   |
| **WS invalidation** | `app_launch` event                                     |
| **Reconnect**       | Yes                                                    |

---

## Side Panels

### Project Intake Panel

Opened by "Import" or "New Project" actions. Composed of:

| Element                     | Source                                       | Query Key                              | Refresh                                   |
| --------------------------- | -------------------------------------------- | -------------------------------------- | ----------------------------------------- |
| **Import candidates**       | `GET /api/v1/projects/import-candidates`     | `['projects', 'import-candidates']`    | 30 s stale; invalidated on import success |
| **Intake preview**          | `GET /api/v1/projects/intake-preview?path=…` | `['projects', 'intake-preview', path]` | 30 s stale; fetched on demand per path    |
| **Spernakit template list** | Loaded from settings/recipes context         | None                                   | None                                      |

### Project Init Failures

Rendered from `initFailures` in the project list response; no separate query.

### Skipped Roots Warning

Rendered from `skippedRoots` in the project list response; no separate query.

---

## Client-Side Filtering and Sorting

All filtering and sorting is performed client-side in `useProjectsFilters.ts` against the cached
project list. No additional API calls are triggered by filter changes. Available filters:

- Text search (`query`)
- Root filter
- Phase filter
- Maturity filter
- Milestone filter
- Sync state filter
- Sort key / direction

---

## Mutations (actions that trigger refresh)

| Action                   | Mutation                                          | Queries invalidated on success                                                                                                       |
| ------------------------ | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| **Create project**       | `POST /api/v1/projects`                           | `['projects']`, `['projects', 'import-candidates']`, `['runs']`, `['director', 'fleet']`                                             |
| **Import projects**      | `POST /api/v1/projects/import`                    | `['projects']`, `['projects', 'import-candidates']`, `['pipeline-sessions']`, `['runs']`, `['director', 'fleet']`, `['suggestions']` |
| **Dismiss init failure** | `POST /api/v1/projects/init-failures/:id/dismiss` | `['projects']`                                                                                                                       |
| **Retry init failure**   | `POST /api/v1/projects/init-failures/:id/retry`   | `['projects']`, `['runs']`, `['pipeline-sessions']`                                                                                  |

---

## Refresh Trigger Summary

| Trigger                   | Queries invalidated                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------- |
| TanStack staleTime (30 s) | All (auto-refetch on mount after stale)                                                   |
| WS `app_launch`           | `['port-status']`, `['app-launch', id]`, `['app-launch-all']`                             |
| WS `run_status`           | `['runs']`, `['telemetry']`, `['diary']`                                                  |
| WS reconnect              | `['projects']`, `['runs']`, `['port-status']`, `['app-launch-all']`, `['app-launch', id]` |
| Manual "Discover" button  | `['projects']`                                                                            |

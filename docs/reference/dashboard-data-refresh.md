# Dashboard Data Sources and Refresh

This page documents every main element on the aidd dashboard
(`frontend/src/pages/dashboard/DashboardPage.tsx`), the API endpoint that supplies it, the TanStack
Query key that caches it, and how the data is kept fresh.

## Global Defaults

| Setting                | Value                                                                               |
| ---------------------- | ----------------------------------------------------------------------------------- |
| `staleTime`            | **30 s** (`App.tsx` QueryClient default)                                            |
| `refetchOnWindowFocus` | `false`                                                                             |
| Realtime invalidation  | WebSocket via `useRealtimeInvalidation` (`hooks/useRealtimeInvalidation.ts`)        |
| Manual refresh         | `DataFreshness` button calls `refreshDashboard()`, refetching all 5 primary queries |

Queries that don't specify their own `staleTime` or `refetchInterval` inherit the 30 s default.

---

## Top Metric Tiles

Four tiles rendered by `<Metric>` (`Metric.tsx`).

### Projects

| Field               | Value                                                 |
| ------------------- | ----------------------------------------------------- |
| **Source**          | `GET /api/v1/projects` → `listProjects()`             |
| **Query key**       | `['projects']`                                        |
| **staleTime**       | 30 s                                                  |
| **Polling**         | None                                                  |
| **WS invalidation** | `suggestion_status` (indirect, via mutation handlers) |
| **Reconnect**       | Yes                                                   |

### Active Runs

| Field               | Value                                                                          |
| ------------------- | ------------------------------------------------------------------------------ |
| **Source**          | `GET /api/v1/runs` → `listRuns()`                                              |
| **Query key**       | `['runs', 'all']` (`useRuns()` keys by project path, `'all'` on the dashboard) |
| **staleTime**       | 30 s (default)                                                                 |
| **Polling**         | **15 s**, only while any run is `running` (`refetchInterval` in `useRuns()`)   |
| **WS invalidation** | `run_status`, `suggestion_status`                                              |
| **Reconnect**       | Yes                                                                            |

### Priority Health

| Field         | Value                                                                                                     |
| ------------- | --------------------------------------------------------------------------------------------------------- |
| **Source**    | Computed: `percent(fleetFeaturePassing, fleetFeatureTotal)` from `['projects']` + `['director', 'fleet']` |
| **Query key** | Inherited from parents                                                                                    |
| **Refresh**   | Refreshes when either parent query refreshes                                                              |
| **Fallback**  | `fleet.fleetAggregations.featurePassRate` when local list is empty                                        |

### Suggestions

| Field               | Value                                                    |
| ------------------- | -------------------------------------------------------- |
| **Source**          | `GET /api/v1/director/suggestions` → `listSuggestions()` |
| **Query key**       | `['suggestions']`                                        |
| **staleTime**       | 30 s (default)                                           |
| **Polling**         | None                                                     |
| **WS invalidation** | `suggestion_status`, `director_cycle`                    |
| **Reconnect**       | Yes                                                      |

---

## Dashboard Cards

Rendered by `<SortableDashboardGrid>`.

### Fleet Health

| Field               | Value                                              |
| ------------------- | -------------------------------------------------- |
| **Source**          | `GET /api/v1/director/fleet` → `getFleetSummary()` |
| **Query key**       | `['director', 'fleet']`                            |
| **staleTime**       | 30 s (default)                                     |
| **Polling**         | None                                               |
| **WS invalidation** | `director_cycle`, `suggestion_status`              |
| **Reconnect**       | Yes                                                |

### Active Runs Card

| Field         | Value                                              |
| ------------- | -------------------------------------------------- |
| **Source**    | Same as the Active Runs metric: `GET /api/v1/runs` |
| **Query key** | `['runs', 'all']`                                  |
| **Refresh**   | 15 s poll while running, WS `run_status`, manual   |

### Feature Summary

| Field               | Value                                     |
| ------------------- | ----------------------------------------- |
| **Source**          | `GET /api/v1/projects` → `listProjects()` |
| **Query key**       | `['projects']`                            |
| **staleTime**       | 30 s                                      |
| **Polling**         | None                                      |
| **WS invalidation** | Via mutation handlers                     |
| **Reconnect**       | Yes                                       |

### Feature Queue

| Field         | Value                                                                      |
| ------------- | -------------------------------------------------------------------------- |
| **Source**    | `GET /api/v1/director/fleet` → `buildFeatureQueue()` (derived client-side) |
| **Query key** | `['director', 'fleet']`                                                    |
| **Refresh**   | Same as Fleet Health card                                                  |

### Feature Status

| Field         | Value                                                                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Source**    | `GET /api/v1/projects` (list) + per-project `GET /api/v1/projects/:id` (detail)                                                                            |
| **Query key** | `['projects']` + `['project', id]` per project                                                                                                             |
| **staleTime** | List: 30 s. Per-project: 30 s                                                                                                                              |
| **Lazy load** | Per-project detail fetched when `featureStats.total > 0` and `featureStatus` is missing from the list response, or when `featureStats.waitingApproval > 0` |
| **Polling**   | None                                                                                                                                                       |
| **Reconnect** | Yes                                                                                                                                                        |

### Project Health

| Field               | Value                                                       |
| ------------------- | ----------------------------------------------------------- |
| **Source**          | `GET /api/v1/projects` + `GET /api/v1/projects/port-status` |
| **Query key**       | `['projects']` + `['port-status']`                          |
| **staleTime**       | Projects: 30 s. Port status: 15 s                           |
| **Polling**         | None                                                        |
| **WS invalidation** | `app_launch` → `['port-status']`                            |
| **Reconnect**       | Yes                                                         |

### Director Queue

| Field               | Value                                                    |
| ------------------- | -------------------------------------------------------- |
| **Source**          | `GET /api/v1/director/suggestions` → `listSuggestions()` |
| **Query key**       | `['suggestions']`                                        |
| **staleTime**       | 30 s (default)                                           |
| **Polling**         | None                                                     |
| **WS invalidation** | `suggestion_status`, `director_cycle`                    |
| **Reconnect**       | Yes                                                      |

### Waiting Approval

| Field         | Value                                                                                |
| ------------- | ------------------------------------------------------------------------------------ |
| **Source**    | Derived from `['suggestions']`, the run list, and the Feature Status project details |
| **Query key** | Inherited from parents                                                               |
| **Refresh**   | Refreshes when any parent query refreshes                                            |

---

## Active Cycle Banner

Shown conditionally when a cycle with `status === 'running'` exists.

| Field               | Value                                                          |
| ------------------- | -------------------------------------------------------------- |
| **Source**          | `GET /api/v1/director/cycles` → `listDirectorCycles()`         |
| **Query key**       | `['director-cycles']`                                          |
| **staleTime**       | 30 s (default)                                                 |
| **Polling**         | None                                                           |
| **WS invalidation** | `director_cycle`                                               |
| **Reconnect**       | Yes                                                            |
| **Elapsed timer**   | `useNow(true)` ticks every 1 s (display-only, no data refetch) |

---

## Refresh Trigger Summary

| Trigger                   | Queries invalidated                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------- |
| TanStack staleTime (30 s) | All (auto-refetch on mount after stale)                                                         |
| Polling (15 s)            | `['runs']`, only while any run is `running`                                                     |
| WS `run_status`           | `['runs']`, `['telemetry']`, `['diary']`                                                        |
| WS `director_cycle`       | `['director-cycles']`, `['runs']`, `['run-output']`, `['suggestions']`, `['director', 'fleet']` |
| WS `suggestion_status`    | `['suggestions']`, `['runs']`, `['director', 'fleet']`                                          |
| WS `app_launch`           | `['port-status']`, `['app-launch', id]`, `['app-launch-all']`                                   |
| WS reconnect              | All dashboard query keys                                                                        |
| Manual Refresh button     | `['projects']`, `['runs']`, `['director', 'fleet']`, `['suggestions']`, `['director-cycles']`   |

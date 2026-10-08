# WebSocket Event Contract

The web backend pushes real-time updates to the browser over a single socket at `/api/v1/ws`
(`backend/src/routes/ws.ts`, `backend/src/webSocketHub.ts`). This page is the contract of record: the
complete set of events, what triggers each, the payload it carries, and the React Query keys the
frontend invalidates in response.

The contract is enforced in code by the `WebSocketEvent` discriminated union in
**`shared/src/contracts/websocket.ts`** (imported as `aidd-shared/contracts/websocket`; the single
source of truth):

- the hub's `broadcast()` accepts only a `WebSocketEvent`, so an unlisted or mistyped event is a
  compile error at the emit site; and
- the frontend handler (`frontend/src/hooks/useRealtimeInvalidation.ts`) switches **exhaustively** over
  `WebSocketEventType` with an `assertHandled(_: never)` default, so adding an event to the union
  without wiring its invalidation breaks the build.

To add an event, add it to the union; the compiler then forces both the emitter and frontend
invalidation handler to be updated.

## Events

| Event               | Domain       | Trigger                                                                                       | Payload                                                                                   | Invalidates (query keys)                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------- | ------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `run_status`        | Runs         | Run launch / status transition / termination / heartbeat reconciliation / control (stop/kill) | `{ status, exitCode?, stopReason?, summary?, error?, source?, stopRequested? }` + `runId` | `['runs']`, `['projects']`, `['project']`, `['telemetry']`, `['diary']`, `['pipeline-session-report']` (`['project']` because the open project page derives its blueprint wording from live run state; also drives a completion toast for UI-launched runs via `useLaunchedRunToasts`, and mirrors `stopRequested`/terminal transitions into the local stop-request set in `lib/stopRequests.ts` so run rows flip to "Stopping…" ahead of the refetch) |
| `run_output`        | Runs         | Tail watcher reads new stdout bytes for a live run                                            | `{ chunk, stream: 'stdout' }` + `runId`                                                   | none; consumed directly by `useRunLiveOutput` (appends to React state)                                                                                                                                                                                                                                                                                                                                                                                 |
| `pipeline_status`   | Pipeline     | Pipeline session status change (queued → running → completed/failed)                          | `{ sessionId, status }`                                                                   | `['pipeline-sessions']`, `['telemetry']`, `['diary']`, `['project']`, `['pipeline-session-report', sessionId]`                                                                                                                                                                                                                                                                                                                                         |
| `pipeline_progress` | Pipeline     | A top-level step becomes active or terminal                                                   | `{ sessionId, completedTopLevelSteps, activeTopLevelStep }`                               | `['pipeline-sessions']`, `['pipeline-session-report', sessionId]`                                                                                                                                                                                                                                                                                                                                                                                      |
| `director_cycle`    | Director     | Director cycle stage/status transition                                                        | `{ cycleId, stage, status, totalSuggestions?, directAiMeta? }`                            | `['director-cycles']`, `['runs']`, `['run-output']`, `['suggestions']`, `['director', 'fleet']`                                                                                                                                                                                                                                                                                                                                                        |
| `suggestion_status` | Director     | A suggestion is dismissed or launched                                                         | `{ id, status: 'dismissed' \| 'launched', launchedRunId?, launchedPipelineSessionId? }`   | `['suggestions']`, `['runs']`, `['pipeline-sessions']`, `['director', 'fleet']`                                                                                                                                                                                                                                                                                                                                                                        |
| `app_launch`        | App launcher | A project's app starts or stops (its dev/start ports come up or down)                         | `{ projectId, status }`                                                                   | `['app-launch-all']`, `['port-status']`, `['projects', 'dashboard-summary']` (the Dashboard reads port state out of its own summary), `['app-launch', projectId]`                                                                                                                                                                                                                                                                                      |
| `connected`         | Transport    | Server confirms a successful connection                                                       | `{ connected: true }`                                                                     | none; handled in `useWebSocket` (confirms the connection / fires reconnect listeners)                                                                                                                                                                                                                                                                                                                                                                  |
| `ack`               | Transport    | Server echoes a client message                                                                | `<echoed message>`                                                                        | none                                                                                                                                                                                                                                                                                                                                                                                                                                                   |

Emitters: `services/run/*` (`run_status`, `run_output`), `services/pipeline/broadcastService.ts`
(`pipeline_status`, `pipeline_progress`), `services/director/cyclePersistence.ts`
(`director_cycle`),
`services/director/suggestionService.ts` (`suggestion_status`),
`services/appLauncher/launcher.ts` (`app_launch`), `routes/ws.ts` (`connected`, `ack`).

Invalidation is **coalesced**, not immediate: `useRealtimeInvalidation` routes every key through
`createInvalidationCoalescer` (`frontend/src/lib/invalidationCoalescer.ts`), which collects the keys
a burst touches, flushes each once after a 250ms window, and holds a key back while its refetch is
in flight. A fleet-wide fan-out therefore costs one refetch per key rather than one per frame.
Anything that must react instantly (a stop request flipping a row to "Stopping…") does so from local
state instead.

On socket **reconnect**, `useRealtimeInvalidation` invalidates `realtimeReconnectKeys` from
`frontend/src/hooks/realtimeInvalidationKeys.ts` to recover any events missed while disconnected.
That set is not hand-written: it is derived from `realtimeEventInvalidations`, the per-event table
the live handler also reads, as the union of every key and scoped prefix any event invalidates,
plus any declared `reconnectOnlyKeys` (empty today: `['project']` moved onto `run_status` and
`pipeline_status`, because the project page's blueprint status must refresh during a session and
not only after a reconnect), reduced to prefixes so `['projects']` covers `['projects', 'dashboard-summary']` in one refetch. A
key a live event refreshes therefore cannot go missing from reconnect, and
`test/frontend/realtime-reconnect-coverage.test.ts` asserts the parity. `['run-output']` is in the
set as well; the live console additionally resyncs itself through `useRunLiveOutput`'s own reconnect
handler, which refetches the full-log snapshot.

## Intentional polling backstops (do not "fix")

A few queries keep a poll interval **on purpose**, as self-healing backstops against a missed
broadcast. These are not gaps in WS coverage and should not be removed, nor should new polling be
added elsewhere; extend the event contract instead.

| Location                                                                                                             | Polls while…                                                 | Interval | Why it exists                                                                                                                                                                                                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | -------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `frontend/src/hooks/useRunsList.ts` (the `['runs', …]` list the Dashboard, the Runs page and the navbar badge share) | any run on the loaded pages is `queued` or `running`         | 15s      | Backstop for a missed terminal `run_status`; `useActiveRunCount` reads this query's first page and has no poll of its own                                                                                                                                              |
| `frontend/src/hooks/useActivePipelineSessionCount.ts` (`['pipeline-sessions', 'active-count']`, navbar badge)        | the count is above zero                                      | 15s      | Backstop for a missed terminal pipeline broadcast; `pipeline_status`/`pipeline_progress` already cover the key, so it was cut from 3s in f1918682                                                                                                                      |
| `frontend/src/hooks/usePipelineSessions.ts` (`usePipelineSessionReport`)                                             | the selected session is `queued` / `running`                 | 3s       | Backstop for a missed scoped broadcast: `pipeline_status` and `pipeline_progress` invalidate `['pipeline-session-report', sessionId]` directly, so the report already moves on the event; the hook carries a `poll-justified` comment for its sub-five-second interval |
| `frontend/src/hooks/useRunLiveOutput.ts`                                                                             | the selected run is `running` and has produced no output yet | 2s       | Recovery if the initial `run_output` batch is missed on connect (a `setInterval` refetch, not `refetchInterval`)                                                                                                                                                       |

Each polls only while the relevant work is active and stops once it settles, so steady-state UI is
push-driven.

Separately, two groups poll unconditionally because they have no corresponding WS event at all.
They are an always-on category rather than a backstop:

- the system/web-vitals metric queries (`frontend/src/hooks/useMetrics.ts`): `['system-metrics']`
  every 5s, `['web-vitals-summary']` every 30s. Metrics are sampled data.
- the sidebar counts (`frontend/src/hooks/useNavCounts.ts`): `['nav-counts']` every 60s, because the
  scheduler completes a once-task with no mutation and no event, so the mounted sidebar would hold
  the old Scheduled count until a reload.
- the scheduled-task queries (`frontend/src/hooks/useScheduledTasks.ts`): `['scheduled-tasks']`
  every 30s, and its executions page (`['scheduled-tasks', id, 'executions', limit]`) every 15s.
  The contract carries no scheduled-task event, so the scheduler's own progress is invisible to
  the socket.

`test/frontend/hook-poll-floor.test.ts` refuses any hook poll under five seconds that lacks a
`poll-justified:` comment. Before re-introducing any other poll interval, confirm whether the gap is a missing
event in the contract above. If so, add the event rather than polling.

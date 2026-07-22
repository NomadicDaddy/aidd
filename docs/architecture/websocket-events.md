# WebSocket Event Contract

The web backend pushes real-time updates to the browser over a single socket at `/api/v1/ws`
(`backend/src/routes/ws.ts`, `backend/src/webSocketHub.ts`). This page is the contract of record: the
complete set of events, what triggers each, the payload it carries, and the React Query keys the
frontend invalidates in response.

The contract is enforced in code by the `WebSocketEvent` discriminated union in
**`aidd-shared/contracts/websocket.ts`** (the single source of truth):

- the hub's `broadcast()` accepts only a `WebSocketEvent`, so an unlisted or mistyped event is a
  compile error at the emit site; and
- the frontend handler (`frontend/src/hooks/useRealtimeInvalidation.ts`) switches **exhaustively** over
  `WebSocketEventType` with an `assertHandled(_: never)` default, so adding an event to the union
  without wiring its invalidation breaks the build.

To add an event, add it to the union; the compiler then forces both the emitter and frontend
invalidation handler to be updated.

## Events

| Event               | Domain       | Trigger                                                                                       | Payload                                                                                   | Invalidates (query keys)                                                                                                                                                                                                                                                               |
| ------------------- | ------------ | --------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `run_status`        | Runs         | Run launch / status transition / termination / heartbeat reconciliation / control (stop/kill) | `{ status, exitCode?, stopReason?, summary?, error?, source?, stopRequested? }` + `runId` | `['runs']`, `['telemetry']`, `['diary']` (also drives a launch toast for UI-initiated runs via `useLaunchedRunToasts`, and mirrors `stopRequested`/terminal transitions into the local stop-request set in `lib/stopRequests.ts` so run rows flip to "Stopping…" ahead of the refetch) |
| `run_output`        | Runs         | Tail watcher reads new stdout bytes for a live run                                            | `{ chunk, stream: 'stdout' }` + `runId`                                                   | none; consumed directly by `useRunLiveOutput` (appends to React state)                                                                                                                                                                                                                 |
| `pipeline_status`   | Pipeline     | Pipeline session status change (queued → running → completed/failed)                          | `{ sessionId, status }`                                                                   | `['pipeline-sessions']`, `['telemetry']`, `['diary']`, `['pipeline-session-report', sessionId]`                                                                                                                                                                                        |
| `director_cycle`    | Director     | Director cycle stage/status transition                                                        | `{ cycleId, stage, status, totalSuggestions?, directAiMeta? }`                            | `['director-cycles']`, `['runs']`, `['run-output']`, `['suggestions']`, `['director', 'fleet']`                                                                                                                                                                                        |
| `suggestion_status` | Director     | A suggestion is dismissed or launched                                                         | `{ id, status: 'dismissed' \| 'launched', launchedRunId?, launchedPipelineSessionId? }`   | `['suggestions']`, `['runs']`, `['pipeline-sessions']`, `['director', 'fleet']`                                                                                                                                                                                                        |
| `app_launch`        | App launcher | A project's app starts or stops (its dev/start ports come up or down)                         | `{ projectId, status }`                                                                   | `['app-launch-all']`, `['app-launch', projectId]`, `['port-status']`                                                                                                                                                                                                                   |
| `connected`         | Transport    | Server confirms a successful connection                                                       | `{ connected: true }`                                                                     | none; handled in `useWebSocket` (confirms the connection / fires reconnect listeners)                                                                                                                                                                                                  |
| `ack`               | Transport    | Server echoes a client message                                                                | `<echoed message>`                                                                        | none                                                                                                                                                                                                                                                                                   |

Emitters: `services/run/*` (`run_status`, `run_output`), `services/pipeline/broadcastService.ts`
(`pipeline_status`), `services/director/cyclePersistence.ts` (`director_cycle`),
`services/director/suggestionService.ts` (`suggestion_status`),
`services/appLauncher/launcher.ts` (`app_launch`), `routes/ws.ts` (`connected`, `ack`).

On socket **reconnect**, the frontend invalidates the union of all the above keys (plus `['project']`
/ `['projects']`) to recover any events missed while disconnected
(`useRealtimeInvalidation`'s `handleReconnect`).

## Intentional polling backstops (do not "fix")

A few queries keep a `refetchInterval` **on purpose**, as self-healing backstops against a missed
broadcast. These are not gaps in WS coverage and should not be removed, nor should new polling be
added elsewhere; extend the event contract instead.

| Location                                                          | Polls while…                              | Interval | Why it exists                                                           |
| ----------------------------------------------------------------- | ----------------------------------------- | -------- | ----------------------------------------------------------------------- |
| `frontend/src/hooks/useRuns.ts`                                   | any run has `status === 'running'`        | 15s      | Backstop for a missed terminal `run_status` on the Active Runs table    |
| `frontend/src/hooks/useActiveRunCount.ts`                         | any run has `status === 'running'`        | 15s      | Backstop for the navbar active-run badge                                |
| `frontend/src/hooks/usePipelineSessions.ts` (list, report, count) | a session is `queued` / `running`         | 3s       | Backstop for a missed `pipeline_status` transition (incl. navbar badge) |
| `frontend/src/hooks/useRunLiveOutput.ts`                          | a selected run has produced no output yet | 2s       | Recovery if the initial `run_output` batch is missed on connect         |

Each polls only while the relevant work is active and stops once it settles, so steady-state UI is
push-driven.

Separately, the system/web-vitals metric queries (`frontend/src/hooks/useMetrics.ts`) poll
unconditionally (`['system-metrics']` every 5s, `['web-vitals-summary']` every 30s) because
metrics are sampled data with no corresponding WS event. They are an always-on category rather
than a backstop.

Before re-introducing any other `refetchInterval`, confirm whether the gap is a missing
event in the contract above. If so, add the event rather than polling.

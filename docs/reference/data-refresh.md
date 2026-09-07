# Data Refresh Model

How the web control panel keeps what it shows current. This is the model — the defaults, the four
mechanisms, and the contract between them. It is deliberately not a per-widget catalog: the
authoritative mapping from an element to its query lives in the page component and the hook it
calls, and a catalog of those goes stale the day a hook changes.

## Defaults

Every query inherits the `QueryClient` defaults in `frontend/src/App.tsx`:

| Setting                | Value   |
| ---------------------- | ------- |
| `staleTime`            | 30 s    |
| `refetchOnWindowFocus` | `false` |

`staleTime` is a floor on refetch-on-mount, not a refresh interval. Concurrent component mounts
share one fetch instead of each refetching the same key, and freshness comes from the mechanisms
below — all of which override `staleTime`.

## The four mechanisms

**1. Realtime invalidation.** `frontend/src/hooks/useRealtimeInvalidation.ts` subscribes to the
WebSocket and invalidates query keys per event type. This is the primary mechanism; the event
contract is `aidd-shared/contracts/websocket` and
[docs/architecture/websocket-events.md](../architecture/websocket-events.md). The switch is
exhaustive against `WebSocketEventType` by construction — `assertHandled(eventType)` in the
`default` arm makes `eventType` `never`, so adding an event to the contract breaks the build until a
case is added. That is what stops an uncovered event from being "fixed" by re-introducing polling.

Two events have no cache effect and say so in place: `ack` and `connected` are transport frames
handled in `useWebSocket`, and `run_output` is consumed directly by `useRunLiveOutput`, which
appends to React state rather than to a query.

**2. Burst coalescing.** Invalidations do not reach React Query directly. They go through
`frontend/src/lib/invalidationCoalescer.ts`, which holds one outstanding refetch per key over a
250 ms window. A run fanning out over a fleet emits a `run_status` frame per project, and each
frame used to invalidate `['runs']` and `['projects']` on its own; React Query cancels the in-flight
refetch and starts a new one per invalidation, so a burst became a burst of requests — the backend
served seven concurrent `GET /api/v1/runs` and nine `GET /api/v1/projects` in full, because a
cancelled fetch is only cancelled at the browser. An event landing mid-flight is not dropped: it
re-queues the key, and the flush after the refetch settles covers it. The window is short enough
that no operator reads it as lag, because the parts of the UI that must react instantly — a stop
request flipping a row to "Stopping…" — do so from local state, not from the refetch.

**3. Conditional polling.** A few queries poll, and each one polls only while something is active:

| Query                                                                     | Interval | Condition                       |
| ------------------------------------------------------------------------- | -------- | ------------------------------- |
| `['runs', …]` lists, `['runs','active-count']`                            | 15 s     | a run is `running`              |
| `['pipeline-sessions','active-count']`, `['pipeline-session-report', id]` | 3 s      | a session is `queued`/`running` |
| `['scheduled-tasks']`                                                     | 30 s     | always                          |
| `['scheduled-tasks', id, 'executions', n]`                                | 15 s     | always                          |
| `['system-metrics']`                                                      | 5 s      | always                          |
| `['web-vitals-summary']`                                                  | 30 s     | always                          |

Every conditional poller sets `refetchIntervalInBackground: false`, so a hidden tab stops polling.
Polling is a fallback for socket loss and for the nav badges, not the refresh path — a new poll
added because an event was missed is a bug in the event coverage.

**4. Manual refresh.** `frontend/src/components/shared/DataFreshness.tsx` renders the age of a
surface's primary query, a disclosure attributing age, loading, and errors to every query the
surface represents, and one refresh button. Only an operator-triggered refresh writes to the polite
live region, once, when the whole multi-query refresh settles.

## Key structure

React Query invalidation is a prefix match, element by element, and the key layout depends on it:

- `['runs']` covers every runs list and `['runs','active-count']`. A per-project runs query is
  keyed `['runs', projectPath, scope]` specifically so `run_status` invalidation reaches it.
- `['pipeline-session-report']` with no id invalidates every loaded report.
- `['director', 'fleet']` is two elements. Invalidating `['director']` instead would over-broaden
  to the director profile and chat keys, so the fleet key is named in full.

A key that a handler invalidates but reconnect omits stays stale until its own poll or a later
event happens to fire — see below.

## The reconnect contract

`handleReconnect` runs after the socket comes back, typically after a backend restart, and refetches
the keys whose updates were missed while the socket was down. Two properties hold it in tension:

- It must cover every key the event handlers invalidate. A key updated by the socket but skipped on
  reconnect is exactly the stale surface reconnect exists to fix.
- It must stay a bounded list of keys rather than a whole-cache invalidation. Several tabs reconnect
  together, and that burst is the heaviest moment the panel has.

A key that is correctly absent — one with no realtime producer, such as `run_output` — stays absent,
and the reason belongs next to the omission.

## Adding a query

1. Pick a key whose prefix already receives the invalidation you need, or add the key to the event
   handler that produces its data.
2. If you add it to a handler, add it to `handleReconnect` too.
3. Reach for `refetchInterval` only when there is no event that produces the data, and gate it on an
   active-work predicate with `refetchIntervalInBackground: false`.
4. Register the query with the page's `DataFreshness` sources so the operator can see its age and
   refresh it.

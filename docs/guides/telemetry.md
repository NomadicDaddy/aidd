# Telemetry

aidd records every skill, recipe, and run it executes into a local table so you can see what has
been run, how often, on which backends, what it produced, and how it ended. The dashboard lives on
the `/telemetry` page and includes an in-product inventory of everything described here.

> **Local only.** Telemetry is written to the local SQLite database and never leaves the
> machine: there are no outbound calls in the telemetry service or routes, no cloud sync,
> and no third-party analytics. This is the "local data / no telemetry by default" posture
> stated in [`PRIVACY.md`](../../PRIVACY.md).

## What is recorded

Each invocation is a row in the `invocation_events` table (`backend/src/db/schema.ts`). Key
fields:

| Field                                      | Meaning                                                               |
| ------------------------------------------ | --------------------------------------------------------------------- |
| `id`                                       | `inv_<timestamp>_<uuid>`.                                             |
| `resourceType`                             | `skill` · `recipe` · `run`.                                           |
| `resourceId` / `resourceName`              | Which catalog entry or run.                                           |
| `source`                                   | `cli` · `recipe-step` · `web`.                                        |
| `status`                                   | `running` · `completed` · `failed` · `killed` · `stopped`.            |
| `startedAt` / `completedAt` / `durationMs` | Timing.                                                               |
| `exitCode` / `errorMessage`                | Outcome detail.                                                       |
| `backend` / `model`                        | Where it ran.                                                         |
| `projectName` / `projectPath`              | Against which project.                                                |
| `runId` / `sessionId`                      | Links to the run / pipeline session.                                  |
| `parentInvocationId` / `parentResource*`   | Nesting for recipe steps.                                             |
| `argsPresent`                              | Whether arguments were supplied (the args themselves are not stored). |

A row is created with `status: 'running'` when work starts and updated to a terminal status when it
finishes. On web startup, stale running invocations are reconciled against authoritative run facts.

Every top-level launch and every nested recipe or skill step is a separate invocation. The
dashboard therefore displays total, top-level, and nested counts separately. Outcome counts are
also mutually exclusive: completed, warnings, failed, flagged, stopped, killed, no work, and running
always add up to the total. Run-backed rows use the same outcome classifier as the Runs page; a warning is
not a failure, and stopped, killed, or no-work outcomes are never relabeled as failed.

The recent-invocations table exposes an **Inspect** control for every row. It displays the exact
stored identifiers, project path, timestamps, hierarchy, run/session links, raw and authoritative
statuses, exit code, and error text. Argument values are not available because the invocation
ledger deliberately stores only the `argsPresent` boolean. (Launch arguments for a run are a
separate matter: `runs.command_args_json` does retain them so the Runs page can show the exact
launch command.)

## Run output metrics

Each terminal run also records what it produced: `lines_added` / `lines_removed` /
`files_changed` (git numstat over the run's attributed commits) and `input_tokens` /
`output_tokens` / `cached_tokens` / `reasoning_tokens` (the run's accumulated usage totals).
The CLI computes these at finalization, writes them to the run ledger (`.aidd/runs.jsonl`, as
`diffStat` and `totals`) and to the terminal heartbeat record, and the web layer persists them onto
the `runs` row at the terminal transition. All columns are nullable: `NULL` means "not captured"
(runs that predate capture, or commit-less runs for the line columns) — never zero. The dashboard
shows capture coverage separately for line, file, and token data, and shows cached and reasoning
tokens as explicit totals rather than hiding them in a tooltip. On first boot after upgrading, a
one-shot backfill
(`backend/src/services/run/outputMetricsBackfill.ts`) fills historical rows from the ledger,
re-deriving line counts from git where the ledger predates `diffStat`; a settings flag
(`runs.outputMetricsBackfill`) marks it done.

## Other local observability

The control panel also records:

- A system snapshot every minute: CPU, memory, heap, RSS, event-loop latency, disk usage, active
  connections, and request counts.
- Browser Core Web Vitals: CLS, FCP, INP, LCP, and TTFB, with rating, navigation type, and a
  sanitized route pathname.
- A structured AI-call diagnostic entry containing timestamp, duration, provider/model, endpoint
  host, request size, success/error details, source/surface, and optional project, run, turn, and
  token fields. Prompt and response contents are not stored in this diagnostic log.

System and browser samples are retained in the local database for up to 30 days and are visible in
Settings. AI-call diagnostics live in `logs/ai-calls.jsonl`, rotate at 10 MB, and retain at most five
archived files. Invocation and run history remain part of the local project history until that
history or project is removed.

## Dashboard behavior

`frontend/src/pages/telemetry/TelemetryPage.tsx` provides:

- Type filter (All / Skills / Recipes / Runs) and time window (24h / 7d / 30d / All).
- Summary cards: total, top-level, nested, completed, warnings, failed, flagged, stopped, killed,
  no work, and running.
- Most-used leaderboard, invocations-over-time series, and a backend-mix breakdown.
- An agent-output chart: diverging bars per hour/day — lines added above the baseline and
  removed below, toggleable to tokens in/out — with line, file, and token capture coverage.
- A recent-invocations table with complete per-row stored details.
- A local-data disclosure covering invocation, output, system/browser, and AI-call diagnostics.

The type and time filters apply to the headline counts, leaderboard, chart, backend mix, and recent
invocations. `All` means all recorded history; there is no hidden chart cap. Agent output is always
identified as run-only and is unavailable while the Skills or Recipes filter is selected.

## API

`backend/src/routes/telemetry.ts` (all read-only aggregations over the local table):

| Endpoint                                   | Purpose                                |
| ------------------------------------------ | -------------------------------------- |
| `GET /api/v1/telemetry/resources`          | Usage rows for a type within a window. |
| `GET /api/v1/telemetry/top`                | Top-N resources by invocation count.   |
| `GET /api/v1/telemetry/backends`           | Backend counts within current filters. |
| `GET /api/v1/telemetry/timeseries`         | Counts bucketed by hour/day.           |
| `GET /api/v1/telemetry/output-timeseries`  | Run output sums bucketed by hour/day.  |
| `GET /api/v1/telemetry/invocations`        | Recent invocations.                    |
| `GET /api/v1/telemetry/resource/:type/:id` | Detail for one resource.               |

# aidd Architecture

aidd is a pure TypeScript orchestration engine run via Bun.

The runtime flow is:

```text
argv -> ParsedArgs -> ResolvedConfig -> RunPlan -> mode handler -> prompt compiler -> backend -> metadata store
```

The CLI entrypoint is `bun run --cwd cli start` (also exposed as root `bun run start`), which runs `cli/src/index.ts` from the repository root. Signal handling and `.stop` creation are handled in `cli/src/app.ts`. CLI orchestration behavior lives under `cli/src`, the embedded web backend lives under `backend/src`, and the React control panel lives under `frontend/src`. Argument parsing, config resolution, backend execution, the native agent loop, and most metadata/contract logic live under `shared/src` (published in-repo as `aidd-shared`) so the CLI and web backend share one implementation.

Primary module boundaries:

- `shared/src/args/` parses the CLI surface without executing behavior.
- `shared/src/config/` loads defaults, user config, project config, backend overrides, and CLI overrides into one resolved object via `resolveConfig`.
- `cli/src/plan/resolve.ts` turns parsed input into a typed `RunPlan` (the `RunPlan` type is defined in `shared/src/plan/types.ts`).
- `cli/src/modes/` owns work selection, prompt planning, and result processing per mode.
- `cli/src/prompts/` compiles prompt source files from `prompts/` plus runtime context.
- `shared/src/backends/` owns process spawning, native backend execution, event parsing, and monitoring; `cli/src/backends/rate-limit.ts` owns rate-limit classification.
- `shared/src/metadata/` and `cli/src/metadata/` own the stable `.aidd/` artifact contract (the shared package holds the feature/roadmap/artifact-store schemas; the CLI package holds git, init, scaffold, and log helpers).
- `cli/src/orchestrator/` runs the bounded state machine, optional Triumvirate pre-execution planning, and
  iteration artifacts.

Dependency direction is intentionally one-way: metadata and prompts do not import backends, backends
do not import the orchestrator, and modes do not spawn processes.

## Triumvirate Orchestration

Triumvirate mode is implemented in `cli/src/orchestrator/triumvirate.ts` (stage helpers under
`cli/src/orchestrator/triumvirate/`) as a wrapper around the normal mode-selected work and compiled
prompt. The wrapper runs primary planning, secondary planning, and overseer synthesis in a scratch
project mirror, then runs only the execution stage in the real project directory when the overseer
returns an execute decision. Complexity tiering is off unless `--complexity-tiering` or
`complexityTieredPlanning` is set; with it on, work classified low-complexity takes a fast path that
sends the primary plan straight to execution, skipping the secondary planner and the overseer gate.

Planning mirrors exclude `.git`, dependency directories, build/cache directories, and `data`.
Original project mutation is guarded with `git status --porcelain=v1 --untracked-files=all` before
and after each planning stage. Every stage writes decisioning evidence into the normal iteration JSON
under `triumvirate`, including role identities, timing, prompt size, cwd class, metrics, raw stage
transcripts, parsed overseer decision, and guard or stage failure classification.

Planning-mirror mutation is guarded separately from original-worktree mutation. If a planner writes
to its scratch mirror, aidd retries that planning stage once from a clean mirror, records the full
changed-path evidence in the artifact, and caps the retry prompt's changed-path list with an omitted
path-group summary.

## Web Control Panel

The web control panel lives under `backend/src` and remains a small single-user surface. It serves
Dashboard, Projects, Director, Runs, Scheduled, Diary, Recipes, Skills, Audits, Telemetry, Settings,
Docs, and About (the authoritative registry is
`frontend/src/components/layout/nav-destinations.ts`; `nav-items.ts` is the icon-bearing view of it)
without auth, RBAC, workspace tenancy, notification, analytics, or custom dashboard code. Pipeline
sessions have no sidebar entry: the list is folded into the Runs page, `/pipeline-sessions`
redirects there, and `/pipeline-sessions/:id` is the per-session report. An embedded terminal pane
(docked in the app shell, not a route) provides persistent PTY sessions:
`backend/src/routes/terminal.ts` and
`backend/src/services/terminal/ptyProvider.ts` (the `bun-pty` dependency is confined to
`ptyProvider.ts`), with the wire contract in `shared/src/contracts/terminal.ts`.

Web recipes are loaded from `recipes/*.json` by `RecipeService`; recipe ids are derived from
filenames. `PipelineService` launches every recipe as a persisted pipeline session, records step
results, links aidd-backed steps to managed runs, and reconciles stale queued/running sessions on
startup because live execution state is in memory.

`ScheduledTaskService` stores task definitions, project references, and occurrence snapshots in
SQLite. A DB-worker command claims each due timestamp and advances its cadence atomically. The
in-process timer sleeps for at most one hour, coalesces missed startup occurrences, and dispatches
through `PipelineService`, `SkillLaunchService`, `AuditService`, or the Director; child runs and
sessions retain the occurrence foreign key and `scheduled` provenance. The Director's fleet cycle is
one of those tasks: a built-in, non-archivable row seeded at startup, running under the no-project
scope, whose occurrences link to a `director_cycles` row rather than to a run. A database command
starts a cycle only when none is running, so the scheduled, manual, and chat entry points cannot
stack two cycles over one fleet.

The web SQLite schema is still rooted under `data/` and includes run history, director cycles,
suggestions, Director profile/chat state, settings, scheduled tasks and occurrences, pipeline
sessions, and pipeline step results. The database runs in a dedicated Bun worker thread (`backend/src/db/worker/dbWorker.ts`,
message protocol in `db/worker/protocol.ts`, writer serialization in `db/writerLock.ts`); code
outside the worker never opens the database directly, and multi-statement transactions must be
expressed as named commands under `backend/src/db/commands/`, registered in the facade
`backend/src/db/commands.ts`, rather than ad-hoc `db.transaction()` calls.

Director chat is an autonomous tool-calling agent. When the `directorChat` Direct AI surface
resolves an OpenAI-compatible provider, a chat turn runs a bounded tool loop (`chatAgent.ts`) whose
tools call the existing services: it can inspect the fleet and orchestrate work via `launch_run`,
`run_cycle` (started in the background, non-blocking), `launch_suggestion`/`dismiss_suggestion`,
and `stop_run`/`kill_run`. By default the agent never edits files itself; all mutations flow through
supervised runs it launches (visible on `/runs`, stoppable). The opt-in
`director.chat.allowFileEdits` config additionally exposes project-scoped filesystem tools. Each
turn persists an `actions` trail on the assistant message. When no tool-calling provider is
configured, the turn falls back to the prior read-only, text-only path from an isolated
`data/director/chat-work` cwd that rejects responses reporting file modifications.

The Settings page is file-backed for runtime configuration. `GET /api/v1/settings/config` reads
the effective web-facing config and `PUT /api/v1/settings/config` writes `~/.aidd/config.json`
while preserving unrelated keys. The API exposes `applicationsRoot` (bare project-name resolution)
and `applicationRoots` (stored as `web.allowedRoots`); `web.ignoredFolders` supplies the discovery
skip list. After a save, `ProjectService`, `RunService`, and `DirectorService` receive the refreshed
config so project discovery and new run launches use the latest defaults without restarting the
web server; `DirectAiService`, and the audit and Telegram bridge services when present, are
refreshed the same way.

The Runs page can launch Triumvirate mode by sending role CLI/model fields through
`POST /api/v1/runs`. When the execution role is omitted, the resolved overseer backend/model is
also used for the real-project execution stage. The web run row keeps the mode and primary
backend/model in existing columns; detailed role and decision metadata lives in the iteration
artifact.

### Single-operator scope boundary

The omissions above are a decision, not a backlog. aidd is an operator tool that runs on the
owner's own machine against a local fleet, where identity is the OS user and there are no other
tenants to isolate; carrying the hosted-product surface would add auth, RBAC, and tenancy
complexity — and the attack surface that comes with them — for no local benefit. Reversing the
decision is expensive, because auth, RBAC, and tenancy touch every route, store, and page, and the
omission surprises a reader who expects a web app to have a login, so it is recorded here rather
than left implicit.

Local scheduled execution is explicitly inside the boundary: tasks dispatch recipes, skills, and
audits for the same OS user through the existing supervised execution paths, and the Director's
automatic fleet cycle runs there too as a built-in task the operator can pause, resume, and re-time
but not delete, rather than as a second private timer with its own settings. A hosted scheduler,
shared task ownership, notifications, and every other multi-user concern stay outside it. The
loopback web API stays guard-light by design — direct loopback calls are exempt from the optional
access token, while proxy-forwarded requests must present it — consistent with the single-operator
assumption. Adding one of the omitted surfaces is a product decision, not an incidental feature add.

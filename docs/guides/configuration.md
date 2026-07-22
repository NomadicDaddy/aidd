# Configuration Reference

aidd uses JSON-only configuration. The runtime does not use `.env` files for persistent
application settings.

## Files And Precedence

Configuration starts from built-in defaults, then merges these sources:

1. `~/.aidd/config.json`
2. `<project>/.aidd/aidd.config.json`
3. CLI flags

Later sources override earlier sources. The project file uses the same schema as the user-level
file and should usually contain only project-specific overrides.

`sharedFiles` and `sharedDirs` are honored from the user-level file only. The project file ships
with the repository, so file-copy directives in it would let a cloned codebase copy or overwrite
files on the operator's machine; project-config values for these two keys are silently ignored.

The root [config.json.example](../../config.json.example) file shows every accepted config key in a
single valid JSON file. It uses built-in defaults where a literal JSON default exists and
representative placeholder values for optional provider, model, path, and role defaults.

## Resolution Rules

- `~/.aidd/config.json` is the user-level config file loaded by `getUserConfigPath()`. In the
  Docker image this resolves to `/home/aidd/.aidd/config.json` inside the home volume; the
  JSON-only policy is unchanged in Docker: there are no environment-variable overrides for web
  settings (see [docker.md](./docker.md)).
- `<project>/.aidd/aidd.config.json` is loaded only after the project directory is known.
- Bare project names passed by CLI can resolve under `applicationsRoot`.
- `web.allowedRoots` is the web control panel and backend filesystem boundary.
- If `web.allowedRoots` is omitted, it falls back to `[applicationsRoot]` when configured, or the
  parent of the current runtime base directory.
- The Settings page exposes `applicationsRoot` as "Applications Root" (bare project-name resolution)
  and `web.allowedRoots` as "Application Roots" (web filesystem boundary).
- The schema is strict. Unknown top-level keys and unknown keys inside strict nested objects fail
  validation.
- Optional values are omitted to use defaults. The file schema does not use `null` for clearing
  optional string or number values.
- Some effective defaults are computed and cannot be represented exactly in a static JSON example:
  `maxIterations` defaults to no limit when omitted, `web.allowedRoots` falls back from
  `applicationsRoot` or the runtime base directory when omitted, and `web.dataDir` resolves under
  the runtime repository `data/` directory.

## Top-Level Keys

| Key                            | Type                | Default   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applicationsRoot`             | string              | none      | Root used to resolve bare project names and to seed web roots when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `auditModel`                   | string              | none      | Default model for audit prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `auditsEnabled`                | boolean             | `true`    | Enables audit behavior where applicable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `backends`                     | object              | none      | Per-backend model, idle timeout, and run timeout overrides.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `channels`                     | object              | none      | External messaging channel settings (Telegram bridge). See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `cli`                          | backend name        | `native`  | Default backend. Valid values are listed below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `codeModel`                    | string              | none      | Default model for code prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `complexityTieredPlanning`     | boolean             | `false`   | Enables the Triumvirate complexity heuristic so trivial work can skip secondary/overseer planning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `consistencyGateEnabled`       | boolean             | `false`   | Enables the Triumvirate cross-artifact consistency gate before execution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `director`                     | object              | none      | Director settings. `director.chat.allowFileEdits` (boolean, default `false`) lets the agentic Director chat edit project files directly instead of only orchestrating supervised runs. `director.schedule.enabled` (boolean, default `false`) auto-runs a fleet cycle on a fixed cadence, and once on startup if the last cycle is older than the interval; `director.schedule.intervalHours` (positive number, default `12`) sets that cadence. `director.suggestions.granularity` (`targeted` or `aggregate`, default `targeted`) makes each cycle surface concrete, individually-runnable next actions instead of one sweeping suggestion; `director.suggestions.maxPerBucket` (positive integer, default `3`) caps targeted suggestions per bucket. |
| `defaultProvider`              | string              | `zhipu`   | Native provider selected when no provider override is supplied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `directAi`                     | object              | disabled  | Direct AI settings for web surfaces.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `dirtyTreeThreshold`           | nonnegative integer | `50`      | Dirty-file count that blocks a run before backend execution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `idleNudgeTimeoutSeconds`      | nonnegative integer | `600`     | Shared backend silence timeout before a nudge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `idleTimeoutSeconds`           | nonnegative integer | `900`     | Shared backend silence timeout before kill/abort handling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `initModel`                    | string              | none      | Default model for initialization prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `maxConsecutiveTimeoutRetries` | nonnegative integer | `2`       | Max consecutive silent provider-timeout retries before a run gives up, independent of `maxIterations`. `0` disables the cap (falls back to the iteration limit). Prevents a stalled/non-streaming provider from spinning up fresh agents indefinitely.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `maxCostUsd`                   | nonnegative number  | no budget | Warn-only accumulated run-cost budget. When exceeded, the run logs the budget breach once but continues.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `maxIterations`                | nonnegative integer | no limit  | Maximum orchestrator iterations when configured; omit the key for no limit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `maxTokens`                    | nonnegative integer | no budget | Warn-only accumulated token budget. When exceeded, the run logs the budget breach once but continues.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `maxTurns`                     | positive integer    | `25`      | Native agent loop turn cap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `model`                        | string              | none      | Shared model default used when a narrower model override is absent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `noClean`                      | boolean             | `false`   | Keeps generated iteration artifacts from being cleaned where cleanup applies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `noWorkBackoffMs`              | nonnegative integer | `30000`   | Delay after an iteration finds no work. Set `0` to disable the delay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `preflightDoctor`              | boolean             | `true`    | Fast pre-run environment probes (backend CLI runnable; native bash + toolchain works). A failed probe ends the run in seconds with a diagnostic instead of after the full wall-clock budget. `AIDD_SKIP_DOCTOR=1` also skips.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `providers`                    | object              | none      | Native provider definitions keyed by provider id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `quitOnAbort`                  | nonnegative integer | `0`       | Consecutive abort threshold before the run stops early.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `rateLimitBackoffSeconds`      | nonnegative integer | `300`     | Fallback wait after a rate limit when no reset time is parsed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `rateLimitBufferSeconds`       | nonnegative integer | `60`      | Extra wait added to parsed rate-limit reset times.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `reasoningEffort`              | reasoning effort    | `low`     | Shared persisted reasoning effort.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `sharedDirs`                   | string array        | none      | Directories copied into newly scaffolded `.aidd/` metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `sharedFiles`                  | string/object array | none      | Files copied into newly scaffolded `.aidd/` metadata.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `timeoutSeconds`               | nonnegative integer | `10800`   | Overall run timeout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `triumvirate`                  | object              | none      | Default secondary, overseer, and execution role backend/model selections.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `web`                          | object              | see below | Embedded web control panel settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |

## Enum Values

Backend names:

- `native`
- `ollama`
- `lmstudio`
- `claude-code`
- `opencode`
- `kilocode`
- `codex`

Persisted reasoning efforts:

- `none`
- `minimal`
- `low`
- `medium`
- `high`
- `xhigh`

## Backend Defaults

`backends` is keyed by backend name:

```json
{
	"backends": {
		"codex": {
			"idleNudgeTimeoutSeconds": 600,
			"idleTimeoutSeconds": 900,
			"model": "gpt-5.6",
			"timeoutSeconds": 14400
		}
	}
}
```

Backend-specific `model`, `idleTimeoutSeconds`, and `idleNudgeTimeoutSeconds` override the shared
top-level values for that backend only.

Every launch surface (CLI plan and web launches) resolves the effective backend/model/effort
through one shared resolver (`resolveEffectiveLaunchTarget`). Model precedence, most specific
wins:

1. Per-launch override (CLI `--model` / a launch-target control override)
2. Mode model (`auditModel` for audit mode, `codeModel` for coding-like modes)
3. Backend-scoped model (`backends.<backend>.model`)
4. Shared `model`
5. Provider default (native-family backends only)

## Provider Settings

The native backend reads provider settings from `providers`. Credentials, base URL, and provider
model belong under `providers.<provider>.*`; the top-level `model` remains the shared run-launch
model and is not used as provider configuration:

```json
{
	"defaultProvider": "ollama",
	"providers": {
		"ollama": {
			"baseUrl": "http://localhost:11434/v1",
			"model": "gpt-oss:20b"
		}
	}
}
```

Per provider, the following keys are accepted:

| Key               | Type             | Purpose                                                                                                      |
| ----------------- | ---------------- | ------------------------------------------------------------------------------------------------------------ |
| `apiKey`          | string           | Provider API key. Required for providers that need authentication (e.g. `zhipu`, `xai`).                     |
| `baseUrl`         | string           | OpenAI-compatible base URL for the provider.                                                                 |
| `model`           | string           | Default model used when no narrower model override is supplied.                                              |
| `reasoningEffort` | reasoning effort | Per-provider reasoning-effort default. Overrides the top-level `reasoningEffort` when this provider is used. |

Recognized provider names and their defaults:

| Provider   | Base URL                              | Default model        | Key required |
| ---------- | ------------------------------------- | -------------------- | ------------ |
| `zhipu`    | `https://api.z.ai/api/coding/paas/v4` | `glm-5.1`            | yes          |
| `xai`      | `https://api.x.ai/v1`                 | `grok-4.5`           | yes          |
| `ollama`   | `http://localhost:11434/v1`           | `gpt-oss:20b`        | no           |
| `lmstudio` | `http://localhost:1234/v1`            | `openai/gpt-oss-20b` | no           |

`providers.<provider>.reasoningEffort` only takes effect for backends that consult the provider
map: `native` (provider resolved from `defaultProvider`), `ollama` (provider forced to `ollama`),
and `lmstudio` (provider forced to `lmstudio`). External CLI backends (`claude-code`, `codex`,
`opencode`, `kilocode`) ignore it and fall back to the top-level `reasoningEffort` instead. Note
that `lmstudio` does not send `reasoning_effort` on the wire, as it is not part of LM Studio's
documented chat parameters.

Precedence (most specific wins):

1. CLI flag `--reasoning-effort` / per-call request override
2. `directAi.reasoningEffort` (direct AI calls only)
3. `providers.<provider>.reasoningEffort`
4. Top-level `reasoningEffort`
5. Built-in default (`low`)

Shell credential variables are documented exceptions for provider credentials only:
`NATIVE_API_KEY`, `ZHIPU_API_KEY`, `XAI_API_KEY`, `NATIVE_BASE_URL`, `NATIVE_MODEL`, and `NATIVE_PROVIDER`.

## Direct AI

`directAi` controls direct web-backed AI surfaces:

| Key               | Type             | Purpose                                                                                         |
| ----------------- | ---------------- | ----------------------------------------------------------------------------------------------- |
| `enabled`         | boolean          | Enables configured direct AI web surfaces.                                                      |
| `provider`        | string           | Override for `defaultProvider` when direct AI should target a different provider. Optional.     |
| `model`           | string           | Override for the resolved `providers.<provider>.model` for direct AI calls only. Optional.      |
| `baseUrl`         | string           | Override for the resolved `providers.<provider>.baseUrl` for direct AI calls only. Optional.    |
| `reasoningEffort` | reasoning effort | Override for the top-level `reasoningEffort` for direct AI calls only. Optional.                |
| `surfaces`        | object           | Per-surface switches for `projectAdvisor`, `directorChat`, `directorCycle`, and `runSummaries`. |
| `timeoutSeconds`  | positive integer | Direct AI request timeout. Defaults to `120` when `directAi` is present and this key is unset.  |

`provider`, `model`, `baseUrl`, and `reasoningEffort` are overrides only. Direct AI inherits
them from `defaultProvider`, `providers.<provider>.*`, and the top-level `reasoningEffort` when
unset. Set them only when direct AI should diverge from the agent-loop defaults.

When `directAi.enabled` is false and the Settings API has no prior direct AI config to preserve,
the settings service omits `directAi` from the persisted file.

## Channels

`channels` configures external messaging integrations. Currently only the Telegram bridge is
supported. When `channels.telegram` is configured, the web backend starts the bridge
automatically and applies Settings changes without requiring a restart:

| Key                                | Type         | Purpose                                       |
| ---------------------------------- | ------------ | --------------------------------------------- |
| `channels.telegram.botToken`       | string       | Telegram bot token used by the bridge.        |
| `channels.telegram.allowedChatIds` | number array | Chat IDs allowed to interact with the bridge. |

Both `channels.telegram.botToken` and `channels.telegram.allowedChatIds` are required when the
`telegram` object is present.

## Triumvirate

`triumvirate` stores role defaults for web and CLI launches:

| Key              | Type         | Purpose                         |
| ---------------- | ------------ | ------------------------------- |
| `secondaryCli`   | backend name | Secondary planner backend.      |
| `secondaryModel` | string       | Secondary planner model.        |
| `overseerCli`    | backend name | Overseer backend.               |
| `overseerModel`  | string       | Overseer model.                 |
| `execCli`        | backend name | Real-project execution backend. |
| `execModel`      | string       | Real-project execution model.   |

If execution fields are omitted in a Triumvirate launch, the overseer backend/model can be used for
the real-project execution stage.

## Shared Metadata Inputs

`sharedDirs` copies entire directories into newly scaffolded `.aidd/` metadata. `sharedFiles`
accepts either a string path or an object with `source` and optional `target`. Both keys are
read from the user-level config only (never from a project's `aidd.config.json`), and a `target`
must stay inside the project root — absolute or `..`-traversing targets are skipped with a
warning:

```json
{
	"sharedFiles": [
		"C:\\path\\to\\workspace\\AGENTS.md",
		{
			"source": "C:\\path\\to\\workspace\\ai\\shared\\workspace-notes.md",
			"target": ".aidd\\workspace-notes.md"
		}
	]
}
```

## Web Settings

| Key                           | Type             | Default                                                                                  | Purpose                                                                                                                                                             |
| ----------------------------- | ---------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `allowRemote`                 | boolean          | `false`                                                                                  | Allows non-loopback hostnames when true. Requires `authToken`.                                                                                                      |
| `allowedOrigins`              | string array     | none                                                                                     | Extra browser origins allowed when remote access is on.                                                                                                             |
| `authToken`                   | string           | none                                                                                     | Bearer token guarding the API. Required when `allowRemote` is true.                                                                                                 |
| `allowedRoots`                | string array     | `[applicationsRoot]` or parent runtime directory                                         | Filesystem roots available to the web backend.                                                                                                                      |
| `dataDir`                     | string           | `data` under the runtime base directory                                                  | SQLite, run logs, and web runtime data root.                                                                                                                        |
| `hostname`                    | string           | `127.0.0.1`                                                                              | Web bind hostname. Non-loopback requires `allowRemote`.                                                                                                             |
| `ignoredFolders`              | string array     | `.git`, `data`, `dist`, `frontend`, `logs`, `node_modules`, `scaffolding`, `screenshots` | Folder names skipped during project discovery.                                                                                                                      |
| `maxConcurrentRuns`           | positive integer | `2`                                                                                      | Maximum concurrent managed web runs.                                                                                                                                |
| `maxConcurrentRunsPerProject` | positive integer | `2`                                                                                      | Per-project cap on concurrent non-terminal managed runs.                                                                                                            |
| `port`                        | positive integer | `3210`                                                                                   | Web bind port.                                                                                                                                                      |
| `showSpernakitProject`        | boolean          | `false`                                                                                  | Shows the Spernakit template checkout (a discovered project named `spernakit` containing `scripts/init.ts`) on the projects page; hidden by default.                |
| `spernakitFleetManifest`      | string           | none                                                                                     | Optional `spernakit.psd1` path; used to detect Spernakit-derived projects during intake, and as the fleet manifest that Spernakit creation registers new apps into. |
| `spernakitInitScript`         | string           | none                                                                                     | Optional path to a local Spernakit checkout's init script. When set, Spernakit apps are created from that checkout; when unset, the template is cloned on demand.   |
| `spernakitTemplateRepo`       | string           | `NomadicDaddy/spernakit`                                                                 | `owner/repo` cloned into `<dataDir>/templates/spernakit` when creating a Spernakit app without a configured `spernakitInitScript`.                                  |
| `spernakitTemplateRef`        | string           | none                                                                                     | Optional git tag/branch to clone for `spernakitTemplateRepo`; defaults to the repo's default branch. Changing it rebuilds the cached clone.                         |
| `templates`                   | object array     | none                                                                                     | Project-creation template registry. See below.                                                                                                                      |
| `traceDataMovement`           | boolean          | `false`                                                                                  | Enables data-movement trace records.                                                                                                                                |
| `useWorktrees`                | boolean          | `false`                                                                                  | Runs web/Director-launched coding mode in isolated git worktrees.                                                                                                   |

`web.dataDir` must resolve inside the repository root `data/` directory and must not target
`backend/data`.

`web.templates` entries define project-creation lanes. Each entry requires `name` and
`initCommand`; optional fields are `description`, `cwd` (`root` or `targetPath`), `postCreate`
(`coding-run` or `ingest`), `requiresDescription`, `rootMustBeInitDir`, and `validationCommand`.
`initCommand` tokens `{name}`, `{description}`, `{targetPath}`, and `{root}` are substituted at
run time. A `spernakit` template is always offered: with no local checkout configured it clones
`web.spernakitTemplateRepo` on demand and runs its portable `scripts/init.ts`. An explicit
`web.templates` entry named `spernakit` overrides the built-in one and is run through the generic
`initCommand` engine instead.

Scaffolders that treat their positional argument as a _project name_ (for example `create-vite`)
sanitize it: an absolute Windows path like `d:\apps\my-app` becomes a mangled directory name. For
those tools, set `cwd` to `targetPath` and scaffold into `.` (e.g.
`["bun", "create", "vite", ".", "--template", "react-ts"]`) instead of passing `{targetPath}` as
the argument. Reserve `{targetPath}`/`{root}` for scripts that accept real filesystem paths.

To expose the control panel on a trusted LAN, enable remote access explicitly and bind to all
interfaces or a concrete LAN address. Remote binding requires a non-empty `web.authToken`; config
resolution fails if `allowRemote` is true while `authToken` is missing or blank, so a remote-bound
control panel can never run without API authentication:

```json
{
	"web": {
		"allowRemote": true,
		"allowedOrigins": ["http://192.0.2.10:3210", "http://demo-host:3210"],
		"authToken": "replace-with-a-long-random-secret",
		"hostname": "0.0.0.0",
		"port": 3210
	}
}
```

When `hostname` is `0.0.0.0` or `::`, aidd also allows origins for detected local network
interface addresses. The effective allowlist always includes the active listener origin and
loopback aliases; `allowedOrigins` is additive for stable machine names or fixed LAN IPs. Listener
changes saved from Settings take effect after restarting `aidd-web`.

To verify a LAN-facing listener without changing config, run:

```powershell
bun scripts/crawltest.ts --local-network --base-url http://demo-host:3210 --local-network-host demo-host --page /settings
```

`--local-network-host` is optional when the listener binds a concrete LAN address or the machine
has a single obvious non-internal interface. The probe fails if remote access is disabled, the
active listener is loopback-only, the LAN URL is unreachable, or the invalid-origin guard does not
return HTTP 403.

## Settings API Shape

The web settings API uses a DTO shape, not the exact file shape:

- `GET /api/v1/settings/config` returns `{ config }`.
- `PUT /api/v1/settings/config` accepts `applicationRoots` (stored as `web.allowedRoots`) and
  `applicationsRoot` (stored as the top-level `applicationsRoot` key).
- Network listener fields (`allowRemote`, `hostname`, `port`, and `allowedOrigins`) are exposed
  directly in the DTO and persist under `web.*`.
- Optional strings and numbers can be submitted as `null` to clear settings through the API.
- The settings service writes the file back as strict JSON config and preserves unrelated keys.

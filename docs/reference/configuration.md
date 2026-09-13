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
with the repository, so a file-copy directive in it would let a cloned codebase copy or overwrite
files on the operator's machine. Project-config values for these two keys are silently ignored.

The root [config.json.example](../../config.json.example) file shows every accepted config path and
every canonical backend/provider in a single valid JSON file. Where a runtime default can be
represented as a valid configured value, the example uses that exact default. A few real defaults
are absence, unlimited, or a path computed for the local checkout; because the strict JSON schema
does not accept `null` for those optional fields, the example uses valid illustrative values instead.

## Credentials In The Environment

Two credentials can be supplied by an environment variable instead of being written into
`~/.aidd/config.json`:

| Variable                  | Supplies                     |
| ------------------------- | ---------------------------- |
| `AIDD_WEB_AUTH_TOKEN`     | `web.authToken`              |
| `AIDD_TELEGRAM_BOT_TOKEN` | `channels.telegram.botToken` |

Prefer these over the config file. `~/.aidd/config.json` is the file every doc names as _the_
configuration file, so an agent asked to inspect your configuration reads the whole of it — and a
credential inside travels out with the answer, into the model provider's context, where nothing
can recall it. A value held in the environment is not in the file an agent reads.

Rules:

- The environment wins over the file, so a rotated credential takes effect without editing config
  and a stale file value cannot shadow it.
- Blank and whitespace-only are treated as unset, so a half-filled shell profile cannot shadow a
  working file value.
- `AIDD_TELEGRAM_BOT_TOKEN` supplies the token for a `channels.telegram` block the config already
  declares; it does not create one. `allowedChatIds` decides who may talk to the bridge and still
  belongs in the file.
- Both apply to the user-level config only. A project `aidd.config.json` must never carry a
  credential — see the trust boundary in [Files And Precedence](#files-and-precedence).
- Neither variable is forwarded to a spawned backend CLI. That is deliberate and pinned by a test:
  forwarding one would put the credential back within reach of the agent it was moved away from.
- Saving the Settings page never copies an environment-supplied credential into the file. The page
  reports such a credential as configured, because it is.

Provider API keys have their own, older environment chain — see [Provider Settings](#provider-settings).

## Resolution Rules

- `~/.aidd/config.json` is the user-level config file loaded by `getUserConfigPath()`. Aside from
  credentials (see [Credentials In The Environment](#credentials-in-the-environment)), the
  JSON-only policy admits no exceptions: there are no environment-variable overrides for web
  settings.
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
- The example's `maxIterations`, `maxTokens`, and `maxCostUsd` values demonstrate opt-in limits;
  their runtime defaults are unlimited/no budget. Paths, credentials, optional model/role pins,
  `web.spernakitTemplateRef`, and the third-party `web.templates` entry are likewise illustrative
  because their runtime defaults are unset, installation-specific, or synthesized.

## Top-Level Keys

| Key                            | Type                | Default   | Purpose                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ------------------------------ | ------------------- | --------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `applicationsRoot`             | string              | none      | Root used to resolve bare project names and to seed web roots when unset.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `auditModel`                   | string              | none      | Default model for audit prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `auditsEnabled`                | boolean             | `true`    | Enables audit behavior where applicable.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `backends`                     | object              | none      | Per-backend model, idle timeout, and run timeout overrides.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `channels`                     | object              | none      | External messaging channel settings (Telegram bridge). See below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `cli`                          | backend name        | `native`  | Default backend. Valid values are listed below.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `codeModel`                    | string              | none      | Default model for code prompts.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `complexityTieredPlanning`     | boolean             | `false`   | Enables the Triumvirate complexity heuristic so trivial work can skip secondary/overseer planning.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `consistencyGateEnabled`       | boolean             | `false`   | Enables the Triumvirate cross-artifact consistency gate before execution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `director`                     | object              | none      | Director settings. `director.chat.allowFileEdits` (boolean, default `false`) lets the agentic Director chat edit project files directly instead of only orchestrating supervised runs. `director.schedule.enabled` (boolean, default `false`) and `director.schedule.intervalHours` (positive number, default `12`) are seed values only: automatic cycles run from a built-in scheduled task, and these keys are read exactly once, on the first start that finds no such task, to seed its cadence. Editing them afterwards does nothing, and the first settings save removes them from the file. `director.suggestions.granularity` (`targeted` or `aggregate`, default `targeted`) makes each cycle surface concrete, individually-runnable next actions instead of one sweeping suggestion; `director.suggestions.maxPerBucket` (positive integer, default `3`) caps targeted suggestions per bucket. `director.suggestions.autoLaunch` (object) lets a scheduled cycle start the work it proposed: `allowedRecipes` (array of recipe names, default `["coding", "remediate-audit-findings", "remediate-bugs"]` — a recipe not on the list is refused, and `[]` keeps auto-launch to plain runs), `enabled` (boolean, default `false`), `maxPerCycle` (positive integer, default `1`), `maxRank` (positive integer, default `1`), and `riskCeiling` (`LOW`, `MEDIUM`, or `HIGH`, default `LOW`). Off by default; see [the panel's Director doc](../../frontend/content/docs/director.md#cycles-and-suggestions). |
| `defaultProvider`              | string              | `zhipu`   | Native provider selected when no provider override is supplied.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| `directAi`                     | object              | disabled  | Direct AI settings for web surfaces.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `dirtyTreeThreshold`           | nonnegative integer | `50`      | Dirty-file count that blocks a run before backend execution.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| `idleNudgeTimeoutSeconds`      | nonnegative integer | `600`     | Shared backend silence timeout before a nudge.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `idleTimeoutSeconds`           | nonnegative integer | `900`     | Shared backend silence timeout before kill/abort handling.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| `maxConsecutiveTimeoutRetries` | nonnegative integer | `2`       | Max consecutive silent provider-timeout retries before a run gives up, independent of `maxIterations`. `0` disables the cap (falls back to the iteration limit). Prevents a stalled/non-streaming provider from spinning up fresh agents indefinitely.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| `maxCostUsd`                   | nonnegative number  | no budget | Warn-only accumulated run-cost budget. When exceeded, the run logs the budget breach once but continues.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `maxIterations`                | nonnegative integer | no limit  | Maximum orchestrator iterations when configured; omit the key for no limit.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `maxTokens`                    | nonnegative integer | no budget | Warn-only accumulated token budget. When exceeded, the run logs the budget breach once but continues.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `maxTurns`                     | positive integer    | `25`      | Native agent loop turn cap.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| `model`                        | string              | none      | Shared model default used when a narrower model override is absent.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| `noClean`                      | boolean             | `false`   | Keeps generated iteration artifacts from being cleaned where cleanup applies.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `noWorkBackoffMs`              | nonnegative integer | `30000`   | Delay after an iteration finds no work. Set `0` to disable the delay.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `preflightDoctor`              | boolean             | `true`    | Fast pre-run environment probes (backend CLI runnable; native bash + toolchain works). A failed probe ends the run in seconds with a diagnostic instead of after the full wall-clock budget. `AIDD_SKIP_DOCTOR=1` also skips.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `providers`                    | object              | none      | Native provider definitions keyed by provider id.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `quitOnAbort`                  | nonnegative integer | `0`       | Consecutive abort threshold before the run stops early.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| `rateLimitBackoffSeconds`      | nonnegative integer | `300`     | Fallback wait after a rate limit when no reset time is parsed.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| `rateLimitBufferSeconds`       | nonnegative integer | `60`      | Extra wait added to parsed rate-limit reset times.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `reasoningEffort`              | reasoning effort    | `low`     | Shared persisted reasoning effort.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| `sharedDirs`                   | string array        | none      | Directories copied to the project root, initializer-phase runs only.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `sharedFiles`                  | string/object array | none      | Files copied into a newly scaffolded project, at the project root unless the entry sets `target`.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| `timeoutSeconds`               | nonnegative integer | `10800`   | Overall run timeout.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| `triumvirate`                  | object              | none      | Default secondary, overseer, and execution role backend/model selections.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| `web`                          | object              | see below | Embedded web control panel settings.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

## Enum Values

Backend names:

- `native`
- `ollama`
- `lmstudio`
- `openai`
- `claude-code`
- `cline`
- `opencode`
- `kilocode`
- `codex`
- `grok`

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
			"model": "gpt-6-astra",
			"reasoningEffort": "high",
			"timeoutSeconds": 14400
		}
	}
}
```

Each `backends.<backend>` entry accepts every path below:

| Config path                                  | Type                | Default                   | Purpose                                        |
| -------------------------------------------- | ------------------- | ------------------------- | ---------------------------------------------- |
| `backends.<backend>.idleNudgeTimeoutSeconds` | nonnegative integer | top-level value (`600`)   | Silence interval before a nudge.               |
| `backends.<backend>.idleTimeoutSeconds`      | nonnegative integer | top-level value (`900`)   | Silence interval before kill/abort handling.   |
| `backends.<backend>.model`                   | string              | normal model precedence   | Model override for this backend.               |
| `backends.<backend>.reasoningEffort`         | reasoning effort    | top-level value (`low`)   | Reasoning-effort override for this backend.    |
| `backends.<backend>.timeoutSeconds`          | nonnegative integer | top-level value (`10800`) | Overall run timeout override for this backend. |

Every launch surface (CLI plan and web launches) resolves the effective backend/model/effort
through one shared resolver (`resolveEffectiveLaunchTarget`). Model precedence, most specific
wins:

1. Per-launch override (CLI `--model` / a launch-target control override)
2. Mode model (`auditModel` for audit mode, `codeModel` for coding-like modes)
3. Backend-scoped model (`backends.<backend>.model`)
4. Shared `model`
5. Provider default (native-family backends only)

Step 2 is scoped to the configured `cli`: a launch that overrides the backend skips the mode model,
because `auditModel`/`codeModel` name a model id for `cli`'s provider and would fail against a
different one.

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

Each `providers.<provider>` entry accepts every path below:

| Config path                                | Type             | Default                      | Purpose                                                                                                |
| ------------------------------------------ | ---------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| `providers.<provider>.apiKey`              | string           | none                         | Provider API key. Required for providers that need authentication.                                     |
| `providers.<provider>.baseUrl`             | string           | provider-specific            | OpenAI-compatible base URL for the provider.                                                           |
| `providers.<provider>.model`               | string           | provider-specific            | Default model used when no narrower model override is supplied.                                        |
| `providers.<provider>.reasoningEffort`     | reasoning effort | top-level value (`low`)      | Per-provider reasoning effort for native-family backends.                                              |
| `providers.<provider>.stream`              | boolean          | remote `true`; local `false` | Enables SSE streaming; disable it for an endpoint with incompatible streaming.                         |
| `providers.<provider>.streamIdleTimeoutMs` | positive integer | `180000`                     | No-bytes stream stall timeout in milliseconds. JSON-only; there is no environment-variable equivalent. |

Recognized provider names and their defaults:

| Provider   | Base URL                              | Default model        | Key required |
| ---------- | ------------------------------------- | -------------------- | ------------ |
| `zhipu`    | `https://api.z.ai/api/coding/paas/v4` | `glm-5.3`            | yes          |
| `xai`      | `https://api.x.ai/v1`                 | `grok-4.6`           | yes          |
| `openai`   | `https://api.openai.com/v1`           | `gpt-6-astra`        | yes          |
| `ollama`   | `http://localhost:11434/v1`           | `gpt-oss:20b`        | no           |
| `lmstudio` | `http://localhost:1234/v1`            | `openai/gpt-oss-20b` | no           |

`providers.<provider>.reasoningEffort` only takes effect for backends that consult the provider
map: `native` (provider resolved from `NATIVE_PROVIDER` or `defaultProvider`, falling back to
`zhipu`), plus `ollama`, `lmstudio`, and `openai`, each of which forces the provider of the same
name. External CLI backends (`claude-code`, `cline`,
`codex`, `grok`, `opencode`, `kilocode`) ignore it. All backends first consult their
`backends.<backend>.reasoningEffort` value, then fall back to the shared top-level
`reasoningEffort`. Note that `lmstudio` does not send `reasoning_effort` on the wire, as it is not
part of LM Studio's documented chat parameters.

Precedence (most specific wins):

1. CLI flag `--reasoning-effort` / per-call request override
2. `directAi.reasoningEffort` (direct AI calls only)
3. `backends.<backend>.reasoningEffort` (run launches only)
4. `providers.<provider>.reasoningEffort`
5. Top-level `reasoningEffort`
6. Built-in default (`low`)

Shell credential variables are documented exceptions for provider credentials only:
`NATIVE_API_KEY`, `OPENAI_API_KEY`, `ZHIPU_API_KEY`, `XAI_API_KEY`, `NATIVE_BASE_URL`,
`NATIVE_MODEL`, and `NATIVE_PROVIDER`. Each provider variable is read only when the resolved
provider is its own (`OPENAI_API_KEY` for `openai`, `ZHIPU_API_KEY` for `zhipu`, `XAI_API_KEY`
for `xai`), so an ambient key in the shell cannot silently authenticate a run for a different
provider whose own key is missing. `NATIVE_API_KEY` is the only provider-agnostic override.

## Direct AI

`directAi` controls direct web-backed AI surfaces:

| Config path                        | Type             | Default                    | Purpose                                                 |
| ---------------------------------- | ---------------- | -------------------------- | ------------------------------------------------------- |
| `directAi.baseUrl`                 | string           | selected provider          | Base URL override for direct AI calls only.             |
| `directAi.enabled`                 | boolean          | `false`                    | Enables configured direct AI web surfaces.              |
| `directAi.model`                   | string           | selected provider          | Model override for direct AI calls only.                |
| `directAi.provider`                | string           | `defaultProvider`          | Provider override for direct AI calls only.             |
| `directAi.reasoningEffort`         | reasoning effort | provider/top-level effort  | Reasoning-effort override for direct AI calls only.     |
| `directAi.surfaces`                | object           | follows `directAi.enabled` | Per-surface enablement overrides.                       |
| `directAi.surfaces.directorChat`   | boolean          | `directAi.enabled`         | Enables direct AI for Director chat.                    |
| `directAi.surfaces.directorCycle`  | boolean          | `directAi.enabled`         | Enables direct AI for Director cycles.                  |
| `directAi.surfaces.projectAdvisor` | boolean          | `directAi.enabled`         | Enables direct AI for project-creation recommendations. |
| `directAi.surfaces.runSummaries`   | boolean          | `directAi.enabled`         | Enables direct AI for run summaries.                    |
| `directAi.timeoutSeconds`          | positive integer | `120`                      | Direct AI request timeout.                              |

`provider`, `model`, `baseUrl`, and `reasoningEffort` are overrides only. Direct AI inherits
them from `defaultProvider`, `providers.<provider>.*`, and the top-level `reasoningEffort` when
unset. Set them only when direct AI should diverge from the agent-loop defaults.

When `directAi.enabled` is false and the Settings API has no prior direct AI config to preserve,
the settings service omits `directAi` from the persisted file.

## Director Settings

`director` is optional. When present, these paths are accepted:

| Config path                                      | Type             | Default                                                | Purpose                                                                     |
| ------------------------------------------------ | ---------------- | ------------------------------------------------------ | --------------------------------------------------------------------------- |
| `director.chat`                                  | object           | see child path                                         | Director chat behavior.                                                     |
| `director.chat.allowFileEdits`                   | boolean          | `false`                                                | Lets agentic Director chat edit project files directly.                     |
| `director.schedule`                              | object           | see child paths                                        | One-time seed values for the built-in Director scheduled task.              |
| `director.schedule.enabled`                      | boolean          | `false`                                                | Initial enabled state used only when the built-in task is first created.    |
| `director.schedule.intervalHours`                | positive number  | `12`                                                   | Initial cadence used only when the built-in task is first created.          |
| `director.suggestions`                           | object           | see child paths                                        | Suggestion shape and auto-launch policy.                                    |
| `director.suggestions.autoLaunch`                | object           | disabled                                               | Bounds scheduled-cycle launches of generated suggestions.                   |
| `director.suggestions.autoLaunch.allowedRecipes` | string array     | `coding`, `remediate-audit-findings`, `remediate-bugs` | Recipes that scheduled cycles may auto-launch; `[]` allows only plain runs. |
| `director.suggestions.autoLaunch.enabled`        | boolean          | `false`                                                | Enables scheduled-cycle suggestion auto-launching.                          |
| `director.suggestions.autoLaunch.maxPerCycle`    | positive integer | `1`                                                    | Maximum suggestions launched by one cycle.                                  |
| `director.suggestions.autoLaunch.maxRank`        | positive integer | `1`                                                    | Lowest-priority suggestion rank still eligible for auto-launch.             |
| `director.suggestions.autoLaunch.riskCeiling`    | risk level       | `LOW`                                                  | Highest eligible suggestion risk: `LOW`, `MEDIUM`, or `HIGH`.               |
| `director.suggestions.granularity`               | enum             | `targeted`                                             | Emits `targeted` individual actions or `aggregate` bucket suggestions.      |
| `director.suggestions.maxPerBucket`              | positive integer | `3`                                                    | Maximum targeted suggestions emitted per bucket.                            |

The `director.schedule` values are read only on the first start that finds no built-in Director
task. The task owns its schedule afterwards; edit it through Scheduled rather than changing these
seed values.

## Channels

`channels` configures external messaging integrations. Currently only the Telegram bridge is
supported. When `channels.telegram` is configured, the web backend starts the bridge
automatically and applies Settings changes without requiring a restart:

| Key                                | Type         | Purpose                                       |
| ---------------------------------- | ------------ | --------------------------------------------- |
| `channels.telegram.botToken`       | string       | Telegram bot token used by the bridge.        |
| `channels.telegram.allowedChatIds` | number array | Chat IDs allowed to interact with the bridge. |

`channels.telegram.allowedChatIds` is required when the `telegram` object is present. The bot
token may come from the file or from `AIDD_TELEGRAM_BOT_TOKEN` — prefer the variable, see
[Credentials In The Environment](#credentials-in-the-environment). A `telegram` block with no
token from either source resolves as unconfigured and the bridge does not start.

## Triumvirate

`triumvirate` stores role defaults for web and CLI launches:

| Config path                  | Type         | Default            | Purpose                         |
| ---------------------------- | ------------ | ------------------ | ------------------------------- |
| `triumvirate.execCli`        | backend name | overseer backend   | Real-project execution backend. |
| `triumvirate.execModel`      | string       | overseer model     | Real-project execution model.   |
| `triumvirate.overseerCli`    | backend name | required at launch | Overseer backend.               |
| `triumvirate.overseerModel`  | string       | backend default    | Overseer model.                 |
| `triumvirate.secondaryCli`   | backend name | required at launch | Secondary planner backend.      |
| `triumvirate.secondaryModel` | string       | backend default    | Secondary planner model.        |

If execution fields are omitted in a Triumvirate launch, the overseer backend/model can be used for
the real-project execution stage.

## Shared Metadata Inputs

`sharedDirs` copies entire directories to the project root under each directory's own base name,
and only during an initializer-phase run. `sharedFiles` accepts either a string path or an object
with `source` and optional `target`; a bare string, or an object without `target`, lands at the
project root under the source file's name, so reaching `.aidd/` takes an explicit `target`. Both
keys are read from the user-level config only (never from a project's `aidd.config.json`), and a `target`
must stay inside the project root — absolute or `..`-traversing targets are skipped with a
warning:

| Config path            | Type   | Default                     | Purpose                                                        |
| ---------------------- | ------ | --------------------------- | -------------------------------------------------------------- |
| `sharedFiles[]`        | union  | none                        | A source-path string or an object entry.                       |
| `sharedFiles[].source` | string | required for object entries | Source file path.                                              |
| `sharedFiles[].target` | string | source basename at root     | Project-relative destination; must remain inside project root. |

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

`web` groups the control panel and web-backend settings:

| Config path                       | Type             | Default                                                                                  | Purpose                                                                                                                                                                                                                                                                             |
| --------------------------------- | ---------------- | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `web.allowedOrigins`              | string array     | none                                                                                     | Extra browser origins allowed when remote access is on.                                                                                                                                                                                                                             |
| `web.allowedRoots`                | string array     | `[applicationsRoot]` or parent runtime directory                                         | Filesystem roots available to the web backend.                                                                                                                                                                                                                                      |
| `web.allowRemote`                 | boolean          | `false`                                                                                  | Allows non-loopback hostnames when true. Requires `authToken`.                                                                                                                                                                                                                      |
| `web.authToken`                   | string           | none                                                                                     | Access token guarding the API. Clients send it using the `Authorization: Bearer` scheme. Required when `allowRemote` is true.                                                                                                                                                       |
| `web.autoChainLimit`              | positive integer | `3`                                                                                      | Maximum auto-launched follow-up runs per chain, counted from the original run. Only meaningful when `autoChainRuns` is true.                                                                                                                                                        |
| `web.autoChainRuns`               | boolean          | `false`                                                                                  | Opt-in: auto-launches a follow-up run when a coding run exhausts its wall-clock budget with selected features incomplete. CLI-launched runs are excluded, and so is the initializer handoff — it stays continuation-eligible but only a manual Continue crosses it.                 |
| `web.dataDir`                     | string           | `data` under the runtime base directory                                                  | SQLite, run logs, and web runtime data root.                                                                                                                                                                                                                                        |
| `web.hostname`                    | string           | `127.0.0.1`                                                                              | Web bind hostname. Non-loopback requires `allowRemote`.                                                                                                                                                                                                                             |
| `web.ignoredFolders`              | string array     | `.git`, `data`, `dist`, `frontend`, `logs`, `node_modules`, `scaffolding`, `screenshots` | Folder names skipped during project discovery.                                                                                                                                                                                                                                      |
| `web.maxConcurrentRuns`           | positive integer | `2`                                                                                      | Maximum concurrent managed web runs.                                                                                                                                                                                                                                                |
| `web.maxConcurrentRunsPerProject` | positive integer | `2`                                                                                      | Per-project cap on concurrent non-terminal managed runs.                                                                                                                                                                                                                            |
| `web.port`                        | positive integer | `3210`                                                                                   | Web bind port.                                                                                                                                                                                                                                                                      |
| `web.showSpernakitProject`        | boolean          | `false`                                                                                  | Shows the Spernakit template checkout (a discovered project named `spernakit` containing `scripts/init.ts`) on the projects page; hidden by default.                                                                                                                                |
| `web.spernakitFleetManifest`      | string           | none                                                                                     | Optional `spernakit.psd1` path; used to detect Spernakit-derived projects during intake, and as the fleet manifest that Spernakit creation registers new apps into. When unset it falls back to `spernakit.psd1` beside a configured `spernakitInitScript`, and is otherwise unset. |
| `web.spernakitInitScript`         | string           | none                                                                                     | Optional path to a local Spernakit checkout's init script. When set, Spernakit apps are created from that checkout; when unset, the template is cloned on demand.                                                                                                                   |
| `web.spernakitTemplateRef`        | string           | none                                                                                     | Optional git tag/branch to clone for `spernakitTemplateRepo`; defaults to the repo's default branch. Changing it rebuilds the cached clone.                                                                                                                                         |
| `web.spernakitTemplateRepo`       | string           | `NomadicDaddy/spernakit`                                                                 | `owner/repo` cloned into `<dataDir>/templates/spernakit` when creating a Spernakit app without a configured `spernakitInitScript`.                                                                                                                                                  |
| `web.templates`                   | object array     | none                                                                                     | Project-creation template registry. See below.                                                                                                                                                                                                                                      |
| `web.traceDataMovement`           | boolean          | `false`                                                                                  | Enables data-movement trace records.                                                                                                                                                                                                                                                |
| `web.useWorktrees`                | boolean          | `false`                                                                                  | Runs web/Director-launched coding mode in isolated git worktrees.                                                                                                                                                                                                                   |

`web.dataDir` must resolve inside the repository root `data/` directory and must not target
`backend/data`.

`web.templates[]` entries define project-creation lanes:

| Config path                           | Type         | Default  | Purpose                                                                                |
| ------------------------------------- | ------------ | -------- | -------------------------------------------------------------------------------------- |
| `web.templates[].cwd`                 | enum         | `root`   | Runs the command from `root` or `targetPath`.                                          |
| `web.templates[].description`         | string       | `name`   | Operator-facing template description.                                                  |
| `web.templates[].initCommand`         | string array | required | Command and arguments used to scaffold the project.                                    |
| `web.templates[].name`                | string       | required | Unique template name.                                                                  |
| `web.templates[].postCreate`          | enum         | `ingest` | Launches `coding-run` or the project `ingest` pipeline after creation.                 |
| `web.templates[].requiresDescription` | boolean      | `false`  | Requires a non-empty project description.                                              |
| `web.templates[].rootMustBeInitDir`   | boolean      | `false`  | Requires the selected root to equal the parent of an absolute init script's directory. |

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
interfaces or a concrete LAN address. Remote binding requires a non-empty `web.authToken`; the web
backend refuses to start if `allowRemote` is true while `authToken` is missing or blank, so a
remote-bound control panel can never listen without API authentication. The check lives at startup
rather than in config resolution because every aidd process reads the same configuration, including
the coding CLI a run spawns, and that CLI is deliberately given an environment without
`AIDD_WEB_AUTH_TOKEN`. Supply the token through
`AIDD_WEB_AUTH_TOKEN` and leave it out of the file
(see [Credentials In The Environment](#credentials-in-the-environment)):

```json
{
	"web": {
		"allowRemote": true,
		"allowedOrigins": ["http://192.0.2.10:3210", "http://demo-host:3210"],
		"hostname": "0.0.0.0",
		"port": 3210
	}
}
```

An `authToken` written into the file still works and still satisfies `allowRemote`.

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

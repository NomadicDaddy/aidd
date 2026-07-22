# Backend Adapters

All backends implement `CLIBackend` and emit normalized `AgentEvent` values.

Event normalization lets the orchestrator handle provider output without knowing whether the source
was the native backend, Ollama or LM Studio through the native backend, an external CLI process
(Claude Code, OpenCode, or KiloCode) parsed as plain text, or Codex JSON.

Adapter responsibilities:

- build the backend command or invoke the native backend loop
- preserve raw stdout/stderr as `raw_log` events
- parse backend-specific output into assistant text, tool calls, tool results, usage, rate limits,
  errors, and done events
- rely on `monitorBackend` for idle/nudge/kill policy

## Supported Backends

| Backend       | Runtime path                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `native`      | In-process OpenAI-compatible agent loop in `shared/src/agent/` (native backend in `shared/src/backends/native.ts`). |
| `ollama`      | Native backend with Ollama provider defaults.                                                                       |
| `lmstudio`    | Native backend with LM Studio provider defaults.                                                                    |
| `openai`      | Native backend with OpenAI provider defaults (direct `api.openai.com`, no external CLI).                            |
| `claude-code` | External Claude Code CLI process; output handled by the default plain-text parser.                                  |
| `opencode`    | External OpenCode CLI process; output handled by the default plain-text parser.                                     |
| `kilocode`    | External KiloCode CLI process; output handled by the default plain-text parser.                                     |
| `codex`       | External Codex CLI process with dedicated JSON/event parsing.                                                       |
| `grok`        | External Grok Build (`grok`) CLI process with dedicated streaming-json parsing.                                     |

`shared/src/plan/types.ts` is the source of truth for backend names. Unsupported backend names are
rejected at input boundaries before a run plan is executed. `codex` and `grok` use dedicated parsers
(`shared/src/backends/parsers/codex.ts`, `shared/src/backends/parsers/grok.ts`); the other external
CLIs use the shared plain-text parser (`shared/src/backends/parsers/plain.ts`).

## Setting Up a Backend

Pick the default backend with the top-level `cli` key in `~/.aidd/config.json`, or override per run
with `--cli <name>`. There are two families:

- **`native` / `ollama` / `lmstudio` / `openai`**: aidd talks to an OpenAI-compatible model provider
  itself. Simplest if you have a provider API key (or a local Ollama / LM Studio server). No extra
  tool to install.
- **`claude-code` / `opencode` / `kilocode` / `codex` / `grok`**: aidd drives an external agent CLI
  you install and sign in to separately.

### Native backend (`native`)

The native backend calls an OpenAI-compatible provider directly. Five providers ship with defaults:

| Provider          | Default model        | Base URL                              | API key                     |
| ----------------- | -------------------- | ------------------------------------- | --------------------------- |
| `zhipu` (default) | `glm-5.2`            | `https://api.z.ai/api/coding/paas/v4` | required (`ZHIPU_API_KEY`)  |
| `xai`             | `grok-4.5`           | `https://api.x.ai/v1`                 | required (`XAI_API_KEY`)    |
| `openai`          | `gpt-5.6`            | `https://api.openai.com/v1`           | required (`OPENAI_API_KEY`) |
| `ollama`          | `gpt-oss:20b`        | `http://localhost:11434/v1`           | none (local)                |
| `lmstudio`        | `openai/gpt-oss-20b` | `http://localhost:1234/v1`            | none (local)                |

Configure it in `~/.aidd/config.json`:

```json
{
	"cli": "native",
	"defaultProvider": "zhipu",
	"providers": {
		"zhipu": { "apiKey": "sk-…", "model": "glm-5.2" }
	}
}
```

Or supply the key by environment variable instead of storing it in config, handy for CI or shared
machines:

```powershell
$env:ZHIPU_API_KEY = "sk-…"   # or XAI_API_KEY; NATIVE_API_KEY works for any provider
```

Resolution precedence for each setting is **environment → `providers.<name>` → built-in default**
(`NATIVE_PROVIDER`, `NATIVE_API_KEY`/`ZHIPU_API_KEY`/`XAI_API_KEY`, `NATIVE_BASE_URL`,
`NATIVE_MODEL`). A missing required key fails fast with a message naming the variable to set. API
keys are used only in the request auth header, never logged.

### OpenAI (direct API)

`openai` is a backend name that runs on the native machinery pointed at `https://api.openai.com/v1`.
aidd drives its own agent loop against OpenAI's Chat Completions API directly — no external Codex CLI
to install or sign into. (The separate `codex` backend still exists for driving OpenAI's own Codex CLI
harness.)

```json
{ "cli": "openai", "providers": { "openai": { "apiKey": "sk-…", "model": "gpt-5.6" } } }
```

Supply the key via `providers.openai.apiKey`, or the `OPENAI_API_KEY` / `NATIVE_API_KEY` env var.
`reasoning_effort` is forwarded to reasoning-capable models; requests use the Chat Completions API
(not the Responses API). Remote providers stream responses by default (SSE), which keeps long
reasoning turns from tripping upstream idle timeouts and feeds the live run console mid-turn:
assistant narration streams into the console as it is generated, reasoning phases surface as
throttled `[reasoning… Nk chars]` progress lines, and the `AIDD_RESULT` payload is collapsed to a
compact note. Local providers (`ollama`, `lmstudio`) default to non-streaming and log per turn.
Override per provider with `providers.<name>.stream` (set `false` for an endpoint that is not
OpenAI SSE-compatible) and tune the no-bytes stall timeout with
`providers.<name>.streamIdleTimeoutMs` (ms).

### Ollama (fully local, no key)

`ollama` is a backend name that runs on the native machinery with Ollama's defaults: a local model
server, no API key, nothing leaves your machine.

```json
{ "cli": "ollama", "providers": { "ollama": { "model": "gpt-oss:20b" } } }
```

Make sure Ollama is running and the model is pulled (`ollama pull gpt-oss:20b`).

### LM Studio (fully local, no key)

`lmstudio` is a backend name that runs on the native machinery with LM Studio's defaults. LM Studio
exposes an OpenAI-compatible server at `http://localhost:1234/v1`, so aidd talks to it the same way it
talks to any other provider: no API key, and nothing leaves your machine.

```json
{ "cli": "lmstudio", "providers": { "lmstudio": { "model": "openai/gpt-oss-20b" } } }
```

Start LM Studio's local server (Developer → Start Server) and load a model first. The `model` id must
match the model loaded in LM Studio; the built-in default is only a placeholder. aidd does not send
`reasoning_effort` to LM Studio, since it is not part of LM Studio's documented chat parameters.

### External CLI backends (`claude-code`, `opencode`, `kilocode`, `codex`, `grok`)

aidd spawns an agent CLI you provide; authentication and model config for that tool live in the tool
itself. To use one:

1. **Install and sign in** to the CLI per its own docs, and confirm the command is on your `PATH`:
   `claude` (claude-code), `opencode`, `kilo` (kilocode), `codex`, or `grok`.
2. **Point aidd at it** with `cli` (or `--cli`), and optionally pin a model with `backends.<name>.model`:

    ```json
    { "backends": { "opencode": { "model": "zai-coding-plan/glm-5.2" } }, "cli": "opencode" }
    ```

> **Grok Build (`grok`).** Install via xAI's instructions (docs.x.ai/build) and authenticate with
> `grok login` or `XAI_API_KEY`. aidd runs it headless with `--permission-mode bypassPermissions` and
> delivers the prompt via `--prompt-file` (grok does not read a prompt from stdin). Its default model
> is `grok-4.5`; `--reasoning-effort` accepts only `low`/`medium`/`high` (aidd clamps `xhigh` → `high`).
> Grok's headless output surfaces no tool-call events, so the Live Console shows its reasoning and
> final text but not intermediate tool steps. It is not baked into the Docker image — install it in
> the container yourself if you need `grok` there.

> **Model ids are the CLI's, not aidd's.** `backends.<name>.model` is passed straight through to the
> tool, so it must be an id that tool accepts. For example OpenCode wants the provider-qualified form
> `zai-coding-plan/glm-5.2` (run `opencode models` to list valid ids). A bare or wrong-prefix id
> makes the provider return an "Unexpected server error". Omit `model` to use the CLI's own default.

Each external CLI (plus native) has a backend-specific prompt fragment under `prompts/_cli/` so
tool-use guidance matches the active backend.

## Verifying a backend

Run the backend smoke, which exercises every backend it finds on `PATH` (missing CLIs are skipped
unless you pass `-RequireExternal`):

```powershell
bun run smoke:backends
```

Or prove the wiring without spending tokens using native simulation:

```powershell
bun run start -- --project-dir C:\path\to\a-project --cli native --simulation --max-iterations 1 --feature <id>
```

## Parser Coverage

Parser fixture tests live under `test/fixtures/backends/{backend}`. Each backend has success,
rate-limit, and malformed-output fixtures so parser behavior can be changed deliberately instead of
accidentally. When changing adapter behavior, re-run the backend smoke (see
[Verifying a backend](#verifying-a-backend)).

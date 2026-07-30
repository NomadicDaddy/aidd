# aidd: local mission control for AI coding agents

**aidd** drives coding agents through a real plan → code → audit → review loop and gives you
a single local control panel to launch, watch, and steer that work across all your projects.
It runs entirely on your machine: a Bun/TypeScript CLI plus an embedded web app, working
against project-local `.aidd/` metadata. There are no accounts and no cloud service, and no
telemetry leaves your machine.

Point it at a backend you already use: the built-in **native** provider (any
OpenAI-compatible API, including xAI/Grok), a local **Ollama** or **LM Studio**
server, or an agent CLI like **Claude Code**, **Cline**, **opencode**, **kilocode**, or
**codex**. aidd handles the orchestration, structured results, audits, and
run history.

## Highlights

- **One local control panel**: Dashboard, Projects, Runs, Director, Audits, Skills,
  Recipes, Pipeline Sessions, Telemetry, and Settings, plus an embedded terminal pane
  (``Ctrl+` ``) with persistent PTY sessions.
- **Fleet Director**: looks across every project and proposes prioritized work; a
  tool-calling chat agent can drive it.
- **Creation lanes**: start a project three ways: create fresh, scaffold from a registered
  template (`web.templates`), or ingest an existing codebase.
- **Repeatable workflows**: file-backed recipes, plus one-shot skills, runnable
  from the panel or the CLI.
- **Built-in audits**: security, architecture, performance, and more, with findings that flow
  into your backlog.
- **Drive it from anywhere**: an MCP server for MCP-capable agents and a Telegram bridge for
  your phone.
- **Local-first by design**: see [PRIVACY.md](PRIVACY.md).

## Prerequisites

- **Bun 1.3.14** or newer.
- **Git**: aidd uses it for run diffs, the run ledger, and worktrees. aidd degrades gracefully
  if it is absent, but install it for full functionality.
- **Windows 11 + PowerShell 7** is the verified platform; macOS/Linux run from source but are
  not yet smoke-covered.
- Node.js `24.x` only if you use Node-compatible tooling under `scripts/`.

## Install & quickstart

```powershell
bun install
bun run start:web          # starts the control panel at http://127.0.0.1:3210
bun run start:web -- --foreground  # run the web backend in this terminal
```

Prefer prebuilt binaries with no Bun runtime? Download the Windows zip from the
[latest release](https://github.com/NomadicDaddy/aidd/releases/latest), verify its checksum, and
launch. See **[Install From a Release](docs/guides/deployment.md#install-from-a-release)**.

For the full first-run walkthrough (adding a project and running your first workflow), see
**[docs/guides/quickstart.md](docs/guides/quickstart.md)**.

Before you point aidd at a project, **[What aidd Can Modify](docs/guides/what-aidd-modifies.md)**
lists exactly what it reads, writes, runs, and sends.

Common CLI commands:

```powershell
bun run start -- --help
bun run start -- --project-dir C:\path\to\your-app --check-features
bun run start -- --project-dir C:\path\to\your-app --audit SECURITY
bun run start -- --web
```

## Workflows

- **[Recipes](docs/guides/recipes.md)**: multi-step pipelines (`name`, `description`,
  `parameters`, ordered `steps`) backed by `recipes/*.json`. Launching one creates a pipeline
  session. Supported steps: `aidd-cli`, `skill`, `shell`, `recipe-ref`.
- **[Skills](docs/guides/skills.md)**: directive bundles (definition + support
  files) composed by recipes or run one-shot from the panel or via `--skill`; managed local
  imports persist under `data/skills`.
- **[Audits](docs/guides/audits.md)**: read-only review passes whose findings become backlog
  features.
- **[Backends](docs/guides/backends.md)**: choosing and configuring the agent/provider.

## Director

The `/director` page is the fleet-level surface: a saved profile (backend, model, reasoning
effort, role, instructions), background cycles that produce prioritized **suggestions**, and a
chat agent. With a tool-calling Direct AI provider, chat can inspect the fleet and orchestrate
work (launch runs, start cycles, act on suggestions); each reply shows the actions it took. By
default the agent never edits files itself (changes flow through supervised runs visible on
`/runs`) unless you opt in via **Allow Director chat to edit project files directly** in
Settings. See [docs/guides/director.md](docs/guides/director.md).

## Drive aidd from elsewhere

### MCP server

`aidd --mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io) server over
stdio so MCP-capable agents (Claude Code, Claude Desktop, …) can drive aidd as tools. Every
tool proxies the local web API, so **the web backend must be running first**:

```powershell
bun run start:web
```

Register it with your client (a typical `mcpServers` map):

```json
{ "mcpServers": { "aidd": { "args": ["--mcp"], "command": "aidd" } } }
```

It talks to `http://127.0.0.1:<web.port>` and attaches `web.authToken` automatically when set
(loopback calls are exempt). Tools: `list_projects`, `get_project`, `launch_run`, `get_run`,
`run_output`, `stop_run`, `kill_run`, `list_suggestions`, `launch_suggestion`, `run_cycle`,
`director_chat`.

### Telegram bridge

When `channels.telegram` is configured, the web backend automatically lets you chat with the
Director from your phone. It long-polls Telegram (outbound only) and forwards allowed
messages to the Director chat API. Because chat is an agent, a bridged message can launch
supervised runs and cycles, so `allowedChatIds` is your access control; keep it tight. Create
a bot with [@BotFather](https://t.me/BotFather), find your numeric chat id, and add both to
`~/.aidd/config.json` or the Settings page:

```json
{ "channels": { "telegram": { "allowedChatIds": [123456789], "botToken": "123456:ABC-DEF…" } } }
```

The bot token stays in `~/.aidd/config.json` and is never exposed through web settings. The
web backend must be running.

## Triumvirate mode

An opt-in run wrapper where a primary planner, secondary planner, and overseer review work
before an execution stage mutates the real project. Planning runs against a scratch mirror and
the worktree is guarded before execution.

```powershell
bun run start -- --project-dir C:\path\to\your-app --triumvirate `
  --cli native --secondary-cli codex --overseer-cli claude-code
```

See [docs/guides/triumvirate.md](docs/guides/triumvirate.md) for role flags, web launch,
safety behavior, and the artifact schema.

## Configuration

Settings are edited at `/settings` and written to `~/.aidd/config.json`, so CLI and web launches
share defaults. Project discovery roots are labeled `applicationRoots` in the UI and stored as
`web.allowedRoots`. Run defaults come from `cli`, `model`, `codeModel`, `auditModel`,
`reasoningEffort`, and per-backend entries; every launch surface resolves them through one
shared launch-target resolver (per-launch override → mode model → backend model → shared
model → provider default), so the CLI and web panel can never disagree. Full reference:
[docs/guides/configuration.md](docs/guides/configuration.md) and
[config.json.example](config.json.example).

## Quality gates

```powershell
bun run start -- --project-dir . --check-features
bun run start -- --project-dir . --check-artifacts
bun run smoke:qc:fast # cached max-lines, typecheck, format, and lint inner loop
bun run smoke:qc      # typecheck, tests, frontend build, audit mapping, formatting
bun run smoke:e2e
bun run smoke:backends
```

## Build proofs

The public [aidd build-proofs campaign](https://github.com/NomadicDaddy/aidd-build-proofs)
preserves seven instrumented dogfood runs across the fresh-scaffold, third-party-template,
Spernakit, existing-app ingest, GitHub-template, local-model, and agent-driven lanes. Six produced
passing applications; the local-model-only run failed its gate and is published as it ran. It
includes committed app snapshots, structured run evidence, replay results, and scrubbed
transcripts. This is historical first-party evidence, not a current benchmark or an independent
audit.

## Documentation

- **[docs/README.md](docs/README.md)**: the full documentation index (guides, reference,
  architecture).
- **[CONTEXT.md](CONTEXT.md)**: the canonical glossary of aidd terminology.

## Project layout

| Directory                                       | Contents                                                                 |
| ----------------------------------------------- | ------------------------------------------------------------------------ |
| `cli/`                                          | CLI parsing, config, modes, prompt compilation, backends, orchestration. |
| `backend/`                                      | Embedded web backend, SQLite schema, routes, run launcher, services.     |
| `frontend/`                                     | React control panel.                                                     |
| `shared/`                                       | Browser-safe contracts and path helpers.                                 |
| `prompts/` · `audits/` · `skills/` · `recipes/` | Bundled source catalogs.                                                 |
| `data/skills/`                                  | Persistent managed skill imports and provenance.                         |
| `scripts/`                                      | Smoke, crawl, packaging, benchmark, and maintenance tooling.             |
| `docs/`                                         | Guides, reference, and architecture docs.                                |

## Support, security, and privacy

- Questions and bug reports: [SUPPORT.md](SUPPORT.md).
- Reporting a vulnerability: [SECURITY.md](SECURITY.md).
- What stays on your machine: [PRIVACY.md](PRIVACY.md).
- License: [FSL-1.1-ALv2](LICENSE) (Functional Source License; converts to Apache 2.0 after two years).

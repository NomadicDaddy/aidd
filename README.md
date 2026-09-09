# aidd: local control panel for AI coding work

**aidd** drives coding agents through a real plan → run → audit → review loop and gives you
a single local control panel to launch, watch, and steer that work across all your projects.
It runs entirely on your machine: a Bun/TypeScript CLI plus an embedded web app, working
against project-local `.aidd/` metadata. There are no accounts and no cloud service, and no
telemetry leaves your machine.

Use your IDE to edit code and aidd to manage agent runs across projects. Each run keeps its
instructions, results, and history available for review.

Point it at a backend you already use: the built-in **native** provider (any
OpenAI-compatible API, including xAI/Grok), the **openai** preset, a local
**Ollama** or **LM Studio** server, or an agent CLI — **Claude Code**,
**Cline**, **codex**, **grok**, **kilocode**, or **opencode**. aidd handles the
orchestration, structured results, audits, and run history. See
[docs/reference/backends.md](docs/reference/backends.md) for all ten.

Product overview and audience guides: **[nomadicdaddy.github.io/aidd](https://nomadicdaddy.github.io/aidd/)**.

## Highlights

- **One local control panel**: Dashboard, Projects, Runs, Director, Audits, Skills,
  Recipes, Pipeline Sessions, Telemetry, and Settings, plus an embedded terminal pane
  (``Ctrl+` ``) with persistent PTY sessions.
- **Fleet Director**: looks across every project and proposes prioritized work; a
  tool-calling chat agent can drive it.
- **Creation lanes**: start a project four ways: create fresh, scaffold from a registered
  template (`web.templates`, always including a built-in Spernakit entry), clone a GitHub
  template repository with fresh history, or ingest an existing codebase.
- **Repeatable workflows**: file-backed recipes, plus one-shot skills, runnable
  from the panel or the CLI.
- **Built-in audits**: security, architecture, performance, and more, with findings that flow
  into your backlog.
- **Drive it from anywhere**: an MCP server for MCP-capable agents and a Telegram bridge for
  your phone.
- **Local-first by design**: see [PRIVACY.md](PRIVACY.md).

## Free under Fair Source

Every shipped capability is included: supervised runs, scheduled automation, Director cycles and
bounded suggestion auto-launch, continuous follow-ups, every audit, recipe, skill, backend, MCP
tool, and the Telegram bridge. They ship together under the same license and run without an aidd
account.

aidd is released under FSL-1.1-ALv2 and converts to Apache-2.0 two years after publication. See
[docs/reference/licensing.md](docs/reference/licensing.md) for the terms and the complete capability
statement.

## Prerequisites

- **Bun 1.4.2** or newer.
- **Git**: aidd uses it for run diffs, the run ledger, and worktrees. aidd degrades gracefully
  if it is absent, but install it for full functionality.
- **Windows 11 + PowerShell 7** is the primary platform and the only one with browser-smoke
  coverage. **Linux** runs the full quality gate and test suite in CI on every push. **macOS** has
  no automated coverage; it is expected to work but is verified only by hand.
- Node.js `24.x` only if you use Node-compatible tooling under `scripts/`.

## Install & quickstart

aidd ships as source. Clone it (or extract a tag's source archive), then install and start:

```powershell
git clone https://github.com/NomadicDaddy/aidd.git
cd aidd
bun install
bun run start:web          # starts the control panel at http://127.0.0.1:3210
bun run start:web -- --foreground  # run the web backend in this terminal
```

Prefer a pinned version over tracking `main`? Download the source archive for a tag from the
[latest release](https://github.com/NomadicDaddy/aidd/releases/latest), extract it, and run
`bun install` inside. There are no prebuilt binaries, so Bun is required either way. See
**[Install](docs/reference/deployment.md#install)**.

For the full first-run walkthrough (adding a project and running your first workflow), see
**[docs/quickstart.md](docs/quickstart.md)**.

Before you point aidd at a project, **[What aidd Can Modify](docs/reference/what-aidd-modifies.md)**
lists exactly what it reads, writes, runs, and sends.

Common CLI commands:

```powershell
bun run start -- --help
bun run start -- --project-dir C:\path\to\your-app --check-features
bun run start -- --project-dir C:\path\to\your-app --audit SECURITY
bun run start -- --web
```

## Workflows

- **[Recipes](docs/reference/recipes.md)**: multi-step pipelines (`name`, `description`,
  `parameters`, ordered `steps`) backed by `recipes/*.json`. Launching one creates a pipeline
  session. Supported steps: `aidd-cli`, `skill`, `shell`, `recipe-ref`.
- **[Skills](frontend/content/docs/skills.md)**: directive bundles (definition + support
  files) composed by recipes or run one-shot from the panel or via `--skill`; managed local
  imports persist under `data/skills`.
- **[Audits](frontend/content/docs/audits.md)**: read-only review passes whose findings become backlog
  features.
- **[Backends](docs/reference/backends.md)**: choosing and configuring the agent/provider.

## Director

The `/director` page is the fleet-level surface: a saved profile (backend, model, reasoning
effort, role, instructions), background cycles that produce prioritized **suggestions**, and a
chat agent. With a tool-calling Direct AI provider, chat can inspect the fleet and orchestrate
work (launch runs, start cycles, act on suggestions); each reply shows the actions it took. By
default the agent never edits files itself (changes flow through supervised runs visible on
`/runs`) unless you opt in via **Allow Director chat to edit project files directly** in
Settings. See [frontend/content/docs/director.md](frontend/content/docs/director.md).

## Drive aidd from elsewhere

### MCP server

`bun run start -- --mcp` runs a [Model Context Protocol](https://modelcontextprotocol.io)
server over stdio so MCP-capable agents (Claude Code, Claude Desktop, …) can drive aidd as
tools. Every tool proxies the local web API, so **the web backend must be running first**:

```powershell
bun run start:web
```

Register it with your client (a typical `mcpServers` map). aidd installs from source and
publishes no `aidd` executable, so the client spawns Bun against this checkout — and `cwd`
is required, because the client would otherwise spawn in its own working directory and the
scripts resolve relative to the repository root:

```json
{
	"mcpServers": {
		"aidd": {
			"args": ["run", "start", "--", "--mcp"],
			"command": "bun",
			"cwd": "C:/path/to/aidd"
		}
	}
}
```

It talks to `http://127.0.0.1:<web.port>` and attaches `web.authToken` automatically when set
(loopback calls are exempt). Tools: `list_projects`, `get_project`, `launch_run`, `get_run`,
`run_output`, `stop_run`, `kill_run`, `list_suggestions`, `launch_suggestion`, `run_cycle`,
`director_chat`.

### Telegram bridge

When `channels.telegram` is configured, the web backend automatically lets you chat with the
Director from your phone. It long-polls Telegram (outbound only) and forwards allowed
messages to the Director chat API. Because chat is an agent, a bridged message can launch
supervised runs and cycles — and can edit project files too when **Allow Director chat to
edit project files directly** is on, since that setting is not scoped to the panel. So
`allowedChatIds` is your access control; keep it tight. Create a bot with
[@BotFather](https://t.me/BotFather), find your numeric chat id, then declare the channel in
`~/.aidd/config.json` or the Settings page:

```json
{ "channels": { "telegram": { "allowedChatIds": [123456789] } } }
```

and put the bot token in `AIDD_TELEGRAM_BOT_TOKEN` rather than in the config file — an agent asked
to inspect your configuration reads that whole file, and a credential in it leaves with the
answer. The token may still be set as `botToken` in the file if you prefer; either way it is never
exposed through web settings. See
[credentials in the environment](docs/reference/configuration.md#credentials-in-the-environment).
The web backend must be running.

## Triumvirate mode

An opt-in run wrapper where a primary planner, secondary planner, and overseer review work
before an execution stage mutates the real project. Planning runs against a scratch mirror and
the worktree is guarded before execution.

```powershell
bun run start -- --project-dir C:\path\to\your-app --triumvirate `
  --cli native --secondary-cli codex --overseer-cli claude-code
```

See [docs/reference/triumvirate.md](docs/reference/triumvirate.md) for role flags, web launch,
safety behavior, and the artifact schema.

## Configuration

Settings are edited at `/settings` and written to `~/.aidd/config.json`, so CLI and web launches
share defaults. Project discovery roots are labeled `applicationRoots` in the UI and stored as
`web.allowedRoots`. Run defaults come from `cli`, `model`, `codeModel`, `auditModel`,
`reasoningEffort`, and per-backend entries; every launch surface resolves them through one
shared launch-target resolver (per-launch override → mode model → backend model → shared
model → provider default), so the CLI and web panel can never disagree. Full reference:
[docs/reference/configuration.md](docs/reference/configuration.md) and
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

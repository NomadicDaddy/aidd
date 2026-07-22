# Privacy

aidd is local-first. It runs on your machine and does not phone home.

## No telemetry by default

aidd does not send usage analytics, crash reports, or any telemetry to us or to any third
party. The **Telemetry** dashboard you see in the control panel is entirely local: every
invocation is recorded in a local SQLite database and read back only to render that dashboard.
Nothing in the telemetry service makes outbound network calls. See
[docs/guides/telemetry.md](docs/guides/telemetry.md).

## Where your data lives

| Data                                  | Location                          |
| ------------------------------------- | --------------------------------- |
| User settings, provider keys, tokens  | `~/.aidd/config.json`             |
| Web app database (runs, telemetry, …) | the local `data/` directory       |
| Per-project metadata, runs, audits    | each project's `.aidd/` directory |
| Logs                                  | the local `logs/` directory       |

Provider API keys and channel tokens stay in `~/.aidd/config.json` and are never exposed
through the web settings surface.

## What does leave your machine

aidd only makes the network calls **you** configure:

- **Your chosen AI backend/provider.** When you run a workflow, the relevant project content
  and prompts are sent to the backend you selected (e.g. an OpenAI-compatible API, or a local
  Ollama instance that stays on your machine). What is sent, retained, and logged is governed
  by that provider's own privacy policy. Choose a local backend if you want nothing to leave
  the machine at all.
- **The Telegram bridge**, only if you configure `channels.telegram`: it long-polls
  Telegram's API to exchange messages with the chat ids you allowlist.
- **Optional update/download checks** you initiate.

aidd does not bind to the network by default: the web panel listens on `127.0.0.1`. Remote
binding is opt-in; see [docs/guides/deployment.md](docs/guides/deployment.md).

## Your control

Your project metadata under `.aidd/` is yours; uninstalling aidd does not touch it. You can
delete the local `data/` and `logs/` directories and `~/.aidd/config.json` at any time to
remove aidd's own stored state.

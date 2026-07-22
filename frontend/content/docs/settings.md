# Settings

Settings is where you configure the aidd runtime for this machine. Changes here
affect discovery, defaults, and how runs behave across your whole fleet. The
page is organized into tabs: **Paths**, **Runtime**, **Defaults**, **Providers**,
**Backends**, **Channels**, and **Source Control**.

## Paths

- **Applications Root**: the top-level directory used to resolve bare project
  names, and the fallback for Application Roots when none are configured.
- **Application Roots**: the folders aidd scans for projects. Add every
  directory tree that contains projects you want to drive; any folder with an
  `.aidd/` directory under a root is discovered automatically.
- **Ignored Folders**: patterns excluded from discovery and scanning. Use
  these to keep large or irrelevant directories (build output, caches,
  vendored code) out of the way.
- **Network Access**: the panel binds to localhost by default; enabling
  remote access requires an access token.
- **Shared Metadata**: directories and files copied into newly scaffolded
  `.aidd/` metadata.

## Runtime

- **Control panel**: restart or shut down the panel, and change the listener
  port. A port change triggers a graceful restart and redirects your browser
  to the new port.
- **Run Limits**: caps on concurrent managed runs, fleet-wide and per
  project.
- **Director Auto-Cycle**: opt-in scheduled Director cycles on a fixed
  interval.
- **Observability** and **System Metrics**: tracing switches and live
  process/system metrics.

## Defaults

- **CLI and model defaults**: the execution engine and model used when a run
  doesn't specify its own. Every launch surface resolves the same way:
  per-launch override, then mode model (audit/code), then backend model, then
  the shared model, then the provider default.
- **Audits enabled**: a single global toggle for audit behavior. Per-audit
  applicability and overrides live on the Audits page.
- **Triumvirate defaults**: the planner and overseer configuration used when
  a run opts into the Triumvirate wrapper.

## Providers

- **Provider configuration**: base URLs, models, and credentials for the
  OpenAI-compatible providers used by the native-family engines.
- **Direct AI**: an opt-in capability that lets the control panel call a
  compatible provider in-process for lightweight surfaces (Director cycles,
  chat, project recommendations) instead of spawning a full run.
- **Director profile**: the persona the Director uses: engine, model,
  reasoning effort, role, and behavior instructions.

## Backends

A status panel showing which agent CLIs are installed and reachable, plus a
per-backend defaults table (model and idle timeouts) covering every engine,
including local Ollama and LM Studio servers.

## Channels

The Telegram bridge: a bot token plus allowed chat IDs let you chat with the
Director from your phone. The token stays in the local config file.

## Source Control

A read-only status panel for the git tooling aidd depends on.

## Tips

- If projects aren't being discovered, check roots and ignored folders under
  **Paths** first.
- Save persists your changes; a port change is the only setting that restarts
  the panel.

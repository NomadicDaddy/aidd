# Settings

Settings is where you configure the aidd runtime for this machine. Changes here
affect discovery, defaults, and how runs behave across your whole fleet. The
page is organized into five tabs: **Workspace**, **Run Engine**,
**AI & Director**, **Integrations**, and **Control Panel**.

Each tab marks itself when it holds unsaved edits, and one Save commits the
whole form.

## Workspace

- **Applications Root**: the top-level directory used to resolve bare project
  names, and the fallback for Application Roots when none are configured.
- **Application Roots**: the folders aidd scans for projects. Add every
  directory tree that contains projects you want to drive; any folder with an
  `.aidd/` directory under a root is discovered automatically.
- **Ignored Folders**: patterns excluded from discovery and scanning. Use
  these to keep large or irrelevant directories (build output, caches,
  vendored code) out of the way.
- **Shared Metadata**: directories and files copied into newly scaffolded
  `.aidd/` metadata.

## Run Engine

- **Run Limits**: caps on concurrent managed runs, fleet-wide and per project.
- **Backend defaults**: a per-backend table covering every engine, including
  local Ollama and LM Studio servers. Each row carries that backend's model and
  idle timeouts, and shows whether the CLI is installed and reachable, so
  install status and defaults live in one place.

## AI & Director

- **Model Routing**: the execution engine and model used when a run doesn't
  specify its own — Default CLI, Default Model, Reasoning Effort, and the
  per-mode Init, Code, and Audit models. Every launch surface resolves the same
  way: per-launch override, then mode model (init/code/audit), then backend
  model, then the shared model, then the provider default.
- **Audits enabled**: a single global toggle for audit behavior. Per-audit
  applicability and overrides live on the Audits page.
- **Spernakit template**: the init script, template repository, and ref used by
  the From Template intake lane, plus whether Spernakit itself appears in the
  projects list.
- **Provider configuration**: base URLs, models, and credentials for the
  OpenAI-compatible providers used by the native-family engines.
- **Direct AI**: an opt-in capability that lets the control panel call a
  compatible provider in-process for lightweight surfaces (Director cycles,
  chat, project recommendations) instead of spawning a full run.
- **Director profile**: the persona the Director uses: engine, model,
  reasoning effort, role, and behavior instructions.
- **Director Auto-Cycle**: opt-in scheduled Director cycles on a fixed
  interval.
- **Triumvirate defaults**: the planner and overseer configuration used when a
  run opts into the Triumvirate wrapper.

## Integrations

- **Telegram**: a bot token plus allowed chat IDs let you chat with the
  Director from your phone. The token stays in the local config file.
- **Source Control**: a read-only status panel for the git tooling aidd
  depends on.

## Control Panel

- **Runtime controls**: restart or shut down the panel, and change the listener
  port. A port change triggers a graceful restart and redirects your browser to
  the new port.
- **Network Access**: the panel binds to localhost by default; enabling remote
  access requires an access token.
- **Observability** and **System Metrics**: tracing switches and live
  process/system metrics.

## Tips

- If projects aren't being discovered, check roots and ignored folders under
  **Workspace** first.
- Save persists your changes; a port change is the only setting that restarts
  the panel.

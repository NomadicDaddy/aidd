# Settings

Settings is where you configure the aidd runtime for this machine. Changes here affect discovery, defaults, and how runs behave across your whole fleet. The page is organized into five tabs: **Workspace**, **Run Engine**, **AI & Director**, **Integrations**, and **Control Panel**.

Each tab marks itself when it holds unsaved edits. **Save Settings** saves the configuration across all five tabs. The Director Profile is a separate record with its own **Save Profile** button, and restart or shutdown actions also run separately.

## Workspace

Fallback discovery root
: the top-level directory used to resolve bare project names and the default discovery root when no Application Roots are configured.
Application Roots
: the folders aidd scans for projects. Discovery recognizes project directories with `.aidd/` metadata at most two directory levels below each root; a root can also point directly at one project.
Ignored Folders
: directory names or `*`/`?` patterns excluded from discovery and scanning. Use these to keep large or irrelevant directories (build output, caches, vendored code) out of the way.
Spernakit Scaffolding
: the init script, template repository, template ref, and project-list visibility used by the From Template creation lane.
Shared Directories
: directories copied by basename into the project root during fresh-project scaffolding. These copies can overwrite matching files.
Shared Files
: files copied during scaffolding to a project-relative target, or to the project root using the source filename when no target is set. Copies can overwrite existing files; a write allowlist, when present, limits the permitted targets.

## Run Engine

Concurrency
: the fleet-wide run limit and isolated-worktree behavior.
Budgets & Timeouts
: run duration, iteration, turn, idle, and nudge limits. Token and cost budgets are advisory: exceeding them warns but does not stop the run.
Backoff & Safeguards
: rate-limit handling, retry thresholds, dirty-tree limits, and cleanup behavior.
CLI Matrix
: a per-backend table covering every engine, including Ollama and LM Studio. Each row carries that backend's model, reasoning effort, and idle timeouts. The status probe runs the backend's version command; it confirms command availability, not that a provider server or account is reachable.

## AI & Director

Director Profile
: the persona the Director uses: CLI, model, reasoning effort, role, and behavior instructions. This is an independent record saved with **Save Profile**, not **Save Settings**.
Model Routing
: the execution engine and model used when a run doesn't specify its own: Default CLI, Default Model, Reasoning Effort, and the per-mode Code and Audit model fields. For Code and Audit, model precedence is per-launch override, then the mode model when the selected backend is the configured default CLI, then backend model, shared model, and provider default. This section also carries the global Audits enabled toggle; per-audit applicability and overrides live on the Audits page.
Providers
: base URLs, models, reasoning effort, and write-only credentials for OpenAI-compatible providers used by native-family backends and Direct AI.
Direct AI
: an opt-in capability that lets the control panel call a compatible provider in-process for project advice, Director cycles and chat, and run summaries. Director chat file and shell access is a separate, off-by-default permission.
Director Cycles
: the current state of the built-in Director task, with a link to the Scheduled page where its cadence is edited, plus how granular each cycle's suggestions are, how many it may raise per bucket, and the safeguards for optional scheduled suggestion auto-launch.
Triumvirate Roles
: optional CLI and model overrides for the secondary planner, overseer, and execution roles. The primary planner follows the launch selection.

## Integrations

Telegram Channel
: a bot token plus allowed chat IDs let you chat with the Director from your phone. Prefer `AIDD_TELEGRAM_BOT_TOKEN` to keep the token out of the config file. A token entered here is saved to `~/.aidd/config.json`; an environment token takes precedence and is not copied into that file. Saved token values are not returned to the browser.
Source Control
: read-only installation and authentication status for Git, GitHub CLI, GitLab CLI, and Azure CLI. Refreshing the panel does not change provider behavior.

## Control Panel

Control Panel Runtime
: restart or shut down the panel, and change the listener address. A hostname, port, or local-network-access change triggers a graceful restart and redirects your browser to the configured address.
Network Access
: the panel binds to `127.0.0.1` by default. Enabling local-network access generates an access token if needed; remote API callers use it as a bearer token. Saving a hostname or remote-access change restarts the panel automatically; allowed-origin changes take effect after a manual restart.
Observability
: browser tracing controls.
System Metrics
: live process, system, and Core Web Vitals readings.

## Tips

- If projects aren't being discovered, check roots and ignored folders under **Workspace** first, including the two-level discovery limit.
- **Save Settings** persists the config-backed form. A hostname, port, or local-network-access change automatically restarts the panel; allowed-origin changes wait for a manual restart.

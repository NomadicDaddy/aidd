# Quickstart

Get aidd running from a source checkout, launch the local web control panel, add a
project, and run your first workflow. For configuration depth see
[configuration.md](./configuration.md); for the compiled-binary deployment story see
[deployment.md](./deployment.md).

## Prerequisites

- **Bun 1.3.14 or newer**: aidd is Bun-first; there is no npm/Node build step.
- **Git**: used for run diffs, the run ledger, and worktrees. aidd degrades gracefully without
  it, but install it for full functionality.
- **Windows 11 + PowerShell 7** is the verified platform. macOS/Linux work from source but
  are not yet smoke-covered.
- No `.env` files: all configuration is JSON (`~/.aidd/config.json` and per-project
  `.aidd/`).

## Install

From the repository root:

```powershell
bun install
```

Confirm the version you are on:

```powershell
bun run start -- --version   # matches the checked-in VERSION file
```

## First CLI run (safe, read-only)

Every CLI command is `bun run start -- <flags>`. The safest first command validates a
project's `.aidd/` metadata without mutating anything:

```powershell
bun run start -- --project-dir C:\path\to\my-app --check-features
bun run start -- --project-dir C:\path\to\my-app --check-artifacts
```

`--help` lists every flag and mode:

```powershell
bun run start -- --help
```

## Launch the web control panel

```powershell
bun run start:web      # background-managed launch (writes logs/, PID file)
# or
bun run start -- --web # foreground
```

The panel listens on **http://127.0.0.1:3210** by default (localhost only). It does not
auto-open a browser; navigate to the URL manually. Stop a background instance with:

```powershell
bun run stop:web
```

Port, bind host, and the LAN-binding auth token are all configurable. See
[configuration.md](./configuration.md) (`web.*` keys) and
[deployment.md](./deployment.md) for remote-binding guidance.

The panel also bundles an embedded terminal pane; press ``Ctrl+` `` to toggle it. Terminal
sessions are backed by persistent PTYs, so they survive page navigation; the pane header offers
a shell picker, restart, resize, and maximize. Press `?` anywhere for the full keyboard-shortcut
overlay, or `Ctrl+K` for the command palette.

## Add a project

On the **Projects** page, aidd discovers projects under your configured roots:

- `applicationsRoot` in `~/.aidd/config.json`, and/or
- `web.allowedRoots` (the filesystem boundary the panel is allowed to read).

Folders in `web.ignoredFolders` (`.git`, `node_modules`, `dist`, `logs`, …) are skipped. A
project becomes manageable once it has an `.aidd/` directory; new projects can be onboarded
through the interview/auto-rebuild flows (see [auto-rebuild.md](./auto-rebuild.md)).

The **New Project** panel offers three creation lanes:

- **Create Fresh**: scaffold a new project and launch its initial coding run.
- **From Template**: run a registered scaffold (`web.templates` entries, plus a synthesized
  `spernakit` entry when `web.spernakitInitScript` is configured); depending on the template's
  `postCreate`, aidd then launches the initial coding run or ingests the scaffolded code. The
  lane appears only when at least one template is registered.
- **Ingest Existing**: point aidd at an existing codebase; onboarding generates the spec and
  feature backlog before any coding work.

## Run your first workflow

Pick a recipe from the **Recipes** page. Good first choices that do not mutate code:

- **`codebase-analysis`**: analyzes the project and writes findings.
- An **audit** run (e.g. `--audit SECURITY` from the CLI, or the audit recipes): read-only
  reporting. See [audits.md](./audits.md).

Recipes are JSON files in `recipes/` (`name`, `description`, `parameters`, `steps`). The
full catalog and step contract are in [recipes.md](./recipes.md).

To launch the same work from the CLI:

```powershell
bun run start -- --project-dir C:\path\to\my-app --audit SECURITY
```

## Where things live

| Path                  | Purpose                                                     |
| --------------------- | ----------------------------------------------------------- |
| `~/.aidd/config.json` | User-level config (roots, default backend/model, web port). |
| `<project>/.aidd/`    | Per-project metadata: spec, features, audits, runs.         |
| `logs/`               | Web backend logs and PID file.                              |
| `data/`               | Web SQLite database and run artifacts.                      |

## Next steps

- [configuration.md](./configuration.md): every config key, merge order, provider/model setup.
- [backends.md](./backends.md): choosing and configuring a backend adapter.
- [recipes.md](./recipes.md) and [audits.md](./audits.md): the common workflows.
- [skills.md](./skills.md): one-shot directives you can run from the CLI or panel.

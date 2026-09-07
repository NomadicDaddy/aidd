# Quickstart

Get aidd running from a source checkout, launch the local web control panel, add a
project, and run your first workflow. For configuration depth see
[configuration.md](./reference/configuration.md); for running the panel as a durable service — data
locations, remote binding, updates, uninstall — see [deployment.md](./reference/deployment.md).

## Prerequisites

- **Bun 1.4.2 or newer**: aidd is Bun-first; there is no npm/Node build step. aidd ships as
  source, so Bun is a hard requirement rather than a build-time one.
- **Git**: used for run diffs, the run ledger, and worktrees. aidd degrades gracefully without
  it, but install it for full functionality.
- **Platform support**: Windows 11 + PowerShell 7 is the primary development platform and the
  only one with browser-smoke coverage. Linux runs the full quality gate (`smoke:qc` and the
  test suite) on every push in CI, so it is exercised continuously. macOS has no automated
  coverage; it is expected to work but is verified only by hand.
- No `.env` files: all configuration is JSON (`~/.aidd/config.json` and per-project
  `.aidd/`). Credentials are the exception and belong in environment variables rather than in
  the config file — see
  [credentials in the environment](reference/configuration.md#credentials-in-the-environment).

## Install

aidd is distributed as source. Either clone the repository:

```powershell
git clone https://github.com/NomadicDaddy/aidd.git
cd aidd
```

...or download the source archive for a tagged release from
[the releases page](https://github.com/NomadicDaddy/aidd/releases) and extract it. There are
no prebuilt executables and no container image; a checkout is the artifact.

Then, from the repository root:

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

Port, bind host, and the LAN-binding access token are all configurable. See
[configuration.md](./reference/configuration.md) (`web.*` keys) and
[deployment.md](./reference/deployment.md) for remote-binding guidance.

The panel also bundles an embedded terminal pane; press ``Ctrl+` `` to toggle it. Terminal
sessions are backed by persistent PTYs, so they survive page navigation; the pane header offers
a shell picker, a new-tab button, restart, and maximize, and the pane's top edge is a drag
handle for resizing. Press `?` anywhere for the full keyboard-shortcut overlay, or `Ctrl+K` for
the command palette.

## Add a project

On the **Projects** page, aidd discovers projects under `web.allowedRoots` in
`~/.aidd/config.json` — the filesystem boundary the panel is allowed to read. When
`web.allowedRoots` is omitted it falls back to `[applicationsRoot]`, or, if that is also unset,
to the parent of the aidd checkout.

Folders in `web.ignoredFolders` (`.git`, `node_modules`, `dist`, `logs`, …) are skipped. A
project becomes manageable once it has an `.aidd/` directory; new projects can be onboarded
through the interview/auto-rebuild flows (see [auto-rebuild.md](./reference/auto-rebuild.md)).

The **New Project** panel offers four creation lanes:

- **Create Fresh**: scaffold a new project and launch its initial coding run.
- **From Template**: run a registered scaffold — `web.templates` entries, plus a built-in
  `spernakit` entry that aidd always synthesizes unless you register your own template of that
  name. The built-in entry runs Spernakit's portable generator (`scripts/init.ts`) from the
  checkout named by `web.spernakitInitScript`; when that key is unset, aidd clones
  `web.spernakitTemplateRepo` (default `NomadicDaddy/spernakit`) into `data/templates/spernakit`
  on first use and reuses that clone. Depending on the template's `postCreate`, aidd then
  launches the initial coding run or ingests the scaffolded code. Because the built-in entry is
  always present, this lane is always available.
- **From GitHub**: create a project from a GitHub template repository (`owner/repo`, with an
  optional `#ref`); the clone gets fresh history and is followed by metadata-only intake. This
  lane needs no registered template. The CLI equivalent is
  `bun run start -- new <github-url | owner/repo[#ref]>`.
- **Ingest Existing**: point aidd at an existing codebase; onboarding generates the spec and
  feature backlog before any coding work.

## Run your first workflow

Pick a recipe from the **Recipes** page. Good first choices that do not mutate code:

- **`codebase-analysis`**: analyzes the project without changing implementation code, then writes
  a dated report and `.aidd/CHANGELOG.md` summary.
- An **audit** run (e.g. `--audit SECURITY` from the CLI, or the audit recipes): inspects source
  read-only, then persists its accepted report and any verified findings under `.aidd/`. See
  [Audits](../frontend/content/docs/audits.md).

Recipes are JSON files in `recipes/` (`name`, `description`, `parameters`, `steps`). The
full catalog and step contract are in [recipes.md](./reference/recipes.md).

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

- [configuration.md](./reference/configuration.md): every config key, merge order, provider/model setup.
- [backends.md](./reference/backends.md): choosing and configuring a backend adapter.
- [recipes.md](./reference/recipes.md) and [Audits](../frontend/content/docs/audits.md): the common workflows.
- [Skills](../frontend/content/docs/skills.md): one-shot directives you can run from the CLI or panel.

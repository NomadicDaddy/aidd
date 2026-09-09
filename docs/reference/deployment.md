# Deployment Guide

How to run the aidd web control panel as a durable local service, where it keeps its state, how to
expose it beyond loopback safely, and how to update, roll back, or remove it.

aidd is distributed as source. Install it by cloning the repository or downloading the source
archive GitHub attaches to a release tag — see [quickstart.md](../quickstart.md) for first-run setup.
There are no prebuilt binaries and no container image; `bun install` resolves dependencies on the
machine that runs it.

## Install

```powershell
git clone https://github.com/NomadicDaddy/aidd.git C:\Tools\aidd
cd C:\Tools\aidd
bun install
```

To pin a specific release rather than tracking `main`, check out its tag:

```powershell
git checkout vX.Y.Z
bun install
```

Downloading the source archive for a tag from the
[releases page](https://github.com/NomadicDaddy/aidd/releases) and extracting it works identically;
run `bun install` inside the extracted directory. A downloaded archive has no git history, so
updating means downloading the next one.

Unless explicitly skipped, the postinstall step builds the frontend when its assets are missing
or older than its build inputs. Starting or restarting the backend does not rebuild the UI. After
editing frontend source, run `bun run build:frontend` before reloading the panel.

## Configuration File Location

aidd is JSON-only (no `.env`). Config merges in this order, with later sources overriding earlier:

1. Built-in defaults
2. `~/.aidd/config.json` (user-level)
3. `<project>/.aidd/aidd.config.json` (project-level overrides)
4. CLI flags

The repository ships `config.json.example` showing every accepted key. Copy it to
`~/.aidd/config.json` and trim it to the keys you need. The web control panel's settings live under
the `web` object:

| Key                  | Default                                 | Purpose                                                            |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `web.hostname`       | `127.0.0.1`                             | Bind hostname. Non-loopback requires `allowRemote`.                |
| `web.port`           | `3210`                                  | Bind port. Overridable per launch with `--port`.                   |
| `web.allowRemote`    | `false`                                 | Allows non-loopback hostnames when `true`.                         |
| `web.allowedOrigins` | none                                    | Extra browser origins trusted when remote access is on.            |
| `web.allowedRoots`   | `[applicationsRoot]` or runtime parent  | Filesystem roots the backend may read project metadata from.       |
| `web.dataDir`        | `data` under the runtime base directory | SQLite, run logs, and web runtime data root.                       |
| `web.authToken`      | none                                    | Access token for the web API; required when `allowRemote` is true. |

Clients send the access token to the web API using the standard `Authorization: Bearer` scheme.
Set it with `AIDD_WEB_AUTH_TOKEN` in preference to the config file.

See [configuration.md](./configuration.md) for the complete schema and the remaining `web.*` keys.

## Start And Stop

```powershell
bun run start:web            # stop any prior listener, then start the web backend
bun run stop                 # or: bun run stop:web (graceful shutdown, then PID/port fallback)
bun run stop:web --port 3210 # stop a listener on a specific port
bun run start -- --web       # foreground, no background management
```

The backend writes its own PID to `logs/backend.pid` once it has bound the port, and removes the
file on clean shutdown. A foreground launch stops with `Ctrl+C`.

`stop:web` first POSTs to the backend's own shutdown endpoint so the listener closes and releases
the port cleanly. If that does not free the port it falls back to the PID file and a port scan, but
on Windows it refuses to force-kill by default: it exits 2 and tells you to re-run
`bun run stop:web -- --force`.

Listener settings changed from the Settings page persist to `~/.aidd/config.json`. Saving a new
`hostname`, `port`, or `allowRemote` value restarts aidd-web and reloads the page at the configured
address.

## Remote Binding Constraints

The panel binds loopback (`127.0.0.1`) by default and refuses non-loopback hostnames unless
`web.allowRemote` is `true`. To expose it on a trusted LAN:

```json
{
	"web": {
		"allowRemote": true,
		"allowedOrigins": ["http://192.0.2.10:3210", "http://demo-host:3210"],
		"authToken": "replace-with-a-long-random-secret",
		"hostname": "0.0.0.0",
		"port": 3210
	}
}
```

- When `allowRemote` is enabled, an Origin allowlist is enforced on `/api/*` and `/ws`; a request
  whose `Origin` header does not match the configured listener (or a recognized loopback alias) is
  rejected with HTTP 403. The WebSocket origin check is enforced regardless of `allowRemote`.
- `allowedOrigins` is additive: the effective allowlist always includes the active listener origin
  and loopback aliases. List stable machine names or fixed LAN IPs here.
- When `hostname` is `0.0.0.0` or `::`, detected local network interface origins are trusted
  automatically.
- Keep `web.authToken` set for every exposed listener; config resolution rejects remote access
  without it. Supply it through `AIDD_WEB_AUTH_TOKEN` rather than writing it into
  `~/.aidd/config.json`, so an agent that reads your config file does not read your access token
  with it — see
  [configuration.md](./configuration.md#credentials-in-the-environment).

To verify a LAN-facing listener without changing config:

```powershell
bun scripts/crawltest.ts --local-network --base-url http://demo-host:3210 --local-network-host demo-host --page /settings
```

## Log And Data Locations

All runtime state is written under the repository root:

| Path                        | Contents                                                             |
| --------------------------- | -------------------------------------------------------------------- |
| `data/aidd-panel.db`        | Web control panel SQLite database (plus a writer-lock sidecar file). |
| `data/skills/`              | Managed skill packages and `catalog.json` import provenance.         |
| `data/` (per `web.dataDir`) | Run logs and other persistent web runtime data.                      |
| `logs/backend.pid`          | PID of the running web backend; removed on clean shutdown.           |
| `logs/backend.log`          | Detached backend stdout, with up to five `.1`-`.5` archives.         |
| `logs/backend.error.log`    | Detached backend stderr, with up to five `.1`-`.5` archives.         |

`bun run start:web` checks both backend logs before opening the detached process's output files.
A log at or above 10 MiB is renamed to `<name>.1`, older archives shift toward `<name>.5`, and the
oldest is removed. Archives older than 30 days are also removed. If a file cannot be renamed,
the launcher reports the failure and leaves the active log intact.

While the backend runs, it checks the two logs every 30 seconds. A log at or above 10 MiB is
copied to an archive and truncated in place so the open output handle remains usable. The same
five-archive and 30-day retention limits apply. Logs can exceed 10 MiB between checks.
Foreground output goes to the terminal; the backend's periodic task still checks any existing
detached log files.

`web.dataDir` must resolve inside the runtime root `data/` directory and must never target
`backend/data`; config resolution throws on either violation. Nothing under `data/` or `logs/` is
tracked in git, so runtime state survives `git pull` untouched. `logs/` is ignored wholesale, but
`data/` is ignored by per-pattern rules that do not cover `data/skills/` — do not `git add data`.

## Update And Rollback

**Update:**

1. Stop the running backend (`bun run stop:web`).
2. `git pull` (or `git checkout vX.Y.Z` for a specific release).
3. `bun install` — the lockfile may have moved.
4. `bun run start:web`.

`data/` and `logs/` are untracked, so they carry forward across updates automatically. Take a copy
of `data/` before a major version jump if the history matters to you.

**Schema baseline note:** a new install creates its database from the single `0001_baseline`
migration; later releases extend it through the `schema_migrations` ledger. A database whose tables
were created by anything other than that baseline — the ledger lacks the `0001_baseline` row — is
**not** upgraded in place: aidd refuses to start and names the fix. Stop aidd, remove
`data/aidd-panel.db` together with its `-wal`, `-shm`, and `.lock` sidecars, and start again to
create a fresh database. Take a copy first if the history matters to you; nothing imports it back.

**Rollback:**

1. Stop the running backend.
2. `git checkout` the previous tag and re-run `bun install`.
3. Only roll back across versions that share the same schema baseline: an older build may not read
   a database written by a newer schema. If schemas diverge, restore the `data/` snapshot taken
   before the update.

## Uninstall

A source install is self-contained, so removing it is a directory delete. Nothing is written to
system locations, the registry, or a package manager.

1. **Stop the backend** (`bun run stop:web`, or kill the PID in `logs/backend.pid`).
2. **Back up `data/` first if you want to keep panel history or imported skills.** The SQLite
   database, run data, and `data/skills` catalog live inside the checkout, so deleting the
   directory discards them.
3. **Delete the checkout directory.** This removes the source, `node_modules/`, and the runtime
   `data/`/`logs/`.
4. **Optionally remove user config** at `~/.aidd/config.json` for a clean slate. It exists if you
   created one or ever saved the Settings page, which writes to that path.

**Never delete a project's own `<project>/.aidd/` directory as part of uninstalling aidd.** Those
hold each project's spec, features, audits, and run history. They are owned by the project, not the
install, and aidd never removes them automatically. Deleting the aidd checkout leaves every
project's `.aidd/` untouched.

## Verification

Before committing docs or metadata changes in aidd:

```powershell
bun run start -- --project-dir . --check-features
bun run start -- --project-dir . --check-artifacts
bun run smoke:qc
```

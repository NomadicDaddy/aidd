# Deployment Guide (Standalone)

This is the stable task reference for running aidd as a standalone deployment: building the
single-file binaries, launching the local web control panel, locating config/log/data, binding to a
trusted LAN, and updating or rolling back a deployment. It is intended for operators who run the
compiled binaries without a Bun runtime or TypeScript source present.

For the full configuration key reference, see [configuration.md](./configuration.md). For runtime
module boundaries, see [overview.md](../architecture/overview.md).

There is also a fourth deployment target built on top of the Linux standalone distribution: a
Docker image that bundles the compiled binaries with the agent-backend CLIs and runs as a single
hardened container. See [docker.md](./docker.md).

There are two ways to get a standalone deployment: **download a published release** (below) or
**build the binaries yourself** from a source checkout ([Build Artifact Layout](#build-artifact-layout)).
Both produce the same self-contained directory.

## Install From a Release

The standalone binaries bundle their own runtime (no Bun needed), but **Git** should be installed
and on `PATH`: aidd uses it for run diffs, the run ledger, and worktrees. It degrades gracefully
if git is absent (runs still complete, just without git-based change tracking), but install it for
full functionality.

The GitHub Release attaches, per version, a Windows zip plus a checksum manifest and release notes:

| Asset                                        | Contents                                                    |
| -------------------------------------------- | ----------------------------------------------------------- |
| `aidd-v<version>-bun-windows-x64-modern.zip` | The full self-contained directory (both binaries + assets). |
| `SHA256SUMS.txt`                             | SHA-256 of every attached asset, `sha256sum` format.        |
| `release-notes.md`                           | The changelog entry for this version.                       |

Linux/macOS zips, when attached, are explicitly unverified: Windows 11 + PowerShell 7 is the only
smoke-covered platform.

**1. Download** the `.zip` and `SHA256SUMS.txt` for the version you want into the same folder.

**2. Verify the checksum before extracting.** A mismatch means the download is corrupt or tampered.
Do not run it.

```powershell
# Windows / PowerShell 7
$version = '<version>'
$zip = "aidd-v$version-bun-windows-x64-modern.zip"
$want = (Select-String -Path .\SHA256SUMS.txt -Pattern ([regex]::Escape($zip))).Line.Split(' ')[0]
$got  = (Get-FileHash .\$zip -Algorithm SHA256).Hash
if ($got -ieq $want) { 'OK' } else { throw 'CHECKSUM MISMATCH — do not run this file' }
```

```bash
# Linux / macOS (shasum -a 256 -c on macOS)
sha256sum -c SHA256SUMS.txt
```

**3. Extract** to a stable location. The zip contains a single top-level
`aidd-v<version>-<target>/` folder. That folder is the deployment directory.

```powershell
Expand-Archive .\aidd-v<version>-bun-windows-x64-modern.zip -DestinationPath C:\Tools\aidd
# -> C:\Tools\aidd\aidd-v<version>-bun-windows-x64-modern\
```

**4. (Optional) Add it to PATH.** Add the **extracted directory itself** (not a copy of the binary)
so `aidd` resolves while it can still find its sibling asset trees. Copying `aidd.exe` somewhere on
its own breaks asset resolution (see [the layout warning](#build-artifact-layout)).

```powershell
$dir = 'C:\Tools\aidd\aidd-v<version>-bun-windows-x64-modern'
$user = [Environment]::GetEnvironmentVariable('Path', 'User')
[Environment]::SetEnvironmentVariable('Path', "$user;$dir", 'User')  # reopen the terminal to pick it up
```

For a stable `aidd` command that survives version updates, PATH a junction instead of the versioned
folder, then re-point the junction on each update (the old folder stays for
[rollback](#update-and-rollback)):

```powershell
New-Item -ItemType Junction -Path C:\Tools\aidd\current -Target $dir  # PATH C:\Tools\aidd\current
```

`.exe` binaries on PATH resolve directly as `aidd` / `aidd-web` in PowerShell and cmd. No launcher
script is needed or shipped.

**5. Start the control panel.** From inside the extracted directory (or anywhere, if you added it to
PATH):

```powershell
aidd-web --port 3210     # panel at http://127.0.0.1:3210 (localhost only)
aidd --help              # CLI
```

Continue with [First Launch](#first-launch) for what happens on startup and
[Configuration File Location](#configuration-file-location) to point aidd at your projects. To move
to a newer version later, see [Update And Rollback](#update-and-rollback).

## Build Artifact Layout

`bun run build:standalone` (driven by [`scripts/build-standalone.ts`](../../scripts/build-standalone.ts))
compiles single-file executables for the CLI and the web control panel and stages a self-contained
directory per target:

```text
dist/<target>/
  aidd[.exe]              # CLI binary
  aidd-web[.exe]          # web control panel binary
  README.txt              # generated launch notes
  audits/                 # sibling asset trees (must stay co-located)
  skills/
  scaffolding/
  prompts/
  recipes/
  frontend/dist/
  VERSION
  config.json.example
  LICENSE                 # required — build fails if missing
  THIRD-PARTY-LICENSES.md # required — build fails if missing
  data/                   # created at runtime — SQLite, run data, managed skill imports
  logs/                   # created at runtime — backend.pid and logs
```

Supported targets and the script that builds each:

| Target                   | Command                            | Binary suffix |
| ------------------------ | ---------------------------------- | ------------- |
| `bun-windows-x64-modern` | `bun run build:standalone:windows` | `.exe`        |
| `bun-linux-x64-modern`   | `bun run build:standalone:linux`   | _(none)_      |
| `bun-darwin-arm64`       | `bun run build:standalone:darwin`  | _(none)_      |

`bun run build:standalone` with no `--target` builds all three. Pass `--skip-frontend` to reuse an
already-current `frontend/dist`. The Windows `aidd-web` binary is compiled with
`--windows-hide-console`, so a double-click launch does not flash a console window.

When multiple targets are requested, the build attempts every target and prints a per-target
summary. Successful `dist/<target>/` directories are preserved. A failed target is removed rather
than left as a partial distribution, and the overall command exits non-zero if any requested target
failed. On Windows, Bun may fail Linux or macOS cross-target compilation with a target executable
extraction error; treat that as a toolchain/cache failure to resolve before declaring an all-target
release complete.

**The directory must stay intact.** The binaries read the sibling asset trees
(`audits/`, `skills/`, `scaffolding/`, `prompts/`, `recipes/`, `frontend/dist/`) and
write runtime state to `data/`. Moving a binary away from its siblings breaks asset resolution.
The build verifies required distribution content after each target: both binaries, `README.txt`,
`VERSION`, `config.json.example`, `LICENSE`, `THIRD-PARTY-LICENSES.md`, `frontend/dist/index.html`,
and the core catalog directories must be present.

## First Launch

From inside `dist/<target>/`:

```bash
./aidd-web --port 3210      # start the web control panel (default port 3210)
./aidd --help               # run the CLI
./aidd-web --help           # aidd-web --help / --version are handled before server startup
```

The web panel binds `127.0.0.1` by default and serves the bundled `frontend/dist`. Open
`http://127.0.0.1:3210` in a browser. On first launch the binary creates `data/` (with
`aidd-panel.db`) and `logs/` next to itself.

Web-managed runs are compile-aware: when the panel runs from a compiled `aidd-web` binary, it
spawns the sibling compiled `aidd[.exe]` for launched runs instead of a Bun/TypeScript entrypoint,
so runs work on machines with no Bun runtime installed.

## Configuration File Location

aidd is JSON-only (no `.env`). Config merges in this order, with later sources overriding earlier:

1. Built-in defaults
2. `~/.aidd/config.json` (user-level)
3. `<project>/.aidd/aidd.config.json` (project-level overrides)
4. CLI flags

The bundle ships `config.json.example` showing every accepted key. Copy it to `~/.aidd/config.json`
and trim it to the keys you need. The web control panel's settings live under the `web` object:

| Key                  | Default                                 | Purpose                                                            |
| -------------------- | --------------------------------------- | ------------------------------------------------------------------ |
| `web.hostname`       | `127.0.0.1`                             | Bind hostname. Non-loopback requires `allowRemote`.                |
| `web.port`           | `3210`                                  | Bind port. Overridable per launch with `--port`.                   |
| `web.allowRemote`    | `false`                                 | Allows non-loopback hostnames when `true`.                         |
| `web.allowedOrigins` | none                                    | Extra browser origins trusted when remote access is on.            |
| `web.allowedRoots`   | `[applicationsRoot]` or runtime parent  | Filesystem roots the backend may read project metadata from.       |
| `web.dataDir`        | `data` under the runtime base directory | SQLite, run logs, and web runtime data root.                       |
| `web.authToken`      | none                                    | Bearer token for the web API; required when `allowRemote` is true. |

See [configuration.md](./configuration.md) for the complete schema and the remaining `web.*` keys.

## Start And Stop

**Standalone binary:** `aidd-web` runs in the foreground. Stop it with `Ctrl+C`, or kill the PID it
records in `logs/backend.pid` on startup (the file is removed on clean shutdown). There is no
package-script stopper in a standalone deployment. Those scripts (`bun run stop` / `bun run
stop:web`) exist only in a source checkout.

**From source (development):**

```powershell
bun run start:web            # stop any prior listener, then start the web backend
bun run stop                 # or: bun run stop:web (reads logs/backend.pid, then port scan)
bun run stop:web --port 3210 # stop a listener on a specific port
```

Listener settings changed from the Settings page persist to config and **take effect only after
restarting `aidd-web`**.

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
- Keep `web.authToken` set for every exposed listener; config resolution rejects remote access without it.

To verify a LAN-facing listener without changing config (source checkout only):

```powershell
bun scripts/crawltest.ts --local-network --base-url http://demo-host:3210 --local-network-host demo-host --page /settings
```

## Log And Data Locations

All runtime state is written under the runtime base directory (the `dist/<target>/` folder for a
standalone deployment):

| Path                        | Contents                                                             |
| --------------------------- | -------------------------------------------------------------------- |
| `data/aidd-panel.db`        | Web control panel SQLite database (plus a writer-lock sidecar file). |
| `data/skills/`              | Managed skill packages and `catalog.json` import provenance.         |
| `data/` (per `web.dataDir`) | Run logs and other persistent web runtime data.                      |
| `logs/backend.pid`          | PID of the running web backend; removed on clean shutdown.           |

`web.dataDir` must resolve inside the runtime root `data/` directory and must never target
`backend/data`.

## Update And Rollback

Each `dist/<target>/` directory is a complete, self-contained deployment. Treat the directory as the
unit of update and rollback.

**Update:**

1. Stop the running `aidd-web` (`Ctrl+C` or kill `logs/backend.pid`).
2. Build the new release (`bun run build:standalone:<os>`), producing a fresh `dist/<target>/`.
3. Replace the binaries and sibling asset trees, but **preserve `data/`** (and `logs/` if you keep
   history) so the database, run data, and managed skill imports carry forward. Copy the prior `data/` into the new
   directory, or build into a separate path and move `data/` across.
4. Relaunch `aidd-web`.

**Schema baseline note:** new installs and standalone binaries start from the squashed
`0001_unhinged_taco_party` SQLite baseline (followed by `0002_run_liveness`). A pre-ledger or partially-applied development database is **not**
upgraded in place: discard `data/aidd-panel.db*` (and the writer-lock sidecar) before launching a
build that introduced a new consolidated baseline. This applies only when crossing such a baseline;
ordinary updates preserve `data/`.

**Rollback:**

1. Stop the running `aidd-web`.
2. Relaunch `aidd-web` from the previously retained `dist/<target>/` directory.
3. Only roll back across builds that share the same schema baseline: an older binary may not read
   a database written by a newer schema. If schemas diverge, restore the `data/` snapshot taken
   before the update.

Keep the prior `dist/<target>/` directory until the new release is confirmed healthy so rollback is
a directory swap rather than a rebuild.

## Uninstall

A standalone install is self-contained, so removing it is a directory delete. Nothing is written to
system locations, the registry, or a package manager.

1. **Stop `aidd-web`** (`Ctrl+C`, or kill the PID in `logs/backend.pid`).
2. **Back up `data/` first if you want to keep panel history or imported skills.** The SQLite
   database, run data, and `data/skills` catalog live inside the deployment directory, so deleting
   the directory discards them.
3. **Delete the deployment directory** (`aidd-v<version>-<target>/`). This removes the binaries,
   bundled assets, and the runtime `data/`/`logs/`.
4. **Remove the PATH entry** you added during install, if any.
5. **Optionally remove user config** at `~/.aidd/config.json` (only exists if you created one) for a
   clean slate.

**Never delete a project's own `<project>/.aidd/` directory as part of uninstalling aidd.** Those hold
each project's spec, features, audits, and run history. They are owned by the project, not the
install, and aidd never removes them automatically. Uninstalling the binaries leaves every project's
`.aidd/` untouched.

## Verification

Before committing docs or metadata changes in aidd:

```powershell
bun run start -- --project-dir . --check-features
bun run start -- --project-dir . --check-artifacts
bun run smoke:qc
```

Before handing off a standalone distribution:

```powershell
bun run build:standalone:windows --skip-frontend
bun run check:standalone -- --target bun-windows-x64-modern --probe-binaries
bun run build:standalone
```

`check:standalone` validates the `dist/<target>/` layout. With `--probe-binaries`, it also runs
timed `--help` and `--version` probes for binaries that are executable on the current platform. On
Windows that means `bun-windows-x64-modern`; Linux and macOS target directories can still be layout
checked locally, but their binaries are not executed on Windows.

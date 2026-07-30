# Docker Deployment Guide

aidd ships as a single-process container: the compiled `aidd-web` binary serves the SPA, API, and
WebSockets on port 3210, launches the sibling `aidd` CLI binary for runs, and embeds its database
migrations (they run at boot). There is no nginx or supervisord inside the image; TLS, security
headers, and rate limiting belong to an edge proxy (see [Reverse proxy](#reverse-proxy)).

The image does **not** contain the agent-backend CLIs. The entrypoint installs them into the
home volume on first boot, at the versions pinned by `AGENT_CLI_VERSIONS` in
[`scripts/docker-image.ts`](../../scripts/docker-image.ts), and later boots reuse the volume.
They are installed rather than baked in because baking them would make every published image a
redistribution of them, and `@anthropic-ai/claude-code` is not open source (it ships as "SEE
LICENSE IN README.md" under Anthropic's commercial terms, with no redistribution grant). Installing
at run time means you obtain each CLI from its vendor under your own agreement with them. First
boot therefore needs network access to the npm registry; set `AIDD_SKIP_AGENT_CLI_INSTALL=1` on an
air-gapped host or when the home volume is already provisioned.
The in-process `native`/`ollama` backend needs no CLI at all. The container runs as the non-root
user `aidd` (uid 1000), required because `claude --dangerously-skip-permissions` refuses to run
as root.

For the standalone (non-Docker) deployment, see [deployment.md](./deployment.md).

## Quick start (local)

```bash
bun run docker:build            # build ghcr.io/nomadicdaddy/aidd:{latest,<version>}
bun run smoke:docker            # end-to-end smoke against a throwaway container
docker compose up -d            # dev compose: state under ./.docker/
docker logs aidd-dev            # first boot prints the web API auth token ONCE
```

## Production deployment

```bash
bun run deploy:docker -- --appdata-root /opt/appdata --projects-root /srv/projects --up
```

This pre-authors the deploy tree (spernakit methodology) so the container's first-boot bootstrap
is skipped: `${APPDATA_ROOT}/aidd/home/.aidd/config.json` with a generated `web.authToken`,
`data/` and `logs/` directories, a copy of `docker-compose.production.yml`, and `compose.vars`.
Provider keys go in a `compose.env` file next to the compose file (see
[`compose.env.example`](../../compose.env.example)).

Manual equivalent: copy `compose.vars.example` → `compose.vars`, edit, then
`docker compose -f docker-compose.production.yml --env-file compose.vars up -d`.

### Volumes

| Container path | Purpose                                                                                                       |
| -------------- | ------------------------------------------------------------------------------------------------------------- |
| `/home/aidd`   | `~/.aidd/config.json`, agent-CLI credentials (`~/.claude`, `~/.cline`, `~/.codex`, …), `~/.gitconfig`, caches |
| `/app/data`    | `aidd-panel.db`, run data, managed `skills/`, `backups/` (entrypoint pre-start copies, keeps 5)               |
| `/app/logs`    | `backend.pid`, backend logs (path is fixed relative to the binary; rootfs is read-only)                       |
| `/projects`    | Project working trees aidd manages; **must stay path-stable**: `/projects/...` paths persist in the web DB    |

On Linux hosts the `${APPDATA_ROOT}/aidd` tree must be owned by uid 1000. Docker Desktop
(Windows/macOS) bind mounts handle ownership transparently.

### Configuration

aidd is JSON-only: there are no environment overrides for web settings. The container reads
`/home/aidd/.aidd/config.json` (the home volume). If none exists, the entrypoint authors one
(`hostname 0.0.0.0`, `allowRemote true`, generated `authToken`, `allowedRoots ["/projects"]`) and
prints the token once in `docker logs`. Edit the mounted file and restart to change settings. Do
not change `web.port` inside the container (the image HEALTHCHECK probes 3210); remap the host
port with `AIDD_PORT` instead. See [configuration.md](./configuration.md) for all keys.

### Agent backend auth

Container env reaches launched agent CLIs only when allowlisted in
[`shared/src/subprocess-env.ts`](../../shared/src/subprocess-env.ts); anything else is silently
dropped.

| Backend           | API-key auth (compose.env)              | Subscription auth                                                     |
| ----------------- | --------------------------------------- | --------------------------------------------------------------------- |
| `claude-code`     | `ANTHROPIC_API_KEY`                     | `docker exec -it <container> claude /login` (persists in home volume) |
| `cline`           | Cline or selected-provider API key      | `docker exec -it <container> cline auth` (persists in home volume)    |
| `codex`           | `OPENAI_API_KEY`                        | `docker exec -it <container> codex login`                             |
| `opencode`/`kilo` | provider keys per their config          | their respective login flows                                          |
| `native`/`ollama` | `NATIVE_API_KEY`/`NATIVE_BASE_URL` etc. | n/a (in-process; point `NATIVE_BASE_URL` at an Ollama host)           |

Git identity for run commits: set `GIT_USER_NAME`/`GIT_USER_EMAIL` in `compose.env` (entrypoint
writes `~/.gitconfig` on first boot), or manage `~/.gitconfig` in the home volume yourself.

### Upgrade / rollback

Upgrade: bump `APP_VERSION` in `compose.vars`, then `docker compose --env-file compose.vars pull`
and `up -d`. Volumes (config, credentials, DB, managed skills, projects) carry over; migrations
run at boot. Managed imports live at `/app/data/skills` and are covered by the normal data-volume
backup and restore process.

Rollback: revert `APP_VERSION` to the previous tag and `up -d`. Embedded migrations are
forward-only. If the newer version migrated the schema, restore the matching pre-start backup
from `data/backups/` (enabled by `AIDD_BACKUP_ON_START=1`, the default in
`docker-compose.production.yml`) before starting the older image.

## Reverse proxy

The production compose publishes the panel loopback-only (`127.0.0.1:${AIDD_PORT}`). For remote
access, front it with a TLS proxy; examples in [`docker/examples/`](../../docker/examples/).
Two auth facts matter at the edge:

- Only **direct loopback** callers are token-exempt. Any forwarded request (carrying
  `X-Forwarded-*`) must present `Authorization: Bearer <web.authToken>`. The browser UI attaches
  it automatically after login, but proxy health probes must send it explicitly.
- CSP, rate limiting, and security headers are the proxy's job; the container does not duplicate
  them (divergence from the spernakit template, which ships in-container nginx for this).

## Operational caveats

- **Container restart kills in-flight runs.** Detached runs do not outlive the container; on the
  next boot the heartbeat watcher reaps orphaned runs to `failed`. Drain or wait for runs before
  `docker compose stop` when possible (`stop_grace_period` is 30s).
- **Resource sizing.** Each concurrent run spawns a full agent CLI (node process). Size
  `AIDD_MEM_LIMIT` together with `web.maxConcurrentRuns` (default 2); 4g/2cpu is a workable
  starting point.
- **Image size**: the image itself holds the node runtime, the compiled binaries and the
  catalogs; the agent CLIs land in the home volume on first boot rather than in the image. They
  update frequently - bump `AGENT_CLI_VERSIONS` in `scripts/docker-image.ts` and restart to pick
  up newer ones (a version change reinstalls; an unchanged version reuses the volume). Agent
  self-update stays disabled: the entrypoint writes `~/.claude/settings.json` with
  `autoUpdates: false` on first boot, and Cline only updates on an explicit `cline update`, so the
  version aidd pins is the version that runs. Cline is runtime-installed at the pinned version and
  is never baked into the image (`FORBIDDEN_IN_IMAGE` in `scripts/check-image-licenses.ts`).
- **CPU baseline.** The binaries use the `bun-linux-x64-modern` target (AVX2-class). Very old
  x64 hosts would need a `baseline` build target added to `scripts/lib/standalone/constants.ts`.

## Smoke test

`bun run smoke:docker` builds the image, composes it up with throwaway volumes
(`.docker/smoke/`), and verifies: health, SPA, 401 without token, tokened API, `/projects` mount
discovery, a full simulated run through the detached spawn chain, and a graceful stop within the
grace period. `-- --with-claude` additionally launches a real claude-code run (requires
`ANTHROPIC_API_KEY`, spends tokens) and guards against the claude-as-root refusal regression.
`-- --keep` leaves everything up for debugging; `-- --no-build` reuses the existing `aidd:dev`
image.

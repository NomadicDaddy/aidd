# Recovering an Interrupted supertest

D1 is the long phase of the dance and the one most likely to be interrupted. This is what to do
when a fan-out dies.

**Concurrency is not free here, and a failure to complete is not always the app's fault.** Both the
v3.44.0 dance's second and third waves of three concurrent supertests were killed mid-crawl by
something outside the run, with nothing wrong in the runs themselves and an earlier wave of three
having completed. If a fan-out dies without producing a failing step, do not treat it as an app
failure and do not immediately retry the same shape. Fall back to running each app in the
foreground, one phase at a time:

```text
bun run smoke:reset
bun run smoke:docker-prod
bun run smoke:screenshots
```

Each of the three fits inside a single command budget where the combined `supertest` may not, and a
kill then costs one phase rather than the whole run.

**`smoke:screenshots` is a valid standalone resume.** Its `scripts/smoke.json` step list is
self-contained (stop, clear-logs, start, wait for the backend port, wait for the frontend port,
crawl, stop) and it does not call `smoke:reset`. An app whose reset and docker-prod already passed
can finish with this one command rather than repeating the whole sequence.

**Clean up orphans without a bare production Compose command.** A bare
`docker compose -f docker-compose.production.yml down` fails after the smoke runner exits because
the file hard-requires `APP_SLUG`, `APP_IMAGE`, `APPDATA_ROOT` and `BACKUPS_ROOT` through
`${VAR:?...}` interpolation. Run `bun run stop` in the app first; the current stop script reclaims
PID- or port-owned dev services and attempts same-project Compose teardown when it detects a
container. If the production container or network remains, use `docker rm -f <app>` and
`docker network rm <app>_default`. Before declaring the fleet closed, confirm no scoped-app
containers or Compose networks remain and nothing is listening on any scoped app's two ports.

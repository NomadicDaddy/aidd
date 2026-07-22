---
name: docker-guidelines
description: 'Apply current Docker and container practices for secure, reproducible builds, Compose, BuildKit, caching, non-root execution, and supply-chain safety. Use when writing or reviewing Dockerfiles, Compose files, or container pipelines.'
metadata:
    aidd-category: general
---

# Docker and Container Guidelines

> **Baseline**: Target Docker Engine **29.x**; BuildKit is the default builder; **`docker compose`**
> (the V2 CLI plugin, written with a space) is the standard. The legacy `docker-compose` (V1,
> hyphen) reached end-of-life in June 2023. Do not use it.
>
> This guide covers Dockerfile authoring, Compose, image hygiene, and supply-chain security for the
> supported baseline. Verify installed versions with `docker version` and `docker compose version`.

## Core Principles

1. **Multi-stage builds:** build in a fat stage with the SDK/compilers, then ship a minimal runtime stage. This is the single biggest lever for both image size and attack surface.
2. **Run as non-root:** create a dedicated user and `USER` down before the entrypoint.
3. **Pin base images:** use digests for reproducibility and supply-chain integrity.
4. **Order for cache:** put rarely changing steps (dependency installs) before frequently changing ones (`COPY . .`).
5. **Read config at runtime:** keep secrets and environment-specific config out of the image (see `12-factor-guidelines`).
6. **Make images auditable:** attach an SBOM and provenance at build time, and scan before you ship.

## Dockerfile

Start every Dockerfile with the syntax directive on line 1, then use a multi-stage build.

```dockerfile
# syntax=docker/dockerfile:1
# The floating :1 tag pulls the latest 1.x frontend (bug/feature updates, no breaking changes).
# It is REQUIRED for RUN --mount, --secret, --ssh, and heredocs.

# --- Build stage: full toolchain ---
FROM node:24-bookworm AS build
WORKDIR /app
COPY package.json package-lock.json ./
# Cache mount: persists the package cache across builds (much faster dep installs)
RUN --mount=type=cache,target=/root/.npm npm ci
COPY . .
RUN npm run build

# --- Runtime stage: minimal, non-root ---
FROM node:24-bookworm-slim AS runtime
WORKDIR /app
# Dedicated unprivileged user
RUN groupadd -r app && useradd --no-log-init -r -g app app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
USER app
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=3s CMD node dist/healthcheck.js || exit 1
# Exec (JSON) form so signals reach the process
ENTRYPOINT ["node", "dist/index.js"]
```

### Rules that matter

- **`# syntax=docker/dockerfile:1`:** use this floating `:1` tag as the first line. It is required for the mounts below.
- **`COPY` vs `ADD`:** default to `COPY`. Use `ADD` only for its special powers (fetching remote HTTPS/Git URLs and auto-extracting local tarballs). For build-time-only files, prefer a bind mount over copying: `RUN --mount=type=bind,source=requirements.txt,target=/tmp/requirements.txt`.
- **Non-root `USER`:** create a user/group and switch before `ENTRYPOINT`. Avoid `sudo`; use `gosu` if you must drop privileges at runtime.
- **Pin base images by digest** for reproducible, tamper-evident inputs:

    ```dockerfile
    FROM alpine:3.21@sha256:a8560b36e8b8210634f77d9f7f9efd7ffa463e380b75e2e74aff4511df3ef88c
    ```

- **Minimize layers and clean in the same layer:** combine related `RUN`s and delete package caches within the layer that created them:

    ```dockerfile
    RUN apt-get update && apt-get install -y --no-install-recommends \
            package-bar package-baz && \
        rm -rf /var/lib/apt/lists/*
    ```

- **`ENTRYPOINT` vs `CMD`:** `ENTRYPOINT` is the fixed executable, while `CMD` provides default overridable arguments. Always use **exec/JSON form** (`["cmd"]`), never shell-string form, so signals reach your process:

    ```dockerfile
    ENTRYPOINT ["s3cmd"]
    CMD ["--help"]
    ```

- **`HEALTHCHECK`:** define a cheap probe so orchestrators can detect unhealthy containers.
- **`.dockerignore`:** exclude `.git`, `node_modules`, secrets, and build artifacts. It shrinks the build context and prevents secrets from leaking into layers.

### Build-time secrets and SSH (never bake secrets into layers)

```dockerfile
# syntax=docker/dockerfile:1
# Secret mount; never written to a layer
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc npm ci
# SSH mount; forwards the agent for private git/deps
RUN --mount=type=ssh git clone git@github.com:org/private.git
```

```bash
docker build --secret id=npmrc,src=$HOME/.npmrc --ssh default .
```

Verify nothing leaked with `docker history <image>`.

### Base-image trade-offs

| Base                                     | Pros                                                                  | Cons                                                         |
| ---------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------ |
| `-slim` (e.g. `debian:bookworm-slim`)    | **Safe default**; glibc, so prebuilt binaries/native extensions work  | Larger than distroless/alpine                                |
| `alpine`                                 | Very small                                                            | musl libc → occasional native-lib/build breakage, DNS quirks |
| **distroless** (`gcr.io/distroless/...`) | Smallest attack surface; no shell or package manager                  | No shell → harder to debug; runtime-only                     |
| **Chainguard / Wolfi**                   | Hardened, near-zero-CVE, daily rebuilds, per-image SBOM, FIPS options | Ecosystem lock-in considerations; some paid tiers            |

General pattern: full image in the builder stage, slim or distroless in the final stage.

### PID 1 and signal handling

PID 1 gets no default signal handlers, so a naive app run as PID 1 ignores `SIGTERM` (→ a 10s kill delay) and won't reap zombies. Fixes:

1. `docker run --init` (or Compose `init: true`) injects tini as PID 1. Tini ships inside Docker.
2. Bake `tini` into the image as the entrypoint.
3. Have the app handle `SIGTERM` itself (see the disposability factor in `12-factor-guidelines`).

Always use exec-form `ENTRYPOINT`/`CMD` so signals aren't swallowed by `/bin/sh`.

## Compose

Use the **`docker compose`** plugin (space, not the retired `docker-compose` binary).

- **Drop the top-level `version:` key:** it is obsolete and ignored; Compose V2 applies the latest Compose Specification automatically. Leaving it in prints: _"the attribute `version` is obsolete, it will be ignored…"_. Start the file at `services:`.

```yaml
# No `version:` key. Optionally a top-level `name:`.
services:
    web:
        build: .
        ports:
            - '8000:5000'
        depends_on:
            - redis
        develop:
            watch:
                - action: sync
                  path: ./src
                  target: /app/src
                - action: rebuild
                  path: package.json
    redis:
        image: redis:8-alpine
```

- **`docker compose watch`** (GA) drives the dev inner loop: declare `develop.watch` per service with `action: sync`, `sync+restart`, or `rebuild`. In current releases, watch delegates builds to Docker Bake for better caching/parallelism.
- **Profiles** enable services selectively; **GPU reservations** go under `deploy.resources.reservations.devices`.
- Recent Compose adds a top-level `models:` element and `provider` services that integrate the Docker Model Runner for running OCI-packaged models locally. This is useful for AI apps that want a local model dependency alongside their services.

## Builds at scale: Buildx &amp; Bake

- **BuildKit is the default builder** (since Engine 23.0); the **classic builder is deprecated**.
- **`docker buildx bake`** orchestrates building multiple related images/targets in one command. Definitions can be HCL, JSON, or a Compose file, and multiple files merge. This is a good fit for multi-image monorepos and multi-platform matrices.
- **Multi-platform**: `docker buildx build --platform linux/amd64,linux/arm64 ...`. Use the `docker-container` driver (or a remote build farm) for real multi-platform builds and advanced cache export; the default `docker` driver is single-node.

## Image Security &amp; Supply Chain

- **Scanning**: **Docker Scout** is built into the CLI (`docker scout cves`, `docker scout quickview`). **Trivy** and **Grype** remain popular OSS scanners for gating CI on critical CVEs.
- **Provenance &amp; SBOM attestations**: `docker buildx build --provenance=true --sbom=true`. Both attach to the image index, so they're inspectable without pulling the image. Scout's default supply-chain policy requires full provenance + SBOM.
- **Signing**: Cosign for signature-based verification is the common 2026 pattern.
- **Rootless mode**: run the daemon as a non-root user (`dockerd-rootless-setuptool.sh`) as defense-in-depth. It complements, but does not replace, a non-root `USER` inside the image. (Not supported on `s390x`.)

## Reproducible &amp; Smaller Images

- Multi-stage + minimal final base (distroless/Chainguard/slim): the dominant size lever.
- BuildKit `--mount=type=cache` for dependency caches; bind mounts for build-only files so they never enter a layer.
- Digest-pinned base images (`@sha256:...`) for byte-reproducible inputs.
- For reproducible digests across rebuilds, normalize timestamps with `SOURCE_DATE_EPOCH` and BuildKit's timestamp-rewrite output option. Confirm the exact flag names for your BuildKit version.
- Attach SBOM + provenance so "small" images are also auditable.

## Notable Deprecations (recent)

- **Classic (non-BuildKit) builder:** deprecated since Engine 23.0; use BuildKit/Buildx.
- **`docker-compose` V1:** end-of-life since June 2023; use the `docker compose` plugin.
- **Legacy `ENV name value` syntax:** deprecated; use `ENV name=value`.
- **cgroup v1:** deprecated in Engine 29.0 (support continues on a maintained branch until approximately May 2029).
- **Image `Config` shape:** empty/nil fields are omitted starting with Engine 29.0; this matters if your tooling parses `docker inspect` output.

## References

Official sources this guide is based on:

- Docker, Building best practices: <https://docs.docker.com/build/building/best-practices/>
- Docker, Build secrets: <https://docs.docker.com/build/building/secrets/>
- Docker, Compose file reference &amp; legacy versions: <https://docs.docker.com/reference/compose-file/legacy-versions/>
- Docker, Compose watch GA announcement: <https://www.docker.com/blog/announcing-docker-compose-watch-ga-release/>
- Docker, Compose provider/model services: <https://docs.docker.com/compose/how-tos/provider-services/>
- Docker, Bake guide: <https://docs.docker.com/guides/bake/>
- Docker, Buildx: <https://github.com/docker/buildx>
- Docker, Scout &amp; attestations: <https://docs.docker.com/guides/docker-scout/attestations/>
- Docker, Rootless mode: <https://docs.docker.com/engine/security/rootless/>
- Docker, Deprecated features: <https://docs.docker.com/engine/deprecated/>
- Docker Compose V2 &amp; V1 deprecation: <https://www.docker.com/blog/new-docker-compose-v2-and-v1-deprecation/>
- tini (PID 1 / signals): <https://github.com/krallin/tini>
- Docker Engine release/EOL tracker: <https://endoflife.date/docker-engine>

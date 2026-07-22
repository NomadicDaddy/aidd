# aidd container image.
#
# Stage 1 compiles the existing bun-standalone distribution for Linux and
# validates it with check-standalone (binary probes actually execute here,
# unlike on a Windows build host). Stage 2 is a glibc runtime — required by
# the bun-linux-x64-modern compile target — that also provides node/npm for
# the agent-backend CLIs. The container runs a single process: aidd-web
# serves the SPA, API, and WebSockets itself, so there is no nginx or
# supervisord (unlike the spernakit template this image is modeled on).

FROM oven/bun:1.3.14@sha256:e10577f0db68676a7024391c6e5cb4b879ebd17188ab750cf10024a6d700e5c4 AS builder

# Puppeteer is a root devDependency; its browser download is unused here.
ENV PUPPETEER_SKIP_DOWNLOAD=true
WORKDIR /src

COPY package.json bun.lock bunfig.toml ./
# require-bun.ts must ride along: every workspace's preinstall runs it, and this
# install runs with scripts enabled.
COPY scripts/require-bun.ts scripts/
COPY backend/package.json backend/
COPY cli/package.json cli/
COPY frontend/package.json frontend/
COPY shared/package.json shared/
RUN bun install --frozen-lockfile

COPY . .
RUN bun scripts/build-standalone.ts --target bun-linux-x64-modern \
	&& bun scripts/check-standalone.ts --target bun-linux-x64-modern --probe-binaries

FROM node:26-bookworm-slim@sha256:2d49d876e96237d76de412761cf05dbfe5aee325cc4406a4d41d5824c5bb8beb

# Defaults mirror AGENT_CLI_VERSIONS in scripts/docker-image.ts (the source
# of truth — `bun run docker:build` passes them as --build-arg).
ARG CLAUDE_CODE_VERSION=2.1.175
ARG CODEX_VERSION=0.139.0
ARG OPENCODE_VERSION=1.17.4
ARG KILOCODE_VERSION=7.3.45

# git: aidd runs commit in project working trees. tini: PID 1 zombie reaping —
# detached run relaunchers re-parent to PID 1 and aidd-web does not reap.
RUN apt-get update \
	&& apt-get install -y --no-install-recommends ca-certificates git tini \
	&& rm -rf /var/lib/apt/lists/*

# The agent CLIs are NOT baked into this image because their vendor terms do not grant aidd
# redistribution rights. The entrypoint installs the pinned versions into /home/aidd (a persistent
# volume) on first boot from the operator's own npm, under the operator's vendor agreements. The
# versions travel as ENV so the runtime pins exactly what the build intended.
ENV AIDD_CLAUDE_CODE_VERSION=${CLAUDE_CODE_VERSION} \
	AIDD_CODEX_VERSION=${CODEX_VERSION} \
	AIDD_OPENCODE_VERSION=${OPENCODE_VERSION} \
	AIDD_KILOCODE_VERSION=${KILOCODE_VERSION}

# Non-root is mandatory: claude refuses --dangerously-skip-permissions as
# root. The node base image already holds uid 1000 ("node"); replace it.
RUN userdel -r node \
	&& useradd --create-home --uid 1000 --shell /bin/bash aidd \
	&& mkdir -p /app /projects \
	&& chown aidd:aidd /app /projects

COPY --from=builder --chown=aidd:aidd /src/dist/bun-linux-x64-modern/ /app/
COPY docker/entrypoint.sh /usr/local/bin/aidd-entrypoint

# License notices. The binary embeds Bun, which statically links LGPL libraries, and the Debian
# base carries GPL/LGPL packages — so a recipient of this image must receive the notices and the
# relink offer with it, exactly as a recipient of the release archive does.
COPY --chown=aidd:aidd LICENSE THIRD-PARTY-LICENSES.md THIRD-PARTY-NOTICES.md /app/
COPY --chown=aidd:aidd licenses/ /app/licenses/

# data/ and logs/ must exist as mount points (rootfs is read-only in the
# production compose) and be writable when run without volumes.
RUN chmod 755 /usr/local/bin/aidd-entrypoint \
	&& mkdir -p /app/data /app/logs \
	&& chown aidd:aidd /app/data /app/logs

ENV HOME=/home/aidd
# Global npm installs land in the home volume, not in an image layer: the entrypoint installs the
# agent CLIs there at run time (they are deliberately not baked in — see above), so the prefix has
# to be writable and persistent.
ENV NPM_CONFIG_PREFIX=${HOME}/.npm-global \
	PATH=${HOME}/.npm-global/bin:${PATH}
USER aidd
WORKDIR /app

# Internal port is fixed at 3210 (remap on the host). The bearer-token guard
# exempts direct loopback callers, so this probe needs no token; external
# probes through a reverse proxy must present web.authToken.
EXPOSE 3210
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
	CMD ["node", "-e", "fetch('http://127.0.0.1:3210/api/v1/health').then((r)=>process.exit(r.ok?0:1),()=>process.exit(1))"]

ENTRYPOINT ["tini", "--", "/usr/local/bin/aidd-entrypoint"]
CMD ["/app/aidd-web"]

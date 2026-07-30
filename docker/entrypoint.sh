#!/usr/bin/env bash
# Container entrypoint for the aidd image.
#
# Everything else is handled by aidd-web itself — web-DB migrations are
# embedded in the binary and run at boot, and the SPA is served by the same
# process — so unlike the spernakit template there is no nginx templating,
# supervisord, migration step, or secret factory here. Responsibilities:
#   1. First-boot config bootstrap: author ~/.aidd/config.json with a
#      generated web.authToken and print the token once. aidd reads JSON
#      config only; there are no env overrides for web settings.
#   2. Git bootstrap: identity from GIT_USER_NAME/GIT_USER_EMAIL (GIT_* env
#      never reaches agent subprocesses, so identity must live in
#      ~/.gitconfig) and safe.directory for bind-mounted project trees.
#   3. Agent CLI provisioning: install the pinned agent CLIs into the home
#      volume on first boot. They are deliberately NOT baked into the image —
#      see the block below — so the operator obtains them from their vendors.
#      Skip with AIDD_SKIP_AGENT_CLI_INSTALL=1.
#   4. Claude Code autoupdate off: env toggles do not reach agent subprocesses
#      (aidd passes an allowlisted env), so the setting must live in
#      settings.json; aidd pins the version it installs.
#   5. Optional pre-start database backup (AIDD_BACKUP_ON_START=1).
set -euo pipefail

CONFIG_DIR="${HOME}/.aidd"
CONFIG_FILE="${CONFIG_DIR}/config.json"

mkdir -p "${CONFIG_DIR}"

if [[ ! -f "${CONFIG_FILE}" ]]; then
	# Finite read (od -N) — an unbounded /dev/urandom pipe dies of SIGPIPE
	# under pipefail. 24 random bytes -> 48 hex chars.
	TOKEN="$(od -An -tx1 -N24 /dev/urandom | tr -d ' \n')"
	cat > "${CONFIG_FILE}" <<EOF
{
	"web": {
		"allowRemote": true,
		"allowedOrigins": [],
		"allowedRoots": ["/projects"],
		"authToken": "${TOKEN}",
		"hostname": "0.0.0.0",
		"port": 3210
	}
}
EOF
	chmod 600 "${CONFIG_FILE}"
	echo "=============================================================="
	echo " aidd first boot: generated ${CONFIG_FILE}"
	echo " Web API auth token (printed only this once):"
	echo ""
	echo "   ${TOKEN}"
	echo ""
	echo " Edit the mounted config and restart the container to change"
	echo " web settings."
	echo "=============================================================="
fi

if [[ ! -f "${HOME}/.gitconfig" ]]; then
	# Bind-mounted project trees are often owned by a different uid than the
	# container user; without this, git refuses them as dubious ownership.
	git config --global --add safe.directory '*'
	if [[ -n "${GIT_USER_NAME:-}" && -n "${GIT_USER_EMAIL:-}" ]]; then
		git config --global user.name "${GIT_USER_NAME}"
		git config --global user.email "${GIT_USER_EMAIL}"
		echo "[entrypoint] wrote ~/.gitconfig for ${GIT_USER_NAME} <${GIT_USER_EMAIL}>"
	else
		echo "[entrypoint] no GIT_USER_NAME/GIT_USER_EMAIL set; run commits will fail until git identity exists in the home volume"
	fi
fi

# Agent CLIs are installed at run time into the persistent home volume because their vendor terms
# do not grant aidd redistribution rights. The operator obtains each CLI from its vendor under
# their own agreement.
#
# Pinned to the versions the build intended (AIDD_*_VERSION, set as ENV in the Dockerfile).
# Set AIDD_SKIP_AGENT_CLI_INSTALL=1 for an air-gapped host or a pre-provisioned home volume.
install_agent_cli() {
	local package="$1" version="$2" binary="$3"
	local installed
	if [[ -z "${version}" ]]; then return 0; fi
	installed="$("${binary}" --version 2>/dev/null | head -1 || true)"
	if [[ "${installed}" == *"${version}"* ]]; then return 0; fi

	echo "[entrypoint] installing ${package}@${version} into ${NPM_CONFIG_PREFIX}"
	if ! npm install -g --no-fund --no-audit "${package}@${version}"; then
		echo "[entrypoint] WARNING: could not install ${package}@${version}; that backend will be unavailable"
	fi
}

if [[ "${AIDD_SKIP_AGENT_CLI_INSTALL:-0}" != "1" ]]; then
	mkdir -p "${NPM_CONFIG_PREFIX:-${HOME}/.npm-global}"
	install_agent_cli '@anthropic-ai/claude-code' "${AIDD_CLAUDE_CODE_VERSION:-}" claude
	install_agent_cli 'cline' "${AIDD_CLINE_VERSION:-}" cline
	install_agent_cli '@openai/codex' "${AIDD_CODEX_VERSION:-}" codex
	install_agent_cli 'opencode-ai' "${AIDD_OPENCODE_VERSION:-}" opencode
	# @kilocode/cli installs a binary called `kilo`, not `kilocode` (see the backend command table
	# in shared/src/backends/commands.ts). Probing the wrong name never matches, so the
	# already-installed short-circuit above never fires and every container start reinstalls it.
	install_agent_cli '@kilocode/cli' "${AIDD_KILOCODE_VERSION:-}" kilo
fi

CLAUDE_SETTINGS="${HOME}/.claude/settings.json"
if [[ ! -f "${CLAUDE_SETTINGS}" ]]; then
	mkdir -p "${HOME}/.claude"
	printf '{\n\t"autoUpdates": false\n}\n' > "${CLAUDE_SETTINGS}"
fi

DB_FILE="/app/data/aidd-panel.db"
if [[ "${AIDD_BACKUP_ON_START:-0}" == "1" && -f "${DB_FILE}" ]]; then
	BACKUP_DIR="/app/data/backups"
	mkdir -p "${BACKUP_DIR}"
	STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
	cp "${DB_FILE}" "${BACKUP_DIR}/aidd-panel.${STAMP}.db"
	# Keep the five most recent backups.
	ls -1t "${BACKUP_DIR}"/aidd-panel.*.db 2>/dev/null | tail -n +6 | xargs -r rm --
	echo "[entrypoint] backed up ${DB_FILE} -> ${BACKUP_DIR}/aidd-panel.${STAMP}.db"
fi

echo "[entrypoint] aidd v$(cat /app/VERSION 2>/dev/null || echo unknown)"
exec "$@"

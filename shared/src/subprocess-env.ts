/**
 * Allowed environment-variable exceptions.
 *
 * aidd's configuration rule is "JSON-only" (see .aidd/audits/TECHDEBT.md): persistent app
 * configuration must live in `~/.aidd/config.json`, never in `.env` files or arbitrary
 * `process.env.*` reads. Two narrow categories are exempted because the values are runtime
 * facts of the host shell or provider credentials that legitimately come from the parent
 * environment of the aidd process:
 *
 *   1. **Runtime/shell variables** (`runtimeEnvKeys`) — PATH, PATHEXT, HOME, etc. Needed for
 *      any spawned binary to resolve its dependencies on Windows and POSIX. These pass to every
 *      subprocess (tool and backend).
 *   2. **Provider credentials and per-CLI config overrides** (added in `backendEnvKeys`) — API
 *      keys and config-file overrides honored by the external coding-CLI processes that aidd
 *      invokes (Claude Code, Codex, OpenCode, KiloCode). These pass only to backend CLI
 *      subprocesses, not to internal tool subprocesses.
 *
 * Anything else — feature toggles, paths, settings — must go through `loadNativeFileConfig()`
 * and the JSON config file. Adding a new key here requires a concrete provider/toolchain
 * justification documented in the comment block above `backendEnvKeys`.
 *
 * The single exception inside the aidd codebase is `AIDD_NATIVE_SIMULATION`, a test/CI-only
 * toggle that short-circuits the native backend before any provider call. See
 * `src/agent/client.ts` for the read-site documentation.
 */
const runtimeEnvKeys = [
	'PATH',
	'Path',
	'PATHEXT',
	'SystemRoot',
	'SystemDrive',
	'WINDIR',
	'COMSPEC',
	'ProgramData',
	'ProgramFiles',
	'ProgramFiles(x86)',
	'PSModulePath',
	'HOME',
	'USERPROFILE',
	'APPDATA',
	'LOCALAPPDATA',
	'TMP',
	'TEMP',
	'SHELL',
	'TERM',
];

// Explicit named allowlist for backend CLI subprocesses. Each entry is justified by a concrete
// provider/toolchain requirement; do NOT reintroduce a prefix wildcard loop here. A prefix like
// `OPENAI_` or `CLAUDE_` would propagate unrelated third-party variables (e.g. OPENAI_LOG=debug,
// OPENAI_PROXY, CLAUDE_EVIL=1) verbatim into spawned CLIs — functionally equivalent to a
// `{ ...process.env }` spread. // allow-env-spread-policy
const backendEnvKeys = [
	...runtimeEnvKeys,
	// Anthropic / Claude Code credentials and routing.
	'ANTHROPIC_API_KEY',
	'ANTHROPIC_AUTH_TOKEN',
	'CLAUDE_CODE_API_KEY',
	// OpenAI credentials and endpoint override (used by OpenAI-compatible providers).
	'OPENAI_API_KEY',
	'OPENAI_BASE_URL',
	// aidd native backend OpenAI-compatible provider credentials and routing.
	'NATIVE_API_KEY',
	'ZHIPU_API_KEY',
	'XAI_API_KEY',
	'NATIVE_BASE_URL',
	'NATIVE_MODEL',
	'NATIVE_PROVIDER',
	// Codex (OpenAI CLI) auth + config locations.
	'CODEX_HOME',
	'CODEX_AUTH_TOKEN',
	// Per-CLI config file overrides.
	'OPENCODE_CONFIG',
	'KILOCODE_CONFIG',
	'ZRUN_CONFIG',
	// aidd native backend simulation toggle (test/CI only).
	'AIDD_NATIVE_SIMULATION',
	// Bun runtime install dir, required when a CLI is invoked via a Bun-managed binary.
	'BUN_INSTALL',
	// Node tuning (e.g. --max-old-space-size) for CLIs that shell into Node.
	'NODE_OPTIONS',
	// XDG dirs that the OpenCode/KiloCode/Codex CLIs honor for cache and config discovery.
	'XDG_CACHE_HOME',
	'XDG_CONFIG_HOME',
];

function pickEnv(keys: string[], source: NodeJS.ProcessEnv): Record<string, string> {
	const env: Record<string, string> = {};
	for (const key of keys) {
		const value = source[key];
		if (value !== undefined) env[key] = value;
	}
	return env;
}

export function buildToolSubprocessEnv(
	source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
	return pickEnv(runtimeEnvKeys, source);
}

export function buildBackendSubprocessEnv(
	overrideEnv: Record<string, string> = {},
	source: NodeJS.ProcessEnv = process.env,
): Record<string, string> {
	const env = pickEnv(backendEnvKeys, source);
	return { ...env, ...overrideEnv };
}

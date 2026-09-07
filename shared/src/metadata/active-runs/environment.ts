export const SUPPRESS_CLI_ACTIVE_RUN_ENV = 'AIDD_SUPPRESS_CLI_HEARTBEAT';
export const EXT_RUN_ID_ENV = 'AIDD_EXT_RUN_ID';
export const EXT_RUN_SOURCE_ENV = 'AIDD_EXT_RUN_SOURCE';
// Set alongside EXT_RUN_SOURCE_ENV so a detached child stamps the same initiator on its own
// active-run record that the launcher stamped on the row. Without it the CLI would default to
// 'operator' and an auto-chained or scheduled run would report itself as one somebody asked for.
export const EXT_RUN_INITIATOR_ENV = 'AIDD_EXT_RUN_INITIATOR';
export const EXT_LOG_PATH_ENV = 'AIDD_EXT_LOG_PATH';
export const EXT_RUN_DRIVER_KIND_ENV = 'AIDD_EXT_RUN_DRIVER_KIND';
export const EXT_RUN_DRIVER_ID_ENV = 'AIDD_EXT_RUN_DRIVER_ID';
export const EXT_RUN_DRIVER_SHA256_ENV = 'AIDD_EXT_RUN_DRIVER_SHA256';
// Live URL of the launcher-managed app this run can verify against (e.g. the web panel that
// launched a web/dogfood run). Handed to the detached CLI so the prompt can tell the agent to
// reuse the already-running instance instead of bootstrapping its own server.
export const EXT_APP_URL_ENV = 'AIDD_EXT_APP_URL';

export function isCliActiveRunSuppressed(env: NodeJS.ProcessEnv = process.env): boolean {
	return env[SUPPRESS_CLI_ACTIVE_RUN_ENV] === '1';
}

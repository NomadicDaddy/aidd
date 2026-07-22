import pino from 'pino';

// The web logger is wired through Elysia plugins (requestId, errorHandler) and the run lifecycle
// (RunService.monitorRun / handleMonitorFailure), all of which log structured objects that may
// transitively contain request headers, child-process error payloads, or env-derived context. The
// redact config below masks credential-bearing keys in those payloads. Keep this list in sync with
// `scrubSecrets` in services/secretScrubber.ts — the regex scrubber handles freeform stdout/stderr,
// while pino redact handles structured log fields.
export const webLogger = pino({
	level: 'info',
	redact: {
		censor: '[redacted]',
		paths: [
			'*.authorization',
			'*.Authorization',
			'*.apiKey',
			'*.api_key',
			'*.botToken',
			'*.token',
			'*.password',
			'*.ANTHROPIC_API_KEY',
			'*.OPENAI_API_KEY',
			'*.CODEX_AUTH_TOKEN',
			'env.ANTHROPIC_API_KEY',
			'env.OPENAI_API_KEY',
			'env.CODEX_AUTH_TOKEN',
			'headers.authorization',
			'headers.Authorization',
		],
	},
});

// Structured log categories. Tagging every performance/diagnostic log line with a stable
// `category` lets a log-aggregation query split request timing apart from slow queries without
// grepping free-text messages — the gap that left "where does time go" unanswerable. Only the
// categories with a live emitter are declared (the panel is a loopback control plane with no
// authn/scheduler surfaces); add more here when something actually logs them.
const LogCategory = {
	/** API request/response lifecycle (method, path, status, duration). */
	API: 'api',
	/** Database operations — used here for slow-query timing. */
	DATABASE: 'database',
} as const;

type LogCategoryType = (typeof LogCategory)[keyof typeof LogCategory];

type LogLevel = 'debug' | 'error' | 'info' | 'warn';

/**
 * Emit a structured log line tagged with a category. The category lands as a top-level field so
 * aggregators can filter on it (e.g. all `database` lines slower than a threshold).
 */
function logWithCategory(
	level: LogLevel,
	category: LogCategoryType,
	message: string,
	meta?: Record<string, unknown>
): void {
	webLogger[level]({ category, ...meta }, message);
}

/** Log an API request/response event (method, path, status, duration, requestId). */
export function logApi(level: LogLevel, message: string, meta?: Record<string, unknown>): void {
	logWithCategory(level, LogCategory.API, message, meta);
}

/** Log a database operation event (operation, durationMs, method). */
export function logDatabase(
	level: LogLevel,
	message: string,
	meta?: Record<string, unknown>
): void {
	logWithCategory(level, LogCategory.DATABASE, message, meta);
}

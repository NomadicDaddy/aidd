import { scrubSecretFields } from 'aidd-shared/lib/secretScrubber';
import pino from 'pino';

// The web logger is wired through Elysia plugins (requestId, errorHandler) and the run lifecycle
// (RunService.monitorRun / handleMonitorFailure), all of which log structured objects that may
// transitively contain request headers, child-process error payloads, or env-derived context. The
// redact config below masks credential-bearing keys in those payloads. Keep this list in sync with
// `scrubSecrets` in services/secretScrubber.ts — the regex scrubber handles freeform stdout/stderr,
// while pino redact handles structured log fields.
export const webLogger = pino({
	// Scrub the final JSON after pino has serialized Errors, bindings and interpolated messages.
	// This covers arbitrary nesting while retaining pino's cycle handling and Error diagnostics.
	hooks: {
		streamWrite: (line) => `${JSON.stringify(scrubSecretFields(JSON.parse(line)))}\n`,
	},
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
	// pino does not serialize native Error objects by default — Error.message and Error.stack are
	// non-enumerable, so a raw `{ error }` payload logs as `{}` and failure diagnostics are lost.
	// Register a serializer under both payload keys the codebase uses (`err` and `error`) so those
	// logs carry type/message/stack again. Non-Error values pass through unchanged.
	serializers: {
		err: (value: unknown): unknown =>
			value instanceof Error ? pino.stdSerializers.err(value) : value,
		error: (value: unknown): unknown =>
			value instanceof Error ? pino.stdSerializers.err(value) : value,
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
	meta?: Record<string, unknown>,
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
	meta?: Record<string, unknown>,
): void {
	logWithCategory(level, LogCategory.DATABASE, message, meta);
}

import { setTimeout as delay } from 'node:timers/promises';

// SQLite surfaces a handful of transient, retryable lock conditions. busy_timeout (set in
// client.ts) covers plain SQLITE_BUSY by blocking the call until the lock frees, but it does
// NOT cover SQLITE_BUSY_SNAPSHOT — the write-write conflict WAL raises when a deferred
// transaction that started as a reader tries to upgrade to a writer after another connection
// already committed. That one surfaces immediately and is the case this helper exists for.
const RETRYABLE_NEEDLES: readonly string[] = [
	'SQLITE_BUSY_SNAPSHOT',
	'SQLITE_BUSY',
	'SQLITE_LOCKED',
	'database is locked',
	'database table is locked',
];

function isRetryableSqliteError(error: unknown): boolean {
	if (!(error instanceof Error)) return false;
	const rawCode = (error as Error & { code?: unknown }).code;
	const code = typeof rawCode === 'string' ? rawCode : '';
	return RETRYABLE_NEEDLES.some(
		(needle) => code.includes(needle) || error.message.includes(needle)
	);
}

export interface SqliteRetryOptions {
	/** Total attempts including the first try. Default 5. */
	attempts?: number;
	/** Base backoff in ms; doubles each attempt. Default 25. */
	baseDelayMs?: number;
	/** Label used in telemetry/debugging; carried on the final thrown error. */
	label?: string;
	/** Upper bound for a single backoff wait. Default 250. */
	maxDelayMs?: number;
}

/**
 * Run a SQLite operation, retrying with jittered exponential backoff on transient lock
 * errors. Non-lock errors propagate immediately. The operation may be synchronous (a raw
 * bun:sqlite/drizzle call) or async — both are awaited.
 */
export async function withSqliteRetry<T>(
	operation: () => Promise<T> | T,
	options: SqliteRetryOptions = {}
): Promise<T> {
	const attempts = options.attempts ?? 5;
	const baseDelayMs = options.baseDelayMs ?? 25;
	const maxDelayMs = options.maxDelayMs ?? 250;
	for (let attempt = 0; attempt < attempts; attempt++) {
		try {
			return await operation();
		} catch (err) {
			if (attempt === attempts - 1 || !isRetryableSqliteError(err)) throw err;
			const backoff = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
			// Jitter spreads out concurrent writers so they don't retry in lockstep.
			await delay(backoff + backoff * 0.5 * Math.random());
		}
	}
	// Unreachable: the final attempt either returns or throws above.
	throw new Error(
		`withSqliteRetry exhausted without resolution${options.label ? ` (${options.label})` : ''}`
	);
}

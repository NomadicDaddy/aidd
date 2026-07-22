import type { Database, SQLQueryBindings } from 'bun:sqlite';

import { logDatabase } from '../logger.ts';

export type SqlMethod = 'all' | 'get' | 'run' | 'values';

// Slow-query threshold in ms. Any statement at or above this is logged once with its timing so
// database latency is diagnosable from logs. Read once at module load (this runs on the hot path);
// override with AIDD_SLOW_QUERY_MS, set to 0 to log every statement when actively profiling.
// Resolved by executeStatement, which is the single place every query — worker-backed and
// in-process alike — passes through.
const SLOW_QUERY_THRESHOLD_MS = ((): number => {
	const raw = process.env.AIDD_SLOW_QUERY_MS;
	if (raw === undefined || raw === '') return 100;
	const parsed = Number(raw);
	return Number.isFinite(parsed) && parsed >= 0 ? parsed : 100;
})();

// Cap the logged SQL so a pathological generated query can't bloat a log line. The SQL is
// parameterized (`?` placeholders); bound params are never logged, as they may carry secrets.
const MAX_LOGGED_SQL = 300;

// The shape drizzle's sqlite-proxy callback expects back: `rows` is an array of value-arrays
// for 'all'/'values', a single value-array for 'get', and ignored for 'run'. A 'get' that
// matched nothing must report `undefined` (not `[]`) — an empty array is truthy and would make
// drizzle map a phantom row.
export interface StatementResult {
	rows: unknown;
}

// Execute one prepared statement against a raw bun:sqlite connection. This is the single
// translation point between drizzle's (sql, params, method) proxy protocol and bun:sqlite, used
// both inside the DB worker and by the in-process database path.
export function executeStatement(
	sqlite: Database,
	sql: string,
	params: unknown[],
	method: SqlMethod
): StatementResult {
	const bindings = params as SQLQueryBindings[];
	const start = performance.now();
	try {
		const statement = sqlite.query(sql);
		if (method === 'run') {
			statement.run(...bindings);
			return { rows: [] };
		}
		const rows = statement.values(...bindings);
		if (method === 'get') {
			return { rows: rows[0] };
		}
		return { rows };
	} finally {
		const durationMs = Math.round((performance.now() - start) * 100) / 100;
		if (durationMs >= SLOW_QUERY_THRESHOLD_MS) {
			logDatabase('warn', 'slow query', {
				durationMs,
				method,
				sql: sql.length > MAX_LOGGED_SQL ? `${sql.slice(0, MAX_LOGGED_SQL)}…` : sql,
				thresholdMs: SLOW_QUERY_THRESHOLD_MS,
			});
		}
	}
}

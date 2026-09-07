import { getTableConfig, type SQLiteTable } from 'drizzle-orm/sqlite-core';

/**
 * Walk a Drizzle SQL queryChunk tree and reconstruct a best-effort SQL string.
 * Handles StringChunk wrappers, column references (rendered as `"colname"`),
 * and raw string fragments: the three shapes Drizzle's `sql` template tag
 * produces for CHECK constraint bodies.
 */
function drizzleChunkToSql(chunk: unknown): string {
	if (typeof chunk === 'string') return chunk;
	if (chunk === null || chunk === undefined) return '';
	if (typeof chunk === 'object') {
		const obj = chunk as Record<string, unknown>;
		if (typeof obj['name'] === 'string' && typeof obj['columnType'] === 'string') {
			return `"${obj['name']}"`;
		}
		if (Array.isArray(obj['value'])) {
			return obj['value'].map(drizzleChunkToSql).join('');
		}
		if (obj['value'] !== undefined && typeof obj['value'] !== 'object') {
			return String(obj['value']);
		}
	}
	return '';
}

/**
 * Normalize a CHECK constraint SQL body for comparison: collapse all whitespace
 * runs to single spaces, strip double-quotes around identifiers, and strip
 * spaces after commas/parentheses.
 */
function normalizeCheckSql(sql: string): string {
	return sql
		.replace(/"\w+"/g, (match) => match.slice(1, -1))
		.replace(/\s*,\s*/g, ',')
		.replace(/\(\s+/g, '(')
		.replace(/\s+\)/g, ')')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Extract CHECK constraints declared in Drizzle's table config. Returns a Map of
 * constraint name to normalized SQL body.
 */
export function getDrizzleCheckConstraints(table: SQLiteTable): Map<string, string> {
	const config = getTableConfig(table);
	const result = new Map<string, string>();
	if (!config.checks) return result;
	for (const check of config.checks) {
		const chunks = (check.value as { queryChunks?: unknown[] }).queryChunks ?? [];
		const rawSql = chunks.map(drizzleChunkToSql).join('').trim();
		result.set(check.name, normalizeCheckSql(rawSql));
	}
	return result;
}

/**
 * Extract CHECK constraints from a SQLite CREATE TABLE statement's `sql` column
 * in sqlite_master. Uses paren-depth matching to handle nested parens in CHECK
 * bodies. Unnamed CHECKs are keyed as `'unnamed'` when present.
 */
export function getSqliteCheckConstraints(tableSql: string): Map<string, string> {
	const result = new Map<string, string>();
	if (!tableSql) return result;
	let idx = 0;
	while (idx < tableSql.length) {
		const remaining = tableSql.slice(idx);
		const namedMatch = remaining.match(/CONSTRAINT\s+(\w+)\s+CHECK\s*\(/);
		const unnamedMatch = remaining.match(/(?<![\w])CHECK\s*\(/);
		let constraintName: string;
		let matchEnd: number;
		let matchStart: number;
		if (namedMatch) {
			constraintName = namedMatch[1] ?? 'unnamed';
			matchStart = idx + (namedMatch.index ?? 0);
			matchEnd = matchStart + namedMatch[0].length;
		} else if (unnamedMatch) {
			constraintName = 'unnamed';
			matchStart = idx + (unnamedMatch.index ?? 0);
			matchEnd = matchStart + unnamedMatch[0].length;
		} else {
			break;
		}
		const openParenIdx = matchEnd - 1;
		let depth = 1;
		let end = openParenIdx + 1;
		while (end < tableSql.length && depth > 0) {
			if (tableSql[end] === '(') depth++;
			else if (tableSql[end] === ')') depth--;
			end++;
		}
		const checkBody = tableSql.slice(openParenIdx + 1, end - 1).trim();
		result.set(constraintName, normalizeCheckSql(checkBody));
		idx = end;
	}
	return result;
}

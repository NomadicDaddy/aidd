import type { Database } from 'bun:sqlite';

export interface ForeignKeyViolation {
	fkid: number;
	parent: string;
	rowid: null | number;
	table: string;
}

export function getForeignKeyViolations(sqlite: Database): ForeignKeyViolation[] {
	return sqlite.query<ForeignKeyViolation, []>('PRAGMA foreign_key_check').all();
}

export function formatForeignKeyViolation(violation: ForeignKeyViolation): string {
	const row = violation.rowid === null ? 'unknown row' : `rowid ${violation.rowid}`;
	return `${violation.table} ${row} references missing ${violation.parent} row (fkid ${violation.fkid})`;
}

export function assertNoForeignKeyViolations(sqlite: Database): void {
	const violations = getForeignKeyViolations(sqlite);
	if (violations.length === 0) return;

	const sample = violations.slice(0, 10).map(formatForeignKeyViolation).join('; ');
	const suffix =
		violations.length > 10 ? `; ${violations.length - 10} additional violation(s)` : '';
	throw new Error(
		`Web database foreign key check failed with ${violations.length} violation(s): ${sample}${suffix}`,
	);
}

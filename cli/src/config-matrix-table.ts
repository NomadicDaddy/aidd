// Markdown table rendering for the effective-config matrix. Split out of config-matrix.ts so the
// row-derivation logic and the presentation layer stay in separate, headroom-having modules.

export interface ConfigMatrixRow {
	backend: string;
	model: string;
	notes: string;
	provider: string;
	reasoning: string;
	scenario: string;
}

const tableColumns = [
	{ header: 'Scenario', select: (row: ConfigMatrixRow) => row.scenario },
	{ header: 'CLI/backend', select: (row: ConfigMatrixRow) => row.backend },
	{ header: 'Provider', select: (row: ConfigMatrixRow) => row.provider },
	{ header: 'Model', select: (row: ConfigMatrixRow) => row.model },
	{ header: 'Reasoning', select: (row: ConfigMatrixRow) => row.reasoning },
	{ header: 'Notes', select: (row: ConfigMatrixRow) => row.notes },
] as const;

function tableCell(value: string): string {
	// Escape backslashes first, then pipes, so a literal backslash in a cell value
	// cannot merge with the pipe escape (CodeQL js/incomplete-sanitization).
	return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

function formatTableLine(cells: string[], widths: number[]): string {
	return `| ${cells
		.map((cell, index) => cell.padEnd(widths[index] ?? cell.length))
		.join(' | ')} |`;
}

function formatTableSeparator(widths: number[]): string {
	return `| ${widths.map((width) => '-'.repeat(Math.max(3, width))).join(' | ')} |`;
}

export function formatConfigMatrixTable(rows: ConfigMatrixRow[]): string {
	const headers = tableColumns.map((column) => column.header);
	const formattedRows = rows.map((row) =>
		tableColumns.map((column) => tableCell(column.select(row)))
	);
	const widths = tableColumns.map((column, index) =>
		Math.max(column.header.length, ...formattedRows.map((row) => row[index]?.length ?? 0))
	);

	return [
		formatTableLine(headers, widths),
		formatTableSeparator(widths),
		...formattedRows.map((row) => formatTableLine(row, widths)),
	].join('\n');
}

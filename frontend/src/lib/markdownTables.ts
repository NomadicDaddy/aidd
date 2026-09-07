export type MarkdownTableAlignment = 'center' | 'left' | 'right' | null;

export interface MarkdownTableBlock {
	alignments: MarkdownTableAlignment[];
	header: string[];
	rows: string[][];
	type: 'table';
}

const DELIMITER_CELL = /^:?-{3,}:?$/;

function splitTableRow(line: string): null | string[] {
	const trimmed = line.trim();
	if (!trimmed.includes('|')) return null;

	const content = trimmed.replace(/^\|/, '').replace(/\|$/, '');
	const cells: string[] = [];
	let cell = '';
	let escaped = false;
	let inCode = false;

	for (const character of content) {
		if (escaped) {
			cell += character === '|' ? '|' : `\\${character}`;
			escaped = false;
			continue;
		}
		if (character === '\\') {
			escaped = true;
			continue;
		}
		if (character === '`') {
			inCode = !inCode;
			cell += character;
			continue;
		}
		if (character === '|' && !inCode) {
			cells.push(cell.trim());
			cell = '';
			continue;
		}
		cell += character;
	}
	if (escaped) cell += '\\';
	cells.push(cell.trim());
	return cells;
}

function alignment(marker: string): MarkdownTableAlignment {
	const left = marker.startsWith(':');
	const right = marker.endsWith(':');
	if (left && right) return 'center';
	if (right) return 'right';
	return left ? 'left' : null;
}

export function parseMarkdownTable(
	lines: string[],
	index: number,
): { block: MarkdownTableBlock; nextIndex: number } | null {
	const header = splitTableRow(lines[index] ?? '');
	const markers = splitTableRow(lines[index + 1] ?? '');
	if (
		header === null ||
		markers === null ||
		header.length !== markers.length ||
		markers.some((marker) => !DELIMITER_CELL.test(marker))
	) {
		return null;
	}

	const rows: string[][] = [];
	let cursor = index + 2;
	while (cursor < lines.length) {
		const cells = splitTableRow(lines[cursor] ?? '');
		if (cells === null) break;
		rows.push(header.map((_, cellIndex) => cells[cellIndex] ?? ''));
		cursor++;
	}

	return {
		block: { alignments: markers.map(alignment), header, rows, type: 'table' },
		nextIndex: cursor,
	};
}

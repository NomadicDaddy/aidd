export type MarkdownDefinitionsBlock = { entries: MarkdownDefinition[]; type: 'definitions' };

interface MarkdownDefinition {
	definition: string;
	term: string;
}

const DEFINITION = /^:\s+(.+)$/;

/**
 * A definition list: a term line, then a `: definition` line, with any following non-blank lines
 * continuing that definition until a blank line or the next term. Returns null unless the line after
 * `index` opens a definition, so the caller can try the next block kind.
 */
export function parseMarkdownDefinitions(
	lines: string[],
	index: number,
): { block: MarkdownDefinitionsBlock; nextIndex: number } | null {
	if (!DEFINITION.test((lines[index + 1] ?? '').trim())) return null;
	const entries: MarkdownDefinition[] = [];
	let cursor = index;
	while (cursor + 1 < lines.length) {
		const term = (lines[cursor] ?? '').trim();
		const marker = DEFINITION.exec((lines[cursor + 1] ?? '').trim());
		if (term.length === 0 || !marker) break;
		const definition = [marker[1] ?? ''];
		cursor = continueDefinition(lines, cursor + 2, definition);
		entries.push({ definition: definition.join(' '), term });
	}
	return { block: { entries, type: 'definitions' }, nextIndex: cursor };
}

/** Appends continuation lines to `definition` and returns the index after the last one. */
function continueDefinition(lines: string[], start: number, definition: string[]): number {
	let cursor = start;
	while (cursor < lines.length) {
		const continuation = lines[cursor] ?? '';
		if (continuation.trim().length === 0) break;
		if (DEFINITION.test((lines[cursor + 1] ?? '').trim())) break;
		definition.push(continuation.trim());
		cursor++;
	}
	return cursor;
}

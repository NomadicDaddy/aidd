// Prettier-canonical JSON printing, shared by every writer of a committed `.aidd` file.
//
// Apps commit their `.aidd` JSON in prettier's canonical form (useTabs, tabWidth 4, printWidth 100,
// jsonRecursiveSort). A plain `JSON.stringify(_, null, 2)` diverges from that on every line —
// 2-space indent, unsorted keys, always-multiline arrays — so a routine one-field write rewrote the
// whole file and fought the formatter. This printer reproduces prettier instead: objects always
// break, one sorted key per line; arrays stay inline until they would exceed printWidth at their
// indentation. `prettier --write` is left with nothing to change.
//
// "Exceed printWidth" is measured over the whole rendered line, separator included. Prettier breaks
// an array whose inline form lands exactly on printWidth when a comma follows it, and keeps the
// identical array inline when it is its parent's last entry. Measuring the value alone left a
// 100-column `dependencies` array inline in a derived app's feature.json, so every approval written
// through this printer turned that app's `check:aidd-format` red until someone reformatted by hand.

export interface JsonPrintStyle {
	/** The literal indentation unit — a tab or a run of spaces. */
	indent: string;
	/** Columns one `indent` occupies when measuring a line against `printWidth`. */
	indentWidth: number;
	printWidth: number;
}

export const PRETTIER_JSON_STYLE: JsonPrintStyle = {
	indent: '\t',
	indentWidth: 4,
	printWidth: 100,
};

export function printJson(value: unknown, style: JsonPrintStyle = PRETTIER_JSON_STYLE): string {
	return `${printValue(value, 0, 0, style, 0)}\n`;
}

/**
 * Infer the style of an already-written JSON document, or `null` when it is not in prettier's
 * canonical shape and should be left to whatever serializer owns it. Callers use this to match the
 * formatting a file already has rather than imposing one on it.
 */
export function detectPrettierJsonStyle(raw: string): JsonPrintStyle | null {
	let parsed: unknown;
	try {
		parsed = JSON.parse(raw) as unknown;
	} catch {
		return null;
	}
	if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
	const keys = Object.keys(parsed);
	// Fewer than two keys sort trivially, so there is nothing to tell the two regimes apart.
	if (keys.length < 2) return null;
	if (keys.some((key, index) => index > 0 && key < keys[index - 1]!)) return null;
	// Line 2 of a non-empty object is always its first key, so its indent is the unit. Reading the
	// first indented line anywhere in the file would instead match inside a multi-line string value.
	const indent = /^(\t+| +)"/.exec(raw.split('\n', 2)[1] ?? '')?.[1];
	if (indent === undefined) return null;
	return {
		indent,
		indentWidth: indent === '\t' ? 4 : indent.length,
		printWidth: 100,
	};
}

/** Columns the separator after an entry occupies: a comma for every entry but the last. */
function separatorWidth(index: number, length: number): number {
	return index < length - 1 ? 1 : 0;
}

/**
 * @param column - Columns already consumed on this line before the value starts.
 * @param trailing - Columns consumed after the value on the same line, from `separatorWidth`.
 */
function printValue(
	value: unknown,
	depth: number,
	column: number,
	style: JsonPrintStyle,
	trailing: number,
): string {
	if (Array.isArray(value)) return printArray(value, depth, column, style, trailing);
	if (value !== null && typeof value === 'object') {
		return printObject(value as Record<string, unknown>, depth, style);
	}
	return JSON.stringify(value);
}

function printObject(
	object: Record<string, unknown>,
	depth: number,
	style: JsonPrintStyle,
): string {
	const keys = Object.keys(object).sort();
	if (keys.length === 0) return '{}';
	const childIndent = style.indent.repeat(depth + 1);
	const childColumns = (depth + 1) * style.indentWidth;
	const lines = keys.map((key, index) => {
		const keyText = JSON.stringify(key);
		const valueColumn = childColumns + keyText.length + 2;
		const value = printValue(
			object[key],
			depth + 1,
			valueColumn,
			style,
			separatorWidth(index, keys.length),
		);
		return `${childIndent}${keyText}: ${value}`;
	});
	return `{\n${lines.join(',\n')}\n${style.indent.repeat(depth)}}`;
}

function printArray(
	array: unknown[],
	depth: number,
	column: number,
	style: JsonPrintStyle,
	trailing: number,
): string {
	if (array.length === 0) return '[]';
	// Probing each element at column 0 only asks whether any of them is itself multi-line, which
	// forces the parent to break. Their own fit is decided below, once they have a real column.
	const elements = array.map((item) => printValue(item, depth + 1, 0, style, 0));
	const inline = `[${elements.join(', ')}]`;
	if (!inline.includes('\n') && column + inline.length + trailing <= style.printWidth) {
		return inline;
	}
	const childIndent = style.indent.repeat(depth + 1);
	const lines = array.map((item, index) => {
		const value = printValue(
			item,
			depth + 1,
			(depth + 1) * style.indentWidth,
			style,
			separatorWidth(index, array.length),
		);
		return `${childIndent}${value}`;
	});
	return `[\n${lines.join(',\n')}\n${style.indent.repeat(depth)}]`;
}

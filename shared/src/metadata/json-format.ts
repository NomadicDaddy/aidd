// Prettier-canonical JSON printing, shared by every writer of a committed `.aidd` file.
//
// Apps commit their `.aidd` JSON in prettier's canonical form (useTabs, tabWidth 4, printWidth 100,
// jsonRecursiveSort). A plain `JSON.stringify(_, null, 2)` diverges from that on every line —
// 2-space indent, unsorted keys, always-multiline arrays — so a routine one-field write rewrote the
// whole file and fought the formatter. This printer reproduces prettier instead: objects always
// break, one sorted key per line; arrays stay inline until they would exceed printWidth at their
// indentation. `prettier --write` is left with nothing to change.

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
	return `${printValue(value, 0, 0, style)}\n`;
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

function printValue(value: unknown, depth: number, column: number, style: JsonPrintStyle): string {
	if (Array.isArray(value)) return printArray(value, depth, column, style);
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
	const lines = keys.map((key) => {
		const keyText = JSON.stringify(key);
		const valueColumn = childColumns + keyText.length + 2;
		return `${childIndent}${keyText}: ${printValue(object[key], depth + 1, valueColumn, style)}`;
	});
	return `{\n${lines.join(',\n')}\n${style.indent.repeat(depth)}}`;
}

function printArray(
	array: unknown[],
	depth: number,
	column: number,
	style: JsonPrintStyle,
): string {
	if (array.length === 0) return '[]';
	const elements = array.map((item) => printValue(item, depth + 1, 0, style));
	const inline = `[${elements.join(', ')}]`;
	if (!inline.includes('\n') && column + inline.length <= style.printWidth) return inline;
	const childIndent = style.indent.repeat(depth + 1);
	const lines = array.map(
		(item) =>
			`${childIndent}${printValue(item, depth + 1, (depth + 1) * style.indentWidth, style)}`,
	);
	return `[\n${lines.join(',\n')}\n${style.indent.repeat(depth)}]`;
}

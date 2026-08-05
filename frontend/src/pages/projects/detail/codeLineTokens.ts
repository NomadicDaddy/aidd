/**
 * The minimum typographic structure the token set already supports, without pulling in a
 * highlighter: comment lines recede, string literals lift. The viewer is the one surface in the app
 * where the operator reads long-form content and it had the least structure of any panel — 2,500
 * lines of identical grey monospace with no entry point for the eye.
 */

export interface CodeSegment {
	kind: 'code' | 'string';
	text: string;
}

// Deliberately language-agnostic and prefix-only: no parser, no per-language table, and nothing that
// can mis-tag the middle of a line. '#' needs a following space so a CSS id selector stays code.
const commentPrefixes = ['//', '/*', '*/', '*', '--', '<!--', '#!'];

export function isCommentLine(line: string): boolean {
	const trimmed = line.trim();
	if (trimmed.length === 0) return false;
	if (trimmed === '#' || trimmed.startsWith('# ')) return true;
	return commentPrefixes.some((prefix) => trimmed.startsWith(prefix));
}

const stringPattern = /(['"`])(?:\\.|(?!\1).)*?\1/gu;

/** Splits a code line into plain and quoted runs. Unterminated quotes stay plain. */
export function splitStrings(line: string): CodeSegment[] {
	const segments: CodeSegment[] = [];
	let last = 0;
	for (const match of line.matchAll(stringPattern)) {
		const at = match.index;
		if (at > last) segments.push({ kind: 'code', text: line.slice(last, at) });
		segments.push({ kind: 'string', text: match[0] });
		last = at + match[0].length;
	}
	if (last < line.length) segments.push({ kind: 'code', text: line.slice(last) });
	return segments;
}

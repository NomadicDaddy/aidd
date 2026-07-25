import type { ReactNode } from 'react';

// Cap how much transcript is laid out in the <pre> at once. The full loaded transcript remains
// searchable and copyable; only the visible raw stream is windowed for rendering.
const MAX_RENDERED_CHARS = 512 * 1024;

export function windowTail(text: string): string {
	if (text.length <= MAX_RENDERED_CHARS) return text;
	const tail = text.slice(text.length - MAX_RENDERED_CHARS);
	const firstNewline = tail.indexOf('\n');
	return firstNewline === -1 ? tail : tail.slice(firstNewline + 1);
}

export function highlightLine(line: string, query: string): ReactNode {
	const lower = line.toLowerCase();
	const needle = query.toLowerCase();
	const nodes: ReactNode[] = [];
	let cursor = 0;
	let match = lower.indexOf(needle, cursor);
	let key = 0;
	while (match !== -1) {
		if (match > cursor) nodes.push(line.slice(cursor, match));
		nodes.push(
			<mark className="rounded-sm bg-amber-300 text-neutral-950" key={key}>
				{line.slice(match, match + query.length)}
			</mark>,
		);
		key += 1;
		cursor = match + query.length;
		match = lower.indexOf(needle, cursor);
	}
	if (cursor < line.length) nodes.push(line.slice(cursor));
	return nodes;
}

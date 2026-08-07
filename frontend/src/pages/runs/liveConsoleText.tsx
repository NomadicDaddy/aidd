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
			// The console scroller is a fixed dark surface in both themes, so this highlight fixes
			// its own foreground rather than inheriting `text-foreground`, which would render
			// near-white on amber-300 under the dark theme (~1.5:1).
			//
			// The weight and the rule are the part that does not depend on seeing amber. A reader
			// who cannot separate that swatch from the surrounding transcript was left with a
			// paragraph of monospace and no marks in it; bold plus an underline says the same thing
			// in the two channels a fixed-width face still has. `decoration-current` keeps the rule
			// on the mark's own dark foreground rather than the scroller's near-white one.
			<mark
				className="rounded-sm bg-amber-300 font-bold text-neutral-900 underline decoration-current decoration-2 underline-offset-2"
				key={key}>
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

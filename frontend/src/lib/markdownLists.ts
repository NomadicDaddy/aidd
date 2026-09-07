export type MarkdownListBlock =
	| { items: string[]; ordered: false; type: 'list' }
	| { items: string[]; ordered: true; start: number; type: 'list' };

const UNORDERED = /^[-*]\s+(.*)$/;
const ORDERED = /^(\d+)\.\s+(.*)$/;

function itemMatch(line: string, ordered: boolean): null | RegExpExecArray {
	return ordered ? ORDERED.exec(line) : UNORDERED.exec(line);
}

export function parseMarkdownList(
	lines: string[],
	index: number,
): { block: MarkdownListBlock; nextIndex: number } | null {
	const firstLine = (lines[index] ?? '').trim();
	const firstOrdered = ORDERED.exec(firstLine);
	const ordered = firstOrdered !== null;
	if (!ordered && !UNORDERED.test(firstLine)) return null;

	const items: string[] = [];
	let cursor = index;
	while (cursor < lines.length) {
		const raw = lines[cursor] ?? '';
		const candidate = raw.trim();
		const match = itemMatch(candidate, ordered);
		if (match !== null) {
			items.push(match[ordered ? 2 : 1] ?? '');
			cursor++;
			continue;
		}
		if (items.length > 0 && /^\s/.test(raw) && candidate.length > 0) {
			items[items.length - 1] = `${items[items.length - 1]} ${candidate}`;
			cursor++;
			continue;
		}
		if (items.length > 0 && candidate.length === 0) {
			const nextCandidate = (lines[cursor + 1] ?? '').trim();
			if (itemMatch(nextCandidate, ordered) !== null) {
				cursor++;
				continue;
			}
			const continuation: string[] = [];
			let continuationCursor = cursor + 1;
			while (continuationCursor < lines.length) {
				const continuationRaw = lines[continuationCursor] ?? '';
				if (!/^\s/.test(continuationRaw) || continuationRaw.trim().length === 0) break;
				continuation.push(continuationRaw.trim());
				continuationCursor++;
			}
			if (continuation.length > 0) {
				items[items.length - 1] = `${items[items.length - 1]} ${continuation.join(' ')}`;
				cursor = continuationCursor;
				continue;
			}
		}
		break;
	}

	const block: MarkdownListBlock = ordered
		? {
				items,
				ordered: true,
				start: Number.parseInt(firstOrdered?.[1] ?? '1', 10),
				type: 'list',
			}
		: { items, ordered: false, type: 'list' };
	return { block, nextIndex: cursor };
}

// Pure block-level markdown parsing for the diary renderer. Kept separate from the React
// component so it can be unit-tested and so the component file only exports components
// (react-refresh). Entries follow the diary-entry skill's constrained template, so a bounded
// subset (headings, lists, blockquotes, hr, paragraphs) is sufficient.

export type MarkdownBlock =
	| { code: string; type: 'code' }
	| { items: string[]; ordered: boolean; type: 'list' }
	| { level: 1 | 2 | 3; text: string; type: 'heading' }
	| { lines: string[]; type: 'quote' }
	| { text: string; type: 'paragraph' }
	| { type: 'hr' };

const HEADING = /^(#{1,3})\s+(.*)$/;
const UNORDERED = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const HR = /^(?:---+|\*\*\*+|___+)$/;
// A skill definition is mostly fenced examples. Without this the fence lines became paragraphs
// reading "```bash" and their contents were reflowed as prose, which is what a command example
// cannot survive.
const FENCE = /^(?:```|~~~)/;

// Strip a leading frontmatter fence so a raw entry body (which still carries its `---` block)
// renders cleanly even when passed verbatim.
function stripFrontmatter(markdown: string): string {
	if (!markdown.startsWith('---')) return markdown;
	const match = markdown.match(/^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/);
	return match ? markdown.slice(match[0].length) : markdown;
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
	const lines = stripFrontmatter(markdown).split(/\r?\n/);
	const blocks: MarkdownBlock[] = [];
	let paragraph: string[] = [];

	const flushParagraph = (): void => {
		if (paragraph.length === 0) return;
		blocks.push({ text: paragraph.join(' '), type: 'paragraph' });
		paragraph = [];
	};

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index] ?? '';
		const trimmed = line.trim();

		if (trimmed.length === 0) {
			flushParagraph();
			continue;
		}
		// Checked before HR, because `---` inside a fence is content, not a rule.
		if (FENCE.test(trimmed)) {
			flushParagraph();
			const codeLines: string[] = [];
			let cursor = index + 1;
			while (cursor < lines.length && !FENCE.test((lines[cursor] ?? '').trim())) {
				codeLines.push(lines[cursor] ?? '');
				cursor++;
			}
			blocks.push({ code: codeLines.join('\n'), type: 'code' });
			// An unterminated fence consumes the rest of the document, which is what a reader
			// would see in any other renderer too.
			index = cursor;
			continue;
		}
		if (HR.test(trimmed)) {
			flushParagraph();
			blocks.push({ type: 'hr' });
			continue;
		}
		const heading = HEADING.exec(trimmed);
		if (heading?.[1] && heading[2] !== undefined) {
			flushParagraph();
			blocks.push({
				level: heading[1].length as 1 | 2 | 3,
				text: heading[2].trim(),
				type: 'heading',
			});
			continue;
		}
		const quote = QUOTE.exec(trimmed);
		if (quote) {
			flushParagraph();
			const quoteLines: string[] = [];
			let cursor = index;
			while (cursor < lines.length) {
				const inner = QUOTE.exec((lines[cursor] ?? '').trim());
				if (!inner) break;
				quoteLines.push(inner[1] ?? '');
				cursor++;
			}
			blocks.push({ lines: quoteLines, type: 'quote' });
			index = cursor - 1;
			continue;
		}
		const unordered = UNORDERED.exec(trimmed);
		const ordered = ORDERED.exec(trimmed);
		if (unordered || ordered) {
			flushParagraph();
			const isOrdered = Boolean(ordered);
			const items: string[] = [];
			let cursor = index;
			while (cursor < lines.length) {
				const raw = lines[cursor] ?? '';
				const candidate = raw.trim();
				const match = isOrdered ? ORDERED.exec(candidate) : UNORDERED.exec(candidate);
				if (match) {
					items.push(match[1] ?? '');
					cursor++;
					continue;
				}
				// A wrapped list item continues on an indented, non-empty line; fold it
				// into the current item so hanging-indented prose stays in the list
				// instead of breaking it and restarting any numbering.
				if (items.length > 0 && /^\s/.test(raw) && candidate.length > 0) {
					items[items.length - 1] = `${items[items.length - 1]} ${candidate}`;
					cursor++;
					continue;
				}
				break;
			}
			blocks.push({ items, ordered: isOrdered, type: 'list' });
			index = cursor - 1;
			continue;
		}
		paragraph.push(trimmed);
	}
	flushParagraph();
	return blocks;
}

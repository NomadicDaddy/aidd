// Pure block-level markdown parsing for the diary renderer. Kept separate from the React
// component so it can be unit-tested and so the component file only exports components
// (react-refresh). Entries follow the diary-entry skill's constrained template, so a bounded
// subset (headings, lists, blockquotes, hr, paragraphs) is sufficient.

export type MarkdownBlock =
	| { code: string; type: 'code' }
	| { entries: MarkdownDefinition[]; type: 'definitions' }
	| { items: string[]; ordered: boolean; type: 'list' }
	| { level: 1 | 2 | 3; text: string; type: 'heading' }
	| { lines: string[]; type: 'quote' }
	| { text: string; type: 'paragraph' }
	| { type: 'hr' };

export interface MarkdownDefinition {
	definition: string;
	term: string;
}

const HEADING = /^(#{1,3})\s+(.*)$/;
const UNORDERED = /^[-*]\s+(.*)$/;
const ORDERED = /^\d+\.\s+(.*)$/;
const QUOTE = /^>\s?(.*)$/;
const DEFINITION = /^:\s+(.+)$/;
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

const COMMENT = /<!--[\s\S]*?-->/g;

/**
 * Drop HTML comments, which are markup rather than content and print in no other renderer.
 *
 * This became load-bearing when the in-app documentation started linking to app routes:
 * `scripts/check-docs.ts` resolves every internal markdown link against the filesystem, and
 * `[Settings](/settings)` is a router destination with no file behind it, so those lines carry the
 * gate's sanctioned `check-docs-allow:` waiver marker as an HTML comment. Without this the markers
 * rendered on the page as literal `<!-- … -->` text.
 *
 * Fenced blocks are exempt: `<!--` inside a code example is the example, not a comment. The fence
 * state is tracked here rather than left to the main loop because that loop consumes fenced lines
 * through an inner cursor, so a comment pre-pass has to know about fences on its own.
 *
 * A line that held nothing but a comment is removed rather than blanked, since a blank line would
 * split the paragraph the comment sat inside.
 */
function stripComments(lines: string[]): string[] {
	const out: string[] = [];
	let inFence = false;
	let inComment = false;

	for (const raw of lines) {
		if (!inComment && FENCE.test(raw.trim())) {
			inFence = !inFence;
			out.push(raw);
			continue;
		}
		if (inFence) {
			out.push(raw);
			continue;
		}

		let line = raw;
		if (inComment) {
			const end = line.indexOf('-->');
			if (end === -1) continue;
			line = line.slice(end + 3);
			inComment = false;
		}
		line = line.replace(COMMENT, '');
		const open = line.indexOf('<!--');
		if (open !== -1) {
			line = line.slice(0, open);
			inComment = true;
		}
		if (raw.trim().length > 0 && line.trim().length === 0) continue;
		out.push(line);
	}

	return out;
}

export function parseMarkdownBlocks(markdown: string): MarkdownBlock[] {
	const lines = stripComments(stripFrontmatter(markdown).split(/\r?\n/));
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
		const firstDefinition = DEFINITION.exec((lines[index + 1] ?? '').trim());
		if (firstDefinition) {
			flushParagraph();
			const entries: MarkdownDefinition[] = [];
			let cursor = index;
			while (cursor + 1 < lines.length) {
				const term = (lines[cursor] ?? '').trim();
				const marker = DEFINITION.exec((lines[cursor + 1] ?? '').trim());
				if (term.length === 0 || !marker) break;
				const definition = [marker[1] ?? ''];
				cursor += 2;
				while (cursor < lines.length) {
					const continuation = lines[cursor] ?? '';
					const nextMarker = DEFINITION.exec((lines[cursor + 1] ?? '').trim());
					if (continuation.trim().length === 0 || nextMarker) break;
					definition.push(continuation.trim());
					cursor++;
				}
				entries.push({ definition: definition.join(' '), term });
			}
			blocks.push({ entries, type: 'definitions' });
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

/**
 * The inline pass's grammar: `**bold**`, `*italic*`, `` `code` `` and `[text](href)`.
 *
 * It lives here rather than in the renderer because two things need it and they must agree: the
 * renderer turns the markers into elements, and `plainInlineText` below throws them away. A second
 * copy of this expression is a heading whose anchor id or accessible name spells its own asterisks.
 */
export const INLINE_MARKDOWN = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;

/** The same text with the markers gone — for an `aria-label`, a `title`, or a table-of-contents row. */
export function plainInlineText(text: string): string {
	return text.replace(
		INLINE_MARKDOWN,
		(_match, _whole, bold?: string, italic?: string, code?: string, linkText?: string) =>
			bold ?? italic ?? code ?? linkText ?? '',
	);
}

/** A heading id that survives an edit elsewhere in the document: derived from the text, not the index. */
function slugify(text: string): string {
	return (
		plainInlineText(text)
			.toLowerCase()
			.replace(/[^a-z0-9]+/g, '-')
			.replace(/^-+|-+$/g, '') || 'section'
	);
}

/**
 * Ids for one document's headings, in document order.
 *
 * Stateful on purpose: two `## Notes` in one file are `notes` and `notes-2`, which only works if
 * every consumer allocates from the same counter in the same order. The renderer and the
 * on-this-page list both call this, so a repeated heading cannot land a link on the wrong section.
 */
export function headingIdAllocator(idPrefix?: string): (text: string) => string {
	const seen = new Map<string, number>();
	return (text) => {
		const base = `${idPrefix === undefined ? '' : `${idPrefix}-`}${slugify(text)}`;
		const count = seen.get(base) ?? 0;
		seen.set(base, count + 1);
		return count === 0 ? base : `${base}-${count + 1}`;
	};
}

export interface MarkdownHeading {
	/** Steps below the document's own shallowest heading, so a `##`-only document is all depth 0. */
	depth: number;
	id: string;
	text: string;
}

/**
 * The document's outline: the same headings, ids and depths `MarkdownContent` will render, computed
 * without rendering it. This is what a table of contents is built from.
 */
export function markdownHeadings(
	markdown: string,
	{ idPrefix, skipLeadingTitle = false }: { idPrefix?: string; skipLeadingTitle?: boolean } = {},
): MarkdownHeading[] {
	const parsed = parseMarkdownBlocks(markdown);
	const blocks =
		skipLeadingTitle && parsed[0]?.type === 'heading' && parsed[0].level === 1
			? parsed.slice(1)
			: parsed;
	const levels = blocks.flatMap((block) => (block.type === 'heading' ? [block.level] : []));
	const shallowest = Math.min(...levels, 3);
	const allocate = headingIdAllocator(idPrefix);
	return blocks.flatMap((block) =>
		block.type === 'heading'
			? [
					{
						depth: block.level - shallowest,
						id: allocate(block.text),
						text: plainInlineText(block.text),
					},
				]
			: [],
	);
}

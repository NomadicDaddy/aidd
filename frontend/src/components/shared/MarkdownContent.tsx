import { Fragment, type ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { parseMarkdownBlocks } from '../../lib/markdownBlocks.ts';

// A small, dependency-free markdown renderer for diary entries. Block parsing lives in
// lib/markdownBlocks.ts; this file owns the inline pass and JSX. No dangerouslySetInnerHTML.

// Inline pass: **bold**, *italic*, and `code`. Markers are matched left-to-right; unmatched
// markers render as literal text.
const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`)/g;

function renderInline(text: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	let key = 0;
	let match: null | RegExpExecArray;
	INLINE.lastIndex = 0;
	while ((match = INLINE.exec(text)) !== null) {
		if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
		if (match[2] !== undefined) {
			nodes.push(<strong key={`b${key++}`}>{match[2]}</strong>);
		} else if (match[3] !== undefined) {
			nodes.push(<em key={`i${key++}`}>{match[3]}</em>);
		} else if (match[4] !== undefined) {
			nodes.push(
				<code
					className="rounded-sm bg-muted px-0.5 font-mono text-[0.9em] text-foreground"
					key={`c${key++}`}>
					{match[4]}
				</code>,
			);
		}
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
	return nodes;
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
	1: 'mt-4 mb-2 text-lg font-semibold text-foreground',
	2: 'mt-6 mb-2 text-base font-semibold text-foreground',
	3: 'mt-4 mb-1 text-sm font-semibold text-foreground',
};

type HeadingBaseLevel = 2 | 3 | 4;

function renderHeading(
	level: 1 | 2 | 3,
	text: string,
	key: string,
	baseLevel: HeadingBaseLevel,
): ReactNode {
	const content = renderInline(text);
	const renderedLevel = baseLevel + level - 1;
	if (renderedLevel === 2) {
		return (
			<h2 className={HEADING_CLASS[level]} key={key}>
				{content}
			</h2>
		);
	}
	if (renderedLevel === 3) {
		return (
			<h3 className={HEADING_CLASS[level]} key={key}>
				{content}
			</h3>
		);
	}
	if (renderedLevel === 4) {
		return (
			<h4 className={HEADING_CLASS[level]} key={key}>
				{content}
			</h4>
		);
	}
	if (renderedLevel === 5) {
		return (
			<h5 className={HEADING_CLASS[level]} key={key}>
				{content}
			</h5>
		);
	}
	return (
		<h6 className={HEADING_CLASS[level]} key={key}>
			{content}
		</h6>
	);
}

/** `**Term**: definition` — the shape a glossary entry takes in a bulleted list. */
const DEFINITION_ITEM = /^\*\*([^*]+)\*\*:\s*(.+)$/;

/**
 * A bulleted list whose every item is `**term**: definition` is a definition list wearing bullets:
 * the terms and their prose share one ragged run, so the term column cannot be scanned. Two items
 * is the floor — a single one is a sentence that happens to start bold.
 */
function readDefinitionItems(items: string[]): { definition: string; term: string }[] | null {
	if (items.length < 2) return null;
	const parsed = items.map((item) => DEFINITION_ITEM.exec(item.trim()));
	if (parsed.some((match) => match === null)) return null;
	return parsed.map((match) => ({
		definition: match?.[2] ?? '',
		term: match?.[1] ?? '',
	}));
}

export function MarkdownContent({
	baseLevel = 3,
	className,
	markdown,
	skipLeadingTitle = false,
}: {
	baseLevel?: HeadingBaseLevel;
	className?: string;
	markdown: string;
	/** Drop a leading `#` heading, for consumers that already render the document's name. */
	skipLeadingTitle?: boolean;
}) {
	const parsed = parseMarkdownBlocks(markdown);
	const blocks =
		skipLeadingTitle && parsed[0]?.type === 'heading' && parsed[0].level === 1
			? parsed.slice(1)
			: parsed;
	return (
		<div
			className={cn(
				'max-w-[68ch] space-y-2 text-sm leading-relaxed text-foreground',
				className,
			)}>
			{blocks.map((block, index) => {
				const key = `block-${index}`;
				if (block.type === 'heading') {
					return renderHeading(block.level, block.text, key, baseLevel);
				}
				if (block.type === 'hr') {
					return <hr className="border-border" key={key} />;
				}
				if (block.type === 'quote') {
					return (
						<blockquote
							className="border-l-2 border-border pl-3 text-muted-foreground italic"
							key={key}>
							{block.lines.map((line, lineIndex) => (
								<p key={`${key}-${lineIndex}`}>{renderInline(line)}</p>
							))}
						</blockquote>
					);
				}
				if (block.type === 'list') {
					const definitions = block.ordered ? null : readDefinitionItems(block.items);
					if (definitions) {
						return (
							<dl
								className="grid gap-x-4 gap-y-1.5 sm:grid-cols-[11rem_minmax(0,1fr)]"
								key={key}>
								{definitions.map(({ definition, term }, itemIndex) => (
									<Fragment key={`${key}-${itemIndex}`}>
										<dt className="text-sm font-medium text-foreground">
											{renderInline(term)}
										</dt>
										<dd className="text-sm text-muted-foreground">
											{renderInline(definition)}
										</dd>
									</Fragment>
								))}
							</dl>
						);
					}
					const items = block.items.map((item, itemIndex) => (
						<li key={`${key}-${itemIndex}`}>{renderInline(item)}</li>
					));
					return block.ordered ? (
						<ol className="ml-5 list-decimal space-y-1" key={key}>
							{items}
						</ol>
					) : (
						<ul className="ml-5 list-disc space-y-1" key={key}>
							{items}
						</ul>
					);
				}
				return <p key={key}>{renderInline(block.text)}</p>;
			})}
		</div>
	);
}

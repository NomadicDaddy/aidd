import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { parseMarkdownBlocks } from '../../lib/markdownBlocks.ts';

// A small, dependency-free markdown renderer for diary entries, docs and skill definitions. Block
// parsing lives in lib/markdownBlocks.ts; this file owns the inline pass and JSX. The renderer
// never sets a width: the measure belongs to whatever container the prose sits in, or the card
// border stops 375px to the right of the last word. No dangerouslySetInnerHTML.

// Inline pass: **bold**, *italic*, `code`, and [text](href). Markers are matched left-to-right;
// unmatched markers render as literal text.
const INLINE = /(\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\(([^)\s]+)\))/g;

// Anything that is not plainly an http(s) or in-app destination renders as text. A markdown link
// target arriving from an imported SKILL.md is untrusted input, and `javascript:` in an href is
// the one thing a renderer with no dangerouslySetInnerHTML could still hand an attacker.
function safeHref(href: string): null | string {
	if (href.startsWith('/') || href.startsWith('#')) return href;
	return /^https?:\/\//i.test(href) ? href : null;
}

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
		} else if (match[5] !== undefined && match[6] !== undefined) {
			const href = safeHref(match[6]);
			nodes.push(
				href === null ? (
					match[5]
				) : (
					<a
						className="text-accent underline underline-offset-2 hover:text-accent/80"
						href={href}
						key={`l${key++}`}
						rel="noreferrer"
						target={href.startsWith('http') ? '_blank' : undefined}>
						{match[5]}
					</a>
				),
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
		// No measure here. The cap used to sit on this element, so a doc card drew its border at the
		// container's full width and left a second gutter of empty space to the right of every
		// line. The container owns the measure now — `proseMeasureClass`, applied by the surface.
		<div className={cn('min-w-0 space-y-2 text-sm leading-relaxed text-foreground', className)}>
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
				if (block.type === 'code') {
					return (
						<pre
							className="overflow-x-auto rounded-md bg-muted p-3 font-mono text-xs text-foreground"
							key={key}>
							<code>{block.code}</code>
						</pre>
					);
				}
				if (block.type === 'list') {
					// A list renders as a list. The previous treatment read all the items and
					// swapped the block to a two-column `<dl>` only when every one of them matched
					// `**term**: definition`, so one ordinary bullet among twelve definitions
					// silently relaid the other eleven, and an author adding a bullet to a glossary
					// changed the shape of a section they had not touched. The bold a definition
					// starts with is already bold — the inline pass renders it, on every surface,
					// from what was written rather than from what the surrounding items look like.
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

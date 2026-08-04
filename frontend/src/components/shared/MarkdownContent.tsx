import { type ReactNode } from 'react';

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
					className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
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
	2: 'mt-4 mb-1.5 text-sm font-semibold tracking-wide text-foreground uppercase ',
	3: 'mt-3 mb-1 text-sm font-semibold text-foreground ',
};

export function MarkdownContent({ className, markdown }: { className?: string; markdown: string }) {
	const blocks = parseMarkdownBlocks(markdown);
	return (
		<div className={cn('space-y-2 text-sm text-foreground', className)}>
			{blocks.map((block, index) => {
				const key = `block-${index}`;
				if (block.type === 'heading') {
					if (block.level === 1) {
						return (
							<h3 className={HEADING_CLASS[1]} key={key}>
								{renderInline(block.text)}
							</h3>
						);
					}
					if (block.level === 2) {
						return (
							<h4 className={HEADING_CLASS[2]} key={key}>
								{renderInline(block.text)}
							</h4>
						);
					}
					return (
						<h5 className={HEADING_CLASS[3]} key={key}>
							{renderInline(block.text)}
						</h5>
					);
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

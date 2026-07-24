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
					className="rounded bg-neutral-100 px-1 py-0.5 font-mono text-[0.85em] dark:bg-neutral-800"
					key={`c${key++}`}>
					{match[4]}
				</code>
			);
		}
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
	return nodes;
}

const HEADING_CLASS: Record<1 | 2 | 3, string> = {
	1: 'mt-4 mb-2 text-lg font-semibold text-foreground',
	2: 'mt-4 mb-1.5 text-sm font-semibold tracking-wide text-neutral-700 uppercase dark:text-neutral-300',
	3: 'mt-3 mb-1 text-sm font-semibold text-neutral-800 dark:text-neutral-200',
};

export function MarkdownContent({ className, markdown }: { className?: string; markdown: string }) {
	const blocks = parseMarkdownBlocks(markdown);
	return (
		<div className={cn('space-y-2 text-sm text-neutral-700 dark:text-neutral-300', className)}>
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
					return <hr className="border-neutral-200 dark:border-neutral-800" key={key} />;
				}
				if (block.type === 'quote') {
					return (
						<blockquote
							className="border-l-2 border-neutral-300 pl-3 text-neutral-600 italic dark:border-neutral-700 dark:text-neutral-400"
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

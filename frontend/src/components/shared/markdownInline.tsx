import type { ReactNode } from 'react';

import { Link } from 'react-router';

import { INLINE_MARKDOWN } from '../../lib/markdownBlocks.ts';
import { ShortcutChord } from './KeyboardShortcut.tsx';

// One spelling keeps router and external links visually aligned.
const LINK_CLASS = 'text-accent underline underline-offset-2 hover:text-accent/80';

// Anything that is not plainly an http(s) or in-app destination renders as text. A markdown link
// target arriving from imported content is untrusted input, and `javascript:` in an href is the one
// thing a renderer with no dangerouslySetInnerHTML could still hand an attacker.
function safeHref(href: string): null | string {
	if (href.startsWith('/') || href.startsWith('#')) return href;
	return /^https?:\/\//i.test(href) ? href : null;
}

/** Render the supported inline markdown grammar without introducing a block wrapper. */
export function renderMarkdownInline(text: string): ReactNode[] {
	const nodes: ReactNode[] = [];
	let lastIndex = 0;
	let key = 0;
	let match: null | RegExpExecArray;
	INLINE_MARKDOWN.lastIndex = 0;
	while ((match = INLINE_MARKDOWN.exec(text)) !== null) {
		if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
		if (match[2] !== undefined) {
			nodes.push(<strong key={`b${key++}`}>{match[2]}</strong>);
		} else if (match[3] !== undefined) {
			nodes.push(<em key={`i${key++}`}>{match[3]}</em>);
		} else if (match[4] !== undefined) {
			nodes.push(
				<code
					className="rounded-sm border border-border bg-muted box-decoration-clone px-0.5 py-px font-mono text-[0.9em] [overflow-wrap:anywhere] text-foreground"
					key={`c${key++}`}>
					{match[4]}
				</code>,
			);
		} else if (match[5] !== undefined && match[6] !== undefined) {
			const href = safeHref(match[6]);
			const isInternal = href !== null && href.startsWith('/');
			nodes.push(
				href === null ? (
					match[5]
				) : isInternal ? (
					<Link className={LINK_CLASS} key={`l${key++}`} to={href}>
						{match[5]}
					</Link>
				) : (
					<a
						className={LINK_CLASS}
						href={href}
						key={`l${key++}`}
						rel="noreferrer"
						target={href.startsWith('http') ? '_blank' : undefined}>
						{match[5]}
					</a>
				),
			);
		} else if (match[7] !== undefined) {
			const sequential = match[7].includes(' ');
			nodes.push(
				<ShortcutChord
					key={`k${key++}`}
					keys={match[7].split(sequential ? /\s+/ : '+')}
					sequential={sequential}
				/>,
			);
		}
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
	return nodes;
}

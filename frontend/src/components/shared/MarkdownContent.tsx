import type { ReactNode } from 'react';

import { Link } from 'react-router';

import { cn } from '../../lib/cn.ts';
import {
	headingIdAllocator,
	INLINE_MARKDOWN,
	parseMarkdownBlocks,
	plainInlineText,
} from '../../lib/markdownBlocks.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';

// A small, dependency-free markdown renderer for diary entries, docs and skill definitions. Block
// parsing lives in lib/markdownBlocks.ts; this file owns the inline pass and JSX. The renderer
// never sets a width: the measure belongs to whatever container the prose sits in, or the card
// border stops 375px to the right of the last word. No dangerouslySetInnerHTML.

// Inline pass: **bold**, *italic*, `code`, and [text](href). Markers are matched left-to-right;
// unmatched markers render as literal text. The grammar itself is in lib/markdownBlocks.ts, shared
// with the plain-text form of it that ids and accessible names are built from.
const INLINE = INLINE_MARKDOWN;

// Anything that is not plainly an http(s) or in-app destination renders as text. A markdown link
// target arriving from an imported SKILL.md is untrusted input, and `javascript:` in an href is
// the one thing a renderer with no dangerouslySetInnerHTML could still hand an attacker.
function safeHref(href: string): null | string {
	if (href.startsWith('/') || href.startsWith('#')) return href;
	return /^https?:\/\//i.test(href) ? href : null;
}

// One spelling for both link elements below, so the router link and the external anchor cannot
// drift into looking like two different kinds of thing.
const LINK_CLASS = 'text-accent underline underline-offset-2 hover:text-accent/80';

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
					// The chip has an edge because the fill alone never had one: `bg-muted`
					// (#1e2330) on the doc card's `--card` (#161a22) is 1.14:1, and with `px-0.5`
					// and no vertical padding there was no shape either. On /docs/glossary the run
					// `native, ollama, lmstudio, claude-code, cline` read as a face change with the
					// commas outside the chips. The fill stays: on a sunken panel the code sits on
					// `bg-muted` itself, and there the border is the only thing left.
					//
					// The size stays relative. `text-xs` is the declared step and `text-[0.9em]` is
					// a one-off between two of them, but 17 headings across the skill corpus hold
					// inline code, and a fixed 12px inside a `text-xl` heading is two thirds the
					// size of the words beside it — a worse error than an undeclared step.
					className="rounded-sm border border-border bg-muted px-1 py-px font-mono text-[0.9em] text-foreground"
					key={`c${key++}`}>
					{match[4]}
				</code>,
			);
		} else if (match[5] !== undefined && match[6] !== undefined) {
			const href = safeHref(match[6]);
			// An in-app destination goes through the router. `safeHref` already admits `/…` as a
			// link target, but rendering it as a bare `<a href>` would tear the SPA down and rebuild
			// it to move one route sideways — so a docs cross-reference would have cost a full
			// reload while every other link to the same page costs nothing. `#…` stays an anchor:
			// it is a jump within the document that is already open.
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
		}
		lastIndex = match.index + match[0].length;
	}
	if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
	return nodes;
}

/**
 * Document headings, as steps of one scale — read by `headingStep` below, which enters the scale at
 * the surface's `baseLevel` and advances by depth below the document's own shallowest heading. Not
 * by `#` count, and not by depth alone.
 *
 * None of these may be `text-base font-semibold text-foreground` or `text-sm font-semibold
 * text-foreground`: those two are `ui/card`'s section and subsection steps, and a markdown `##`
 * rendering identically to the header of the card it sits inside is the collision this scale
 * exists to break. The card contract is correct and is not the thing to change.
 *
 * Steps two and three are different kinds of mark rather than further sizes, because 14px is where
 * the body text already lives: on Docs the whole documentation set separated headings from prose by
 * 2px and one weight. Case and colour separate at a glance where two pixels do not.
 */
const HEADING_CLASS = [
	'mt-6 mb-2 text-xl font-semibold tracking-tight text-foreground',
	'mt-5 mb-1.5 text-lg font-semibold tracking-tight text-foreground',
	'mt-4 mb-1 text-sm font-semibold tracking-wide text-muted-foreground uppercase',
	'mt-3 mb-1 text-xs font-semibold tracking-wide text-muted-foreground',
] as const;

/**
 * Where in the scale a heading lands: how deep the *surface* embeds the document, plus how deep the
 * heading sits inside it.
 *
 * Depth alone was the whole index, so a document embedded two levels down entered the scale at its
 * top step regardless. Measured on /skills at 2250x1309, the outline ran h1 24px, h2 16px, h3 16px,
 * h4 20px: the Definition card's own header rendered at 16px and the `##` headings of the SKILL.md
 * inside it rendered at 20px, so the document's sections shouted louder than the card containing
 * them. Distinguishable from the card header, which is what the scale was built for — but louder
 * than it, which inverts the nesting a reader is trying to read.
 *
 * `baseLevel` already carries exactly the missing fact. Docs embeds at 2 and is unchanged: its
 * headings still open at `text-xl`. Skills and the Diary embed at 4 and now open at the uppercase
 * 14px mark, under their card headers rather than over them, and their `###` sections take the
 * fourth step so a document with two heading levels still reads as having two — 39 of the 76 skill
 * definitions in this repo use `###`, so collapsing them into one mark would have traded an
 * inverted outline for a flattened one.
 */
function headingStep(baseLevel: HeadingBaseLevel, depth: number): string {
	return HEADING_CLASS[Math.min(baseLevel - 2 + depth, HEADING_CLASS.length - 1)] as string;
}

type HeadingBaseLevel = 2 | 3 | 4;

function renderHeading(
	{
		baseLevel,
		depth,
		level,
		text,
	}: { baseLevel: HeadingBaseLevel; depth: number; level: number; text: string },
	key: string,
	id: string,
): ReactNode {
	// Clamped, not wrapped: a `####` under an `h5` has nowhere deeper to go, and `h6` repeated is
	// still a truthful outline where `h7` is not an element.
	const Heading = `h${Math.min(level, 6)}` as 'h2' | 'h3' | 'h4' | 'h5' | 'h6';
	// The heading names itself, because the anchor below is one of its children and a child's label
	// is part of its parent's accessible name: "What aidd does" was announced as "What aidd does,
	// Link to section What aidd does". The label is the heading's own text and nothing else, so the
	// anchor can stay inside the heading — which is where it has to be to sit beside the words.
	const name = plainInlineText(text);
	return (
		<Heading
			aria-label={name}
			className={cn('group', headingStep(baseLevel, depth))}
			id={id}
			key={key}>
			{renderInline(text)}{' '}
			{/* The anchor is the section's address, which is only worth having if it is reachable:
			    revealed on hover for a pointer and on focus for a keyboard, never on neither. */}
			<a
				aria-label={`Link to section ${name}`}
				className={cn(
					touchTargetTextClass,
					'text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent focus-visible:opacity-100',
				)}
				href={`#${id}`}>
				#
			</a>
		</Heading>
	);
}

export function MarkdownContent({
	baseLevel = 3,
	className,
	idPrefix,
	markdown,
	skipLeadingTitle = false,
}: {
	/** The element level the document's *shallowest* remaining heading renders as. */
	baseLevel?: HeadingBaseLevel;
	className?: string;
	/** Namespace for heading ids, for surfaces that render several documents on one page. */
	idPrefix?: string;
	markdown: string;
	/** Drop a leading `#` heading, for consumers that already render the document's name. */
	skipLeadingTitle?: boolean;
}) {
	const parsed = parseMarkdownBlocks(markdown);
	const blocks =
		skipLeadingTitle && parsed[0]?.type === 'heading' && parsed[0].level === 1
			? parsed.slice(1)
			: parsed;
	// `baseLevel + level - 1` read the `#` count as the depth, which is only the same thing when
	// the document still starts at `#`. Docs passes `skipLeadingTitle` — its `#` is already the
	// page `h1` — so every remaining heading is at least `##`, every one rendered one level too
	// deep, and `h2` was never emitted anywhere in the documentation set. A skipped level is not a
	// cosmetic complaint: it is what a screen reader's outline navigation walks.
	const shallowest = Math.min(
		...blocks.flatMap((block) => (block.type === 'heading' ? [block.level] : [])),
		3,
	);
	// Allocated from the shared counter, in document order, so `markdownHeadings` — which walks the
	// same blocks to build the on-this-page list — hands out exactly these ids.
	const headingId = headingIdAllocator(idPrefix);
	return (
		// No measure here. The cap used to sit on this element, so a doc card drew its border at the
		// container's full width and left a second gutter of empty space to the right of every
		// line. The container owns the measure now — `proseMeasureClass`, applied by the surface.
		<div
			className={cn(
				'min-w-0 space-y-2 text-sm leading-relaxed break-words text-foreground',
				className,
			)}>
			{blocks.map((block, index) => {
				const key = `block-${index}`;
				if (block.type === 'heading') {
					const depth = block.level - shallowest;
					return renderHeading(
						{ baseLevel, depth, level: baseLevel + depth, text: block.text },
						key,
						headingId(block.text),
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

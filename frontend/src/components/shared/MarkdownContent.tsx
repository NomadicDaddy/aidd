import type { ReactNode } from 'react';

import { cn } from '../../lib/cn.ts';
import { linkFocusClass } from '../../lib/focusStyles.ts';
import {
	headingIdAllocator,
	parseMarkdownBlocks,
	plainInlineText,
} from '../../lib/markdownBlocks.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { markdownRunningProseMeasureClass } from '../../lib/typography.ts';
import { MarkdownCodeBlock } from './MarkdownCodeBlock.tsx';
import { MarkdownDefinitionList } from './MarkdownDefinitionList.tsx';
import { renderMarkdownInline } from './markdownInline.tsx';
import { MarkdownTable } from './MarkdownTable.tsx';

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
	'mt-4 mb-1 text-sm font-semibold tracking-wide text-foreground uppercase',
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

type MarkdownContentVariant = 'docs' | 'document' | 'embedded' | 'glossary';

/**
 * Which width running prose answers to.
 *
 * `'prose'` projects the reading measure onto paragraphs, list items and blockquotes;
 * `'container'` lets them fill whatever box the caller put them in. There is no default,
 * because the wrong one of these is invisible in source and obvious on screen, in both
 * directions: the measure applied to a row capped every interview prompt at 427px inside a
 * 1928px row, and the row that wanted its own width cancelled the measure with four
 * `max-w-none` overrides instead. A container is the only thing that knows which it is, so it
 * says so.
 */
type MarkdownMeasure = 'container' | 'prose';

type MarkdownRenderingPolicy = {
	anchorDefinitions: boolean;
	omitLeadingSummary: boolean;
	omitLeadingTitle: boolean;
};

const MARKDOWN_RENDERING_POLICIES = {
	docs: {
		anchorDefinitions: false,
		omitLeadingSummary: true,
		omitLeadingTitle: true,
	},
	document: {
		anchorDefinitions: false,
		omitLeadingSummary: false,
		omitLeadingTitle: false,
	},
	embedded: {
		anchorDefinitions: false,
		omitLeadingSummary: false,
		omitLeadingTitle: true,
	},
	glossary: {
		anchorDefinitions: true,
		omitLeadingSummary: true,
		omitLeadingTitle: true,
	},
} as const satisfies Record<MarkdownContentVariant, MarkdownRenderingPolicy>;

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
			{renderMarkdownInline(text)}{' '}
			{/* The anchor is the section's address, which is only worth having if it is reachable:
			    revealed on hover for a fine pointer, on focus for a keyboard, and at rest for a coarse
			    pointer that has neither state before activation. */}
			<a
				aria-label={`Link to section ${name}`}
				className={cn(
					touchTargetTextClass,
					'coarse-heading-anchor text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:text-accent focus-visible:opacity-100',
					linkFocusClass,
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
	measure,
	variant = 'document',
}: {
	/** The element level the document's *shallowest* remaining heading renders as. */
	baseLevel?: HeadingBaseLevel;
	className?: string;
	/** Namespace for heading ids, for surfaces that render several documents on one page. */
	idPrefix?: string;
	markdown: string;
	/** Whether running prose takes the reading measure or the container width. */
	measure: MarkdownMeasure;
	/** Explicit document policy; the default preserves every authored block. */
	variant?: MarkdownContentVariant;
}) {
	const policy = MARKDOWN_RENDERING_POLICIES[variant];
	const parsed = parseMarkdownBlocks(markdown);
	const withoutTitle =
		policy.omitLeadingTitle && parsed[0]?.type === 'heading' && parsed[0].level === 1
			? parsed.slice(1)
			: parsed;
	const blocks =
		policy.omitLeadingSummary && withoutTitle[0]?.type === 'paragraph'
			? withoutTitle.slice(1)
			: withoutTitle;
	// Docs skips its authored `#`; measure depth from the shallowest remaining heading.
	const shallowest = Math.min(
		...blocks.flatMap((block) => (block.type === 'heading' ? [block.level] : [])),
		3,
	);
	const headingId = headingIdAllocator(idPrefix);
	const definitionId = headingIdAllocator(idPrefix === undefined ? 'term' : `${idPrefix}-term`);
	return (
		// The wrapper remains full-width; only its running-prose children receive the measure, and
		// only when the caller asked for one.
		<div
			className={cn(
				'min-w-0 space-y-2 text-sm leading-relaxed break-words text-foreground [&>*:first-child]:mt-0 [&>p+p]:mt-3',
				measure === 'prose' && markdownRunningProseMeasureClass,
				className,
			)}>
			{blocks.map((block, index) => {
				const key = `block-${index}`;
				if (block.type === 'definitions') {
					return (
						<MarkdownDefinitionList
							entries={block.entries.map(({ definition, term }) => ({
								definition: renderMarkdownInline(definition),
								id: policy.anchorDefinitions ? definitionId(term) : undefined,
								term: renderMarkdownInline(term),
								termLabel: plainInlineText(term),
							}))}
							key={key}
						/>
					);
				}
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
				if (block.type === 'table') {
					return (
						<MarkdownTable
							alignments={block.alignments}
							header={block.header.map(renderMarkdownInline)}
							key={key}
							rows={block.rows.map((row) => row.map(renderMarkdownInline))}
						/>
					);
				}
				if (block.type === 'quote') {
					return (
						<blockquote
							className="border-l-2 border-border pl-3 text-muted-foreground italic"
							key={key}>
							{block.lines.map((line, lineIndex) => (
								<p key={`${key}-${lineIndex}`}>{renderMarkdownInline(line)}</p>
							))}
						</blockquote>
					);
				}
				if (block.type === 'code') {
					return <MarkdownCodeBlock code={block.code} key={key} />;
				}
				if (block.type === 'list') {
					// Lists stay lists; definitions use their explicit authored block syntax.
					const items = block.items.map((item, itemIndex) => (
						<li key={`${key}-${itemIndex}`}>{renderMarkdownInline(item)}</li>
					));
					return block.ordered ? (
						<ol className="ml-5 list-decimal space-y-1" key={key} start={block.start}>
							{items}
						</ol>
					) : (
						<ul className="ml-5 list-disc space-y-1" key={key}>
							{items}
						</ul>
					);
				}
				return <p key={key}>{renderMarkdownInline(block.text)}</p>;
			})}
		</div>
	);
}

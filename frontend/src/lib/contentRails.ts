import { createContext, use } from 'react';

/**
 * Every page composition provides one of these rails at its root. Descendants consume the
 * provided value instead of restating a page-area maximum width.
 *
 * Rail choice follows the page's dominant content type rather than a page-specific width guess.
 * Record feeds, data displays, and catalogs use `full`; their rows, tables, or repeating cards
 * benefit from available space. Long-form single-column content uses `reading`. Control-heavy or
 * multi-pane workflows use `bounded`. Nested prose, form, and table measures size only their own
 * element; they must not duplicate the page cap or strand a narrower surface inside a full rail.
 * Every tier is pinned to the shell's left content edge; page compositions must not restate
 * horizontal placement.
 */
export type ContentRail = 'bounded' | 'full' | 'reading';

export type PageContentType = 'catalog' | 'data' | 'reading' | 'workflow';

export const pageRailByContentType = {
	catalog: 'full',
	data: 'full',
	reading: 'reading',
	workflow: 'bounded',
} as const satisfies Record<PageContentType, ContentRail>;

/**
 * The reading tier is 71rem rather than the 61rem it used to be, and the extra 10rem costs the
 * reader nothing: running prose carries its own 46ch measure on the paragraph, so a wider page
 * leaves every line exactly the length it already was. Measured on /docs/glossary at 2250x1309,
 * paragraphs are 427px wide at both values.
 *
 * What the width buys is the structured content that measure was never meant to constrain. 71rem is
 * the first value at which the docs article track clears the 36rem container query in
 * MarkdownDefinitionList: the three-track docs grid gives the article 640px of card and 590px
 * inside it, past the 576px gate, so a glossary entry renders as a term beside its definition
 * (192px + 378px) instead of stacking. At 61rem that track was 430px and every definition stacked.
 */
export const contentRailClass: Record<ContentRail, string> = {
	bounded: 'mr-auto w-full max-w-[80rem]',
	full: 'mr-auto w-full max-w-none',
	reading: 'mr-auto w-full max-w-[71rem]',
};

export const ContentRailContext = createContext<ContentRail | null>(null);

/** The page rail supplied by the nearest composition root. */
export function useContentRail(): ContentRail {
	const rail = use(ContentRailContext);
	if (rail === null) throw new Error('Page rail consumers must be rendered inside PageRail.');
	return rail;
}

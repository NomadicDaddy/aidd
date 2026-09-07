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

export const contentRailClass: Record<ContentRail, string> = {
	bounded: 'mr-auto w-full max-w-[80rem]',
	full: 'mr-auto w-full max-w-none',
	reading: 'mr-auto w-full max-w-[61rem]',
};

export const ContentRailContext = createContext<ContentRail | null>(null);

/** The page rail supplied by the nearest composition root. */
export function useContentRail(): ContentRail {
	const rail = use(ContentRailContext);
	if (rail === null) throw new Error('Page rail consumers must be rendered inside PageRail.');
	return rail;
}

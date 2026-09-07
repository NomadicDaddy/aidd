import { useEffect } from 'react';
import { useParams } from 'react-router';

import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { renderMarkdownInline } from '../../components/shared/markdownInline.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { PageRail } from '../../components/shared/PageRail.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { cn } from '../../lib/cn.ts';
import { pageRailByContentType } from '../../lib/contentRails.ts';
import { markdownHeadings, markdownSummary } from '../../lib/markdownBlocks.ts';
import { getDocBody } from './docs-content.ts';
import { DEFAULT_DOC_SLUG, docSectionBySlug } from './docs-manifest.ts';
import { DocsNavigationRail } from './DocsNavigationRail.tsx';
import { DocsNotFound } from './DocsNotFound.tsx';
import { DocsOutline } from './DocsOutline.tsx';
import { shouldRenderDocsOutline } from './docsOutlineState.ts';
import { DocsPager } from './DocsPager.tsx';

const PAGE_RAIL = pageRailByContentType.reading;
const DOCS_GRID_CLASS = 'grid gap-6 @min-[45rem]:grid-cols-[14rem_minmax(0,1fr)]';
const DOCS_OUTLINE_GRID_CLASS = '@min-[61rem]:grid-cols-[14rem_minmax(0,1fr)_14rem]';
const FAQ_CONTENT_CLASS =
	'[&>h2:not(:first-child)]:mt-8 [&>h2:not(:first-child)]:border-t [&>h2:not(:first-child)]:border-border/60 [&>h2:not(:first-child)]:pt-8';

function docsOutlineHeadings(body: string | undefined) {
	// Two levels are this corpus's complete outline. Deeper headings would duplicate the article.
	return body === undefined
		? []
		: markdownHeadings(body, { skipLeadingTitle: true }).filter(
				(heading) => heading.depth <= 1,
			);
}

export function DocsPage() {
	const params = useParams<{ slug?: string }>();
	const slug = params.slug ?? DEFAULT_DOC_SLUG;
	const section = docSectionBySlug(slug);
	const body = getDocBody(slug);
	const summary = body === undefined ? undefined : markdownSummary(body);
	const outlineHeadings = docsOutlineHeadings(body);
	const outlineContent = shouldRenderDocsOutline(outlineHeadings.length) ? (
		<DocsOutline headings={outlineHeadings} />
	) : null;
	const docsGridClass = cn(DOCS_GRID_CLASS, outlineContent !== null && DOCS_OUTLINE_GRID_CLASS);

	useDocumentTitle(section ? `Docs · ${section.title}` : 'Docs · Section Not Found');

	// Docs are one route with a changing `slug`, so following a sidebar link from halfway down a
	// long document swapped the article underneath a scroll position that belonged to the previous
	// one — the new document opened at whatever paragraph happened to sit at that offset, with no
	// navigation having visibly occurred. The heading-anchor links inside the article change the
	// hash and not the slug, so in-page jumps are unaffected.
	useEffect(() => {
		window.scrollTo({ behavior: 'auto', top: 0 });
	}, [slug]);

	if (body === undefined) return <DocsNotFound slug={slug} />;

	return (
		<PageRail className="page-reveal @container space-y-5" key={slug} rail={PAGE_RAIL}>
			{/* The document owns both header fields. Group-level copy made every page in a section
			    sound identical; the authored lead now does header duty and leaves the body once. */}
			<PageHeader
				description={
					summary === undefined
						? 'Guides, how-tos, and reference for operating the aidd control panel.'
						: renderMarkdownInline(summary)
				}
				title={section ? section.title : 'Docs'}
				{...(slug === DEFAULT_DOC_SLUG
					? {}
					: { breadcrumb: { label: 'Docs', to: `/docs/${DEFAULT_DOC_SLUG}` } })}
			/>
			{/* The split asks this region how wide it is, not the viewport. `lg:` got an answer that
			    ignored the rail: at 1024 with the rail expanded this column is 736px and at 768 with
			    it collapsed it is 656px, so one breakpoint was deciding for two column widths that
			    differ by more than the sidebar it was deciding about. Expanded at 768 the column is
			    480px, and `lg:` was right there only by accident — a viewport tier that happened to
			    fall the correct side of a width it cannot see.

			    45rem is where 14rem of sidebar plus the 1.5rem gap (248px) still leave the article
			    the ~480px its own measure asks for. Below it the disclosure carries the wayfinding
			    and the prose gets the whole column. Only `@min-` variants, so nothing has to be
			    decided at the boundary twice.

			    61rem adds the on-this-page rail, at the width where a second 14rem column still
			    leaves the article its measure (224 + 480 + 224 + two 24px gaps = 976px = 61rem).
			    A real multi-section outline claims that track consistently. Viewport height cannot add
			    or remove 224px of article width when the window changes by one pixel.

			    The page stops at the reading tier, which is that same 976px. It used to stop at the
			    80rem bounded tier, and the mismatch is what this whole block was quietly working
			    around: three tracks sized for 976px laid out inside 1280px gave the article a 784px
			    card holding 427px of prose, so the surplus arrived as bare card rather than as page.
			    Declaring the content type instead of a width tier is what keeps the arithmetic above
			    and the rail below the same number. Its equal 24px grid gaps keep the outline beside
			    the card while the article track gives definitions, tables and code the room they
			    need. Running prose carries its own measure inside that track, so the composition
			    never turns into a longer line. */}
			{/* The grid is the outer route reveal's direct nested reveal. Its composition regions
			    consume the existing nested ladder instead of arriving as one block, while the slug key
			    above remounts the route reveal when one document replaces another. */}
			<div className={cn('page-reveal', docsGridClass)}>
				<DocsNavigationRail {...(section ? { sectionTitle: section.title } : {})} />
				<div className="min-w-0 space-y-6 @min-[45rem]:col-start-2 @min-[61rem]:contents">
					{/* The outline precedes the article in keyboard order because it navigates that article.
				    Grid placement keeps it visually in the third track once that track exists; below it the
					    outline and article share one stack in the two-column band, so the adjacent
					    sidebar cannot create empty space between them. */}
					{outlineContent === null ? null : (
						<div className="sticky top-[var(--app-topbar-height,0px)] z-10 self-start @min-[61rem]:top-4 @min-[61rem]:col-start-3 @min-[61rem]:row-start-1">
							{outlineContent}
						</div>
					)}
					{/* The card takes the whole article track so structured content can use it. The
					    renderer projects the reading measure only onto running prose blocks. */}
					<Card className="min-w-0 p-3 sm:p-6 @min-[61rem]:col-start-2 @min-[61rem]:row-start-1">
						<article>
							{/* The PageHeader promotes the document's title and lead, so neither
						    repeats in the article. */}
							<MarkdownContent
								baseLevel={2}
								className={slug === 'faq' ? FAQ_CONTENT_CLASS : ''}
								markdown={body}
								measure="prose"
								variant={slug === 'glossary' ? 'glossary' : 'docs'}
							/>
							<DocsPager slug={slug} />
						</article>
					</Card>
				</div>
			</div>
		</PageRail>
	);
}

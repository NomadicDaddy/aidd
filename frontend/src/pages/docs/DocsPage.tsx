import { useEffect } from 'react';
import { Link, useParams } from 'react-router';

import { EmptyState } from '../../components/shared/EmptyState.tsx';
import { MarkdownContent } from '../../components/shared/MarkdownContent.tsx';
import { PageHeader } from '../../components/shared/PageHeader.tsx';
import { Card } from '../../components/ui/card.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { cn } from '../../lib/cn.ts';
import { touchTargetTextClass } from '../../lib/touchTarget.ts';
import { proseMeasureCardClass } from '../../lib/typography.ts';
import { getDocBody } from './docs-content.ts';
import { DEFAULT_DOC_SLUG, docSectionBySlug } from './docs-manifest.ts';
import { DocsOutline } from './DocsOutline.tsx';
import { DocsSidebar } from './DocsSidebar.tsx';

export function DocsPage() {
	const params = useParams<{ slug?: string }>();
	const slug = params.slug ?? DEFAULT_DOC_SLUG;
	const section = docSectionBySlug(slug);
	const body = getDocBody(slug);

	useDocumentTitle(section ? `Docs · ${section.title}` : 'Docs');

	// Docs are one route with a changing `slug`, so following a sidebar link from halfway down a
	// long document swapped the article underneath a scroll position that belonged to the previous
	// one — the new document opened at whatever paragraph happened to sit at that offset, with no
	// navigation having visibly occurred. The heading-anchor links inside the article change the
	// hash and not the slug, so in-page jumps are unaffected.
	useEffect(() => {
		window.scrollTo({ behavior: 'auto', top: 0 });
	}, [slug]);

	return (
		<div className="page-reveal space-y-5">
			{/* The document's own name is the page title: "Docs" was identical on all 13 slugs, so
			    the largest text on screen was the word that changed least. The breadcrumb keeps the
			    section context the generic title used to carry. */}
			<PageHeader
				breadcrumb={
					<Link
						className={`hover:text-foreground ${touchTargetTextClass}`}
						to={`/docs/${DEFAULT_DOC_SLUG}`}>
						Docs
					</Link>
				}
				description={
					section
						? `${section.group} · guides, how-tos, and reference for operating the aidd control panel.`
						: 'Guides, how-tos, and reference for operating the aidd control panel.'
				}
				title={section ? section.title : 'Docs'}
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
			    The rail is what claims the width the measure gives up: capped and two-column, the
			    grid left 1231px of a 1962px content column — 63% of it — as blank face to the right
			    of the card. A measure without a second column is a narrower article in the same
			    empty room. */}
			<div className="@container">
				<div className="grid gap-6 @min-[45rem]:grid-cols-[14rem_minmax(0,1fr)] @min-[61rem]:grid-cols-[14rem_minmax(0,1fr)_14rem]">
					<aside className="@min-[45rem]:sticky @min-[45rem]:top-4 @min-[45rem]:self-start">
						{/* Narrow, the full list is 3 group labels and 13 links — roughly a screen of
						    navigation above the article a reader just navigated to. Collapsed behind
						    the current section name, the wayfinding cue survives and the prose leads. */}
						<details className="rounded-xl border border-border bg-card px-3 py-2 @min-[45rem]:hidden">
							<summary className="cursor-pointer list-none py-1 text-sm font-medium text-foreground marker:content-none">
								<span className="text-muted-foreground">Docs · </span>
								{section ? section.title : 'All sections'}
							</summary>
							<div className="mt-3 border-t border-border pt-3">
								<DocsSidebar instance="compact" />
							</div>
						</details>
						<div className="hidden @min-[45rem]:block">
							<DocsSidebar />
						</div>
					</aside>
					{/* The measure is the card's, not the renderer's: capped inside, the border ran
					    to the full column and the prose sat in the left two thirds of an apparently
					    empty card. Capped here, the border comes back to the text — and in the card
					    form of the measure, which corrects for the card's own face and padding. */}
					<Card className={cn('min-w-0 p-5 sm:p-7', proseMeasureCardClass)}>
						<article>
							{body ? (
								// `skipLeadingTitle`: PageHeader above already renders this
								// document's name in the display face, so the markdown `#` would
								// state it twice.
								<MarkdownContent baseLevel={2} markdown={body} skipLeadingTitle />
							) : (
								<EmptyState
									action={
										<Link
											className={`font-medium text-accent underline underline-offset-2 ${touchTargetTextClass}`}
											to={`/docs/${DEFAULT_DOC_SLUG}`}>
											Back to Getting started
										</Link>
									}>
									No documentation found for “{slug}”.
								</EmptyState>
							)}
						</article>
					</Card>
					{/* Hidden below its own breakpoint rather than absent: the compact `<details>`
					    above already lists every section of every document, so a narrow reader has a
					    route to them without a second list under the article. */}
					{body ? (
						<aside className="hidden @min-[61rem]:sticky @min-[61rem]:top-4 @min-[61rem]:block @min-[61rem]:self-start">
							<DocsOutline body={body} />
						</aside>
					) : null}
				</div>
			</div>
		</div>
	);
}

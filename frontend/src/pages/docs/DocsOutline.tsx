import { useEffect, useState } from 'react';

import type { MarkdownHeading } from '../../lib/markdownBlocks.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { touchTargetRowClass } from '../../lib/touchTarget.ts';
import { microLabelClass, sectionCaptionClass } from '../../lib/typography.ts';
import { docsCurrentLocationClass, docsNavigationFocusClass } from './docsNavigationStyles.ts';
import { activeOutlineHeadingId } from './docsOutlineState.ts';

function useActiveHeadingId(headingIds: readonly string[]): null | string {
	const [activeHeadingId, setActiveHeadingId] = useState<null | string>(null);

	useEffect(() => {
		let frame: null | number = null;
		const update = () => {
			const positions = headingIds.flatMap((id) => {
				const heading = document.getElementById(id);
				return heading === null ? [] : [{ id, top: heading.getBoundingClientRect().top }];
			});
			const activationOffset = window.scrollY <= 1 ? 0 : window.innerHeight / 3;
			const documentScrollable =
				document.documentElement.scrollHeight > window.innerHeight + 1;
			setActiveHeadingId(
				activeOutlineHeadingId(positions, activationOffset, documentScrollable),
			);
		};
		const scheduleUpdate = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				update();
			});
		};

		update();
		window.addEventListener('resize', scheduleUpdate);
		window.addEventListener('scroll', scheduleUpdate, { passive: true });
		return () => {
			if (frame !== null) cancelAnimationFrame(frame);
			window.removeEventListener('resize', scheduleUpdate);
			window.removeEventListener('scroll', scheduleUpdate);
		};
	}, [headingIds]);

	return activeHeadingId;
}

/**
 * The current document's own sections, as a rail beside it.
 *
 * It exists to be read, and it also does the layout's work: the article is capped at its reading
 * measure, so on a wide screen the grid released 1231px of the content column — 63% of it — to
 * nothing. A cap has to be paired with something that claims the width it gives up, or tightening
 * the measure only moves the void from inside the border to outside it.
 *
 * The ids come from the same allocator the renderer uses, so a document with two identically-named
 * sections links to the right one rather than to the first.
 *
 * Named for what it is rather than for the heading it renders: a file under `pages/` whose name ends
 * in `Page.tsx` is a route in this codebase, and `check:feature-integration` fails the gate when one
 * is not mounted in `App.tsx`.
 */
export function DocsOutline({ headings }: { headings: readonly MarkdownHeading[] }) {
	const headingIds = headings.map((heading) => heading.id);
	const activeHeadingId = useActiveHeadingId(headingIds);
	if (headings.length < 2) return null;

	const links = (
		<ul className="grid gap-1">
			{headings.map((heading) => (
				<li key={heading.id}>
					<a
						aria-current={activeHeadingId === heading.id ? 'location' : undefined}
						className={cn(
							'relative block rounded-lg py-1.5 text-sm',
							touchTargetRowClass,
							'transition-[color,background-color,border-color,box-shadow] duration-150',
							docsNavigationFocusClass,
							activeHeadingId === heading.id
								? docsCurrentLocationClass
								: 'text-muted-foreground hover:bg-muted hover:text-foreground',
							heading.depth === 0 ? 'pl-3' : 'pl-6',
						)}
						href={`#${heading.id}`}>
						<span
							aria-hidden="true"
							className={cn(
								'absolute top-1/2 left-0 size-1.5 -translate-y-1/2 rounded-full bg-accent transition-opacity',
								activeHeadingId === heading.id ? 'opacity-100' : 'opacity-0',
							)}
						/>
						{heading.text}
					</a>
				</li>
			))}
		</ul>
	);

	return (
		// One landmark, two presentations. Below the outline's own track the sections were simply
		// not rendered, and a phone got no outline at all: measured at 390x844, /docs/getting-started
		// runs 8 sections over 2.9 screens, /docs/glossary 5 over 4.1, /docs/runs 8 over 3.6 — the
		// documents that most need a section list were the ones that had none. The disclosure is the
		// narrow equivalent, closed by default so it costs one row of the article it sits above.
		<nav aria-label="On this page">
			<Card className="px-3 py-2 @min-[61rem]:hidden" variant="sunken">
				<details className="group">
					<summary
						className={cn(
							'flex cursor-pointer list-none items-center gap-1 py-1 text-sm font-medium text-foreground marker:content-none',
							touchTargetRowClass,
						)}>
						<DisclosureMarker />
						On this page
						<span className={cn('ml-auto text-muted-foreground', microLabelClass)}>
							{headings.length} sections
						</span>
					</summary>
					<div className="mt-3 border-t border-border pt-3">{links}</div>
				</details>
			</Card>
			{/* The rail is a nested panel beside the article card, so it takes the declared
			    sunken variant rather than describing a fill of its own. It used to draw a
			    bare hairline box with no fill at all, which read as a different kind
			    of surface from every other nested panel in the app. The nav stays the
			    landmark; the Card is only the box around it. */}
			<Card className="hidden grid-cols-1 gap-2 p-3 @min-[61rem]:grid" variant="sunken">
				<span className={cn('pl-3', sectionCaptionClass)}>On this page</span>
				{links}
			</Card>
		</nav>
	);
}

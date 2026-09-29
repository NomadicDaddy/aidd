import { type MouseEvent, useEffect, useState } from 'react';

import type { MarkdownHeading } from '../../lib/markdownBlocks.ts';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Card } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { touchTargetRowClass } from '../../lib/touchTarget.ts';
import { microLabelClass, sectionCaptionClass } from '../../lib/typography.ts';
import { docsCurrentLocationClass, docsNavigationFocusClass } from './docsNavigationStyles.ts';
import { activeOutlineHeadingId } from './docsOutlineState.ts';

function prefersReducedMotion(): boolean {
	return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

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
 * The section the reader chose, held until they choose something else.
 *
 * `useActiveHeadingId` answers which section is being read, and for scrolling that is the right
 * question: its activation line sits a third of the way down the viewport, so the heading you have
 * scrolled past owns the highlight. Following a link is not scrolling, though, and measured on
 * /docs/faq at 2250x1309 the same rule made six of seven outline links highlight a section the
 * reader had not asked for. The jump leaves the target at the top of the scrollport, so every
 * heading in the 420px between it and the activation line outranked it: choosing "Why isn't my
 * project showing up?" lit "Where is my data stored?".
 *
 * The last four links could not have been right under any offset. A document runs out of scroll
 * before its final sections can reach the top, so their position stops encoding the reader's choice
 * at all and all four resolved to the same heading. Only the click knows.
 *
 * The pin releases on input intent — wheel, touch, a key — and deliberately not on `scroll`, which
 * the jump itself fires.
 */
function useOutlineNavigation(): {
	navigateToHeading: (event: MouseEvent<HTMLAnchorElement>, id: string) => void;
	pinnedHeadingId: null | string;
} {
	const [pinnedHeadingId, setPinnedHeadingId] = useState<null | string>(null);

	useEffect(() => {
		if (pinnedHeadingId === null) return;
		const release = () => setPinnedHeadingId(null);
		window.addEventListener('wheel', release, { passive: true });
		window.addEventListener('touchmove', release, { passive: true });
		window.addEventListener('keydown', release);
		return () => {
			window.removeEventListener('wheel', release);
			window.removeEventListener('touchmove', release);
			window.removeEventListener('keydown', release);
		};
	}, [pinnedHeadingId]);

	// Taking the anchor's navigation means taking its history behaviour too. `pushState` records
	// the entry but, unlike a real hash navigation, restores no scroll position on the way back, so
	// Back would move the address bar and nothing else. Restoring it here is instant on purpose:
	// returning to somewhere you have already been is not a journey the reader needs to watch.
	useEffect(() => {
		const restore = () => {
			const id = window.location.hash.slice(1);
			if (id === '') return;
			const heading = document.getElementById(id);
			if (heading === null) return;
			setPinnedHeadingId(id);
			heading.scrollIntoView({ behavior: 'auto', block: 'start' });
		};
		window.addEventListener('popstate', restore);
		return () => window.removeEventListener('popstate', restore);
	}, []);

	/*
	 * The rail drives the scroll itself so the page is traversed rather than replaced. A bare `#id`
	 * moves the document in a single frame — measured at 750px on one /docs/faq link — and every
	 * fixed point the reader was using moves with it, including this rail, which settles 121px as
	 * its sticky offset engages. Nothing on screen connects where they were to where they landed.
	 *
	 * `scrollIntoView` honours the root's `scroll-padding-top`, so the shell bar still cannot bury
	 * the heading, and the reduced-motion branch restores the instant jump for a reader who asked
	 * for one.
	 */
	const navigateToHeading = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
		const heading = document.getElementById(id);
		if (heading === null) return;
		event.preventDefault();
		setPinnedHeadingId(id);
		window.history.pushState(null, '', `#${id}`);
		heading.scrollIntoView({
			behavior: prefersReducedMotion() ? 'auto' : 'smooth',
			block: 'start',
		});
	};

	return { navigateToHeading, pinnedHeadingId };
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
	const scrolledHeadingId = useActiveHeadingId(headingIds);
	const { navigateToHeading, pinnedHeadingId } = useOutlineNavigation();
	const activeHeadingId = pinnedHeadingId ?? scrolledHeadingId;
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
						href={`#${heading.id}`}
						onClick={(event) => {
							navigateToHeading(event, heading.id);
						}}>
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
			    landmark; the Card is only the box around it.

			    The caption takes `text-foreground` over the token's muted default, for the reason
			    given in `DocsSidebar`: these rails are the app's only navigation whose links carry
			    no icon, so a caption left at the links' own colour has nothing to separate it from
			    them. */}
			<Card className="hidden grid-cols-1 gap-2 p-3 @min-[61rem]:grid" variant="sunken">
				<span className={cn('pl-3', sectionCaptionClass, 'text-foreground')}>
					On this page
				</span>
				{links}
			</Card>
		</nav>
	);
}

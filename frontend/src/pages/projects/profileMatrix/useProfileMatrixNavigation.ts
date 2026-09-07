import type { RefObject } from 'react';

import { useEffect, useRef, useState } from 'react';

import type { FacetField, ProfileFacet } from '../detail/profile/profile-facets.ts';

import { revealElementWithinScroller } from '../../../lib/revealWithinScroller.ts';

const FACET_REVEAL_GUTTER_PX = 24;

function findFacetHeader(table: HTMLTableElement, title: string): HTMLTableCellElement | undefined {
	return [...table.querySelectorAll<HTMLTableCellElement>('thead th')].find(
		(header) => header.querySelector('button')?.textContent?.trim() === title,
	);
}

export function useProfileMatrixNavigation(visibleFacets: readonly ProfileFacet[]): {
	activeFacet: FacetField | null;
	revealFacet: (facet: ProfileFacet) => void;
	scrollerRef: RefObject<HTMLDivElement | null>;
	tableRef: RefObject<HTMLTableElement | null>;
} {
	const scrollerRef = useRef<HTMLDivElement>(null);
	const tableRef = useRef<HTMLTableElement>(null);
	const requestedFacetRef = useRef<{ field: FacetField; scrollLeft: number } | null>(null);
	const [activeFacet, setActiveFacet] = useState<FacetField | null>(
		visibleFacets[0]?.field ?? null,
	);

	useEffect(() => {
		if (!scrollerRef.current || !tableRef.current) return;
		const scroller = scrollerRef.current;
		const table = tableRef.current;
		const pinnedHeader = table.querySelector<HTMLTableCellElement>('thead th:first-child');
		const firstDataHeader = table.querySelector<HTMLTableCellElement>('thead th:nth-child(2)');
		if (!pinnedHeader || !firstDataHeader) return;
		const pinnedHeaderElement: HTMLTableCellElement = pinnedHeader;
		const firstDataHeaderElement: HTMLTableCellElement = firstDataHeader;
		let animationFrame = 0;

		function syncScrollPadding(): void {
			// The first data header's offset is the exact trailing edge of the content-sized Project
			// track, including the table border. Using that live boundary keeps the first snap target
			// at scrollLeft 0 even when a longer project identity widens the pinned column.
			scroller.style.scrollPaddingInlineStart = `${firstDataHeaderElement.offsetLeft}px`;
		}

		function updateActiveFacet(): void {
			const requestedFacet = requestedFacetRef.current;
			if (requestedFacet && Math.abs(scroller.scrollLeft - requestedFacet.scrollLeft) < 1) {
				requestedFacetRef.current = null;
				setActiveFacet(requestedFacet.field);
				return;
			}
			requestedFacetRef.current = null;
			const readableStart =
				pinnedHeaderElement.getBoundingClientRect().right + FACET_REVEAL_GUTTER_PX;
			const scrollerRight = scroller.getBoundingClientRect().right;
			let closest: FacetField | null = null;
			let closestDistance = Number.POSITIVE_INFINITY;
			for (const facet of visibleFacets) {
				const header = findFacetHeader(table, facet.title);
				if (!header) continue;
				const rect = header.getBoundingClientRect();
				if (rect.right <= readableStart || rect.left >= scrollerRight) continue;
				const distance = Math.abs(rect.left - readableStart);
				if (distance >= closestDistance) continue;
				closest = facet.field;
				closestDistance = distance;
			}
			setActiveFacet((current) => closest ?? (visibleFacets.length === 0 ? null : current));
		}

		function scheduleUpdate(): void {
			if (animationFrame !== 0) return;
			animationFrame = requestAnimationFrame(() => {
				animationFrame = 0;
				syncScrollPadding();
				updateActiveFacet();
			});
		}

		syncScrollPadding();
		updateActiveFacet();
		const observer = new ResizeObserver(scheduleUpdate);
		observer.observe(pinnedHeaderElement);
		scroller.addEventListener('scroll', scheduleUpdate, { passive: true });
		window.addEventListener('resize', scheduleUpdate);
		return () => {
			cancelAnimationFrame(animationFrame);
			observer.disconnect();
			scroller.removeEventListener('scroll', scheduleUpdate);
			window.removeEventListener('resize', scheduleUpdate);
			scroller.style.removeProperty('scroll-padding-inline-start');
		};
	}, [visibleFacets]);

	const revealFacet = (facet: ProfileFacet): void => {
		const scroller = scrollerRef.current;
		const table = tableRef.current;
		const pinnedHeader = table?.querySelector<HTMLTableCellElement>('thead th:first-child');
		const target = table ? findFacetHeader(table, facet.title) : undefined;
		if (!scroller || !target || !pinnedHeader) return;
		setActiveFacet(facet.field);
		revealElementWithinScroller(
			scroller,
			target,
			0,
			pinnedHeader.getBoundingClientRect().width + FACET_REVEAL_GUTTER_PX,
			FACET_REVEAL_GUTTER_PX,
		);
		requestedFacetRef.current = { field: facet.field, scrollLeft: scroller.scrollLeft };
	};

	return { activeFacet, revealFacet, scrollerRef, tableRef };
}

export function nearestHorizontalScrollLeft({
	currentScrollLeft,
	endPadding,
	padding = 0,
	scrollerLeft,
	scrollerRight,
	startPadding,
	targetLeft,
	targetRight,
}: {
	currentScrollLeft: number;
	endPadding?: number;
	padding?: number;
	scrollerLeft: number;
	scrollerRight: number;
	startPadding?: number;
	targetLeft: number;
	targetRight: number;
}): number {
	const resolvedStartPadding = startPadding ?? padding;
	const resolvedEndPadding = endPadding ?? padding;
	if (targetLeft < scrollerLeft + resolvedStartPadding) {
		return Math.max(0, currentScrollLeft - (scrollerLeft + resolvedStartPadding - targetLeft));
	}
	if (targetRight > scrollerRight - resolvedEndPadding) {
		return currentScrollLeft + targetRight - (scrollerRight - resolvedEndPadding);
	}
	return currentScrollLeft;
}

export function nearestVerticalScrollTop({
	currentScrollTop,
	padding,
	scrollerBottom,
	scrollerTop,
	targetBottom,
	targetTop,
}: {
	currentScrollTop: number;
	padding: number;
	scrollerBottom: number;
	scrollerTop: number;
	targetBottom: number;
	targetTop: number;
}): number {
	if (targetTop < scrollerTop + padding) {
		return Math.max(0, currentScrollTop - (scrollerTop + padding - targetTop));
	}
	if (targetBottom > scrollerBottom - padding) {
		return currentScrollTop + targetBottom - (scrollerBottom - padding);
	}
	return currentScrollTop;
}

export function revealElementWithinScroller(
	scroller: HTMLElement,
	target: HTMLElement,
	verticalPadding = 0,
	horizontalStartPadding = 0,
	horizontalEndPadding = horizontalStartPadding,
): void {
	const scrollerRect = scroller.getBoundingClientRect();
	const targetRect = target.getBoundingClientRect();
	const nextScrollLeft = nearestHorizontalScrollLeft({
		currentScrollLeft: scroller.scrollLeft,
		endPadding: horizontalEndPadding,
		scrollerLeft: scrollerRect.left,
		scrollerRight: scrollerRect.right,
		startPadding: horizontalStartPadding,
		targetLeft: targetRect.left,
		targetRight: targetRect.right,
	});
	const nextScrollTop = nearestVerticalScrollTop({
		currentScrollTop: scroller.scrollTop,
		padding: verticalPadding,
		scrollerBottom: scrollerRect.bottom,
		scrollerTop: scrollerRect.top,
		targetBottom: targetRect.bottom,
		targetTop: targetRect.top,
	});
	if (nextScrollLeft !== scroller.scrollLeft) scroller.scrollLeft = nextScrollLeft;
	if (nextScrollTop !== scroller.scrollTop) scroller.scrollTop = nextScrollTop;
}

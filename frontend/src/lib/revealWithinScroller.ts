export function nearestHorizontalScrollLeft({
	currentScrollLeft,
	scrollerLeft,
	scrollerRight,
	targetLeft,
	targetRight,
}: {
	currentScrollLeft: number;
	scrollerLeft: number;
	scrollerRight: number;
	targetLeft: number;
	targetRight: number;
}): number {
	if (targetLeft < scrollerLeft) {
		return Math.max(0, currentScrollLeft - (scrollerLeft - targetLeft));
	}
	if (targetRight > scrollerRight) {
		return currentScrollLeft + targetRight - scrollerRight;
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
): void {
	const scrollerRect = scroller.getBoundingClientRect();
	const targetRect = target.getBoundingClientRect();
	const nextScrollLeft = nearestHorizontalScrollLeft({
		currentScrollLeft: scroller.scrollLeft,
		scrollerLeft: scrollerRect.left,
		scrollerRight: scrollerRect.right,
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

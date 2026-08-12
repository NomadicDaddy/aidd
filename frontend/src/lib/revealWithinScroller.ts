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

export function revealElementWithinScroller(scroller: HTMLElement, target: HTMLElement): void {
	const scrollerRect = scroller.getBoundingClientRect();
	const targetRect = target.getBoundingClientRect();
	const nextScrollLeft = nearestHorizontalScrollLeft({
		currentScrollLeft: scroller.scrollLeft,
		scrollerLeft: scrollerRect.left,
		scrollerRight: scrollerRect.right,
		targetLeft: targetRect.left,
		targetRight: targetRect.right,
	});
	if (nextScrollLeft !== scroller.scrollLeft) scroller.scrollLeft = nextScrollLeft;
}

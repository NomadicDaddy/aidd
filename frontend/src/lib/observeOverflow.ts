export interface OverflowFlags {
	/** Content continues past the right edge. */
	end: boolean;
	/** The scrollport hides rows below its fold, as a `max-h-*` one does. */
	scrollsDown: boolean;
	/** The scrollport has rows above its current position. */
	scrollsUp: boolean;
	/** Content continues past the left edge — true only once the scroller has moved. */
	start: boolean;
}

export function overflowFlagsForMetrics({
	clientHeight,
	clientWidth,
	scrollHeight,
	scrollLeft,
	scrollTop,
	scrollWidth,
}: {
	clientHeight: number;
	clientWidth: number;
	scrollHeight: number;
	scrollLeft: number;
	scrollTop: number;
	scrollWidth: number;
}): OverflowFlags {
	// A sub-pixel slack: fractional layout dimensions otherwise leave an edge permanently lit at
	// a scroll extreme.
	const horizontalOverflow = scrollWidth - clientWidth;
	const verticalOverflow = scrollHeight - clientHeight;
	return {
		end: horizontalOverflow > 1 && scrollLeft < horizontalOverflow - 1,
		scrollsDown: verticalOverflow > 1 && scrollTop < verticalOverflow - 1,
		scrollsUp: verticalOverflow > 1 && scrollTop > 1,
		start: horizontalOverflow > 1 && scrollLeft > 1,
	};
}

/**
 * Reports which edges of one scrolling element have content beyond them, and keeps reporting as the
 * element scrolls or resizes.
 *
 * The measurement is pushed to the caller rather than held in state on purpose. Measuring layout
 * into state and re-rendering on the result is how the identity-badge truncation loop happened (see
 * `ExecutionIdentityBadges`): the render changes the box, the box changes the measurement, and the
 * measurement changes the render. Every caller here writes a data attribute instead, which leaves
 * the measured box independent of the outcome.
 *
 * Returns a teardown; call it before observing a different element.
 */
export function observeOverflow(
	scroller: HTMLElement,
	onChange: (flags: OverflowFlags) => void,
): () => void {
	const measure = () => {
		onChange(
			overflowFlagsForMetrics({
				clientHeight: scroller.clientHeight,
				clientWidth: scroller.clientWidth,
				scrollHeight: scroller.scrollHeight,
				scrollLeft: scroller.scrollLeft,
				scrollTop: scroller.scrollTop,
				scrollWidth: scroller.scrollWidth,
			}),
		);
	};

	measure();
	scroller.addEventListener('scroll', measure, { passive: true });
	const observer = new ResizeObserver(measure);
	observer.observe(scroller);
	// A scrollport wrapping a single element sees that element grow without its own box changing —
	// a table when columns are toggled on. Where the scroller holds a list of siblings instead this
	// observes the first of them, which is harmless: measuring is idempotent.
	const content = scroller.firstElementChild;
	if (content) observer.observe(content);
	// Lists commonly replace their loading/empty child after this observer attaches. That changes
	// scrollHeight without changing the scrollport's own box, and the original first child may no
	// longer be connected, so ResizeObserver alone leaves the cue and tab stop stale. Mutations are
	// the content boundary: remeasure after React adds, removes, or updates rendered rows.
	const mutationObserver = new MutationObserver(measure);
	mutationObserver.observe(scroller, { characterData: true, childList: true, subtree: true });

	return () => {
		scroller.removeEventListener('scroll', measure);
		mutationObserver.disconnect();
		observer.disconnect();
	};
}

export interface OverflowFlags {
	/** Content continues past the right edge. */
	end: boolean;
	/** The scrollport hides rows below its fold, as a `max-h-*` one does. */
	scrollsDown: boolean;
	/** Content continues past the left edge — true only once the scroller has moved. */
	start: boolean;
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
		// A sub-pixel slack: fractional layout widths otherwise leave an edge permanently lit at a
		// scroll extreme.
		const overflow = scroller.scrollWidth - scroller.clientWidth;
		const overflowing = overflow > 1;
		onChange({
			end: overflowing && scroller.scrollLeft < overflow - 1,
			scrollsDown: scroller.scrollHeight - scroller.clientHeight > 1,
			start: overflowing && scroller.scrollLeft > 1,
		});
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

	return () => {
		scroller.removeEventListener('scroll', measure);
		observer.disconnect();
	};
}

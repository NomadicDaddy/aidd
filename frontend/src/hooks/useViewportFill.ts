import { type RefObject, useEffect, useRef } from 'react';

/** Never collapse the region below this, whatever the measurement says. */
const MIN_FILL_PX = 240;

/**
 * Sizes an element to the space left between its own top edge and the bottom of the viewport, by
 * writing `--fill-height` onto the element itself.
 *
 * A list-plus-detail split has to be a fixed-height region for its rail to pin and its detail column
 * to be the scrollport; otherwise the page scrolls, the rail's `sticky` never engages, and the rail
 * is capped at a number somebody guessed. The skills rail was capped at `calc(100vh - 9rem)` with
 * 188px of chrome above it, so its last row sat 44px below the fold at rest — and 9rem was wrong the
 * moment a filter row wrapped.
 *
 * Measured rather than expressed in CSS because the chrome above is not one element: a page header
 * whose height depends on its actions, plus a filter card whose height depends on how many segments
 * wrap. `top` is taken document-relative so a mid-scroll measurement gives the same answer as one at
 * rest, and the write is a direct style mutation rather than React state — the value is layout, not
 * data, and a state round-trip per resize frame would re-render the whole list.
 */
export function useViewportFill<T extends HTMLElement>(gutterPx = 16): RefObject<null | T> {
	const ref = useRef<null | T>(null);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;

		function apply(): void {
			if (!node) return;
			const top = node.getBoundingClientRect().top + window.scrollY;
			const available = window.innerHeight - top - gutterPx;
			node.style.setProperty('--fill-height', `${Math.max(MIN_FILL_PX, available)}px`);
		}

		apply();
		window.addEventListener('resize', apply);
		// The chrome above can change height without the window changing size — a wrapping filter
		// strip, a header action appearing — and only an observer on the page above notices that.
		const observer = new ResizeObserver(apply);
		if (node.parentElement) observer.observe(node.parentElement);

		return () => {
			window.removeEventListener('resize', apply);
			observer.disconnect();
		};
	}, [gutterPx]);

	return ref;
}

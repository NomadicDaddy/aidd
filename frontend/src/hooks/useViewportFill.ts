import { type RefObject, useEffect, useRef } from 'react';

/** The smallest usable scrollport per content shape. */
const VIEWPORT_FILL_FLOOR_PX = {
	compact: 160,
	default: 240,
	graph: 320,
} as const;

const MOBILE_PAGE_FLOW_QUERY = '(max-width: 639px)';

export type ViewportFillFloor = keyof typeof VIEWPORT_FILL_FLOOR_PX;
export type ViewportFillMode = 'page-on-phone' | 'scrollport';

/** Shared cap for an overflow region measured by {@link useViewportFill}. */
export const viewportFillScrollerClass = 'max-h-[var(--fill-height)] overflow-y-auto';

/** Lets a phone list resolve sticky descendants against the document instead of a natural-height scroller. */
export const viewportFillPhonePageListClass =
	'max-h-[var(--fill-height)] overflow-y-auto max-sm:max-h-none max-sm:overflow-visible';

/** Pairs with {@link viewportFillPhonePageListClass} on the cue-bearing wrapper. */
export const viewportFillPhonePageRootClass = 'max-sm:overflow-visible';

/** The value written to `--fill-height` when the region is not capped at all. */
export const VIEWPORT_FILL_RELEASED = 'max-content';

interface ViewportFillOptions {
	floor?: ViewportFillFloor;
	gutterPx?: number;
	mode?: ViewportFillMode;
	refreshKey?: unknown;
}

interface ViewportFillHeightOptions {
	belowFoldAvailablePx: number;
	floor?: ViewportFillFloor;
	pageFlow?: boolean;
}

/**
 * Resolves the CSS value written to `--fill-height` for a measured viewport remainder.
 *
 * A negative remainder means the region begins below the initial fold. That branch is explicit:
 * scrollports receive the viewport-derived height they can use once reached, while a consumer that
 * deliberately selects phone page flow releases the cap. This avoids both a fixed-floor keyhole
 * and the former global `max-content` fallback, which removed the dependency canvas pan affordance.
 */
export function viewportFillHeightValue(
	availablePx: number,
	{ belowFoldAvailablePx, floor = 'default', pageFlow = false }: ViewportFillHeightOptions,
): string {
	if (pageFlow) return VIEWPORT_FILL_RELEASED;
	const measuredAvailablePx = availablePx < 0 ? belowFoldAvailablePx : availablePx;
	return `${Math.round(Math.max(VIEWPORT_FILL_FLOOR_PX[floor], measuredAvailablePx))}px`;
}

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
 *
 * The property is written, never removed, and it inherits: a region may publish one budget that its
 * descendants resolve, which is how the Runs split gives its sticky console column the measurement
 * without the grid itself having to be a fixed-height box.
 */
export function useViewportFill<T extends HTMLElement>({
	floor = 'default',
	gutterPx = 16,
	mode = 'scrollport',
	refreshKey,
}: ViewportFillOptions = {}): RefObject<null | T> {
	const ref = useRef<null | T>(null);

	useEffect(() => {
		const node = ref.current;
		if (!node) return;

		function apply(): void {
			if (!node) return;
			const top = node.getBoundingClientRect().top + window.scrollY;
			const available = window.innerHeight - top - gutterPx;
			const pageFlow =
				mode === 'page-on-phone' && window.matchMedia(MOBILE_PAGE_FLOW_QUERY).matches;
			node.style.setProperty(
				'--fill-height',
				viewportFillHeightValue(available, {
					belowFoldAvailablePx: window.innerHeight - gutterPx,
					floor,
					pageFlow,
				}),
			);
		}

		apply();
		window.addEventListener('resize', apply);
		// The chrome above can change height without the window changing size — a wrapping filter
		// strip, a header action appearing — and only an observer on the page above notices that.
		const observer = new ResizeObserver(apply);
		if (node.parentElement) observer.observe(node.parentElement);
		// Data arriving above the measured region can move it without resizing its immediate parent.
		// The body does resize in that case, so observe it as the layout-shift boundary as well.
		if (node.parentElement !== document.body) observer.observe(document.body);

		return () => {
			window.removeEventListener('resize', apply);
			observer.disconnect();
		};
	}, [floor, gutterPx, mode, refreshKey]);

	return ref;
}

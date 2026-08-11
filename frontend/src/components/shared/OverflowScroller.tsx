import type { ReactNode } from 'react';

import { useCallback, useRef } from 'react';

import { cn } from '../../lib/cn.ts';
import { observeOverflow } from '../../lib/observeOverflow.ts';

/**
 * A scrollport that says so.
 *
 * A table wider than its card silently hides its right-hand columns: nothing at the edge signals
 * that more exists, and the scrollport is unreachable by keyboard. This wraps the scroller with an
 * edge fade on whichever side has content beyond it, and makes the scroller itself a focusable
 * region so arrow keys can reach the hidden columns without a pointer.
 *
 * Both are driven imperatively from a ref callback rather than from state. Measuring layout into
 * state and re-rendering on the result is how the identity-badge truncation loop happened (see
 * `ExecutionIdentityBadges`): the render changes the box, the box changes the measurement, and the
 * measurement changes the render. Writing a data attribute instead leaves the measured box
 * independent of the outcome, so this cannot feed back on itself.
 */

/**
 * The token the fade dissolves into — whatever the scrollport is actually sitting on.
 *
 * `card` is the default because the original consumers are tables inside a Card, and three
 * reviewers confirmed it is correct there. It is wrong the moment a scroller sits somewhere else:
 * the project tab strip sits on `--background` (#0c0f14) and faded `from-card` (rgb(22,26,34)), so
 * the band painted *lighter* than the page it covered and the strip's right edge read as a
 * container wall rather than as content continuing — five to seven hidden tabs behind a cue saying
 * "this ends here". The recipe step's command block has the same fault against `bg-muted`.
 */
const fadeFrom = {
	background: 'from-background',
	card: 'from-card',
	muted: 'from-muted',
} as const;

export function OverflowScroller({
	ariaLabel,
	children,
	className,
	scrollerClassName,
	surface = 'card',
}: {
	/** Names the scrollable region for assistive tech; required because it is focusable. */
	ariaLabel: string;
	children: ReactNode;
	className?: string;
	/** Extra classes for the scrolling element itself — a `max-h-*` makes it scroll vertically. */
	scrollerClassName?: string;
	/** The surface under the scrollport, so the edge fade dissolves into it rather than over it. */
	surface?: keyof typeof fadeFrom;
}) {
	const cleanupRef = useRef<(() => void) | null>(null);

	const setRoot = useCallback((root: HTMLDivElement | null) => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		if (!root) return;
		const scroller = root.querySelector<HTMLElement>('[data-overflow-scroller]');
		if (!scroller) return;

		cleanupRef.current = observeOverflow(scroller, (flags) => {
			root.dataset.overflowStart = String(flags.start);
			root.dataset.overflowEnd = String(flags.end);
			// Only a scrollport that actually has hidden content earns a tab stop; a table that
			// fits would otherwise add a focus step that goes nowhere. Either axis counts: a
			// `max-h-*` scrollport hides rows below its fold exactly as this one hides columns
			// past its right edge, and neither is reachable by arrow key without a tab stop.
			// The fades stay horizontal-only on purpose — both vertical scrollports here pin a
			// `sticky top-0` header, and a top fade at `z-30` would paint over it.
			if (flags.start || flags.end || flags.scrollsDown) scroller.tabIndex = 0;
			else scroller.removeAttribute('tabindex');
		});
	}, []);

	return (
		// `overflow-clip` is what actually keeps a capped scrollport out of the page's scroll
		// height. The scroller's own `overflow-x-auto` clips what it *paints* — the rows past the
		// cap are not on screen — but its layout overflow still propagated to the document: the
		// audits matrix capped at 925px left `document.scrollHeight` at 2184 against a card bottom
		// of 1329, so 855px of page scrolled below the card holding nothing at all. Measured at
		// 2250x1309; `overflow-y: scroll` on the scroller does not fix it and `contain: paint`
		// does, which is what says the fault is overflow propagation rather than scroll-container
		// resolution.
		//
		// It clips nothing the scroller was not already clipping, so it is safe on every consumer.
		// The 4px clip margin is for the scroller's own focus ring: this component hands the
		// scrollport a tab stop, and a wrapper that shaved the ring off would take back the
		// keyboard affordance it exists to provide.
		<div
			className={cn('group relative overflow-clip [overflow-clip-margin:4px]', className)}
			ref={setRoot}>
			<div
				aria-label={ariaLabel}
				className={cn('overflow-x-auto', scrollerClassName)}
				data-overflow-scroller=""
				role="region">
				{children}
			</div>
			{/* Two cues, because the gradient alone has two ways to fail. A pinned column is
			    `bg-card` and `z-10`, so `from-card` over it is card-on-card and its stacking context
			    puts it above an auto-z-index sibling — the fade was both invisible and behind the
			    one column that most needs it. `z-30` lifts it over the pinned cells, and the border
			    is a cue that does not depend on a colour difference against what it sits on. */}
			<span
				aria-hidden="true"
				className={cn(
					'pointer-events-none absolute inset-y-0 left-0 z-30 w-6 border-l border-border bg-gradient-to-r to-transparent opacity-0 transition-opacity duration-200 group-data-[overflow-start=true]:opacity-100',
					fadeFrom[surface],
				)}
			/>
			<span
				aria-hidden="true"
				className={cn(
					'pointer-events-none absolute inset-y-0 right-0 z-30 w-6 border-r border-border bg-gradient-to-l to-transparent opacity-0 transition-opacity duration-200 group-data-[overflow-end=true]:opacity-100',
					fadeFrom[surface],
				)}
			/>
		</div>
	);
}

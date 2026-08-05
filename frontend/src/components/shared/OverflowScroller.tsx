import type { ReactNode } from 'react';

import { useCallback, useRef } from 'react';

import { cn } from '../../lib/cn.ts';

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
export function OverflowScroller({
	ariaLabel,
	children,
	className,
	scrollerClassName,
}: {
	/** Names the scrollable region for assistive tech; required because it is focusable. */
	ariaLabel: string;
	children: ReactNode;
	className?: string;
	/** Extra classes for the scrolling element itself — a `max-h-*` makes it scroll vertically. */
	scrollerClassName?: string;
}) {
	const cleanupRef = useRef<(() => void) | null>(null);

	const setRoot = useCallback((root: HTMLDivElement | null) => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		if (!root) return;
		const scroller = root.querySelector<HTMLElement>('[data-overflow-scroller]');
		if (!scroller) return;

		const measure = () => {
			// A sub-pixel slack: fractional layout widths otherwise leave a fade permanently lit
			// at a scroll extreme.
			const overflow = scroller.scrollWidth - scroller.clientWidth;
			const overflowing = overflow > 1;
			root.dataset.overflowStart = String(overflowing && scroller.scrollLeft > 1);
			root.dataset.overflowEnd = String(overflowing && scroller.scrollLeft < overflow - 1);
			// Only a scrollport that actually has hidden content earns a tab stop; a table that
			// fits would otherwise add a focus step that goes nowhere.
			if (overflowing) scroller.tabIndex = 0;
			else scroller.removeAttribute('tabindex');
		};

		measure();
		scroller.addEventListener('scroll', measure, { passive: true });
		const observer = new ResizeObserver(measure);
		observer.observe(scroller);
		// The table grows independently of the scrollport when columns are toggled on.
		const content = scroller.firstElementChild;
		if (content) observer.observe(content);
		cleanupRef.current = () => {
			scroller.removeEventListener('scroll', measure);
			observer.disconnect();
		};
	}, []);

	return (
		<div className={cn('group relative', className)} ref={setRoot}>
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
				className="pointer-events-none absolute inset-y-0 left-0 z-30 w-6 border-l border-border bg-gradient-to-r from-card to-transparent opacity-0 transition-opacity duration-200 group-data-[overflow-start=true]:opacity-100"
			/>
			<span
				aria-hidden="true"
				className="pointer-events-none absolute inset-y-0 right-0 z-30 w-6 border-r border-border bg-gradient-to-l from-card to-transparent opacity-0 transition-opacity duration-200 group-data-[overflow-end=true]:opacity-100"
			/>
		</div>
	);
}

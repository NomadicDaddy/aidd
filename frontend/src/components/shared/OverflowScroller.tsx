import type {
	AriaAttributes,
	AriaRole,
	KeyboardEventHandler,
	ReactNode,
	Ref,
	RefObject,
} from 'react';

import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronLeft } from 'lucide-react/dist/esm/icons/chevron-left';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { default as ChevronUp } from 'lucide-react/dist/esm/icons/chevron-up';
import { useLayoutEffect, useRef } from 'react';

import type { OverflowFlags } from '../../lib/observeOverflow.ts';

import { cn } from '../../lib/cn.ts';
import { observeOverflow } from '../../lib/observeOverflow.ts';
import { revealElementWithinScroller } from '../../lib/revealWithinScroller.ts';

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
	ariaLive,
	bottomCueLabel,
	children,
	className,
	id,
	onKeyDown,
	onOverflowChange,
	revealElementId,
	revealHorizontalPadding = 0,
	role = 'region',
	rootRef,
	scrollerClassName,
	scrollerRef,
	showTopCue = false,
	startCueInset,
	surface = 'card',
}: {
	/** Names the scrollable region for assistive tech; required because it is focusable. */
	ariaLabel: string;
	/** Announces appended content when this scrollport is also a live log. */
	ariaLive?: AriaAttributes['aria-live'];
	/** Optional visible copy for a vertical continuation cue that needs more than a chevron. */
	bottomCueLabel?: string;
	children: ReactNode;
	className?: string;
	id?: string;
	/** Preserves keyboard behavior when the scrolling element owns a composite widget role. */
	onKeyDown?: KeyboardEventHandler<HTMLDivElement>;
	/** Publishes measured overflow when a consumer must hide controls that would otherwise no-op. */
	onOverflowChange?: (flags: OverflowFlags) => void;
	/** Reveals this descendant when its id changes, without moving any ancestor scrollport. */
	revealElementId?: string;
	/** Keeps a revealed descendant clear of the horizontal edge fades. */
	revealHorizontalPadding?: number;
	/** Keeps the scrollport's native semantic role when it is more specific than a region. */
	role?: AriaRole;
	/** Exposes the cue-bearing root when a consumer needs to publish measured layout to it. */
	rootRef?: RefObject<HTMLDivElement | null>;
	/** Extra classes for the scrolling element itself — a `max-h-*` makes it scroll vertically. */
	scrollerClassName?: string;
	/** Exposes the scrolling element to consumers that must keep an active item in view. */
	scrollerRef?: Ref<HTMLDivElement>;
	/** Shows upward continuation for lists without a sticky header. */
	showTopCue?: boolean;
	/** Clears a pinned leading track instead of painting the start cue over it. */
	startCueInset?: string;
	/** The surface under the scrollport, so the edge fade dissolves into it rather than over it. */
	surface?: keyof typeof fadeFrom;
}) {
	const cleanupRef = useRef<(() => void) | null>(null);
	const rootElementRef = useRef<HTMLDivElement | null>(null);

	const setRoot = (root: HTMLDivElement | null) => {
		cleanupRef.current?.();
		cleanupRef.current = null;
		rootElementRef.current = root;
		if (rootRef) rootRef.current = root;
		if (!root) return;
		const scroller = root.querySelector<HTMLElement>('[data-overflow-scroller]');
		if (!scroller) return;

		cleanupRef.current = observeOverflow(scroller, (flags) => {
			root.dataset.overflowStart = String(flags.start);
			root.dataset.overflowEnd = String(flags.end);
			root.dataset.overflowDown = String(flags.scrollsDown);
			root.dataset.overflowUp = String(flags.scrollsUp);
			onOverflowChange?.(flags);
			// Only a scrollport that actually has hidden content earns a tab stop; a table that
			// fits would otherwise add a focus step that goes nowhere. Either axis counts: a
			// `max-h-*` scrollport hides rows below its fold exactly as this one hides columns
			// past its right edge, and neither is reachable by arrow key without a tab stop.
			if (flags.start || flags.end || flags.scrollsDown || flags.scrollsUp) {
				scroller.tabIndex = 0;
			} else scroller.removeAttribute('tabindex');
		});
	};

	useLayoutEffect(() => {
		if (!revealElementId) return;
		const reveal = () => {
			const scroller = rootElementRef.current?.querySelector<HTMLElement>(
				'[data-overflow-scroller]',
			);
			const target = document.getElementById(revealElementId);
			if (!scroller || !(target instanceof HTMLElement) || !scroller.contains(target)) return;
			revealElementWithinScroller(scroller, target, 0, revealHorizontalPadding);
		};
		reveal();
		const scroller = rootElementRef.current?.querySelector<HTMLElement>(
			'[data-overflow-scroller]',
		);
		if (!scroller) return;
		const observer = new ResizeObserver(reveal);
		observer.observe(scroller);
		return () => observer.disconnect();
	}, [revealElementId, revealHorizontalPadding]);

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
				aria-live={ariaLive}
				className={cn('overflow-x-auto', scrollerClassName)}
				data-overflow-scroller=""
				id={id}
				onKeyDown={onKeyDown}
				ref={scrollerRef}
				role={role}>
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
					'pointer-events-none absolute inset-y-0 left-0 z-30 flex w-7 items-start border-l border-border bg-gradient-to-r to-transparent pl-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-data-[overflow-start=true]:opacity-100',
					fadeFrom[surface],
				)}
				style={{ left: startCueInset }}>
				<ChevronLeft className="sticky top-[50dvh] h-4 w-4 drop-shadow-sm" />
			</span>
			<span
				aria-hidden="true"
				className={cn(
					'pointer-events-none absolute inset-y-0 right-0 z-30 flex w-7 items-start justify-end border-r border-border bg-gradient-to-l to-transparent pr-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-data-[overflow-end=true]:opacity-100',
					fadeFrom[surface],
				)}>
				<ChevronRight className="sticky top-[50dvh] h-4 w-4 drop-shadow-sm" />
			</span>
			{showTopCue ? (
				<span
					aria-hidden="true"
					className={cn(
						'pointer-events-none absolute inset-x-0 top-0 z-30 flex h-7 items-start justify-center border-t border-border bg-gradient-to-b to-transparent pt-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-data-[overflow-up=true]:opacity-100',
						fadeFrom[surface],
					)}>
					<ChevronUp className="h-4 w-4 drop-shadow-sm" />
				</span>
			) : null}
			{/* The bottom cue is always safe. A top cue is opt-in because a `max-h-*` table can pin a
			    `sticky top-0` header that a `z-30` fade would paint over; plain lists opt in above.
			    The bottom edge has no pinned content, and without a cue the only
			    signal that ~370 more rows exist is the row the cap happens to slice through: Feature
			    Status showed 448px of a 10,042px table with its eleventh row cut horizontally
			    through the glyphs. */}
			<span
				aria-hidden="true"
				className={cn(
					'pointer-events-none absolute inset-x-0 bottom-0 z-30 flex h-7 items-end justify-center border-b border-border bg-gradient-to-t to-transparent pb-0.5 text-muted-foreground opacity-0 transition-opacity duration-200 group-data-[overflow-down=true]:opacity-100',
					fadeFrom[surface],
				)}>
				{bottomCueLabel ? (
					<span className="mb-0.5 inline-flex items-center gap-1 rounded-t-md border border-b-0 border-border bg-card px-2 py-1 text-xs font-medium text-foreground shadow-sm">
						{bottomCueLabel}
						<ChevronDown className="h-4 w-4 drop-shadow-sm" />
					</span>
				) : (
					<ChevronDown className="h-4 w-4 drop-shadow-sm" />
				)}
			</span>
		</div>
	);
}

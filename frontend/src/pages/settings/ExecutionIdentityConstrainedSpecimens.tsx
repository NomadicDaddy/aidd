/**
 * The constrained-width half of the badge lab.
 *
 * Extracted from the page because the page is a specimen sheet — a list of sections — while this
 * is a measuring instrument with its own layout effect, observer and verdict. Keeping them in one
 * file put the only logic on the page behind three hundred lines of markup.
 */
import { Fragment, useLayoutEffect, useRef, useState } from 'react';

import {
	type ExecutionIdentity,
	ExecutionIdentityBadges,
} from '../../components/shared/ExecutionIdentityBadges.tsx';
import { CardHeader } from '../../components/ui/card.tsx';
import { cn } from '../../lib/cn.ts';
import { toneText } from '../../lib/tones.ts';
import { microLabelClass } from '../../lib/typography.ts';
const constrainedWidths = [
	// `shrink-0` is load-bearing: these are flex items, so without it the wider budgets collapse to
	// whatever the cell has left and render at an identical width — a constrained-width specimen
	// that is not actually constrained to the width it is labelled with.
	//
	// 179px, not 160px: 179 is the Runs MODEL column the docstring above names as the real budget,
	// and a sheet without it never exercises it. 96px is the tight step — at 160px the Production
	// badge measures 153px and renders identically to its own 240px row, so two of three rows would
	// show the same outcome.
	{ className: 'w-[240px] shrink-0', label: '240px' },
	{ className: 'w-[179px] shrink-0', label: '179px' },
	{ className: 'w-[120px] shrink-0', label: '120px' },
	{ className: 'w-[96px] shrink-0', label: '96px' },
] as const;

export function ConstrainedSpecimens({
	identity,
	label,
}: {
	identity: ExecutionIdentity;
	label: string;
}) {
	return (
		<div className="min-w-0">
			<CardHeader className="mb-2" headingLevel={3} level="subsection" title={label} />
			{/* Side by side, not stacked. Stacked, the 240px, 179px and 120px results sat 768px
			    apart down a 948px row on the one section whose entire job is comparing them; the
			    budgets together total 635px and wrap as a set when the cell is narrower. */}
			<div
				aria-label={`${label} constrained-width comparison`}
				className="flex flex-wrap items-start gap-x-4 gap-y-5"
				role="group">
				{constrainedWidths.map((width, index) => (
					<Fragment key={width.label}>
						<MeasuredSpecimen identity={identity} width={width} />
						{index === 1 ? <span className="hidden basis-full max-sm:block" /> : null}
					</Fragment>
				))}
			</div>
		</div>
	);
}

/**
 * Does anything inside this specimen overflow the box it was given?
 *
 * The question the lab exists to answer is whether the identity is *legible* at a budget, and the
 * segment spans carry `truncate`, so an overflowing one ellipsizes while every ancestor stays
 * dutifully in bounds. Comparing the wrapper's own width against the budget therefore asked a
 * question that could only ever be answered "no": the wrapper is `max-w-full`, so the budget box
 * has already clamped it before the tape measure arrives.
 *
 * Inline boxes report `scrollWidth === clientWidth === 0`, which is why walking every descendant is
 * safe rather than noisy: only the `inline-block` truncating segments have a real content box to
 * compare. The 1px slack absorbs sub-pixel rounding in the integer geometry properties; real
 * ellipsized text overflows by far more than that.
 */
function overflowsItsBox(root: HTMLElement): boolean {
	if (root.scrollWidth - root.clientWidth > 1) return true;
	for (const element of root.querySelectorAll<HTMLElement>('*')) {
		if (element.scrollWidth - element.clientWidth > 1) return true;
	}
	return false;
}

function MeasuredSpecimen({
	identity,
	width,
}: {
	identity: ExecutionIdentity;
	width: (typeof constrainedWidths)[number];
}) {
	const badgeRef = useRef<HTMLSpanElement>(null);
	const [measurement, setMeasurement] = useState<{ clipped: boolean; width: number } | null>(
		null,
	);
	const renderedWidth = measurement?.width ?? null;
	const clipped = measurement?.clipped ?? false;

	useLayoutEffect(() => {
		const badge = badgeRef.current;
		if (!badge) return;
		const measure = () =>
			setMeasurement({
				clipped: overflowsItsBox(badge),
				width: Math.round(badge.getBoundingClientRect().width),
			});
		measure();
		const observer = new ResizeObserver(measure);
		observer.observe(badge);
		// The verdict depends on the *inner* segment widths, which move when a web font swaps in
		// without the wrapper ever changing size — so the ResizeObserver above would not fire.
		let live = true;
		void document.fonts?.ready.then(() => {
			if (live) measure();
		});
		return () => {
			live = false;
			observer.disconnect();
		};
	}, []);

	return (
		<div className={cn('min-w-0', width.className)}>
			<div
				className={cn(
					'mb-1 flex flex-wrap items-baseline gap-x-1.5 font-mono text-xs',
					clipped ? toneText.amber : 'text-muted-foreground',
				)}>
				{width.label} budget
				{renderedWidth === null ? '' : ` · renders at ${renderedWidth}px`}
				{renderedWidth === null ? null : (
					<span className={microLabelClass}>{clipped ? 'Clipped' : 'Fits'}</span>
				)}
			</div>
			<div className="min-w-0">
				<ExecutionIdentityBadges {...identity} paintedRef={badgeRef} variant="compact" />
			</div>
		</div>
	);
}

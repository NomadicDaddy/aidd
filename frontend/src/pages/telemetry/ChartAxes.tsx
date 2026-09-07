import type { ReactNode } from 'react';

import type { AxisTick } from './chartAxisScale.ts';

import { categoryLabelStride } from './chartAxisScale.ts';

/**
 * Axis furniture for the hand-drawn telemetry charts.
 *
 * Both charts are plain CSS bars rather than a charting library, so the axes are drawn here rather
 * than configured. The plot keeps ownership of its own height and bar geometry; this component only
 * adds the gutter, the gridlines and the category labels around it.
 *
 * `categories` must be in the same order as the bars, one entry per column, and the plot must lay
 * its columns out as `flex-1` siblings with a `gap-1` — the label row mirrors that geometry so the
 * ticks stay under their bars without measuring anything.
 */
export function ChartAxes({
	categories,
	children,
	ticks,
}: {
	categories: readonly string[];
	children: ReactNode;
	ticks: readonly AxisTick[];
}) {
	const stride = categoryLabelStride(categories.length);
	const lastIndex = categories.length - 1;
	return (
		// `mt-2`: the top tick is `-translate-y-1/2` against the plot's own top edge, so half of it
		// hangs above this grid. With the grid flush to the card's content box that half was
		// borrowing the card's padding, and the chart's highest number sat closer to the card
		// description above it than to the gridline it labels. Two units is one text-xs line's
		// worth of clearance, which is exactly what hangs out.
		<div className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
			{/* The gutter is a grid item with no content height of its own, so it takes the row's
			    height from the plot beside it and the percentage tick offsets resolve against the
			    same box the gridlines use. */}
			<div aria-hidden="true" className="relative w-10">
				{ticks.map((tick) => (
					<span
						className="absolute right-0 -translate-y-1/2 text-xs leading-none text-muted-foreground tabular-nums"
						key={`${tick.label}@${tick.offsetPct}`}
						style={{ top: `${tick.offsetPct}%` }}>
						{tick.label}
					</span>
				))}
			</div>
			<div className="relative">
				{/* `border-border` is the right weight for a card edge, which is a shape cue, and the
				    wrong one for a rule that carries a measurement: on the card surface it measured
				    1.23:1 in dark and 1.26:1 in light, so the only thing tying a bar's height to its
				    tick was effectively invisible. The muted token is the one the bar troughs on this
				    same page already use, so nothing new is introduced.

				    The zero line takes twice the strength. On the invocations chart it is the
				    baseline every bar stands on; on the diverging chart it is the axis the two arms
				    hinge on, and that one read as absent entirely. */}
				<div aria-hidden="true" className="pointer-events-none absolute inset-0">
					{ticks.map((tick) => (
						<span
							className={`absolute inset-x-0 border-t ${
								tick.label === '0'
									? 'border-muted-foreground/40'
									: 'border-muted-foreground/20'
							}`}
							key={`${tick.label}@${tick.offsetPct}`}
							style={{ top: `${tick.offsetPct}%` }}
						/>
					))}
				</div>
				{/* Above the gridlines by document order — no z-index needed. */}
				<div className="relative">{children}</div>
			</div>
			<div />
			{/* The label sits in a cell narrower than itself — 21 daily buckets give each column
			    20px to hold a 27-35px date — so it is positioned out of the flow rather than laid
			    out in it. In the flow the cell clipped it ('Aug 1' rendered as 'Aug'); out of it
			    the text spills over the neighbours the stride leaves empty, which is exactly the
			    room it needs. The cells stay `flex-1` so the anchors still track the bars, and the
			    row carries the height the absolute children no longer contribute — `h-3` is exactly
			    one `text-xs`/`leading-none` line, and the gap above the plot is a margin so the
			    labels are not offset inside it. */}
			<div aria-hidden="true" className="mt-1.5 flex h-3 gap-1">
				{categories.map((label, index) => {
					// Anchored to the newest bucket rather than the oldest: the right-hand end is
					// what the window is centered on, so it always keeps its label.
					const labelled = (lastIndex - index) % stride === 0;
					// The ends spill inward only: at the edges of the plot there is no neighbour
					// to spill over, and the gutter and the card are what would clip them.
					const anchor =
						index === 0
							? 'left-0'
							: index === lastIndex
								? 'right-0'
								: 'left-1/2 -translate-x-1/2';
					return (
						<span className="relative min-w-0 flex-1" key={`${label}-${index}`}>
							{labelled ? (
								<span
									className={`absolute top-0 text-xs leading-none whitespace-nowrap text-muted-foreground ${anchor}`}>
									{label}
								</span>
							) : null}
						</span>
					);
				})}
			</div>
		</div>
	);
}

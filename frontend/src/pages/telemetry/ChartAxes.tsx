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
		<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-2">
			{/* The gutter is a grid item with no content height of its own, so it takes the row's
			    height from the plot beside it and the percentage tick offsets resolve against the
			    same box the gridlines use. */}
			<div className="relative w-10">
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
				<div className="pointer-events-none absolute inset-0">
					{ticks.map((tick) => (
						<span
							className="absolute inset-x-0 border-t border-border"
							key={`${tick.label}@${tick.offsetPct}`}
							style={{ top: `${tick.offsetPct}%` }}
						/>
					))}
				</div>
				{/* Above the gridlines by document order — no z-index needed. */}
				<div className="relative">{children}</div>
			</div>
			<div />
			<div className="flex gap-1 overflow-hidden pt-1.5">
				{categories.map((label, index) => {
					// Anchored to the newest bucket rather than the oldest: the right-hand end is
					// what the window is centered on, so it always keeps its label.
					const labelled = (lastIndex - index) % stride === 0;
					return (
						<span
							className={`min-w-0 flex-1 text-xs leading-none whitespace-nowrap text-muted-foreground ${
								index === 0
									? 'text-left'
									: index === lastIndex
										? 'text-right'
										: 'text-center'
							}`}
							key={`${label}-${index}`}>
							{labelled ? label : ''}
						</span>
					);
				})}
			</div>
		</div>
	);
}

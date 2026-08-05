import { formatCompactNumber } from '../../lib/formatters.ts';

/**
 * Scale arithmetic for the hand-drawn telemetry charts.
 *
 * Kept apart from `ChartAxes.tsx` so that file exports only its component: these are plain
 * functions the charts call while building props, and co-exporting them would cost the chart
 * module its fast refresh.
 */

export interface AxisTick {
	/** Rendered text. Value ticks are compact numbers; the zero tick is plain `0`. */
	label: string;
	/** Distance from the top of the plot, in percent, so ticks land on their gridlines. */
	offsetPct: number;
}

// The charts sit in the narrow column of the telemetry grid and go full width at 768x1024. Six
// labels is what fits at the narrow end without ticks colliding, so denser windows (24 hourly or
// 30 daily buckets) label every Nth column and leave the rest to the bar tooltips and the
// screen-reader table that already carries every bucket.
const MAX_CATEGORY_LABELS = 6;

/** Label every Nth column so at most `MAX_CATEGORY_LABELS` ticks are drawn. */
export function categoryLabelStride(count: number): number {
	return Math.max(1, Math.ceil(count / MAX_CATEGORY_LABELS));
}

/** Top, midpoint and baseline ticks for a chart whose bars all grow in one direction. */
export function singleSidedTicks(max: number): AxisTick[] {
	return [
		{ label: formatCompactNumber(max), offsetPct: 0 },
		{ label: formatCompactNumber(max / 2), offsetPct: 50 },
		{ label: '0', offsetPct: 100 },
	];
}

/**
 * Ticks for a chart whose bars diverge from a shared center baseline. Both arms are drawn against
 * the same symmetric scale, so the labels are magnitudes — the legend names which arm is which.
 */
export function divergingTicks(max: number): AxisTick[] {
	const half = formatCompactNumber(max / 2);
	const full = formatCompactNumber(max);
	return [
		{ label: full, offsetPct: 0 },
		{ label: half, offsetPct: 25 },
		{ label: '0', offsetPct: 50 },
		{ label: half, offsetPct: 75 },
		{ label: full, offsetPct: 100 },
	];
}

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

export interface AxisScaleOptions {
	/** Set on count axes, where a fractional tick is not a value the data can take. */
	integral?: boolean;
}

const NICE_MANTISSAS = [1, 2, 2.5, 5, 10];

/**
 * The smallest "nice" number — 1, 2, 2.5 or 5 times a power of ten — that is at least `value`.
 *
 * Ticks used to be the raw data max and half of it, so a whole-number invocation axis was labelled
 * `20.5`. Rounding to a step first means the label is always a number a reader would have chosen.
 */
export function niceAxisStep(value: number, options: AxisScaleOptions = {}): number {
	if (!Number.isFinite(value) || value <= 0) return options.integral === true ? 1 : 0;
	const exponent = Math.floor(Math.log10(value));
	const magnitude = 10 ** exponent;
	const mantissa = value / magnitude;
	const chosen = NICE_MANTISSAS.find((candidate) => mantissa <= candidate + 1e-9) ?? 10;
	const step = chosen * magnitude;
	return options.integral === true ? Math.max(1, Math.ceil(step)) : step;
}

/**
 * The axis domain: twice a nice step, so the midpoint tick is itself a nice number.
 *
 * Charts scale their bars against this same value. Rounding the labels without rounding the domain
 * would just move the lie from the label to the bar height.
 *
 * Idempotent — `niceAxisMax(niceAxisMax(x)) === niceAxisMax(x)` — so a chart may hand an
 * already-rounded domain to the tick builders without the scale creeping upward.
 */
export function niceAxisMax(max: number, options: AxisScaleOptions = {}): number {
	return 2 * niceAxisStep(max / 2, options);
}

/** Top, midpoint and baseline ticks for a chart whose bars all grow in one direction. */
export function singleSidedTicks(max: number, options: AxisScaleOptions = {}): AxisTick[] {
	const domain = niceAxisMax(max, options);
	return [
		{ label: formatCompactNumber(domain), offsetPct: 0 },
		{ label: formatCompactNumber(domain / 2), offsetPct: 50 },
		{ label: '0', offsetPct: 100 },
	];
}

/**
 * Ticks for a chart whose bars diverge from a center baseline, one scale per arm.
 *
 * A single symmetric scale anchored on the larger arm is what emptied the lower half of the token
 * chart: against `352.9M` in and `1.5M` out, every downward bar collapsed to its 2px minimum and
 * no fuchsia was visible anywhere in the plot. Scaling each arm to its own domain costs the
 * cross-arm magnitude comparison, so the two domains are labelled independently and the reader
 * takes the magnitude from the axis rather than from the bar.
 */
export function divergingTicks(
	up: number,
	down: number,
	options: AxisScaleOptions = {},
): AxisTick[] {
	const upDomain = niceAxisMax(up, options);
	const downDomain = niceAxisMax(down, options);
	return [
		{ label: formatCompactNumber(upDomain), offsetPct: 0 },
		{ label: formatCompactNumber(upDomain / 2), offsetPct: 25 },
		{ label: '0', offsetPct: 50 },
		{ label: formatCompactNumber(downDomain / 2), offsetPct: 75 },
		{ label: formatCompactNumber(downDomain), offsetPct: 100 },
	];
}

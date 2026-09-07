/**
 * Nearest-rank percentile: the smallest observed sample at or above the requested percentile.
 *
 * Core Web Vitals are graded at p75 because a mean hides the slow tail an operator actually feels —
 * a route whose LCP averages 1.8s can still be over budget for a quarter of its loads. Nearest rank
 * (rank = ceil(p * n), 1-based) is used rather than an interpolating percentile because it returns a
 * real measurement: the value, and its recorded rating, belong to a load that happened.
 */

/** The percentile Core Web Vitals compliance is graded at. */
export const VITALS_PERCENTILE = 0.75;

/**
 * Zero-based index of the nearest-rank percentile within an ascending-sorted sample array.
 * @param sampleCount How many samples were observed.
 * @param percentile Fraction in (0, 1].
 * @returns The index, or -1 when there are no samples — a percentile over nothing is undefined,
 *   and reporting 0 there would read as "comfortably within threshold".
 */
export function nearestRankIndex(sampleCount: number, percentile: number): number {
	if (!Number.isFinite(sampleCount) || sampleCount <= 0) return -1;
	const rank = Math.ceil(percentile * sampleCount);
	// A percentile at or below 1/n still names the first sample; clamp rather than return -1.
	return Math.min(Math.max(rank, 1), sampleCount) - 1;
}

/**
 * Nearest-rank percentile of a sample set.
 * @param values Samples in any order; copied before sorting.
 * @param percentile Fraction in (0, 1].
 * @returns The percentile value, or null when there are no samples.
 */
export function nearestRankPercentile(
	values: readonly number[],
	percentile: number,
): null | number {
	const index = nearestRankIndex(values.length, percentile);
	if (index < 0) return null;
	const sorted = [...values].sort((a, b) => a - b);
	return sorted[index] ?? null;
}

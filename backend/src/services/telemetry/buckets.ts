/**
 * Bucket-key generation for telemetry time series.
 *
 * Both series builders accumulate into a `Map` keyed by bucket start, which means a bucket with no
 * rows never becomes a key and never reaches the chart. Rendering the survivors at equal width then
 * makes unequal gaps look identical: a 24h window drew six bars labelled 4 PM, 5 PM, 8 PM, 9 PM,
 * 1 AM, 2 AM at even spacing, and a 7d window drew seven bars over an eight-day span while the
 * chart directly beneath it — same window, same "per day" badge — drew eight columns on dates that
 * did not line up. Two charts over one window disagreed about how many days they covered.
 *
 * Filling the window is what makes column position map linearly to time. Both callers derive their
 * keys from here so they cannot drift apart again.
 */

/**
 * Every bucket start in the window, ascending, so a series can emit an explicit zero for buckets
 * that carry no rows.
 *
 * With `windowMs` the range runs from the bucket containing `now - windowMs` to the bucket
 * containing `now`, which is the same range the SQL filter selects. Without it — the all-time case,
 * where there is no start to count back from — the range is anchored on the earliest observed
 * bucket instead, so the span stays bounded by the data that actually exists.
 *
 * @param input.bucketMs Bucket width in milliseconds; hourly or daily for both callers.
 * @param input.now Wall-clock reference the window counts back from.
 * @param input.observed Bucket keys the series actually accumulated rows into.
 * @param input.windowMs Selected window; omitted for an all-time query.
 * @param input The window to enumerate.
 * @returns Ascending bucket starts, one bucket width apart, covering the whole window.
 */
export function bucketKeysForWindow(input: {
	bucketMs: number;
	now: number;
	observed: Iterable<number>;
	windowMs?: number | undefined;
}): number[] {
	const { bucketMs, now, observed, windowMs } = input;
	if (bucketMs <= 0) return [];

	const floorToBucket = (timestamp: number): number =>
		Math.floor(timestamp / bucketMs) * bucketMs;
	const observedKeys = [...observed];
	const end = floorToBucket(now);

	let start: number;
	if (windowMs !== undefined) {
		start = floorToBucket(now - windowMs);
	} else {
		if (observedKeys.length === 0) return [];
		start = Math.min(...observedKeys);
	}

	// A row can carry a timestamp fractionally outside the requested window — clock skew on the
	// writer, or an all-time query whose earliest row post-dates nothing. Widening to cover every
	// observed key keeps a real data point from being filled over and dropped.
	for (const key of observedKeys) if (key < start) start = key;
	const last = Math.max(end, ...(observedKeys.length > 0 ? observedKeys : [end]));

	const keys: number[] = [];
	for (let key = start; key <= last; key += bucketMs) keys.push(key);
	return keys;
}

/**
 * The URL-backed filter parameters shared by the Skills and Recipes catalogs.
 *
 * Both pages derive their filter state directly from the query string (the same contract as the
 * Features tab's `featureQ`/`featureStatus` parameters), so a filtered view can be bookmarked,
 * shared, restored, and traversed with browser history. Empty and default values are removed from
 * the URL rather than written as `q=` or `category=all`, and writes preserve every unrelated
 * parameter already present.
 */

/** The text filter, straight from the URL: absent means the empty (unfiltered) query. */
export function readCatalogQuery(params: URLSearchParams): string {
	return params.get('q') ?? '';
}

/**
 * Writes a set of catalog filter values onto a copy of the current params.
 *
 * Returns a new `URLSearchParams`; the input is never mutated, because callers pass it to
 * `setSearchParams` from inside the updater form — where the previous value must stay intact for
 * the router to diff against — and tests assert preservation against the original.
 */
export function catalogFilterSearchParams(
	current: URLSearchParams,
	updates: Readonly<Record<string, string>>,
): URLSearchParams {
	const next = new URLSearchParams(current);
	for (const [key, value] of Object.entries(updates)) {
		if (value === '') next.delete(key);
		else next.set(key, value);
	}
	return next;
}

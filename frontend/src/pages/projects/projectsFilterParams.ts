import { MATURITY_FILTERS, PHASES, PROFILE_BUCKETS } from './projects-list-shared.ts';
import { SORT_DIRS, SORT_KEYS } from './projects-list-sort.ts';

export const PROJECT_FILTER_KEYS = [
	'q',
	'root',
	'milestone',
	'profile',
	'phase',
	'maturity',
	'sort',
	'dir',
] as const;

export type ProjectFilterKey = (typeof PROJECT_FILTER_KEYS)[number];

/**
 * The filter keys whose values come from a fixed set, and the set each one draws from.
 *
 * `q` and `milestone` are deliberately absent: a search string is free text, and a milestone name is
 * whatever the projects on disk happen to declare, so neither has an allowlist to fall outside of.
 * `root` is absent for a different reason and handled separately below.
 *
 * `all` is not exempted. It is the value the UI itself never writes — `updateParam` deletes a key
 * rather than setting it to `all` — so a hand-typed `?profile=all` is a filter the surface cannot
 * show as active either, and leaving it in place would reproduce the same disagreement by a milder
 * route.
 */
/** The value every filter control uses for "no filter", and the one the URL never carries. */
const NO_FILTER = 'all';

const ALLOWLISTS: readonly (readonly [ProjectFilterKey, ReadonlySet<string>])[] = [
	['dir', SORT_DIRS],
	['maturity', MATURITY_FILTERS],
	['phase', PHASES],
	['profile', PROFILE_BUCKETS],
	['sort', SORT_KEYS],
];

/** Query keys the toolbar no longer reads; stripped so old bookmarks do not leave a dead param. */
const RETIRED_FILTER_KEYS = ['sync'] as const;

/**
 * The filter keys this URL carries that nothing downstream can act on.
 *
 * The read path in `useProjectsPageFilters` already collapses each of these to `all`, so an
 * unrecognized value filters nothing — but it stays in the address bar, it is written to the prefs
 * store, and `hasFilters` is computed from the collapsed values, so the Reset control that would
 * clear it reports there is nothing to clear. One derivation, called at both boundaries: the URL
 * pass removes the value, and the persistence pass declines to store what that pass is about to
 * remove.
 *
 * `rootPaths` is `null` when the project list has not loaded yet. The root allowlist is data rather
 * than a constant, and an empty set makes a perfectly good `?root=` look unrecognized when it is
 * only early — so while it is unknown, `root` is left exactly as it is.
 */
export function unrecognizedFilterKeys(
	params: URLSearchParams,
	rootPaths: null | ReadonlySet<string>,
): ProjectFilterKey[] {
	const keys: ProjectFilterKey[] = [];
	for (const [key, allowed] of ALLOWLISTS) {
		const value = params.get(key);
		if (value === null) continue;
		// Checked ahead of the set rather than inside it: MATURITY_FILTERS contains 'all' as that
		// control's own no-filter option, so the set alone would let ?maturity=all through.
		if (value === NO_FILTER || !allowed.has(value)) keys.push(key);
	}
	const root = params.get('root');
	if (rootPaths !== null && root !== null && (root === NO_FILTER || !rootPaths.has(root)))
		keys.push('root');
	return keys;
}

/** The params with every unrecognized filter dropped, or `null` when there was nothing to drop. */
export function normalizeFilterParams(
	params: URLSearchParams,
	rootPaths: null | ReadonlySet<string>,
): null | URLSearchParams {
	const unrecognized = unrecognizedFilterKeys(params, rootPaths);
	const retired = RETIRED_FILTER_KEYS.filter((key) => params.has(key));
	if (unrecognized.length === 0 && retired.length === 0) return null;
	const next = new URLSearchParams(params);
	for (const key of unrecognized) next.delete(key);
	for (const key of retired) next.delete(key);
	return next;
}

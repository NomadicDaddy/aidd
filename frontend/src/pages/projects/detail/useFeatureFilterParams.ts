import { useSearchParams } from 'react-router';

import type { FeatureSortKey } from './features-list-sort.ts';

import {
	DEFAULT_FEATURE_SORT,
	DEFAULT_FEATURE_SORT_DIR,
	readFeatureSortDir,
	readFeatureSortKey,
} from './features-list-sort.ts';
import {
	FEATURE_FILTER_PARAMS,
	isKnownStatusFilter,
	withUnassignedMilestoneFilter,
} from './featuresUtils.ts';

/**
 * The Features tab's URL-backed view state: the five filter parameters, the ordering, and the
 * writers that change them.
 *
 * Split out of `useFeaturesTab` because this is the one part of that hook that touches nothing but
 * the query string and the page reset, and the tab hook had grown past what one file should hold.
 *
 * Every parameter carries the tab's `feature*` prefix, so a project-detail URL can hold this tab's
 * ordering and the Projects list's bare `sort`/`dir` at the same time without collision.
 *
 * @param resetPage Called before every *filter* write. A filter change can shrink the result set
 *   below the current page, and jumping to a page that no longer exists reads as an empty table.
 *   `toggleSort` deliberately does not call it — see below.
 */
export function useFeatureFilterParams(resetPage: () => void) {
	const [searchParams, setSearchParams] = useSearchParams();
	const sortKey = readFeatureSortKey(searchParams.get('featureSort'));
	const sortDir = readFeatureSortDir(searchParams.get('featureDir'));
	const query = searchParams.get('featureQ') ?? '';
	const rawStatusFilter = searchParams.get('featureStatus') ?? 'all';
	const statusFilter = isKnownStatusFilter(rawStatusFilter) ? rawStatusFilter : 'all';
	const priorityFilter = searchParams.get('featurePriority') ?? 'all';
	const milestoneFilter = searchParams.get('featureMilestone') ?? 'all';
	const sourceFilter = searchParams.get('featureSource') ?? 'all';
	const hasFilters =
		query.trim().length > 0 ||
		statusFilter !== 'all' ||
		priorityFilter !== 'all' ||
		milestoneFilter !== 'all' ||
		sourceFilter !== 'all';

	// Each of these reads the current params and writes a modified copy, so they take the
	// updater form rather than the `searchParams` this render closed over. Typing in the
	// metadata filter fires one call per keystroke, and keystrokes that land in the same
	// batch all read the same stale copy, so every character but the last was discarded.
	function updateFilterParam(key: string, value: string): void {
		resetPage();
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				if (value === '' || value === 'all') next.delete(key);
				else next.set(key, value);
				return next;
			},
			{ replace: true },
		);
	}

	function showUnassigned(): void {
		resetPage();
		setSearchParams((previous) => withUnassignedMilestoneFilter(previous), { replace: true });
	}

	// `FEATURE_FILTER_PARAMS` holds only the filters, so a reset clears what the filter bar shows
	// and leaves the ordering alone — the same call the Projects list makes when it re-applies a
	// non-default sort onto its freshly emptied params.
	function resetFilters(): void {
		resetPage();
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				for (const key of FEATURE_FILTER_PARAMS) next.delete(key);
				return next;
			},
			{ replace: true },
		);
	}

	/**
	 * Same contract as the Projects table: the active key flips direction, a new key selects itself
	 * ascending. Defaults are absent from the URL rather than spelled out, so the untouched tab
	 * still deep-links as a clean `?tab=features`.
	 *
	 * No `resetPage()`. A filter changes the *size* of the result set and can strand you past its
	 * end; a sort is a permutation — `filteredTotal` is unchanged, page 4 still exists, and snapping
	 * to page 1 would turn "order these differently" into a navigation nobody asked for.
	 */
	function toggleSort(key: FeatureSortKey): void {
		const nextDir = key === sortKey && sortDir === 'asc' ? 'desc' : 'asc';
		setSearchParams(
			(previous) => {
				const next = new URLSearchParams(previous);
				if (key === DEFAULT_FEATURE_SORT) next.delete('featureSort');
				else next.set('featureSort', key);
				if (nextDir === DEFAULT_FEATURE_SORT_DIR) next.delete('featureDir');
				else next.set('featureDir', nextDir);
				return next;
			},
			{ replace: true },
		);
	}

	return {
		hasFilters,
		milestoneFilter,
		priorityFilter,
		query,
		resetFilters,
		showUnassigned,
		sortDir,
		sortKey,
		sourceFilter,
		statusFilter,
		toggleSort,
		updateFilterParam,
	};
}

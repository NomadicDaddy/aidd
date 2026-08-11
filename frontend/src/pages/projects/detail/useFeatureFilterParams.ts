import { useSearchParams } from 'react-router';

import {
	FEATURE_FILTER_PARAMS,
	isKnownStatusFilter,
	withUnassignedMilestoneFilter,
} from './featuresUtils.ts';

/**
 * The Features tab's URL-backed filter state: the four parameters it reads and the three writers
 * that change them.
 *
 * Split out of `useFeaturesTab` because this is the one part of that hook that touches nothing but
 * the query string and the page reset, and the tab hook had grown past what one file should hold.
 *
 * @param resetPage Called before every filter write. A filter change can shrink the result set
 *   below the current page, and jumping to a page that no longer exists reads as an empty table.
 */
export function useFeatureFilterParams(resetPage: () => void) {
	const [searchParams, setSearchParams] = useSearchParams();
	const query = searchParams.get('featureQ') ?? '';
	const rawStatusFilter = searchParams.get('featureStatus') ?? 'all';
	const statusFilter = isKnownStatusFilter(rawStatusFilter) ? rawStatusFilter : 'all';
	const milestoneFilter = searchParams.get('featureMilestone') ?? 'all';
	const sourceFilter = searchParams.get('featureSource') ?? 'all';
	const hasFilters =
		query.trim().length > 0 ||
		statusFilter !== 'all' ||
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

	return {
		hasFilters,
		milestoneFilter,
		query,
		resetFilters,
		showUnassigned,
		sourceFilter,
		statusFilter,
		updateFilterParam,
	};
}

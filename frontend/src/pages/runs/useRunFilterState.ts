import { useState } from 'react';

import type { RunMode } from '../../api/types.ts';
import type {
	UnifiedEntryFilters,
	UnifiedKindFilter,
	UnifiedStatusFilter,
} from './unifiedEntries.ts';

import { filtersForLaunchedRun } from './runsUtils.ts';

/**
 * The five values the Runs toolbar owns, and the one object the feed reads them through.
 *
 * They were five `useState` calls, a literal assembled inline and a five-setter reset sitting in the
 * middle of `useRunsPage`, which is about selection, expansion, paging and the console. Adding the
 * KIND filter touched all three places; they belong together because every future filter will too.
 */
export function useRunFilterState(initialProject: string) {
	const [historyProject, setHistoryProject] = useState(initialProject);
	const [statusFilter, setStatusFilter] = useState<UnifiedStatusFilter>('all');
	const [kindFilter, setKindFilter] = useState<UnifiedKindFilter>('all');
	const [modeFilter, setModeFilter] = useState<'all' | RunMode>('all');
	const [query, setQuery] = useState('');

	const filters: UnifiedEntryFilters = {
		kind: kindFilter,
		mode: modeFilter,
		project: historyProject,
		query,
		status: statusFilter,
	};

	// Every filter widens when a run is launched, so the run cannot land outside the view it was
	// launched from. It moves all five together, which is the reason it lives beside them.
	function resetFiltersForLaunchedRun(): void {
		const visibility = filtersForLaunchedRun();
		setHistoryProject(visibility.historyProject);
		setStatusFilter(visibility.statusFilter);
		setKindFilter(visibility.kindFilter);
		setModeFilter(visibility.modeFilter);
		setQuery(visibility.query);
	}

	return {
		filters,
		historyProject,
		kindFilter,
		modeFilter,
		query,
		resetFiltersForLaunchedRun,
		setHistoryProject,
		setKindFilter,
		setModeFilter,
		setQuery,
		setStatusFilter,
		statusFilter,
	};
}

import { executionStatusPresentation } from 'aidd-shared/runs/outcome';
import { useState } from 'react';

import type { RunMode } from '../../api/types.ts';
import type { FilterRegister } from '../../lib/filterFields.ts';
import type { RunVisibilityFilters } from './runsUtils.ts';
import type {
	UnifiedEntryFilters,
	UnifiedInitiatorFilter,
	UnifiedKindFilter,
	UnifiedStatusFilter,
} from './unifiedEntries.ts';

import { filterRegister } from '../../lib/filterFields.ts';
import { humanizeEnum } from '../../lib/formatters.ts';
import { presentRunRecordInitiator } from './runInitiator.ts';
import { filtersForLaunchedRun } from './runsUtils.ts';

/**
 * The filtered-to-nothing register for the Runs feed.
 *
 * It lives beside the six values it describes because it is the same list read from the other end:
 * one names what is in force, the other clears it, and a filter added to the toolbar has to reach
 * both. Project is stored as a path, so the register takes the project list and says a name back.
 */
export function runFilterRegister(
	filters: UnifiedEntryFilters,
	projects: { name: string; path: string }[],
	onReset: () => void,
): FilterRegister | undefined {
	return filterRegister(onReset, [
		filters.query.trim() !== '' && { label: 'Search', value: filters.query.trim() },
		filters.status !== 'all' && {
			label: 'Status',
			value: executionStatusPresentation[filters.status].label,
		},
		filters.kind !== 'all' && { label: 'Kind', value: humanizeEnum(filters.kind) },
		filters.mode !== 'all' && { label: 'Mode', value: humanizeEnum(filters.mode) },
		filters.initiator !== 'all' && {
			label: 'Initiator',
			value:
				filters.initiator === 'unknown'
					? 'Unknown'
					: presentRunRecordInitiator({ initiator: filters.initiator }).label,
		},
		filters.project !== 'all' && {
			label: 'Project',
			value:
				projects.find((project) => project.path === filters.project)?.name ??
				filters.project,
		},
	]);
}

/**
 * The six values the Runs toolbar owns, and the one object the feed reads them through.
 *
 * They were five `useState` calls, a literal assembled inline and a five-setter reset sitting in the
 * middle of `useRunsPage`, which is about selection, expansion, paging and the console. Adding the
 * KIND filter touched all three places; they belong together because every future filter will too
 * — the INITIATOR filter was the next one, and it moved only this file.
 */
export function useRunFilterState(initialProject: string) {
	const [historyProject, setHistoryProject] = useState(initialProject);
	const [statusFilter, setStatusFilter] = useState<UnifiedStatusFilter>('all');
	const [kindFilter, setKindFilter] = useState<UnifiedKindFilter>('all');
	const [modeFilter, setModeFilter] = useState<'all' | RunMode>('all');
	const [initiatorFilter, setInitiatorFilter] = useState<UnifiedInitiatorFilter>('all');
	const [query, setQuery] = useState('');

	const filters: UnifiedEntryFilters = {
		initiator: initiatorFilter,
		kind: kindFilter,
		mode: modeFilter,
		project: historyProject,
		query,
		status: statusFilter,
	};

	function applyFilters(visibility: RunVisibilityFilters): void {
		setHistoryProject(visibility.historyProject);
		setStatusFilter(visibility.statusFilter);
		setKindFilter(visibility.kindFilter);
		setModeFilter(visibility.modeFilter);
		setInitiatorFilter(visibility.initiatorFilter);
		setQuery(visibility.query);
	}

	return {
		// Reset and launch-widening land on the same values, but they are not the same intent: Reset
		// undoes what the operator typed, and a launch guarantees the new run is visible. They share
		// one applier so a filter added to the toolbar cannot be wired into one and forgotten by the
		// other, which an inline Reset handler in RunsPage, a screen away from the state, could not.
		clearFilters: () => applyFilters(filtersForLaunchedRun()),
		filters,
		historyProject,
		initiatorFilter,
		kindFilter,
		modeFilter,
		query,
		resetFiltersForLaunchedRun: () => applyFilters(filtersForLaunchedRun()),
		setHistoryProject,
		setInitiatorFilter,
		setKindFilter,
		setModeFilter,
		setQuery,
		setStatusFilter,
		statusFilter,
	};
}

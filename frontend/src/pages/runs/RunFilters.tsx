import type { RunMode } from '../../api/types.ts';
import type { UnifiedStatusFilter } from './unifiedEntries.ts';

import {
	FilterSearch,
	FilterSelect,
	FilterToolbar,
} from '../../components/shared/FilterToolbar.tsx';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';

const STATUS_OPTIONS = [
	{ label: 'All statuses', value: 'all' },
	{ label: 'Running', value: 'running' },
	{ label: 'Queued', value: 'queued' },
	{ label: 'Completed', value: 'completed' },
	{ label: 'Completed w/ failures', value: 'completed_with_failures' },
	{ label: 'Failed', value: 'failed' },
	{ label: 'Stopped', value: 'stopped' },
	{ label: 'Killed', value: 'killed' },
];

const MODE_OPTIONS = [
	{ label: 'All modes', value: 'all' },
	{ label: 'Coding', value: 'coding' },
	{ label: 'Audit', value: 'audit' },
	{ label: 'Director', value: 'director' },
	{ label: 'Directive', value: 'directive' },
	{ label: 'Interview', value: 'interview' },
	{ label: 'Todo', value: 'todo' },
	{ label: 'Triumvirate', value: 'triumvirate' },
	{ label: 'Validate', value: 'validate' },
];

export function RunFilters({
	filteredCount,
	historyProject,
	modeFilter,
	onClear,
	onHistoryProjectChange,
	onModeFilterChange,
	onQueryChange,
	onStatusFilterChange,
	projects,
	query,
	statusFilter,
	totalCount,
}: {
	filteredCount: number;
	historyProject: string;
	modeFilter: 'all' | RunMode;
	onClear: () => void;
	onHistoryProjectChange: (value: string) => void;
	onModeFilterChange: (value: 'all' | RunMode) => void;
	onQueryChange: (value: string) => void;
	onStatusFilterChange: (value: UnifiedStatusFilter) => void;
	projects: { id: string; name: string; path: string }[];
	query: string;
	statusFilter: UnifiedStatusFilter;
	totalCount: number;
}) {
	return (
		// This row was four controls on four lines. Each select carried `min-w-*` and inherited a
		// `w-full` from the shared select class that `cn()` cannot merge away — with `flex-basis:
		// auto` the width won, every select resolved to the full 1278px, and a wrap-flex toolbar
		// became a stack. It is a grid of labelled fields now, in the house order.
		<FilterToolbar
			columns="sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1.5fr]"
			filtered={filteredCount}
			hasFilters={
				query.trim() !== '' ||
				statusFilter !== 'all' ||
				modeFilter !== 'all' ||
				historyProject !== 'all'
			}
			noun="runs"
			onReset={() => {
				traceDataMovement({
					category: 'event',
					layer: 'ui',
					operation: 'runs.filter.clear',
					source: 'RunsPage',
				});
				onClear();
			}}
			total={totalCount}>
			<FilterSearch
				ariaLabel="Search runs"
				onChange={onQueryChange}
				placeholder="Filter runs and pipelines"
				shortcut
				value={query}
			/>
			<FilterSelect
				label="Status"
				onChange={(value) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.status',
						source: 'RunsPage',
						summary: { status: value },
					});
					onStatusFilterChange(value as UnifiedStatusFilter);
				}}
				options={STATUS_OPTIONS}
				value={statusFilter}
			/>
			<FilterSelect
				label="Mode"
				onChange={(value) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.mode',
						source: 'RunsPage',
						summary: { mode: value },
					});
					onModeFilterChange(value as 'all' | RunMode);
				}}
				options={MODE_OPTIONS}
				value={modeFilter}
			/>
			<FilterSelect
				label="Project"
				onChange={(value) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.project',
						source: 'RunsPage',
						summary: { filtered: value !== 'all' },
					});
					onHistoryProjectChange(value);
				}}
				options={[
					{ label: 'All projects', value: 'all' },
					...projects.map((project) => ({ label: project.name, value: project.path })),
				]}
				value={historyProject}
			/>
		</FilterToolbar>
	);
}

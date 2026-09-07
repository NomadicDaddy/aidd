import { executionStatusPresentation } from 'aidd-shared/runs/outcome';

import type { RunMode } from '../../api/types.ts';
import type {
	UnifiedInitiatorFilter,
	UnifiedKindFilter,
	UnifiedStatusFilter,
} from './unifiedEntries.ts';

import { FilterSearch, FilterSelect } from '../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../components/shared/FilterToolbar.tsx';
import { traceDataMovement } from '../../lib/dataMovementTrace.ts';
import { countActiveFilters } from '../../lib/filterFields.ts';
import { projectFilterOptions } from './projectFilterOptions.ts';

const STATUS_OPTIONS = [
	{ label: 'All statuses', value: 'all' },
	...(
		[
			'running',
			'queued',
			'completed',
			'completed_with_failures',
			'failed',
			'stopped',
			'killed',
		] as const
	).map((value) => ({ label: executionStatusPresentation[value].label, value })),
];

// The KIND column's own vocabulary. The feed merges three kinds of execution under one heading and
// the toolbar could filter by everything except the axis that merge introduced, so the only way to
// read a project's ad-hoc runs apart from its recipe sessions was to type into the search box and
// hope the word did not also appear in a project path.
const KIND_OPTIONS = [
	{ label: 'All kinds', value: 'all' },
	{ label: 'Runs', value: 'run' },
	{ label: 'Pipelines', value: 'pipeline' },
	{ label: 'Skills', value: 'skill' },
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

// The one axis `source` cannot answer. 'Unknown' is offered rather than hidden: it is what a run
// with no recorded initiator carries, and folding those into either recorded value would answer
// the question by inventing the answer.
const INITIATOR_OPTIONS = [
	{ label: 'Any initiator', value: 'all' },
	{ label: 'Operator', value: 'operator' },
	{ label: 'Automatic', value: 'automatic' },
	{ label: 'Unknown', value: 'unknown' },
];

export function RunFilters({
	displayedCount,
	filteredCount,
	historyProject,
	initiatorFilter,
	kindFilter,
	modeFilter,
	onClear,
	onHistoryProjectChange,
	onInitiatorFilterChange,
	onKindFilterChange,
	onModeFilterChange,
	onQueryChange,
	onStatusFilterChange,
	projects,
	query,
	statusFilter,
	totalCount,
}: {
	displayedCount: number;
	filteredCount: number;
	historyProject: string;
	initiatorFilter: UnifiedInitiatorFilter;
	kindFilter: UnifiedKindFilter;
	modeFilter: 'all' | RunMode;
	onClear: () => void;
	onHistoryProjectChange: (value: string) => void;
	onInitiatorFilterChange: (value: UnifiedInitiatorFilter) => void;
	onKindFilterChange: (value: UnifiedKindFilter) => void;
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
			activeFilterCount={countActiveFilters(
				statusFilter !== 'all',
				kindFilter !== 'all',
				modeFilter !== 'all',
				initiatorFilter !== 'all',
				historyProject !== 'all',
			)}
			columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_repeat(4,minmax(7.5rem,1fr))_1.5fr]"
			filtered={filteredCount}
			hasFilters={
				query.trim() !== '' ||
				statusFilter !== 'all' ||
				kindFilter !== 'all' ||
				modeFilter !== 'all' ||
				initiatorFilter !== 'all' ||
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
			primaryControlCount={1}
			readoutLabel="Matching"
			readoutSuffix={
				displayedCount < filteredCount ? ` · ${displayedCount} shown` : undefined
			}
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
				label="Kind"
				onChange={(value) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.kind',
						source: 'RunsPage',
						summary: { kind: value },
					});
					onKindFilterChange(value as UnifiedKindFilter);
				}}
				options={KIND_OPTIONS}
				value={kindFilter}
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
				label="Initiator"
				onChange={(value) => {
					traceDataMovement({
						category: 'event',
						layer: 'ui',
						operation: 'runs.filter.initiator',
						source: 'RunsPage',
						summary: { initiator: value },
					});
					onInitiatorFilterChange(value as UnifiedInitiatorFilter);
				}}
				options={INITIATOR_OPTIONS}
				value={initiatorFilter}
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
				options={projectFilterOptions(projects, historyProject)}
				value={historyProject}
			/>
			{/* Kind before Mode, because Mode narrows within a kind: it is a run-only concept, so
			    picking one already hides every pipeline and skill session. */}
		</FilterToolbar>
	);
}

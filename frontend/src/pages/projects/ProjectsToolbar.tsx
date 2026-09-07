import type { ReactNode } from 'react';

import type { ProjectPhase, ProjectSyncState } from '../../api/types.ts';

import { FilterSearch, FilterSelect } from '../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../components/shared/FilterToolbar.tsx';
import { countActiveFilters } from '../../lib/filterFields.ts';
import { formGridMeasureClass } from '../../lib/formStyles.ts';
import { type MaturityFilter, maturityFilterLabels } from './projects-list-shared.ts';

const MATURITY_OPTIONS: MaturityFilter[] = [
	'all',
	'incomplete',
	'specified',
	'structured',
	'mapped',
	'planned',
	'engaged',
	'audited',
	'shipped',
	'complete',
];

export function ProjectsToolbar({
	actions,
	allProjectsCount,
	hasFilters,
	maturityFilter,
	milestoneFilter,
	milestoneOptions,
	onResetFilters,
	onUpdateParam,
	phaseFilter,
	query,
	rootFilter,
	rootOptions,
	sortedCount,
	syncFilter,
}: {
	actions?: ReactNode;
	allProjectsCount: number;
	hasFilters: boolean;
	maturityFilter: MaturityFilter;
	milestoneFilter: string;
	milestoneOptions: string[];
	onResetFilters: () => void;
	onUpdateParam: (key: string, value: null | string) => void;
	phaseFilter: 'all' | ProjectPhase;
	query: string;
	rootFilter: string;
	rootOptions: { label: string; path: string }[];
	sortedCount: number;
	syncFilter: 'all' | ProjectSyncState;
}) {
	return (
		<FilterToolbar
			actionRole="display"
			actions={actions}
			activeFilterCount={countActiveFilters(
				syncFilter !== 'all',
				phaseFilter !== 'all',
				maturityFilter !== 'all',
				rootFilter !== 'all',
				milestoneFilter !== 'all',
			)}
			columns={`@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_repeat(5,minmax(0,1fr))] ${formGridMeasureClass}`}
			filtered={sortedCount}
			hasFilters={hasFilters}
			noun="projects"
			onReset={onResetFilters}
			primaryControlCount={1}
			readoutSuffix={
				rootFilter === 'all'
					? null
					: ` in ${rootOptions.find((root) => root.path === rootFilter)?.label ?? 'selected root'}`
			}
			total={allProjectsCount}>
			<FilterSearch
				onChange={(value) => onUpdateParam('q', value)}
				placeholder="Filter by name or path"
				shortcut
				value={query}
			/>
			<FilterSelect
				label="Sync"
				onChange={(value) => onUpdateParam('sync', value)}
				options={[
					{ label: 'All', value: 'all' },
					{ label: 'Idle', value: 'idle' },
					{ label: 'Syncing', value: 'syncing' },
					{ label: 'Error', value: 'error' },
					{ label: 'Unknown', value: 'unknown' },
				]}
				value={syncFilter}
			/>
			<FilterSelect
				label="Phase"
				onChange={(value) => onUpdateParam('phase', value)}
				options={[
					{ label: 'All', value: 'all' },
					{ label: 'Initializer', value: 'initializer' },
					{ label: 'Onboarding', value: 'onboarding' },
					{ label: 'Coding', value: 'coding' },
				]}
				value={phaseFilter}
			/>
			<FilterSelect
				label="Maturity"
				onChange={(value) => onUpdateParam('maturity', value)}
				options={MATURITY_OPTIONS.map((option) => ({
					label: option === 'all' ? 'All' : maturityFilterLabels[option],
					value: option,
				}))}
				value={maturityFilter}
			/>
			<FilterSelect
				label="Root"
				onChange={(value) => onUpdateParam('root', value)}
				options={[
					{ label: 'All', value: 'all' },
					...rootOptions.map((root) => ({ label: root.label, value: root.path })),
				]}
				value={rootFilter}
			/>
			<FilterSelect
				label="Milestone"
				onChange={(value) => onUpdateParam('milestone', value)}
				options={[
					{ label: 'All', value: 'all' },
					...milestoneOptions.map((milestone) => ({
						label: milestone,
						value: milestone,
					})),
				]}
				value={milestoneFilter}
			/>
		</FilterToolbar>
	);
}

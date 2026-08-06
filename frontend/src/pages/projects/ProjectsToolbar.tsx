import type { ProjectPhase, ProjectSyncState } from '../../api/types.ts';

import {
	FilterSearch,
	FilterSelect,
	FilterToolbar,
} from '../../components/shared/FilterToolbar.tsx';
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
			columns="sm:grid-cols-2 xl:grid-cols-[2fr_repeat(5,minmax(0,1fr))]"
			filtered={sortedCount}
			hasFilters={hasFilters}
			noun="projects"
			onReset={onResetFilters}
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
					{ label: 'All sync states', value: 'all' },
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
					{ label: 'All phases', value: 'all' },
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
					label: maturityFilterLabels[option],
					value: option,
				}))}
				value={maturityFilter}
			/>
			<FilterSelect
				label="Root"
				onChange={(value) => onUpdateParam('root', value)}
				options={[
					{ label: 'All roots', value: 'all' },
					...rootOptions.map((root) => ({ label: root.label, value: root.path })),
				]}
				value={rootFilter}
			/>
			<FilterSelect
				label="Milestone"
				onChange={(value) => onUpdateParam('milestone', value)}
				options={[
					{ label: 'All milestones', value: 'all' },
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

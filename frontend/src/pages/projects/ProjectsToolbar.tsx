import type { ReactNode } from 'react';

import type { ProjectAssuranceBucket, ProjectPhase } from '../../api/types.ts';

import { FilterSearch, FilterSelect } from '../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../components/shared/FilterToolbar.tsx';
import { countActiveFilters } from '../../lib/filterFields.ts';
import { formGridMeasureClass } from '../../lib/formStyles.ts';
import {
	bucketLabels,
	bucketOptions,
	type MaturityFilter,
	maturityFilterLabels,
} from './projects-list-shared.ts';

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
	profileFilter,
	query,
	rootFilter,
	rootOptions,
	sortedCount,
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
	profileFilter: 'all' | ProjectAssuranceBucket;
	query: string;
	rootFilter: string;
	rootOptions: { label: string; path: string }[];
	sortedCount: number;
}) {
	return (
		<FilterToolbar
			actionRole="display"
			actions={actions}
			activeFilterCount={countActiveFilters(
				profileFilter !== 'all',
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
				label="Profile"
				onChange={(value) => onUpdateParam('profile', value)}
				options={[
					{ label: 'All', value: 'all' },
					...bucketOptions.map((bucket) => ({
						label: bucketLabels[bucket],
						value: bucket,
					})),
				]}
				value={profileFilter}
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

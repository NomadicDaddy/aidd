import {
	FilterSearch,
	FilterSelect,
	FilterToolbar,
} from '../../../components/shared/FilterToolbar.tsx';
import { FEATURE_STATUS_OPTIONS, type FeatureStatusFilter } from './featuresUtils.ts';

export function FeatureFilters({
	filteredTotal,
	hasFilters,
	milestoneFilter,
	milestoneOptions,
	onFilterChange,
	onResetFilters,
	query,
	sourceFilter,
	sourceOptions,
	statusFilter,
	total,
}: {
	filteredTotal: number;
	hasFilters: boolean;
	milestoneFilter: string;
	milestoneOptions: { label: string; value: string }[];
	onFilterChange: (key: string, value: string) => void;
	onResetFilters: () => void;
	query: string;
	sourceFilter: string;
	sourceOptions: { label: string; value: string }[];
	statusFilter: FeatureStatusFilter;
	total: number;
}) {
	return (
		<FilterToolbar
			columns="md:grid-cols-[2fr_1fr_1fr_1fr]"
			filtered={filteredTotal}
			hasFilters={hasFilters}
			noun="features"
			onReset={onResetFilters}
			total={total}>
			<FilterSearch
				onChange={(value) => onFilterChange('featureQ', value)}
				placeholder="Filter by feature metadata"
				value={query}
			/>
			<FilterSelect
				label="Status"
				onChange={(value) => onFilterChange('featureStatus', value)}
				options={[
					{ label: 'All statuses', value: 'all' },
					{ label: 'incomplete', value: 'incomplete' },
					...FEATURE_STATUS_OPTIONS.map((option) => ({ label: option, value: option })),
				]}
				value={statusFilter}
			/>
			<FilterSelect
				label="Milestone"
				onChange={(value) => onFilterChange('featureMilestone', value)}
				options={[{ label: 'All milestones', value: 'all' }, ...milestoneOptions]}
				value={milestoneFilter}
			/>
			<FilterSelect
				label="Source"
				onChange={(value) => onFilterChange('featureSource', value)}
				options={[{ label: 'All sources', value: 'all' }, ...sourceOptions]}
				value={sourceFilter}
			/>
		</FilterToolbar>
	);
}

import { FilterSearch, FilterSelect } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { countActiveFilters } from '../../../lib/filterFields.ts';
import { humanizeEnum } from '../../../lib/formatters.ts';
import { FEATURE_STATUS_OPTIONS, type FeatureStatusFilter } from './featuresUtils.ts';
import { featureSourceDisplayLabel } from './shared.ts';

export function FeatureFilters({
	filteredTotal,
	hasFilters,
	milestoneFilter,
	milestoneOptions,
	onFilterChange,
	onResetFilters,
	priorityFilter,
	priorityOptions,
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
	priorityFilter: string;
	priorityOptions: { label: string; value: string }[];
	query: string;
	sourceFilter: string;
	sourceOptions: { label: string; value: string }[];
	statusFilter: FeatureStatusFilter;
	total: number;
}) {
	return (
		<FilterToolbar
			activeFilterCount={countActiveFilters(
				statusFilter !== 'all',
				priorityFilter !== 'all',
				milestoneFilter !== 'all',
				sourceFilter !== 'all',
			)}
			className="max-w-[104rem]"
			columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_repeat(4,minmax(0,1fr))]"
			filtered={filteredTotal}
			hasFilters={hasFilters}
			noun="features"
			onReset={onResetFilters}
			padding="roomy"
			primaryControlCount={1}
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
					{ label: 'Incomplete', value: 'incomplete' },
					...FEATURE_STATUS_OPTIONS.map((option) => ({
						label: humanizeEnum(option),
						value: option,
					})),
				]}
				value={statusFilter}
			/>
			<FilterSelect
				label="Priority"
				onChange={(value) => onFilterChange('featurePriority', value)}
				options={[{ label: 'All priorities', value: 'all' }, ...priorityOptions]}
				value={priorityFilter}
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
				options={[
					{ label: 'All sources', value: 'all' },
					...sourceOptions.map((option) => ({
						...option,
						label: featureSourceDisplayLabel(option.label),
					})),
				]}
				value={sourceFilter}
			/>
		</FilterToolbar>
	);
}

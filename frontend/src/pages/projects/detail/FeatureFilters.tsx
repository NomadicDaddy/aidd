import {
	FilterSearch,
	FilterSelect,
	FilterToolbar,
} from '../../../components/shared/FilterToolbar.tsx';
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
			columns="sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]"
			filtered={filteredTotal}
			hasFilters={hasFilters}
			mobileFilters={{
				activeCount: countActiveFilters(
					statusFilter !== 'all',
					milestoneFilter !== 'all',
					sourceFilter !== 'all',
				),
				children: (
					<>
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
							label="Milestone"
							onChange={(value) => onFilterChange('featureMilestone', value)}
							options={[
								{ label: 'All milestones', value: 'all' },
								...milestoneOptions,
							]}
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
					</>
				),
			}}
			noun="features"
			onReset={onResetFilters}
			total={total}>
			<FilterSearch
				onChange={(value) => onFilterChange('featureQ', value)}
				placeholder="Filter by feature metadata"
				value={query}
			/>
		</FilterToolbar>
	);
}

import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as X } from 'lucide-react/dist/esm/icons/x';

import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { fieldLabelClass, selectClass } from '../../../lib/formStyles.ts';
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
		<Card className="space-y-3">
			<div className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr]">
				<label className="space-y-1">
					<span className={fieldLabelClass}>Search</span>
					<div className="relative">
						<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-neutral-400" />
						<Input
							className="w-full pl-9"
							onChange={(event) => onFilterChange('featureQ', event.target.value)}
							placeholder="Filter by feature metadata"
							value={query}
						/>
					</div>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Status</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => onFilterChange('featureStatus', event.target.value)}
						value={statusFilter}>
						<option value="all">All statuses</option>
						<option value="incomplete">incomplete</option>
						{FEATURE_STATUS_OPTIONS.map((option) => (
							<option key={option} value={option}>
								{option}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Milestone</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => onFilterChange('featureMilestone', event.target.value)}
						value={milestoneFilter}>
						<option value="all">All milestones</option>
						{milestoneOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
				<label className="space-y-1">
					<span className={fieldLabelClass}>Source</span>
					<select
						className={`${selectClass} w-full`}
						onChange={(event) => onFilterChange('featureSource', event.target.value)}
						value={sourceFilter}>
						<option value="all">All sources</option>
						{sourceOptions.map((option) => (
							<option key={option.value} value={option.value}>
								{option.label}
							</option>
						))}
					</select>
				</label>
			</div>
			{hasFilters ? (
				<div className="flex items-center justify-between gap-3 text-xs text-neutral-500">
					<span>
						Showing {filteredTotal} of {total} features
					</span>
					<Button onClick={onResetFilters} variant="ghost">
						<X className="h-3 w-3" />
						Reset filters
					</Button>
				</div>
			) : null}
		</Card>
	);
}

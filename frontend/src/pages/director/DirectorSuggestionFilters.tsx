import type { DirectorSuggestionRecord } from '../../api/types.ts';
import type { SegmentedControlOption } from '../../components/ui/segmented-control.tsx';

import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { humanizeEnum } from '../../lib/formatters.ts';
import { ALL_SUGGESTIONS } from './directorDisclosure.ts';

export function DirectorSuggestionFilters({
	displayedCount,
	onRiskFilterChange,
	onTaskFilterChange,
	riskFilter,
	suggestions,
	taskFilter,
	totalCount,
}: {
	displayedCount: number;
	onRiskFilterChange: (value: string) => void;
	onTaskFilterChange: (value: string) => void;
	riskFilter: string;
	suggestions: DirectorSuggestionRecord[];
	taskFilter: string;
	totalCount: number;
}) {
	const taskOptions: SegmentedControlOption<string>[] = [
		{ label: 'All types', value: ALL_SUGGESTIONS },
		...[...new Set(suggestions.map((suggestion) => suggestion.taskType))]
			.sort((left, right) => left.localeCompare(right))
			.map((taskType) => ({ label: humanizeEnum(taskType), value: taskType })),
	];
	const riskOptions: SegmentedControlOption<string>[] = [
		{ label: 'All risk', value: ALL_SUGGESTIONS },
		...['HIGH', 'MEDIUM', 'LOW']
			.filter((risk) => suggestions.some((suggestion) => suggestion.riskLevel === risk))
			.map((risk) => ({ label: humanizeEnum(risk), value: risk })),
	];

	return (
		<div className="mt-3 flex flex-wrap items-center justify-between gap-3">
			<SegmentedControl
				ariaLabel="Filter suggestions by task type"
				onChange={onTaskFilterChange}
				options={taskOptions}
				value={taskFilter}
			/>
			<div className="flex flex-wrap items-center gap-3">
				<span className="text-xs text-muted-foreground tabular-nums" role="status">
					Showing {displayedCount} of {totalCount}
				</span>
				<SegmentedControl
					ariaLabel="Filter suggestions by risk level"
					onChange={onRiskFilterChange}
					options={riskOptions}
					value={riskFilter}
				/>
			</div>
		</div>
	);
}

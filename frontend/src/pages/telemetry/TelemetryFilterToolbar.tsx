import type { TelemetryOutcomeBucket } from 'aidd-shared/runs/outcome';

import type { TypeFilter, WindowKey } from './telemetryFilters.ts';

import { FilterToolbar } from '../../components/shared/FilterToolbar.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { countActiveFilters } from '../../lib/filterFields.ts';
import { telemetryTypeOptions, telemetryWindowOptions } from './telemetryFilters.ts';

export function TelemetryFilterToolbar({
	filtered,
	onOutcomeChange,
	onTypeChange,
	onWindowChange,
	outcomeFilter,
	total,
	typeFilter,
	windowFilter,
}: {
	filtered: number;
	onOutcomeChange: (value: null | TelemetryOutcomeBucket) => void;
	onTypeChange: (value: TypeFilter) => void;
	onWindowChange: (value: WindowKey) => void;
	outcomeFilter: null | TelemetryOutcomeBucket;
	total: number;
	typeFilter: TypeFilter;
	windowFilter: WindowKey;
}) {
	const hasFilters = typeFilter !== 'all' || windowFilter !== '7d' || outcomeFilter !== null;
	return (
		<FilterToolbar
			activeFilterCount={countActiveFilters(
				typeFilter !== 'all',
				windowFilter !== '7d',
				outcomeFilter !== null,
			)}
			columns="@min-[36rem]:grid-cols-[max-content_max-content]"
			filtered={filtered}
			hasFilters={hasFilters}
			noun="invocations"
			onReset={() => {
				onTypeChange('all');
				onWindowChange('7d');
				onOutcomeChange(null);
			}}
			primaryControlCount={1}
			total={total}>
			<FieldRow group label="Resource type">
				<SegmentedControl
					ariaLabel="Resource type"
					onChange={onTypeChange}
					options={telemetryTypeOptions}
					value={typeFilter}
				/>
			</FieldRow>
			<FieldRow group label="Time window">
				<SegmentedControl
					ariaLabel="Time window"
					onChange={onWindowChange}
					options={telemetryWindowOptions}
					value={windowFilter}
				/>
			</FieldRow>
		</FilterToolbar>
	);
}

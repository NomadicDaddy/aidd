import type { ReactNode } from 'react';

import type { SegmentedControlOption } from '../../components/ui/segmented-control.tsx';
import type { DiaryKindFilter, DiaryWindowFilter } from './diaryFilters.ts';

import { FilterToolbar } from '../../components/shared/FilterToolbar.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';
import { countActiveFilters } from '../../lib/filterFields.ts';
import { DIARY_KINDS, diaryKindLabels, diaryWindowLabels } from './diaryFilters.ts';

// Both lists read their text from `diaryFilters`, which is where the empty state's filter readout
// reads it too. A control and the sentence naming what it did cannot disagree about wording.
const KIND_OPTIONS: readonly SegmentedControlOption<DiaryKindFilter>[] = DIARY_KINDS.map(
	(value) => ({ label: diaryKindLabels[value], value }),
);

const WINDOW_OPTIONS: readonly SegmentedControlOption<DiaryWindowFilter>[] = (
	['7d', '30d', 'all'] as const
).map((value) => ({
	label: value === 'all' ? 'All' : value,
	title: diaryWindowLabels[value],
	value,
}));

/**
 * The scope bar Telemetry established for this class of surface: kind on the left, time window on
 * the right, one Card above the content. The Diary is a fleet-wide five-kind feed across every
 * discovered project, and until this it had no way to isolate one of them.
 */
export function DiaryFilterBar({
	action,
	header,
	kind,
	onKindChange,
	onReset,
	onWindowChange,
	shown,
	timeWindow,
	total,
}: {
	action?: ReactNode;
	header?: ReactNode;
	kind: DiaryKindFilter;
	onKindChange: (value: DiaryKindFilter) => void;
	/** Owned by the feed, so the toolbar and the empty state below it clear the same two values. */
	onReset: () => void;
	onWindowChange: (value: DiaryWindowFilter) => void;
	shown: number;
	timeWindow: DiaryWindowFilter;
	total: number;
}) {
	return (
		<div className="@container">
			<FilterToolbar
				actionRole="display"
				actions={action}
				activeFilterCount={countActiveFilters(timeWindow !== 'all')}
				columns="grid-cols-[minmax(0,1fr)_auto]"
				filtered={shown}
				hasFilters={kind !== 'all' || timeWindow !== 'all'}
				header={header}
				noun="loaded activities"
				onReset={onReset}
				primaryControlCount={2}
				readoutLabel="Showing"
				total={total}>
				<div className="min-w-0">
					<SegmentedControl
						ariaLabel="Event kind"
						onChange={onKindChange}
						options={KIND_OPTIONS}
						value={kind}
					/>
				</div>
				<div className="min-w-0">
					<SegmentedControl
						ariaLabel="Time window"
						onChange={onWindowChange}
						options={WINDOW_OPTIONS}
						value={timeWindow}
					/>
				</div>
			</FilterToolbar>
		</div>
	);
}

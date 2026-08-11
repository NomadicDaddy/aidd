import type { SegmentedControlOption } from '../../components/ui/segmented-control.tsx';
import type { DiaryKindFilter, DiaryWindowFilter } from './diaryFilters.ts';

import { Card } from '../../components/ui/card.tsx';
import { SegmentedControl } from '../../components/ui/segmented-control.tsx';

const KIND_OPTIONS: readonly SegmentedControlOption<DiaryKindFilter>[] = [
	{ label: 'All', value: 'all' },
	{ label: 'Runs', value: 'run' },
	{ label: 'Skills', value: 'skill' },
	{ label: 'Recipes', value: 'recipe-session' },
	{ label: 'Director', value: 'director-cycle' },
	{ label: 'Releases', value: 'release' },
];

const WINDOW_OPTIONS: readonly SegmentedControlOption<DiaryWindowFilter>[] = [
	{ label: '7d', title: 'Last 7 days', value: '7d' },
	{ label: '30d', title: 'Last 30 days', value: '30d' },
	{ label: 'All', title: 'Everything loaded', value: 'all' },
];

/**
 * The scope bar Telemetry established for this class of surface: kind on the left, time window on
 * the right, one Card above the content. The Diary is a fleet-wide five-kind feed across every
 * discovered project, and until this it had no way to isolate one of them.
 */
export function DiaryFilterBar({
	kind,
	onKindChange,
	onWindowChange,
	shown,
	timeWindow,
	total,
}: {
	kind: DiaryKindFilter;
	onKindChange: (value: DiaryKindFilter) => void;
	onWindowChange: (value: DiaryWindowFilter) => void;
	shown: number;
	timeWindow: DiaryWindowFilter;
	total: number;
}) {
	return (
		// The card runs the full width like every other card on the page; the controls inside it
		// stop at the widest measure the app declares. Justified against the raw column at 2250 the
		// kind control ended near x=660 and the count and time window did not begin until x=1924, so
		// one control set was read as two, separated by 1260px of empty toolbar.
		<Card>
			<div className="flex max-w-[61rem] flex-wrap items-center justify-between gap-3">
				<SegmentedControl
					ariaLabel="Event kind"
					onChange={onKindChange}
					options={KIND_OPTIONS}
					value={kind}
				/>
				<div className="flex flex-wrap items-center gap-3">
					<span className="text-xs text-muted-foreground tabular-nums" role="status">
						Showing {shown} of {total} loaded
					</span>
					<SegmentedControl
						ariaLabel="Time window"
						onChange={onWindowChange}
						options={WINDOW_OPTIONS}
						value={timeWindow}
					/>
				</div>
			</div>
		</Card>
	);
}

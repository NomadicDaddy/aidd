import type {
	PostureFilter,
	ProfileMatrixFilterState,
	SourceFilter,
} from './profileMatrixFilters.ts';

import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { SegmentedControl } from '../../../components/ui/segmented-control.tsx';
import { fieldLabelClass } from '../../../lib/formStyles.ts';

export function ProfileMatrixToolbar({
	filters,
	onChange,
	shownCount,
	totalCount,
}: {
	filters: ProfileMatrixFilterState;
	onChange: (next: ProfileMatrixFilterState) => void;
	shownCount: number;
	totalCount: number;
}) {
	return (
		<Card className="flex flex-wrap items-end gap-3">
			<label className="block min-w-56 flex-1 space-y-1">
				<span className={fieldLabelClass}>Filter</span>
				<Input
					onChange={(event) => onChange({ ...filters, query: event.target.value })}
					placeholder="Name or path"
					value={filters.query}
				/>
			</label>
			<div className="space-y-1">
				<span className={`block ${fieldLabelClass}`}>Source</span>
				<SegmentedControl
					ariaLabel="Filter by profile source"
					onChange={(source: SourceFilter) => onChange({ ...filters, source })}
					options={[
						{ label: 'All', value: 'all' },
						{ label: 'Explicit', value: 'explicit' },
						{ label: 'Inferred', value: 'inferred' },
					]}
					value={filters.source}
				/>
			</div>
			<div className="space-y-1">
				<span className={`block ${fieldLabelClass}`}>Posture</span>
				<SegmentedControl
					ariaLabel="Filter by posture"
					onChange={(posture: PostureFilter) => onChange({ ...filters, posture })}
					// One option per label the Posture column renders — the segment labels are the
					// column's own strings, so a value on screen is always reachable from here.
					options={[
						{ label: 'All', value: 'all' },
						{ label: 'Standard', value: 'standard' },
						{ label: 'Low-exposure', value: 'low' },
						{ label: 'Full hardening', value: 'full' },
					]}
					value={filters.posture}
				/>
			</div>
			<div className="space-y-1">
				<span className={`block ${fieldLabelClass}`}>Unsaved</span>
				<SegmentedControl
					ariaLabel="Show unsaved rows only"
					onChange={(value: 'all' | 'dirty') =>
						onChange({ ...filters, dirtyOnly: value === 'dirty' })
					}
					options={[
						{ label: 'All', value: 'all' },
						{ label: 'Unsaved only', value: 'dirty' },
					]}
					value={filters.dirtyOnly ? 'dirty' : 'all'}
				/>
			</div>
			<p className="ml-auto text-xs text-muted-foreground">
				Showing {shownCount} of {totalCount} projects
			</p>
		</Card>
	);
}

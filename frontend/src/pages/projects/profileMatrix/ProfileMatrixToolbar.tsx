import type {
	PostureFilter,
	ProfileMatrixFilterState,
	SourceFilter,
} from './profileMatrixFilters.ts';

import { FilterSearch, FilterSelect } from '../../../components/shared/FilterFields.tsx';
import { FilterToolbar } from '../../../components/shared/FilterToolbar.tsx';
import { countActiveFilters } from '../../../lib/filterFields.ts';
import {
	profileMatrixPostureOptions,
	profileMatrixSourceOptions,
	profileMatrixUnsavedOptions,
} from './profileMatrixFilters.ts';

/**
 * The eighth filter row, built on `FilterToolbar` like the other seven.
 *
 * A hand-built `flex flex-wrap` card of one `<label>` and three segmented controls would have its
 * own wrap behaviour, its own alignment, its own readout and no reset — four ways of differing from
 * the seven toolbars an operator meets on the way here. The controls are selects for the same
 * reason the others are: three segmented controls of three and four options each are eleven
 * permanent targets in a row that has to hold a search field too.
 */
export function ProfileMatrixToolbar({
	filters,
	onChange,
	onReset,
	shownCount,
	totalCount,
}: {
	filters: ProfileMatrixFilterState;
	onChange: (next: ProfileMatrixFilterState) => void;
	onReset: () => void;
	shownCount: number;
	totalCount: number;
}) {
	return (
		<FilterToolbar
			activeFilterCount={countActiveFilters(
				filters.dirtyOnly,
				filters.posture !== 'all',
				filters.source !== 'all',
			)}
			// Resolve both steps from the toolbar's own width. The expanded navigation no longer
			// makes a viewport breakpoint overstate the space available to these four controls.
			columns="@min-[36rem]:grid-cols-2 @min-[64rem]:grid-cols-[2fr_1fr_1fr_1fr]"
			filtered={shownCount}
			hasFilters={
				filters.dirtyOnly ||
				filters.posture !== 'all' ||
				filters.query.trim().length > 0 ||
				filters.source !== 'all'
			}
			noun="projects"
			onReset={onReset}
			primaryControlCount={1}
			total={totalCount}>
			<FilterSearch
				ariaLabel="Filter projects by name or path"
				onChange={(query) => onChange({ ...filters, query })}
				placeholder="Name or path"
				shortcut
				value={filters.query}
			/>
			<FilterSelect
				label="Unsaved"
				onChange={(value) => onChange({ ...filters, dirtyOnly: value === 'dirty' })}
				options={profileMatrixUnsavedOptions}
				value={filters.dirtyOnly ? 'dirty' : 'all'}
			/>
			<FilterSelect
				label="Posture"
				onChange={(value) => onChange({ ...filters, posture: value as PostureFilter })}
				// One option per label the Posture column renders — the option labels are the
				// column's own strings, so a value on screen is always reachable from here.
				options={profileMatrixPostureOptions}
				value={filters.posture}
			/>
			<FilterSelect
				label="Source"
				onChange={(value) => onChange({ ...filters, source: value as SourceFilter })}
				options={profileMatrixSourceOptions}
				value={filters.source}
			/>
		</FilterToolbar>
	);
}

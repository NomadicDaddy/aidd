import type {
	PostureFilter,
	ProfileMatrixFilterState,
	SourceFilter,
} from './profileMatrixFilters.ts';

import {
	FilterSearch,
	FilterSelect,
	FilterToolbar,
} from '../../../components/shared/FilterToolbar.tsx';
import { emptyMatrixFilters } from './profileMatrixFilters.ts';

/**
 * The eighth filter row, and the last one that was still built by hand.
 *
 * It used to be a `flex flex-wrap` card of one `<label>` and three segmented controls, which gave
 * it its own wrap behaviour, its own alignment, its own readout and no reset — four ways of
 * differing from the seven toolbars an operator meets on the way here. The controls are selects now
 * for the same reason the others are: three segmented controls of three and four options each are
 * eleven permanent targets in a row that has to hold a search field too.
 */
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
		<FilterToolbar
			// `xl:`, not `lg:`: the rail is expanded from 1024px up, so `lg` is a 736px content
			// column and four tracks in it put the search field at 245px. See the content-width
			// table in AppLayout.tsx.
			columns="sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]"
			filtered={shownCount}
			hasFilters={
				filters.dirtyOnly ||
				filters.posture !== 'all' ||
				filters.query.trim().length > 0 ||
				filters.source !== 'all'
			}
			noun="projects"
			onReset={() => onChange(emptyMatrixFilters)}
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
				options={[
					{ label: 'All', value: 'all' },
					{ label: 'Unsaved only', value: 'dirty' },
				]}
				value={filters.dirtyOnly ? 'dirty' : 'all'}
			/>
			<FilterSelect
				label="Posture"
				onChange={(value) => onChange({ ...filters, posture: value as PostureFilter })}
				// One option per label the Posture column renders — the option labels are the
				// column's own strings, so a value on screen is always reachable from here.
				options={[
					{ label: 'All', value: 'all' },
					{ label: 'Standard', value: 'standard' },
					{ label: 'Low-exposure', value: 'low' },
					{ label: 'Full hardening', value: 'full' },
				]}
				value={filters.posture}
			/>
			<FilterSelect
				label="Source"
				onChange={(value) => onChange({ ...filters, source: value as SourceFilter })}
				options={[
					{ label: 'All', value: 'all' },
					{ label: 'Explicit', value: 'explicit' },
					{ label: 'Inferred', value: 'inferred' },
				]}
				value={filters.source}
			/>
		</FilterToolbar>
	);
}

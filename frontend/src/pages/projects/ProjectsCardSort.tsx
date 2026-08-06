import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { useId } from 'react';

import type { SortDir, SortKey } from './projects-list-sort.ts';

import { Button } from '../../components/ui/button.tsx';
import { selectClass } from '../../lib/formStyles.ts';
import { projectSortOptions } from './projects-table-columns.ts';

/**
 * The card view's ordering control.
 *
 * The two views already order the same array — `sorted` comes from `useProjectsPageFilters` and goes
 * to both — but only the table could change the order, because the affordance was the column header.
 * Switching from table to cards silently took the ordering away and switching back restored it, so
 * the same list had two capabilities depending on which shape it was drawn in.
 *
 * Not a `FilterSelect` in the toolbar: sorting is not filtering, and `FILTER_FIELD_ORDER` (which the
 * toolbar-pattern test enforces) has no Sort field to slot it into. It sits above the grid, where the
 * table view already puts its own view control.
 */
export function ProjectsCardSort({
	onToggleSort,
	sortDir,
	sortKey,
}: {
	/** Same handler the table headers use: a new key selects it, the current key flips direction. */
	onToggleSort: (key: SortKey) => void;
	sortDir: SortDir;
	sortKey: SortKey;
}) {
	const selectId = useId();
	const DirIcon = sortDir === 'asc' ? ArrowUp : ArrowDown;
	return (
		<div className="flex items-center justify-end gap-2">
			<label className="text-xs font-medium text-muted-foreground" htmlFor={selectId}>
				Sort by
			</label>
			<select
				className={`${selectClass} h-8 py-0 text-xs`}
				id={selectId}
				onChange={(event) => onToggleSort(event.target.value as SortKey)}
				value={sortKey}>
				{projectSortOptions.map((option) => (
					<option key={option.key} value={option.key}>
						{option.label}
					</option>
				))}
			</select>
			<Button
				aria-label={`Sort direction: ${sortDir === 'asc' ? 'ascending' : 'descending'}`}
				onClick={() => onToggleSort(sortKey)}
				size="compact"
				title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
				variant="secondary">
				<DirIcon aria-hidden="true" className="h-3.5 w-3.5" />
			</Button>
		</div>
	);
}

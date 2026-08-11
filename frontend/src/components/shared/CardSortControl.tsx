import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { useId } from 'react';

import { selectClass } from '../../lib/formStyles.ts';
import { Button } from '../ui/button.tsx';

/**
 * The card view's ordering control, for any list whose wide layout sorts through column headers.
 *
 * Both views of such a list already order the same array, but only the table can change the order,
 * because the affordance is the column header. Switching from table to cards silently takes the
 * ordering away and switching back restores it, so the same list has two capabilities depending on
 * which shape it happens to be drawn in. Projects hit this first; the Profile Matrix had it too,
 * with 33 project cards locked to Project-ascending below 1280.
 *
 * Not a `FilterSelect` in the toolbar: sorting is not filtering, and `FILTER_FIELD_ORDER` (which the
 * toolbar-pattern test enforces) has no Sort field to slot it into. It sits above the cards, where
 * the table view already puts its own view controls.
 */
export function CardSortControl<Key extends string>({
	onToggleSort,
	options,
	sortDir,
	sortKey,
}: {
	/** Same handler the table headers use: a new key selects it, the current key flips direction. */
	onToggleSort: (key: Key) => void;
	/** The keys the wide table sorts on, in the order its headers declare them. */
	options: readonly { key: Key; label: string }[];
	sortDir: 'asc' | 'desc';
	sortKey: Key;
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
				onChange={(event) => onToggleSort(event.target.value as Key)}
				value={sortKey}>
				{options.map((option) => (
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

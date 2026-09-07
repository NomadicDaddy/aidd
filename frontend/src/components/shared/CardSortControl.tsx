import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { useId } from 'react';

import { cn } from '../../lib/cn.ts';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
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
	phoneInset = true,
	sortDir,
	sortKey,
}: {
	/** Same handler the table headers use: a new key selects it, the current key flips direction. */
	onToggleSort: (key: Key) => void;
	/** The keys the wide table sorts on, in the order its headers declare them. */
	options: readonly { key: Key; label: string }[];
	/** Disable when an owning list already supplies the standard phone content inset. */
	phoneInset?: boolean;
	sortDir: 'asc' | 'desc';
	sortKey: Key;
}) {
	const selectId = useId();
	const DirIcon = sortDir === 'asc' ? ArrowUp : ArrowDown;
	return (
		// The group is right-packed where a card grid has more than one column, which is what that
		// edge is aligning to. On a phone the list is one column and there is no such edge: the
		// 169px group sat at the right of a 324px rail with the `Sort by` caption alone above it,
		// 155px from the left rail every card below it starts on. Below `sm` the select takes the
		// free space instead, so the control fills the measure and the caption keeps the rail.
		<div
			className={cn(
				'grid grid-cols-[minmax(0,1fr)_auto] items-end gap-x-2 gap-y-1 sm:grid-cols-[auto_auto] sm:justify-end',
				phoneInset && 'max-sm:mx-4',
			)}>
			<label className={`${fieldLabelClass} sm:col-span-2`} htmlFor={selectId}>
				Sort by
			</label>
			<select
				className={`${selectClass} max-sm:col-span-2 max-sm:w-full`}
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
				className="max-sm:col-start-2 max-sm:row-start-1"
				onClick={() => onToggleSort(sortKey)}
				title={sortDir === 'asc' ? 'Ascending' : 'Descending'}
				variant="secondary">
				<DirIcon aria-hidden="true" className="h-3.5 w-3.5" />
			</Button>
		</div>
	);
}

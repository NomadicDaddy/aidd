import type { ReactNode } from 'react';

import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as ArrowUpDown } from 'lucide-react/dist/esm/icons/arrow-up-down';

/**
 * A sortable `<th>`.
 *
 * The Projects table and the Profile Matrix each had their own copy of this — same three icons, same
 * `aria-sort`, same active/inactive colouring — and neither copy told the reader the header was
 * clickable: no cursor change, no hover, no underline. Nine headers on one surface looked exactly
 * like the un-sortable ones beside them and the ArrowUpDown glyph was the only hint, at 12px in
 * muted grey.
 *
 * The affordance is here rather than in each caller so the seventh table cannot ship without it.
 */
export function SortableColumnHeader<Key extends string>({
	activeDir,
	activeKey,
	className,
	hint,
	indicatesSort = true,
	label,
	onSort,
	sortKey,
}: {
	activeDir: 'asc' | 'desc';
	activeKey: Key;
	/** The `<th>` classes — sticky positioning and padding are the caller's business. */
	className: string;
	/**
	 * A note beside the label, outside the button: the Profile Matrix marks its Audits column
	 * "recalc" while a preview is in flight, and that word is a status, not part of the control's
	 * name or of what pressing it does.
	 */
	hint?: ReactNode;
	/**
	 * Whether this header owns the indicator for its sort key. Two headers may legitimately
	 * trigger the same sort - audits-catalog sorts by score from both the Change Potential
	 * band and the score itself - but only one column can answer "what is this table sorted
	 * by". `isActive` was `activeKey === sortKey`, so both lit up and both reported
	 * `aria-sort`, which is what made the sort look broken rather than shared. The header
	 * that borrows another column’s key passes false and stays quiet.
	 */
	indicatesSort?: boolean;
	label: string;
	onSort: (key: Key) => void;
	sortKey: Key;
}) {
	const isActive = indicatesSort && activeKey === sortKey;
	const Icon = isActive ? (activeDir === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
	return (
		<th
			aria-sort={isActive ? (activeDir === 'asc' ? 'ascending' : 'descending') : 'none'}
			className={className}
			scope="col">
			<button
				aria-label={`Sort by ${label}${isActive ? ` (${activeDir})` : ''}`}
				className={`inline-flex cursor-pointer items-center gap-1 rounded-sm text-left whitespace-nowrap uppercase underline-offset-4 hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/80 focus-visible:outline-none max-sm:min-h-11 ${
					isActive ? 'text-foreground' : 'text-muted-foreground'
				}`}
				onClick={() => onSort(sortKey)}
				type="button">
				{label}
				<Icon aria-hidden="true" className="h-3 w-3" />
			</button>
			{hint}
		</th>
	);
}

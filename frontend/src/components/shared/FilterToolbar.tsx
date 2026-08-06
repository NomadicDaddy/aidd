import type { ReactNode } from 'react';

import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Search } from 'lucide-react/dist/esm/icons/search';

import { cn } from '../../lib/cn.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { Button } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { FieldRow } from '../ui/field.tsx';
import { Input } from '../ui/input.tsx';

// The house field order these toolbars all follow lives in `lib/filterFields.ts`, not here: it is
// data, the guard test imports it, and a `.tsx` module that exports a constant is a fast-refresh
// boundary the whole file loses.

/**
 * One filter row: a card, a grid of labelled controls, and a readout of what the filters left.
 *
 * The readout is rendered whether or not anything is filtered. It used to appear only once a filter
 * was set, which put a `role="status"` region into the DOM at the same moment its text changed —
 * and a live region announces changes to a region that was already there. Mounted from the start, a
 * filter change is spoken; mounted by the change, it is usually silent.
 */
export function FilterToolbar({
	children,
	className,
	columns,
	filtered,
	hasFilters,
	header,
	noun,
	onReset,
	readoutSuffix,
	total,
}: {
	children: ReactNode;
	className?: string;
	/** The grid template for the control row, e.g. `md:grid-cols-[2fr_1fr_1fr_1fr]`. */
	columns: string;
	filtered: number;
	hasFilters: boolean;
	/** A `CardHeader` above the controls, for the toolbars that title themselves. */
	header?: ReactNode;
	/** What is being counted, already plural: `features`, `runs`, `projects`. */
	noun: string;
	onReset: () => void;
	/** Extra qualification after the count — the root a projects list is scoped to. */
	readoutSuffix?: ReactNode;
	total: number;
}) {
	return (
		<Card className={cn('space-y-3', className)}>
			{header}
			<div className={cn('grid gap-3', columns)}>{children}</div>
			<div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
				<span role="status">
					Showing {filtered} of {total} {noun}
					{readoutSuffix}
				</span>
				{/* Disabled rather than unmounted: a control that appears when you first type moves
				    the readout beside it, and the row it sits in changes height on the keystroke. */}
				<Button disabled={!hasFilters} onClick={onReset} variant="ghost">
					<RotateCcw className="h-3 w-3" />
					Reset filters
				</Button>
			</div>
		</Card>
	);
}

/**
 * The search field of a filter row. Always first, always with the magnifier inside it.
 */
export function FilterSearch({
	ariaLabel,
	className,
	onChange,
	placeholder,
	shortcut = false,
	value,
}: {
	ariaLabel?: string;
	className?: string;
	onChange: (value: string) => void;
	placeholder: string;
	/** Marks this as the field the `/` shortcut focuses. One per page. */
	shortcut?: boolean;
	value: string;
}) {
	return (
		<FieldRow className={className} label="Search">
			<div className="relative">
				<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
				<Input
					aria-label={ariaLabel}
					className="pl-9"
					data-shortcut-search={shortcut ? '' : undefined}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					value={value}
				/>
			</div>
		</FieldRow>
	);
}

/**
 * A labelled select in a filter row. `w-full` here and not in `selectClass`: this control is a grid
 * item that fills its track, and saying so at the one place that knows is what let every other
 * select stop inheriting a width it did not want.
 */
export function FilterSelect({
	className,
	label,
	onChange,
	options,
	value,
}: {
	className?: string;
	label: string;
	onChange: (value: string) => void;
	options: { label: string; value: string }[];
	value: string;
}) {
	return (
		<FieldRow className={className} label={label}>
			<select
				className={cn(selectClass, 'w-full')}
				onChange={(event) => onChange(event.target.value)}
				value={value}>
				{options.map((option) => (
					<option key={option.value} value={option.value}>
						{option.label}
					</option>
				))}
			</select>
		</FieldRow>
	);
}

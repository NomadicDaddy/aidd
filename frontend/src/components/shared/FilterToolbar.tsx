import type { ReactNode } from 'react';

import { default as RotateCcw } from 'lucide-react/dist/esm/icons/rotate-ccw';
import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { default as SlidersHorizontal } from 'lucide-react/dist/esm/icons/sliders-horizontal';
import { useEffect, useId, useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue.ts';
import { cn } from '../../lib/cn.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { tableMeasureClass } from '../../lib/tableStyles.ts';
import { Badge } from '../ui/badge.tsx';
import { Button, IconButton } from '../ui/button.tsx';
import { Card } from '../ui/card.tsx';
import { Dialog, DialogPanel } from '../ui/dialog.tsx';
import { FieldRow } from '../ui/field.tsx';
import { Input } from '../ui/input.tsx';

// The house field order these toolbars all follow lives in `lib/filterFields.ts`, not here: it is
// data, the guard test imports it, and a `.tsx` module that exports a constant is a fast-refresh
// boundary the whole file loses.

interface MobileFilters {
	/** Search remains exposed, so only non-default secondary controls contribute to this count. */
	activeCount: number;
	children: ReactNode;
	/** Collapse against this toolbar's content width instead of the viewport's `sm` step. */
	contentAware?: boolean;
}

/** One filter row with labelled controls and an always-mounted result readout. */
export function FilterToolbar({
	children,
	className,
	columns,
	filtered,
	hasFilters,
	header,
	mobileFilters,
	noun,
	onReset,
	readoutSuffix,
	total,
}: {
	children: ReactNode;
	className?: string;
	/**
	 * The grid template for the control row, e.g. `sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr_1fr]`.
	 *
	 * Two tiers and no others, because this example is what every consumer copies: `sm` for the
	 * two-up step while the rail is collapsed, and `xl` for the full row. Not `lg` — the rail
	 * expands at 1024px, so `lg` buys a four-track row a 736px column and hands the search field
	 * 245px of it. The earlier version of this line said `md:`, which is a tier the app deleted.
	 */
	columns: string;
	filtered: number;
	hasFilters: boolean;
	/** A `CardHeader` above the controls, for the toolbars that title themselves. */
	header?: ReactNode;
	/** Secondary controls to move into the canonical dialog below `sm`. */
	mobileFilters?: MobileFilters;
	/** What is being counted, already plural: `features`, `runs`, `projects`. */
	noun: string;
	onReset: () => void;
	/** Extra qualification after the count — the root a projects list is scoped to. */
	readoutSuffix?: ReactNode;
	total: number;
}) {
	const [filtersOpen, setFiltersOpen] = useState(false);
	const contentAware = mobileFilters?.contentAware === true;
	const mobileFiltersPanelId = useId();
	const mobileFiltersTitleId = useId();
	// `flex flex-col gap-3`, not `space-y-3`. Tailwind v4 lays `space-y-*` down as a margin on the
	// children, so the `className="mb-0"` that every `CardHeader` in a self-spacing Card passes
	// cancelled it outright — the toolbars that title themselves measured a 0px gap between the card
	// description and the first field label, and since both are 12px muted-foreground the control
	// group read as a third line of the description sentence. `gap` belongs to this element and no
	// child margin can defeat it.
	return (
		<>
			<Card
				className={cn(
					'flex flex-col gap-3',
					tableMeasureClass,
					mobileFilters &&
						(contentAware
							? '@container @max-[48rem]:gap-2 @max-[48rem]:p-3'
							: 'max-sm:gap-2 max-sm:p-3'),
					className,
				)}>
				{header}
				{/* Ratios such as `2fr_1fr_1fr` have no ceiling. The shared 80rem Card measure keeps the
				    tuned control widths while making its border and controls terminate together. */}
				<div
					className={cn(
						'grid gap-3',
						mobileFilters &&
							(contentAware
								? '@max-[48rem]:grid-cols-[minmax(0,1fr)_auto] @max-[48rem]:items-end @max-[48rem]:gap-2'
								: 'max-sm:grid-cols-[minmax(0,1fr)_auto] max-sm:items-end max-sm:gap-2'),
						columns,
					)}>
					{children}
					{mobileFilters ? (
						<>
							<div
								className={cn(
									'items-center gap-1',
									contentAware ? 'hidden @max-[48rem]:flex' : 'flex sm:hidden',
								)}>
								<Button
									aria-controls={mobileFiltersPanelId}
									aria-expanded={filtersOpen}
									aria-haspopup="dialog"
									className="flex-col items-start gap-0 px-2 py-1 text-left"
									onClick={() => setFiltersOpen(true)}>
									<span className="inline-flex items-center gap-1.5">
										<SlidersHorizontal className="h-3.5 w-3.5" />
										Filters
										<Badge
											className="px-1.5 py-0.5"
											tone={
												mobileFilters.activeCount > 0 ? 'teal' : 'neutral'
											}>
											{mobileFilters.activeCount} active
										</Badge>
									</span>
									<span className="text-xs font-normal text-muted-foreground">
										Showing {filtered}/{total}
									</span>
								</Button>
								<IconButton
									ariaLabel="Reset filters"
									disabled={!hasFilters}
									onClick={onReset}
									variant="ghost">
									<RotateCcw className="h-3.5 w-3.5" />
								</IconButton>
							</div>
							<div
								className={
									contentAware
										? 'hidden @min-[48rem]:contents'
										: 'hidden sm:contents'
								}>
								{mobileFilters.children}
							</div>
						</>
					) : null}
				</div>
				{/* The readout and its Reset fill the same capped Card as the controls they describe. */}
				<div
					className={cn(
						'flex items-center justify-between gap-3 text-xs text-muted-foreground',
						mobileFilters && (contentAware ? '@max-[48rem]:hidden' : 'max-sm:hidden'),
					)}>
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
			{mobileFilters ? (
				<Dialog
					aria-labelledby={mobileFiltersTitleId}
					onClose={() => setFiltersOpen(false)}
					open={filtersOpen}>
					<DialogPanel
						className="max-h-[calc(100vh-2rem)] w-full max-w-md overflow-y-auto p-5"
						id={mobileFiltersPanelId}>
						<div className="space-y-1">
							<h2
								className="text-lg font-semibold text-foreground"
								id={mobileFiltersTitleId}>
								Filters
							</h2>
							<p className="text-sm text-muted-foreground">
								{mobileFilters.activeCount} active secondary{' '}
								{mobileFilters.activeCount === 1 ? 'filter' : 'filters'}
							</p>
						</div>
						<div className="mt-4 grid gap-3">{mobileFilters.children}</div>
						<div className="mt-5 flex items-center justify-between gap-3">
							<Button disabled={!hasFilters} onClick={onReset} variant="ghost">
								<RotateCcw className="h-3 w-3" />
								Reset filters
							</Button>
							<Button onClick={() => setFiltersOpen(false)} variant="primary">
								Show results
							</Button>
						</div>
					</DialogPanel>
				</Dialog>
			) : null}
		</>
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
	// Every caller stores this value in the URL, and that write commits in a transition that
	// can land several keystrokes late. Rendering the incoming value directly meant React
	// reset the input to the not-yet-updated value between keystrokes, so anyone typing
	// faster than the round trip kept only their last character. `draft` is the copy the
	// field renders and it updates on the keystroke; the value is pushed outward once typing
	// settles, and an incoming value is adopted only while no edit is waiting to be pushed,
	// so a reset button or a deep link still fills the field.
	const [draft, setDraft] = useState(value);
	const [lastValue, setLastValue] = useState(value);
	const settled = useDebouncedValue(draft, 150);
	if (value !== lastValue) {
		setLastValue(value);
		// Adopt an incoming value only when the field is at rest. Mid-edit it is either the
		// echo of an earlier keystroke or a value about to be superseded, and taking it would
		// throw away what has been typed since.
		if (draft === settled) setDraft(value);
	}
	useEffect(() => {
		// `settled === draft` means the pause after typing has elapsed. Without it, a reset
		// that clears the field would be undone by the previous query still sitting in
		// `settled` for one more debounce interval.
		if (settled === draft && settled !== value) onChange(settled);
	}, [draft, onChange, settled, value]);
	return (
		<FieldRow className={className} label="Search">
			<div className="relative">
				<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
				<Input
					aria-label={ariaLabel}
					className="pl-9"
					data-shortcut-search={shortcut ? '' : undefined}
					onChange={(event) => setDraft(event.target.value)}
					placeholder={placeholder}
					value={draft}
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

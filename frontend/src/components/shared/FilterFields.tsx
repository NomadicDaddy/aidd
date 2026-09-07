import { default as Search } from 'lucide-react/dist/esm/icons/search';
import { useEffect, useId, useState } from 'react';

import { useDebouncedValue } from '../../hooks/useDebouncedValue.ts';
import { cn } from '../../lib/cn.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { FieldRow } from '../ui/field.tsx';
import { Input } from '../ui/input.tsx';

/**
 * The fields a filter row is built from, split out of `FilterToolbar` when that file reached the
 * 300-line cap. The shell owns the row, its rail, and the disclosure that collapses it on a phone;
 * these own one control each and share none of that state, so the seam is where the file already
 * was — the same split `FilterToolbarStackedActions` took.
 */

/** The first field of a filter row, with the magnifier inside it. */
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
	const controlId = useId();
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
		<FieldRow className={className} controlId={controlId} label="Search">
			<div className="relative">
				<Search className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-muted-foreground" />
				<Input
					aria-label={ariaLabel}
					className="pl-9"
					data-shortcut-search={shortcut ? '' : undefined}
					id={controlId}
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

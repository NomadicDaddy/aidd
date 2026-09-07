import { default as Minus } from 'lucide-react/dist/esm/icons/minus';
import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { useId } from 'react';

import { IconButton } from '../ui/button.tsx';
import { Input } from '../ui/input.tsx';

/**
 * A number field with its own increment and decrement controls.
 *
 * The native `<input type="number">` spinner is not reachable on a phone and cannot be made
 * reachable. It is a UA pseudo-element (`::-webkit-inner-spin-button`) inside a replaced element,
 * so no class applies to it and no touch-target idiom in `lib/touchTarget.ts` can grow it: probed
 * at 390x844, `elementFromPoint` over every part of the field returns the `<input>` itself and
 * never the spinner. Worse, Chrome paints no spinner at rest, so on a touch device — which never
 * hovers — the control is invisible as well as unreachable, and the field is indistinguishable
 * from the text inputs beside it.
 *
 * So the native spinner is suppressed and replaced with two `IconButton`s, which carry the house
 * 44px floor below `sm` and settle to 36px from `sm` up like every other icon control. The input
 * keeps `type="number"`, so direct typing and the phone's numeric keyboard are unchanged; the
 * buttons are an addition to that, not a replacement for it.
 *
 * Empty means unset, and it counts as `min` for the arithmetic — incrementing an empty field gives
 * `min + step`, and decrement is disabled there. Clearing the field back to unset is done by
 * typing, because a decrement that emptied the field at its floor would be a different operation
 * wearing the same button.
 */
export function NumberStepper({
	label,
	min = 0,
	name,
	onChange,
	placeholder,
	step = 1,
	value,
}: {
	label: string;
	min?: number;
	name: string;
	onChange: (value: string) => void;
	placeholder?: string;
	step?: number;
	value: string;
}) {
	const inputId = useId();
	const parsed = Number.parseInt(value, 10);
	const current = Number.isFinite(parsed) ? parsed : min;
	const shift = (delta: number) => onChange(String(Math.max(min, current + delta * step)));

	return (
		<div aria-label={label} className="flex items-center gap-2" role="group">
			<span className="shrink-0">
				<IconButton
					ariaLabel={`Decrease ${label}`}
					disabled={current <= min}
					onClick={() => shift(-1)}
					type="button">
					<Minus aria-hidden="true" className="h-4 w-4" />
				</IconButton>
			</span>
			<Input
				aria-label={label}
				className="[appearance:textfield] text-center [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
				id={inputId}
				inputMode="numeric"
				min={min}
				name={name}
				onChange={(event) => onChange(event.target.value)}
				placeholder={placeholder ?? String(min)}
				step={step}
				type="number"
				value={value}
			/>
			<span className="shrink-0">
				<IconButton ariaLabel={`Increase ${label}`} onClick={() => shift(1)} type="button">
					<Plus aria-hidden="true" className="h-4 w-4" />
				</IconButton>
			</span>
		</div>
	);
}

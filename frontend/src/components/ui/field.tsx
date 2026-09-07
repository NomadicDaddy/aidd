import type { HTMLAttributes, InputHTMLAttributes, ReactElement, ReactNode } from 'react';

import { Children, cloneElement, isValidElement, useId } from 'react';

import { cn } from '../../lib/cn.ts';
import {
	disabledFieldSurfaceClass,
	fieldErrorClass,
	fieldHintClass,
	fieldLabelClass,
	formGridClass,
} from '../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { Checkbox } from './checkbox.tsx';

/**
 * Canonical layout layer for groups of fields. Column choices stay with the section that knows the
 * fields; the shared layer owns their gap and maximum horizontal measure.
 */
export function FormGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
	return <div className={cn(formGridClass, className)} {...props} />;
}

interface FieldRowProps {
	children: ReactNode;
	className?: string | undefined;
	/**
	 * The id of a control nested inside a layout wrapper. Direct controls inherit an id
	 * automatically, but a nested control must own this same id so the visible label can target it.
	 */
	controlId?: string;
	/**
	 * The visible message and the `aria-invalid` on the control, as one decision.
	 *
	 * They were two decisions at every call site and drifted apart in both directions: fields
	 * printed a red sentence beside a control a screen reader still reported as valid, and controls
	 * were painted invalid with nothing said about what was wrong.
	 */
	error?: null | string | undefined;
	/**
	 * Groups a composite control under the visible label instead of associating that label with one
	 * descendant. Use this when the control slot contains multiple controls or one component that
	 * owns multiple focus targets.
	 */
	group?: boolean;
	/**
	 * Help or status text for the control. The field owns its full-width measure and accessible
	 * description so call sites cannot accidentally make it narrower than the control or fold it
	 * into the control's accessible name.
	 */
	hint?: ReactNode;
	label: ReactNode;
	labelHidden?: boolean;
	/**
	 * Marks the control `aria-required` and the label with a `*`. Not the native `required`
	 * attribute: these forms submit through a button handler rather than a `<form>`, so the native
	 * one would announce a constraint nothing enforces, and would answer with a browser validation
	 * bubble that says less than the field's own message.
	 */
	required?: boolean;
}

export function FieldRow({
	children,
	className,
	controlId,
	error,
	group = false,
	hint,
	label,
	labelHidden = false,
	required = false,
}: FieldRowProps) {
	const generatedControlId = useId();
	const hintId = useId();
	const labelId = useId();
	const messageId = useId();
	const invalid = Boolean(error);
	// The first element child is the control; any additional control-adjacent content is left
	// untouched. Reaching the control is the whole point — a message rendered next to an input is
	// decoration until the input itself says which hint or error describes it.
	const items = Children.toArray(children);
	const controlIndex = items.findIndex((child) => isValidElement(child));
	const control = items[controlIndex];
	const existingControlId = isValidElement(control)
		? (control.props as { id?: unknown }).id
		: undefined;
	const resolvedControlId =
		controlId ??
		(typeof existingControlId === 'string' ? existingControlId : generatedControlId);
	const content = items.map((child, index) => {
		if (group || index !== controlIndex || !isValidElement(child)) return child;
		const controlProps = child.props as {
			'aria-describedby'?: string;
			id?: string;
		};
		return cloneElement(child as ReactElement<Record<string, unknown>>, {
			'aria-describedby':
				[
					controlProps['aria-describedby'],
					hint ? hintId : undefined,
					invalid ? messageId : undefined,
				]
					.filter(Boolean)
					.join(' ') || undefined,
			'aria-invalid': invalid || undefined,
			'aria-required': required || undefined,
			id: controlProps.id ?? (controlId === undefined ? resolvedControlId : undefined),
		});
	});
	const describedBy =
		[hint ? hintId : undefined, invalid ? messageId : undefined].filter(Boolean).join(' ') ||
		undefined;
	const labelContent = (
		<>
			{label}
			{/* Decoration: `aria-required` is what a screen reader reads, and announcing "star"
			    after every label is noise. */}
			{required && (
				<span aria-hidden="true" className={toneText.red}>
					{' *'}
				</span>
			)}
		</>
	);

	return (
		// The call site's track owns the horizontal measure. A field that is deliberately narrower
		// opts into a named measure there instead of making every FieldRow stop at the same width.
		<div className={cn('grid content-start gap-1', className)}>
			{group ? (
				<span className={cn(fieldLabelClass, labelHidden && 'sr-only')} id={labelId}>
					{labelContent}
				</span>
			) : (
				<label
					className={cn(fieldLabelClass, labelHidden && 'sr-only')}
					htmlFor={resolvedControlId}
					id={labelId}>
					{labelContent}
				</label>
			)}
			{group ? (
				<div
					aria-describedby={describedBy}
					aria-invalid={invalid || undefined}
					aria-labelledby={labelId}
					aria-required={required || undefined}
					className="grid gap-1"
					role="group">
					{content}
				</div>
			) : (
				content
			)}
			{error && (
				<p className={fieldErrorClass} id={messageId} role="alert">
					{error}
				</p>
			)}
			{hint ? (
				<div className={fieldHintClass} id={hintId}>
					<div className={proseMeasureClass}>{hint}</div>
				</div>
			) : null}
		</div>
	);
}

interface FieldCheckboxProps extends Omit<
	InputHTMLAttributes<HTMLInputElement>,
	'aria-label' | 'aria-labelledby' | 'type'
> {
	/**
	 * The sentence under the label. There is exactly one place for it, and this is it.
	 *
	 * Settings had three: inside the bordered box under the label, outside the box as a sibling
	 * paragraph, and in the section's own intro prose above the control. The Spernakit toggle used
	 * the second, so its box read as a bare switch and the sentence explaining it belonged, visually,
	 * to whatever came next.
	 */
	description?: ReactNode;
	indeterminate?: boolean;
	label: ReactNode;
	/** A status or key rendered at the end of the row — `ConfigKey`, "API key configured". */
	meta?: ReactNode;
	/**
	 * `amber` is for a toggle that widens what the app is allowed to do — the two that let an agent
	 * write files or open a port. It is the box that changes colour, not a sentence beside it.
	 */
	tone?: 'amber' | 'neutral';
}

/**
 * A checkbox that owns its bordered box, its label and its description.
 *
 * Nine call sites each rebuilt this row by hand and no two agreed: `items-center` against
 * `items-start`, `mt-0.5` on the box or not, the label at `font-medium text-foreground` or plain
 * `text-sm`, the description muted or toned or absent, and one that put the border on an inner
 * `<span>` so the description sat outside it.
 */
export function FieldCheckbox({
	className,
	description,
	disabled,
	label,
	meta,
	tone = 'neutral',
	...props
}: FieldCheckboxProps) {
	const descriptionId = useId();
	const labelId = useId();
	const toned = tone === 'amber';
	const describedBy =
		[props['aria-describedby'], description ? descriptionId : undefined]
			.filter(Boolean)
			.join(' ') || undefined;
	return (
		<label
			className={cn(
				// `max-sm:min-h-11` on the label, not the box. The 16px `<input>` cannot carry the
				// touch floor itself — Chrome drops padding on a native checkbox — and it does not
				// need to: this row is already its hit area, so raising the row raises the target.
				// Measured at 390 the no-description variant sat at 36px (`min-h-9`), which is what
				// put 70 checkboxes under the floor across the settings and audits surfaces.
				'flex gap-2 rounded-md border px-3 py-2 max-sm:min-h-11',
				description ? 'items-start' : 'min-h-9 items-center',
				toned ? `${toneBorder.amber} ${toneSurface.amber}` : 'border-border',
				className,
				disabled && disabledFieldSurfaceClass,
			)}>
			<Checkbox
				{...props}
				aria-describedby={describedBy}
				aria-labelledby={labelId}
				className={description ? 'mt-0.5' : undefined}
				disabled={disabled}
			/>
			<span
				className={cn(
					'min-w-0 flex-1 text-sm',
					disabled ? 'text-muted-foreground' : toned ? toneText.amber : 'text-foreground',
				)}>
				<span className="font-medium" id={labelId}>
					{label}
				</span>
				{description ? (
					// The measure lives on the slot, the way `CardHeader`'s description does. This
					// is where it pays most: a checkbox row spans the full settings grid, and the
					// Director-chat note is 289 characters, which ran as one 1551px line beside a
					// card header wrapping at 366px — two reading measures on one page.
					<span
						className={cn(
							'mt-1 block text-xs',
							proseMeasureClass,
							toned ? undefined : 'text-muted-foreground',
						)}
						id={descriptionId}>
						{description}
					</span>
				) : null}
			</span>
			{meta}
		</label>
	);
}

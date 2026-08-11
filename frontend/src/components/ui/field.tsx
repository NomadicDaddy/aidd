import type { InputHTMLAttributes, LabelHTMLAttributes, ReactElement, ReactNode } from 'react';

import { Children, cloneElement, isValidElement, useId } from 'react';

import { cn } from '../../lib/cn.ts';
import { fieldErrorClass, fieldLabelClass } from '../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { proseMeasureClass } from '../../lib/typography.ts';
import { Checkbox } from './checkbox.tsx';

interface FieldRowProps extends LabelHTMLAttributes<HTMLLabelElement> {
	children: ReactNode;
	/**
	 * The visible message and the `aria-invalid` on the control, as one decision.
	 *
	 * They were two decisions at every call site and drifted apart in both directions: fields
	 * printed a red sentence beside a control a screen reader still reported as valid, and controls
	 * were painted invalid with nothing said about what was wrong.
	 */
	error?: null | string | undefined;
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
	error,
	label,
	labelHidden = false,
	required = false,
	...props
}: FieldRowProps) {
	const messageId = useId();
	const invalid = Boolean(error);
	// The first element child is the control; a field that also renders a hint below it, or a
	// button beside it, leaves those untouched. Reaching the control is the whole point — a
	// message rendered next to an input is decoration until the input itself says it is invalid.
	const items = Children.toArray(children);
	const controlIndex = items.findIndex((child) => isValidElement(child));
	const content = items.map((child, index) => {
		if (index !== controlIndex || !isValidElement(child)) return child;
		const described = (child.props as { 'aria-describedby'?: string })['aria-describedby'];
		return cloneElement(child as ReactElement<Record<string, unknown>>, {
			'aria-describedby': invalid
				? [described, messageId].filter(Boolean).join(' ')
				: described,
			'aria-invalid': invalid || undefined,
			'aria-required': required || undefined,
		});
	});

	return (
		<label className={cn('grid gap-1', className)} {...props}>
			<span className={cn(fieldLabelClass, labelHidden && 'sr-only')}>
				{label}
				{/* Decoration: `aria-required` is what a screen reader reads, and announcing "star"
				    after every label is noise. This is the one red an untouched form may show, and
				    it means "not yet" — which is why it is a glyph and not a painted control. */}
				{required && (
					<span aria-hidden="true" className={toneText.red}>
						{' *'}
					</span>
				)}
			</span>
			{content}
			{error && (
				<p className={fieldErrorClass} id={messageId} role="alert">
					{error}
				</p>
			)}
		</label>
	);
}

interface FieldCheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
	/**
	 * The sentence under the label. There is exactly one place for it, and this is it.
	 *
	 * Settings had three: inside the bordered box under the label, outside the box as a sibling
	 * paragraph, and in the section's own intro prose above the control. The Spernakit toggle used
	 * the second, so its box read as a bare switch and the sentence explaining it belonged, visually,
	 * to whatever came next.
	 */
	description?: ReactNode;
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
	label,
	meta,
	tone = 'neutral',
	...props
}: FieldCheckboxProps) {
	const toned = tone === 'amber';
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
			)}>
			<Checkbox className={description ? 'mt-0.5' : undefined} {...props} />
			<span
				className={cn(
					'min-w-0 flex-1 text-sm',
					toned ? toneText.amber : 'text-foreground',
				)}>
				<span className="font-medium">{label}</span>
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
						)}>
						{description}
					</span>
				) : null}
			</span>
			{meta}
		</label>
	);
}

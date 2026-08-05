import type { LabelHTMLAttributes, ReactElement, ReactNode } from 'react';

import { Children, cloneElement, isValidElement, useId } from 'react';

import { cn } from '../../lib/cn.ts';
import { fieldErrorClass, fieldLabelClass } from '../../lib/formStyles.ts';
import { toneText } from '../../lib/tones.ts';

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

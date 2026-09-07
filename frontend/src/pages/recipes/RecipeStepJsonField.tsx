import { useState } from 'react';

import { DisclosureMarker } from '../../components/shared/DisclosureMarker.tsx';
import { Button } from '../../components/ui/button.tsx';
import { fieldErrorClass, fieldLabelClass, monoTextareaClass } from '../../lib/formStyles.ts';

// `min-h-40` rather than `min-h-28`: a five-line JSON object is the normal case here, and at
// 112px every real config is clipped mid-object and has to be dragged open before it can be
// read. `resize-y` still handles the long ones.
// One class, not two. The shared textarea carries the same `aria-invalid` variant as every other
// control, so the attribute this field already sets is what paints it; no hand-built invalid
// skin here.
// The measure is the mono one, and it is a real limit here rather than a nicety: the field is the
// full width of the step card, so at 2250px it would be a 1894px line of JSON 160px tall, and an object
// wrapped across that distance is read by scanning sideways. `monoTextareaClass` is 100
// characters exactly in this face, which is wider than any hook config the app writes.
const jsonTextareaClass = `${monoTextareaClass} min-h-40 font-mono text-xs`;

export type StepJsonFieldKey = 'configJson' | 'postHookJson' | 'preHookJson';

export function RecipeStepJsonField({
	error,
	fieldKey,
	label,
	onChange,
	placeholder,
	stepId,
	value,
}: {
	error: null | string;
	fieldKey: StepJsonFieldKey;
	label: string;
	onChange: (next: string) => void;
	placeholder?: string;
	stepId: string;
	value: string;
}) {
	const hasContent = value.trim().length > 0;
	// JSON is supporting configuration, not the primary step form. Keep saved values folded until
	// requested; an invalid value opens itself so the error and the field that caused it stay together.
	const [disclosed, setDisclosed] = useState(error !== null);
	const open = disclosed || error !== null;
	const errorId = `${stepId}-${fieldKey}-error`;
	const labelId = `${stepId}-${fieldKey}-label`;
	const textareaId = `${stepId}-${fieldKey}`;

	return (
		<div>
			<Button
				aria-controls={textareaId}
				aria-expanded={open}
				onClick={() => setDisclosed(!open)}
				size="compact"
				variant="ghost">
				<DisclosureMarker open={open} />
				{/* The label carries the same treatment as every other field label in the step, so
				    a collapsed field stops reading as a selected chip beside plain-text siblings. */}
				<span className={fieldLabelClass} id={labelId}>
					{label}
				</span>
				{!open && hasContent && (
					<span className="text-xs text-muted-foreground">(set)</span>
				)}
			</Button>
			{/* The field stays mounted and is hidden instead: `aria-controls` on the toggle has to
			    resolve to a real element, and a `<label>` cannot live inside the button, so the
			    textarea takes its name from the label span by reference. */}
			<div className="mt-1 grid gap-1" hidden={!open}>
				<textarea
					aria-describedby={error ? errorId : undefined}
					aria-invalid={Boolean(error)}
					aria-labelledby={labelId}
					className={jsonTextareaClass}
					data-testid={`step-${stepId}-${fieldKey}`}
					id={textareaId}
					onChange={(event) => {
						setDisclosed(true);
						onChange(event.target.value);
					}}
					placeholder={placeholder}
					value={value}
				/>
				{error ? (
					<p className={fieldErrorClass} id={errorId} role="alert">
						{error}
					</p>
				) : null}
			</div>
		</div>
	);
}

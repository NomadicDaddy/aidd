import { default as ChevronDown } from 'lucide-react/dist/esm/icons/chevron-down';
import { default as ChevronRight } from 'lucide-react/dist/esm/icons/chevron-right';
import { useState } from 'react';

import { Button } from '../../components/ui/button.tsx';
import { fieldErrorClass, fieldLabelClass, textareaClass } from '../../lib/formStyles.ts';

// `min-h-40` rather than the old `min-h-28`: a five-line JSON object is the normal case here, and
// at 112px every real config was clipped mid-object and had to be dragged open before it could be
// read. `resize-y` still handles the long ones.
// One class, not two. The invalid skin was built here by hand because `textareaClass` had no
// invalid state at all; it now carries the same `aria-invalid` variant as every other control, so
// the attribute this field already sets is what paints it.
const jsonTextareaClass = `${textareaClass} min-h-40 font-mono text-xs`;

export type StepJsonFieldKey = 'configJson' | 'postHookJson' | 'preHookJson';

export function RecipeStepJsonField({
	error,
	fieldKey,
	label,
	onChange,
	stepId,
	value,
}: {
	error: null | string;
	fieldKey: StepJsonFieldKey;
	label: string;
	onChange: (next: string) => void;
	stepId: string;
	value: string;
}) {
	const hasContent = value.trim().length > 0;
	// An empty hook field starts folded so it costs a row of chrome instead of 160px of blank
	// textarea; a field that already holds JSON opens with its content visible.
	const [open, setOpen] = useState(hasContent || fieldKey === 'configJson');
	const errorId = `${stepId}-${fieldKey}-error`;
	const labelId = `${stepId}-${fieldKey}-label`;
	const textareaId = `${stepId}-${fieldKey}`;

	return (
		<div>
			<Button
				aria-controls={textareaId}
				aria-expanded={open}
				onClick={() => setOpen((current) => !current)}
				size="compact"
				variant="ghost">
				{open ? (
					<ChevronDown aria-hidden="true" className="h-3.5 w-3.5" />
				) : (
					<ChevronRight aria-hidden="true" className="h-3.5 w-3.5" />
				)}
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
					onChange={(event) => onChange(event.target.value)}
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

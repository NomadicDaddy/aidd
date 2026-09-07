import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { cn } from '../../lib/cn.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { toneBorder, toneSurface, toneText } from '../../lib/tones.ts';
import { FieldRow } from '../ui/field.tsx';

interface DirectiveIntentFieldProps {
	onChange: (intent: SkillExecutionIntent) => void;
	value: SkillExecutionIntent;
}

/**
 * The execution-intent field, framed in the tone of what the choice authorises: a run that may
 * only look reads as ordinary, a run that may edit and commit does not.
 *
 * The framing travels with the control rather than staying inline in the modal, because the tone,
 * the border it paints, and the sentence describing the permission are one decision — split
 * across two files they drift, and a reassuring colour over a destructive permission is the
 * failure that matters here.
 * @param props.onChange Receives the newly selected intent.
 * @param props.value The intent currently in force.
 * @returns The bordered intent field.
 */
export function DirectiveIntentField({ onChange, value }: DirectiveIntentFieldProps) {
	const tone = value === 'apply-changes' ? 'amber' : 'teal';
	return (
		<div className={cn('rounded-xl border px-3 py-3', toneBorder[tone], toneSurface[tone])}>
			<FieldRow
				hint={
					<span className={toneText[tone]}>
						{value === 'review-only'
							? 'The run may inspect the project but must not edit files, metadata, or git history.'
							: 'The run may edit, test, update metadata, and create commits when the directive requires it.'}
					</span>
				}
				label="Execution intent">
				<select
					className={`${selectClass} w-full`}
					onChange={(event) => onChange(event.target.value as SkillExecutionIntent)}
					value={value}>
					<option value="review-only">Review only</option>
					<option value="apply-changes">Apply changes</option>
				</select>
			</FieldRow>
		</div>
	);
}

import { useState } from 'react';

import type { RecipeStepOnFailure, RecipeStepType } from '../../api/types.ts';
import type { StepDraft, StepJsonErrors } from './recipe-steps.ts';

import { NumberStepper } from '../../components/shared/NumberStepper.tsx';
import { Card } from '../../components/ui/card.tsx';
import { FieldRow, FormGrid } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { cn } from '../../lib/cn.ts';
import { selectClass } from '../../lib/formStyles.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import {
	newStepNamePlaceholder,
	stepConfigPlaceholder,
	stepNameErrorForDisplay,
} from './recipe-steps.ts';
import { RecipeStepEditorHeader } from './RecipeStepEditorHeader.tsx';
import { RecipeStepJsonField } from './RecipeStepJsonField.tsx';
import { RecipeStepMarker } from './RecipeStepMarker.tsx';

interface RecipeStepEditorProps {
	errors: StepJsonErrors;
	expanded: boolean;
	index: number;
	onChange: (patch: Partial<StepDraft>) => void;
	onDelete: () => void;
	onMoveDown: () => void;
	onMoveUp: () => void;
	onToggle: () => void;
	showAllErrors: boolean;
	step: StepDraft;
	/** How many steps the recipe has, which is what decides whether order is a thing at all. */
	total: number;
}

export function RecipeStepEditor({
	errors,
	expanded,
	index,
	onChange,
	onDelete,
	onMoveDown,
	onMoveUp,
	onToggle,
	showAllErrors,
	step,
	total,
}: RecipeStepEditorProps) {
	const [nameTouched, setNameTouched] = useState(false);
	const nameError = stepNameErrorForDisplay(errors.name, nameTouched, showAllErrors);
	const whenParameterError = errors.when && !step.whenParameter.trim() ? errors.when : null;
	const whenEqualsError = errors.when && !step.whenEquals.trim() ? errors.when : null;
	return (
		// The marker and the spine, the same ones the overview draws, with the step card in the right
		// track. A flat `Step 1` badge and no spine would stop the list looking like a pipeline at
		// exactly the point where its order is being changed, and the move controls would have
		// nothing visible to move against.
		<div className="flex gap-3">
			<RecipeStepMarker isLast={index === total - 1} stepNumber={index + 1} />
			{/* `pb-4` on the track rather than `space-y-4` on the list: the gap between two steps has
			    to be inside the spine's column for the spine to reach the next marker. */}
			<div className="min-w-0 flex-1 pb-4">
				{/* A sunken card rather than a bare bordered div: the step list sits inside the Steps
				    card, and nesting a default card in a default card gave two identical surfaces
				    with no depth between them. */}
				<Card className="@container space-y-3" variant="sunken">
					<RecipeStepEditorHeader
						expanded={expanded}
						index={index}
						onDelete={onDelete}
						onMoveDown={onMoveDown}
						onMoveUp={onMoveUp}
						onToggle={onToggle}
						step={step}
						total={total}
					/>
					{expanded ? (
						<>
							{/* Two steps, both measured against this card rather than the viewport. A step editor is
			    two cards deep — the Steps card and this sunken one, `p-4` each — so its interior is
			    the content column less 64px, so `sm:`/`xl:` here would describe a width the
			    controls never actually have. `32rem` is the first width where two of these are still
			    wide enough to read; `58rem` is the interior at the 992px content tier, which is where
			    the 4-up arrives. */}
							<FormGrid className="@min-[32rem]:grid-cols-2 @min-[58rem]:grid-cols-[minmax(0,20rem)_minmax(0,20rem)_minmax(0,20rem)_minmax(0,8rem)]">
								<FieldRow error={nameError} label="Step name" required>
									<Input
										name="step-name"
										onBlur={() => setNameTouched(true)}
										onChange={(event) => {
											setNameTouched(true);
											onChange({ name: event.target.value });
										}}
										// A suggestion, not a value: as a value it was already filled in and already
										// valid, so nothing on the form ever asked for it to be changed and
										// "New shell step" reached the recipe file under that name.
										placeholder={newStepNamePlaceholder(step.stepType)}
										value={step.name}
									/>
								</FieldRow>
								<FieldRow label="Step type">
									<select
										className={selectClass}
										name="step-type"
										onChange={(event) =>
											onChange({
												skillExecutionIntent: 'review-only',
												stepType: event.target.value as RecipeStepType,
											})
										}
										value={step.stepType}>
										<option value="aidd-cli">aidd-cli</option>
										<option value="skill">skill</option>
										<option value="shell">shell</option>
										<option value="recipe-ref">recipe-ref</option>
									</select>
								</FieldRow>
								<FieldRow label="Failure behavior">
									<select
										className={selectClass}
										name="step-on-failure"
										onChange={(event) =>
											onChange({
												onFailure: event.target
													.value as RecipeStepOnFailure,
											})
										}
										value={step.onFailure}>
										<option value="stop">stop</option>
										<option value="continue">continue</option>
										<option value="auto-fix">auto-fix</option>
									</select>
								</FieldRow>
								{/* The one field on this page whose only affordance was the native number
						    spinner. Chrome paints no spinner at rest and a touch device never hovers, so
						    at 390x844 this read as a plain text input; the spinner it does paint on a
						    pointer is a UA pseudo-element no class can reach. NumberStepper suppresses it
						    and puts the same operation on two 44px controls. */}
								<FieldRow group label="Retry count">
									<NumberStepper
										label="retry count"
										name="step-retry-count"
										onChange={(retryCount) => onChange({ retryCount })}
										value={step.retryCount}
									/>
								</FieldRow>
								{/* Folded into the same grid instead of its own `max-w-xs` band below it: the
				    intent is a property of the step like the three beside it, and the stray band
				    read as a separate section that only skill steps happened to grow.

				    Two tracks at the 4-up step, because it is the fifth field of five and a lone
				    track left it with 1429px of empty row beside it and its two-sentence helper
				    wrapped onto three lines underneath. Two tracks put the sentence on one line and
				    halve the void; three would close the row and give a two-option select 1370px of
				    width, which trades one disproportion for a worse one. */}
								{step.stepType === 'skill' ? (
									<FieldRow
										className="@min-[58rem]:col-span-2"
										error={errors.executionIntent}
										hint="Skill steps are directives, not audits. Apply changes permits edits and commits."
										label="Execution intent">
										<select
											className={selectClass}
											onChange={(event) =>
												onChange({
													skillExecutionIntent: event.target.value,
												})
											}
											value={step.skillExecutionIntent}>
											<option value="review-only">Review only</option>
											<option value="apply-changes">Apply changes</option>
										</select>
									</FieldRow>
								) : null}
							</FormGrid>
							<fieldset className="min-w-0">
								{/* Named as one optional group: the two inputs are meaningless apart, and on their
				    own they read as two more required fields in the same stack.
				    A group caption, not a third field label: in `fieldLabelClass` it was the same
				    size, weight and colour as `Run when parameter` directly beneath it, 4px away, so
				    the two read as siblings and the grouping it exists to state was invisible.
				    `sectionCaptionClass` is a step *above* a field label — semibold, wider tracking
				    — which is the direction a group has to sit relative to its children. The
				    micro-label it briefly used was a step below, which said the opposite. */}
								<legend className={cn(sectionCaptionClass, 'mb-2 text-foreground')}>
									Condition (optional)
								</legend>
								{/* The same `32rem` the field grid above uses, and for the same reason: `sm:` is a
				    640px viewport, which inside two nested cards is a card interior of 528px or
				    352px depending on the rail. The pair either fits side by side or it does not,
				    and only this card's own width knows which. */}
								<div className="flex flex-wrap gap-3">
									{/* The message belongs to the empty half of the pair. `errors.when` is raised
					    when exactly one of the two is filled, so marking both invalid pointed at
					    the field that was already right, and the sentence sat under the pair
					    belonging to neither. */}
									<FieldRow
										className="w-full @min-[45rem]:w-80"
										error={whenParameterError}
										label="Run when parameter">
										<Input
											onChange={(event) =>
												onChange({ whenParameter: event.target.value })
											}
											// A shape, not a plausible value: `stopBeforeImplementation` in grey
											// was read as a filled-in default often enough to be worth losing.
											placeholder="parameter name"
											value={step.whenParameter}
										/>
									</FieldRow>
									<FieldRow
										className="w-full @min-[45rem]:w-80"
										error={whenEqualsError}
										label="Equals">
										<Input
											onChange={(event) =>
												onChange({ whenEquals: event.target.value })
											}
											placeholder="expected value"
											value={step.whenEquals}
										/>
									</FieldRow>
								</div>
							</fieldset>
							{/* Stacked full width rather than three narrow columns: JSON is the one thing here that
			    is read line by line, and a third of the card wrapped every object into noise. */}
							<div className="space-y-2">
								<RecipeStepJsonField
									error={errors.configJson}
									fieldKey="configJson"
									label="Config JSON"
									onChange={(next) => onChange({ configJson: next })}
									placeholder={stepConfigPlaceholder(step.stepType)}
									stepId={step.id}
									value={step.configJson}
								/>
								<RecipeStepJsonField
									error={errors.preHookJson}
									fieldKey="preHookJson"
									label="Pre-hook JSON"
									onChange={(next) => onChange({ preHookJson: next })}
									stepId={step.id}
									value={step.preHookJson}
								/>
								<RecipeStepJsonField
									error={errors.postHookJson}
									fieldKey="postHookJson"
									label="Post-hook JSON"
									onChange={(next) => onChange({ postHookJson: next })}
									stepId={step.id}
									value={step.postHookJson}
								/>
							</div>
						</>
					) : null}
				</Card>
			</div>
		</div>
	);
}

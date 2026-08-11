import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { RecipeStepOnFailure, RecipeStepType } from '../../api/types.ts';
import type { StepDraft, StepJsonErrors } from './recipe-steps.ts';

import { IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { selectClass } from '../../lib/formStyles.ts';
import { dangerRowActionClass } from '../../lib/tones.ts';
import { sectionCaptionClass } from '../../lib/typography.ts';
import { newStepNamePlaceholder } from './recipe-steps.ts';
import { RecipeStepJsonField } from './RecipeStepJsonField.tsx';
import { RecipeStepMarker } from './RecipeStepMarker.tsx';

interface RecipeStepEditorProps {
	errors: StepJsonErrors;
	index: number;
	onChange: (patch: Partial<StepDraft>) => void;
	onDelete: () => void;
	onMoveDown: () => void;
	onMoveUp: () => void;
	step: StepDraft;
	/** How many steps the recipe has, which is what decides whether order is a thing at all. */
	total: number;
}

export function RecipeStepEditor({
	errors,
	index,
	onChange,
	onDelete,
	onMoveDown,
	onMoveUp,
	step,
	total,
}: RecipeStepEditorProps) {
	const whenParameterError = errors.when && !step.whenParameter.trim() ? errors.when : null;
	const whenEqualsError = errors.when && !step.whenEquals.trim() ? errors.when : null;
	return (
		// The marker and the spine, the same ones the overview draws, with the step card in the right
		// track. Edit mode used to mark order with a flat `Step 1` badge and no spine at all, so the
		// list stopped looking like a pipeline at exactly the point where its order is being changed
		// and the move controls had nothing visible to move against.
		<div className="flex gap-3">
			<RecipeStepMarker isLast={index === total - 1} stepNumber={index + 1} />
			{/* `pb-4` on the track rather than `space-y-4` on the list: the gap between two steps has
			    to be inside the spine's column for the spine to reach the next marker. */}
			<div className="min-w-0 flex-1 pb-4">
				{/* A sunken card rather than a bare bordered div: the step list sits inside the Steps
				    card, and nesting a default card in a default card gave two identical surfaces
				    with no depth between them. */}
				<Card className="@container space-y-3" variant="sunken">
					{/* No `Step N` badge and no `<h3>{step.name}</h3>`: the marker beside the card
					    numbers the step, and the name is the first editable field one row down, so a
					    heading here was a second copy that went stale mid-keystroke. What is left is
					    the controls that act on this step, left-aligned beside the marker they act
					    against — `justify-between` put roughly 1650px between the label and its own
					    delete button at 2250px, and a trash icon that far from anything reads as
					    belonging to the card rather than to the row. */}
					<div className="flex items-center gap-1">
						{/* Order is the one property of a step the form could not change: the badge
					    numbers the steps, the runner executes them in that order, and the only way
					    to move one was to delete it and retype it at the end. Hidden entirely for a
					    single step — one step has no order — and disabled at each end of the list,
					    where the alternative is a control that moves depending on which step you
					    are looking at. */}
						{total > 1 ? (
							<>
								<IconButton
									ariaLabel={`Move step ${index + 1} up`}
									disabled={index === 0}
									onClick={onMoveUp}
									variant="ghost">
									<ArrowUp className="h-4 w-4" />
								</IconButton>
								<IconButton
									ariaLabel={`Move step ${index + 1} down`}
									disabled={index === total - 1}
									onClick={onMoveDown}
									variant="ghost">
									<ArrowDown className="h-4 w-4" />
								</IconButton>
							</>
						) : null}
						{/* Deleting one step of many is a row action, not the destructive climax of the
					    form — it takes an icon button that turns red on hover instead of a filled
					    danger button repeated down the list. */}
						<IconButton
							ariaLabel={`Delete step ${index + 1}`}
							className={dangerRowActionClass}
							onClick={onDelete}
							variant="ghost">
							<Trash2 className="h-4 w-4" />
						</IconButton>
					</div>
					{/* Two steps, both measured against this card rather than the viewport. A step editor is
			    two cards deep — the Steps card and this sunken one, `p-4` each — so its interior is
			    the content column less 64px, and `sm:`/`xl:` here were describing a width the
			    controls never actually had. `32rem` is the first width where two of these are still
			    wide enough to read; `58rem` is the interior at the 992px content tier, which is where
			    the 4-up used to arrive and still does. */}
					<div className="grid gap-3 @min-[32rem]:grid-cols-2 @min-[58rem]:grid-cols-4">
						<FieldRow label="Step name" required>
							<Input
								name="step-name"
								onChange={(event) => onChange({ name: event.target.value })}
								// A suggestion, not a value: as a value it was already filled in and already
								// valid, so nothing on the form ever asked for it to be changed and
								// "New shell step" reached the recipe file under that name.
								placeholder={newStepNamePlaceholder}
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
										onFailure: event.target.value as RecipeStepOnFailure,
									})
								}
								value={step.onFailure}>
								<option value="stop">stop</option>
								<option value="continue">continue</option>
								<option value="auto-fix">auto-fix</option>
							</select>
						</FieldRow>
						<FieldRow label="Retry count">
							<Input
								name="step-retry-count"
								onChange={(event) => onChange({ retryCount: event.target.value })}
								type="number"
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
							<FieldRow className="@min-[58rem]:col-span-2" label="Execution intent">
								<select
									className={selectClass}
									onChange={(event) =>
										onChange({
											skillExecutionIntent: event.target
												.value as SkillExecutionIntent,
										})
									}
									value={step.skillExecutionIntent}>
									<option value="review-only">Review only</option>
									<option value="apply-changes">Apply changes</option>
								</select>
								<span className="text-xs text-muted-foreground">
									Skill steps are directives, not audits. Apply changes permits
									edits and commits.
								</span>
							</FieldRow>
						) : null}
					</div>
					<div className="flex flex-col gap-2">
						{/* Named as one optional group: the two inputs are meaningless apart, and on their
				    own they read as two more required fields in the same stack.
				    A group caption, not a third field label: in `fieldLabelClass` it was the same
				    size, weight and colour as `Run when parameter` directly beneath it, 4px away, so
				    the two read as siblings and the grouping it exists to state was invisible.
				    `sectionCaptionClass` is a step *above* a field label — semibold, wider tracking
				    — which is the direction a group has to sit relative to its children. The
				    micro-label it briefly used was a step below, which said the opposite. */}
						<p className={sectionCaptionClass}>Condition (optional)</p>
						{/* The same `32rem` the field grid above uses, and for the same reason: `sm:` is a
				    640px viewport, which inside two nested cards is a card interior of 528px or
				    352px depending on the rail. The pair either fits side by side or it does not,
				    and only this card's own width knows which. */}
						<div className="grid gap-3 @min-[32rem]:grid-cols-2">
							{/* The message belongs to the empty half of the pair. `errors.when` is raised
					    when exactly one of the two is filled, so marking both invalid pointed at
					    the field that was already right, and the sentence sat under the pair
					    belonging to neither. */}
							<FieldRow error={whenParameterError} label="Run when parameter">
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
							<FieldRow error={whenEqualsError} label="Equals">
								<Input
									onChange={(event) =>
										onChange({ whenEquals: event.target.value })
									}
									placeholder="expected value"
									value={step.whenEquals}
								/>
							</FieldRow>
						</div>
					</div>
					{/* Stacked full width rather than three narrow columns: JSON is the one thing here that
			    is read line by line, and a third of the card wrapped every object into noise. */}
					<div className="space-y-2">
						<RecipeStepJsonField
							error={errors.configJson}
							fieldKey="configJson"
							label="Config JSON"
							onChange={(next) => onChange({ configJson: next })}
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
				</Card>
			</div>
		</div>
	);
}

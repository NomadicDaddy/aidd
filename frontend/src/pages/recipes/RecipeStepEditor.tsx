import type { SkillExecutionIntent } from 'aidd-shared/skill-execution-intent';

import { default as ArrowDown } from 'lucide-react/dist/esm/icons/arrow-down';
import { default as ArrowUp } from 'lucide-react/dist/esm/icons/arrow-up';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';

import type { RecipeStepOnFailure, RecipeStepType } from '../../api/types.ts';
import type { StepDraft, StepJsonErrors } from './recipe-steps.ts';

import { Badge } from '../../components/ui/badge.tsx';
import { IconButton } from '../../components/ui/button.tsx';
import { Card } from '../../components/ui/card.tsx';
import { FieldRow } from '../../components/ui/field.tsx';
import { Input } from '../../components/ui/input.tsx';
import { fieldLabelClass, selectClass } from '../../lib/formStyles.ts';
import { dangerRowActionClass } from '../../lib/tones.ts';
import { newStepNamePlaceholder } from './recipe-steps.ts';
import { RecipeStepJsonField } from './RecipeStepJsonField.tsx';

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
		// A sunken card rather than a bare bordered div: the step list sits inside the Steps card,
		// and nesting a default card in a default card gave two identical surfaces with no depth
		// between them.
		<Card className="space-y-3" variant="sunken">
			<div className="flex items-center justify-between gap-3">
				{/* No `<h3>{step.name}</h3>` under the badge: the name is the first editable field
				    two rows down, so the heading was a second copy that went stale mid-keystroke. */}
				<Badge>Step {index + 1}</Badge>
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
			</div>
			{/* `sm:grid-cols-2` before the 4-up: between 640 and 768 these four controls were a
			    single stacked column while the card had room for two. */}
			<div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
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
							onChange({ onFailure: event.target.value as RecipeStepOnFailure })
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
				    read as a separate section that only skill steps happened to grow. */}
				{step.stepType === 'skill' ? (
					<FieldRow label="Execution intent">
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
							Skill steps are directives, not audits. Apply changes permits edits and
							commits.
						</span>
					</FieldRow>
				) : null}
			</div>
			<div>
				{/* Named as one optional group: the two inputs are meaningless apart, and on their
				    own they read as two more required fields in the same stack. */}
				<p className={`mb-1 ${fieldLabelClass}`}>Condition (optional)</p>
				<div className="grid gap-3 sm:grid-cols-2">
					{/* The message belongs to the empty half of the pair. `errors.when` is raised
					    when exactly one of the two is filled, so marking both invalid pointed at
					    the field that was already right, and the sentence sat under the pair
					    belonging to neither. */}
					<FieldRow error={whenParameterError} label="Run when parameter">
						<Input
							onChange={(event) => onChange({ whenParameter: event.target.value })}
							// A shape, not a plausible value: `stopBeforeImplementation` in grey
							// was read as a filled-in default often enough to be worth losing.
							placeholder="parameter name"
							value={step.whenParameter}
						/>
					</FieldRow>
					<FieldRow error={whenEqualsError} label="Equals">
						<Input
							onChange={(event) => onChange({ whenEquals: event.target.value })}
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
	);
}

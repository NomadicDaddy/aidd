import type { Dispatch, SetStateAction } from 'react';

import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { Link } from 'react-router';

import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { EditorActionBar } from '../../../components/shared/EditorActionBar.tsx';
import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { touchTargetTextClass } from '../../../lib/touchTarget.ts';
import { moveStep, newStepDraft, type StepDraft, type StepJsonErrors } from '../recipe-steps.ts';
import { RecipeStepEditor } from '../RecipeStepEditor.tsx';
import { RecipeParametersCard } from './RecipeParametersCard.tsx';

interface StepErrorEntry extends StepJsonErrors {
	id: string;
}

/**
 * Every condition under which `onSave` bails with a toast, in the order the pages check them.
 *
 * The commit control was refusing work it looked perfectly willing to do — a 3572px page whose only
 * hint was a `title` on the button, which is unreachable from the keyboard and unannounced by a
 * screen reader. Stating the reason beside the control costs nothing and answers it in place.
 */
function saveBlocker({
	hasJsonErrors,
	id,
	idError,
	isCreate,
	name,
	nameReadOnly,
	steps,
}: {
	hasJsonErrors: boolean;
	id: string;
	idError: null | string | undefined;
	isCreate: boolean;
	name: string;
	nameReadOnly: boolean;
	steps: StepDraft[];
}): null | string {
	// `nameReadOnly` is a system recipe, whose name is fixed and never empty.
	if (!nameReadOnly && !name.trim()) return 'Recipe name is required';
	if (isCreate && !id.trim()) return 'Recipe id is required';
	if (idError) return idError;
	if (steps.length === 0) return 'Add at least one step';
	if (steps.some((step) => !step.name.trim())) return 'Every step needs a name';
	if (hasJsonErrors) return 'Fix recipe step JSON errors before saving';
	return null;
}

interface Props {
	description: string;
	dirty: boolean;
	hasJsonErrors: boolean;
	id: string;
	idError?: null | string;
	name: string;
	nameReadOnly?: boolean;
	onCancel: () => void;
	onReload?: () => void;
	onSave: () => void;
	parameters: RecipeParameterDefinition[];
	saving?: boolean;
	setDescription: Dispatch<SetStateAction<string>>;
	setId?: (value: string) => void;
	setName: (value: string) => void;
	setParameters: Dispatch<SetStateAction<RecipeParameterDefinition[]>>;
	setSteps: Dispatch<SetStateAction<StepDraft[]>>;
	stepErrors: StepErrorEntry[];
	steps: StepDraft[];
	updateStep: (stepId: string, patch: Partial<StepDraft>) => void;
}

export function RecipeEditMode({
	description,
	dirty,
	hasJsonErrors,
	id,
	idError,
	name,
	nameReadOnly = false,
	onCancel,
	onReload,
	onSave,
	parameters,
	saving = false,
	setDescription,
	setId,
	setName,
	setParameters,
	setSteps,
	stepErrors,
	steps,
	updateStep,
}: Props) {
	const isCreate = setId !== undefined;
	const saveBlockedBy = saveBlocker({
		hasJsonErrors,
		id,
		idError,
		isCreate,
		name,
		nameReadOnly,
		steps,
	});
	return (
		// `page-reveal` belongs here rather than on the wrapper each caller supplied: the animation
		// staggers a container's *direct children*, and both callers wrapped this component in a
		// single div, so the whole form was one child and faded in as a single block. Here the header,
		// the action bar, and the three cards are the children the stagger was written for.
		<div className="page-reveal space-y-5">
			<PageHeader
				actions={
					onReload ? (
						<Button onClick={onReload}>
							<RefreshCw className="h-4 w-4" />
							Reload
						</Button>
					) : undefined
				}
				breadcrumb={
					<span className="flex items-center gap-2">
						<Link className={`hover:underline ${touchTargetTextClass}`} to="/recipes">
							Recipes
						</Link>
						<span>/</span>
						<span className="text-foreground">
							{name || (isCreate ? 'New Recipe' : id)}
						</span>
					</span>
				}
				helpSlug="recipes"
				// "Edit Recipe" told you the mode and lost the subject: three recipes open in three
				// tabs were three identical headings. The recipe keeps its name and the mode moves
				// into a badge beside it.
				title={
					isCreate ? (
						'New Recipe'
					) : (
						<span className="flex flex-wrap items-center gap-2">
							{name || id}
							<Badge tone="teal">Editing</Badge>
						</span>
					)
				}
			/>

			{/* "Cancel", not "Discard": in edit mode this is also the way back to the overview, which
			    is why it stays live on a clean form. Settings' Discard reverts in place and has
			    somewhere to sit idle; this one does not. It does revert — `RecipeDetailPage`
			    re-seeds the form from the loaded recipe before it changes mode — so the word covers
			    both halves of what it does rather than only the visible one. */}
			<EditorActionBar
				blockReason={saveBlockedBy}
				dirty={dirty}
				discardEnabledWhenClean
				discardLabel="Cancel"
				onDiscard={onCancel}
				onSave={onSave}
				pending={saving}
				pendingLabel={isCreate ? 'Creating…' : 'Saving…'}
				saveLabel={isCreate ? 'Create' : 'Save'}
			/>

			{/* Weighted tracks, not equal ones. Three `1fr` columns gave a slug field, a name and a
			    description 635px each at 2250px, which is several times what an id will ever hold and
			    still the tightest of the three for the one field that takes a sentence. The
			    `minmax(0,…)` floors keep the first two from being squeezed below their content. */}
			<Card
				className={`grid gap-3 ${isCreate ? 'lg:grid-cols-[minmax(0,16rem)_minmax(0,20rem)_1fr]' : 'lg:grid-cols-[minmax(0,20rem)_1fr]'}`}>
				{/* Both of these block Save, and neither said so until Save was pressed. The id
				    additionally showed a red message beside a control still rendering the ordinary
				    grey border, which read as a note about the field rather than a fault in it. */}
				{setId && (
					<FieldRow error={idError} label="Id" required>
						{/* The one field on this form whose value is a slug rather than prose —
						    it is what the grid, the telemetry rows and the URL all render in
						    mono, so it is typed in mono too. */}
						<Input
							className="font-mono"
							onChange={(event) => setId(event.target.value)}
							placeholder="my-recipe"
							value={id}
						/>
					</FieldRow>
				)}
				<FieldRow label="Name" required={!nameReadOnly}>
					<Input
						disabled={nameReadOnly}
						onChange={(event) => setName(event.target.value)}
						value={name}
					/>
					{nameReadOnly && (
						<p className="text-xs text-muted-foreground">
							System recipe names are reserved and cannot be changed.
						</p>
					)}
				</FieldRow>
				<FieldRow label="Description">
					<Input
						onChange={(event) => setDescription(event.target.value)}
						value={description}
					/>
				</FieldRow>
			</Card>

			<RecipeParametersCard parameters={parameters} setParameters={setParameters} />

			<Card className="flex flex-col gap-4">
				<CardHeader
					action={
						<Button onClick={() => setSteps((current) => [...current, newStepDraft()])}>
							<Plus className="h-4 w-4" />
							Add Step
						</Button>
					}
					className="mb-0"
					title="Steps"
				/>
				<div className="space-y-4">
					{steps.map((step, index) => {
						const errors = stepErrors.find((entry) => entry.id === step.id) ?? {
							configJson: null,
							id: step.id,
							postHookJson: null,
							preHookJson: null,
							when: null,
						};
						return (
							<RecipeStepEditor
								errors={errors}
								index={index}
								key={step.id}
								onChange={(patch) => updateStep(step.id, patch)}
								onDelete={() =>
									setSteps((current) =>
										current.filter((entry) => entry.id !== step.id),
									)
								}
								onMoveDown={() =>
									setSteps((current) => moveStep(current, index, index + 1))
								}
								onMoveUp={() =>
									setSteps((current) => moveStep(current, index, index - 1))
								}
								step={step}
								total={steps.length}
							/>
						);
					})}
				</div>
			</Card>
		</div>
	);
}

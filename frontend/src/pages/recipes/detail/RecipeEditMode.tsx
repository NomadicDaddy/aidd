import type { Dispatch, SetStateAction } from 'react';

import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { Link } from 'react-router';

import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { Badge } from '../../../components/ui/badge.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card, CardHeader } from '../../../components/ui/card.tsx';
import { FieldRow } from '../../../components/ui/field.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { moveStep, newStepDraft, type StepDraft, type StepJsonErrors } from '../recipe-steps.ts';
import { RecipeStepEditor } from '../RecipeStepEditor.tsx';
import { RecipeParametersCard } from './RecipeParametersCard.tsx';

interface StepErrorEntry extends StepJsonErrors {
	id: string;
}

interface Props {
	description: string;
	hasJsonErrors: boolean;
	id: string;
	idError?: null | string;
	name: string;
	nameReadOnly?: boolean;
	onCancel: () => void;
	onReload?: () => void;
	onSave: () => void;
	parameters: RecipeParameterDefinition[];
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
	hasJsonErrors,
	id,
	idError,
	name,
	nameReadOnly = false,
	onCancel,
	onReload,
	onSave,
	parameters,
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
	/* Both of these already stop `onSave` and raise a toast, so the commit action was refusing work
	   it looked perfectly willing to do. An invalid id is as blocking as unparseable step JSON and
	   belongs in the same signal. */
	const saveBlockedBy: string | undefined = hasJsonErrors
		? 'Fix recipe step JSON errors before saving'
		: (idError ?? undefined) || undefined;
	return (
		<div className="space-y-5">
			<PageHeader
				actions={
					<div className="flex flex-wrap gap-2">
						<Button onClick={onCancel} variant="ghost">
							<X className="h-4 w-4" />
							Cancel
						</Button>
						{onReload && (
							<Button onClick={onReload}>
								<RefreshCw className="h-4 w-4" />
								Reload
							</Button>
						)}
						<Button
							aria-disabled={saveBlockedBy !== undefined || undefined}
							onClick={onSave}
							title={saveBlockedBy}
							variant="primary">
							<Save className="h-4 w-4" />
							{isCreate ? 'Create' : 'Save'}
						</Button>
					</div>
				}
				breadcrumb={
					<span className="flex items-center gap-2">
						<Link className="hover:underline" to="/recipes">
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

			<Card className={`grid gap-3 ${isCreate ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
				{/* Both of these block Save, and neither said so until Save was pressed. The id
				    additionally showed a red message beside a control still rendering the ordinary
				    grey border, which read as a note about the field rather than a fault in it. */}
				{setId && (
					<FieldRow error={idError} label="Id" required>
						<Input
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

			<Card className="space-y-4">
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

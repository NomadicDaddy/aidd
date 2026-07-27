import type { Dispatch, SetStateAction } from 'react';

import { default as Plus } from 'lucide-react/dist/esm/icons/plus';
import { default as RefreshCw } from 'lucide-react/dist/esm/icons/refresh-cw';
import { default as Save } from 'lucide-react/dist/esm/icons/save';
import { default as Trash2 } from 'lucide-react/dist/esm/icons/trash-2';
import { default as X } from 'lucide-react/dist/esm/icons/x';
import { Link } from 'react-router';

import type { RecipeParameterDefinition } from '../../../api/types.ts';

import { PageHeader } from '../../../components/shared/PageHeader.tsx';
import { Button } from '../../../components/ui/button.tsx';
import { Card } from '../../../components/ui/card.tsx';
import { Input } from '../../../components/ui/input.tsx';
import { newStepDraft, type StepDraft, type StepJsonErrors } from '../recipe-steps.ts';
import { RecipeStepEditor } from '../RecipeStepEditor.tsx';

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
							aria-disabled={hasJsonErrors || undefined}
							onClick={onSave}
							title={
								hasJsonErrors
									? 'Fix recipe step JSON errors before saving'
									: undefined
							}
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
						<span className="text-neutral-700 dark:text-neutral-300">
							{name || (isCreate ? 'New Recipe' : id)}
						</span>
					</span>
				}
				helpSlug="recipes"
				title={isCreate ? 'New Recipe' : 'Edit Recipe'}
			/>

			<Card className={`grid gap-3 ${isCreate ? 'lg:grid-cols-3' : 'lg:grid-cols-2'}`}>
				{setId && (
					<label className="space-y-1">
						<span className="text-xs font-medium text-neutral-500 uppercase">Id</span>
						<Input
							onChange={(event) => setId(event.target.value)}
							placeholder="my-recipe"
							value={id}
						/>
						{idError && (
							<p className="text-xs text-red-600 dark:text-red-400">{idError}</p>
						)}
					</label>
				)}
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">Name</span>
					<Input
						disabled={nameReadOnly}
						onChange={(event) => setName(event.target.value)}
						value={name}
					/>
					{nameReadOnly && (
						<p className="text-xs text-neutral-500">
							System recipe names are reserved and cannot be changed.
						</p>
					)}
				</label>
				<label className="space-y-1">
					<span className="text-xs font-medium text-neutral-500 uppercase">
						Description
					</span>
					<Input
						onChange={(event) => setDescription(event.target.value)}
						value={description}
					/>
				</label>
			</Card>

			<Card className="space-y-3">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold text-foreground">Parameters</h2>
					<Button
						onClick={() =>
							setParameters((current) => [...current, { description: '', name: '' }])
						}>
						<Plus className="h-4 w-4" />
						Add
					</Button>
				</div>
				<div className="grid gap-3">
					{parameters.map((parameter, index) => (
						<div className="grid gap-3 md:grid-cols-[1fr_2fr_1fr_auto]" key={index}>
							<Input
								onChange={(event) =>
									setParameters((current) =>
										current.map((entry, entryIndex) =>
											entryIndex === index
												? { ...entry, name: event.target.value }
												: entry,
										),
									)
								}
								placeholder="name"
								value={parameter.name}
							/>
							<Input
								onChange={(event) =>
									setParameters((current) =>
										current.map((entry, entryIndex) =>
											entryIndex === index
												? { ...entry, description: event.target.value }
												: entry,
										),
									)
								}
								placeholder="description"
								value={parameter.description ?? ''}
							/>
							<Input
								onChange={(event) =>
									setParameters((current) =>
										current.map((entry, entryIndex) =>
											entryIndex === index
												? { ...entry, defaultValue: event.target.value }
												: entry,
										),
									)
								}
								placeholder="default"
								value={parameter.defaultValue ?? ''}
							/>
							<Button
								aria-label="Remove parameter"
								onClick={() =>
									setParameters((current) =>
										current.filter((_, entryIndex) => entryIndex !== index),
									)
								}
								variant="danger">
								<Trash2 className="h-4 w-4" />
							</Button>
						</div>
					))}
				</div>
			</Card>

			<Card className="space-y-4">
				<div className="flex items-center justify-between">
					<h2 className="text-lg font-semibold text-foreground">Ordered Steps</h2>
					<Button onClick={() => setSteps((current) => [...current, newStepDraft()])}>
						<Plus className="h-4 w-4" />
						Add Step
					</Button>
				</div>
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
								step={step}
							/>
						);
					})}
				</div>
			</Card>
		</div>
	);
}

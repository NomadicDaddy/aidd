/* eslint-disable @typescript-eslint/no-floating-promises */
import { isSystemRecipeId } from 'aidd-shared/system-recipes';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { RecipeDefinition, RecipeParameterDefinition } from '../../api/types.ts';

import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useRecipes } from '../../hooks/useRecipes.ts';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard.ts';
import { cleanParameter } from './detail/recipe-detail-form.ts';
import { RecipeEditMode } from './detail/RecipeEditMode.tsx';
import { collectStepErrors, newStepDraft, type StepDraft, toStep } from './recipe-steps.ts';

const recipeIdPattern = /^[a-zA-Z0-9_-]+$/;

function slugifyName(name: string): string {
	return name
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9_-]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function validateRecipeId(id: string, existingIds: Set<string>): null | string {
	if (!id) return null;
	if (id === 'new') return 'The id "new" is reserved';
	if (isSystemRecipeId(id)) return 'This id is reserved for a system recipe';
	if (!recipeIdPattern.test(id)) return 'Use only letters, numbers, hyphens, and underscores';
	if (existingIds.has(id)) return 'A recipe with this id already exists';
	return null;
}

export function RecipeCreatePage() {
	useDocumentTitle('New Recipe · Recipes');
	const navigate = useNavigate();
	const recipes = useRecipes();
	const [id, setId] = useState('');
	const [idTouched, setIdTouched] = useState(false);
	const [name, setName] = useState('');
	const [description, setDescription] = useState('');
	const [parameters, setParameters] = useState<RecipeParameterDefinition[]>([]);
	const [initialSteps] = useState<StepDraft[]>(() => [newStepDraft()]);
	const [steps, setSteps] = useState<StepDraft[]>(initialSteps);

	// Navigate after the success render so the unsaved guard sees a clean form first.
	const created = recipes.saveRecipe.isSuccess ? recipes.saveRecipe.data : undefined;
	useEffect(() => {
		if (!created) return;
		navigate(`/recipes/${created.id}`, { replace: true });
	}, [created, navigate]);

	function updateStep(stepId: string, patch: Partial<StepDraft>): void {
		setSteps((current) =>
			current.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
		);
	}

	function handleId(value: string): void {
		setIdTouched(true);
		setId(value);
	}

	function handleName(value: string): void {
		setName(value);
		if (!idTouched) setId(slugifyName(value));
	}

	const existingIds = new Set((recipes.recipes.data ?? []).map((recipe) => recipe.id));
	const idError = validateRecipeId(id, existingIds);
	const stepErrors = steps.map((step) => ({ id: step.id, ...collectStepErrors(step) }));
	const hasJsonErrors = stepErrors.some(
		(entry) => entry.configJson || entry.preHookJson || entry.postHookJson || entry.when,
	);

	function save(): void {
		if (!name.trim()) {
			toast.error('Recipe name is required');
			return;
		}
		if (!id) {
			toast.error('Recipe id is required');
			return;
		}
		if (idError) {
			toast.error(idError);
			return;
		}
		if (steps.length === 0) {
			toast.error('Add at least one step');
			return;
		}
		if (steps.some((step) => !step.name.trim())) {
			toast.error('Every step needs a name');
			return;
		}
		if (hasJsonErrors) {
			toast.error('Fix recipe step JSON errors before saving');
			return;
		}
		try {
			const recipe: RecipeDefinition = {
				id,
				name: name.trim(),
				parameters: parameters
					.map(cleanParameter)
					.filter(
						(parameter): parameter is RecipeParameterDefinition =>
							parameter !== undefined,
					),
				steps: steps.map(toStep),
			};
			if (description.trim()) recipe.description = description.trim();
			recipes.saveRecipe.mutate(recipe, {
				onSuccess: () => toast.success('Recipe created'),
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Recipe JSON is invalid');
		}
	}

	const dirty =
		!created &&
		!recipes.saveRecipe.isPending &&
		(idTouched ||
			name !== '' ||
			description !== '' ||
			parameters.length > 0 ||
			JSON.stringify(steps) !== JSON.stringify(initialSteps));
	const blocker = useUnsavedGuard(dirty);

	return (
		<div className="page-reveal">
			<RecipeEditMode
				description={description}
				dirty={dirty}
				hasJsonErrors={hasJsonErrors}
				id={id}
				idError={idError}
				name={name}
				onCancel={() => {
					void navigate('/recipes');
				}}
				onSave={save}
				parameters={parameters}
				saving={recipes.saveRecipe.isPending}
				setDescription={setDescription}
				setId={handleId}
				setName={handleName}
				setParameters={setParameters}
				setSteps={setSteps}
				stepErrors={stepErrors}
				steps={steps}
				updateStep={updateStep}
			/>
			<ConfirmDialog
				confirmLabel="Discard changes"
				description="You have unsaved recipe changes. Leaving this page will discard them."
				destructive
				onClose={() => blocker.reset?.()}
				onConfirm={() => blocker.proceed?.()}
				open={blocker.state === 'blocked'}
				title="Discard unsaved changes?"
			/>
		</div>
	);
}

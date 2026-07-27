/* eslint-disable @typescript-eslint/no-floating-promises */
import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';

import type { RecipeDefinition, RecipeParameterDefinition } from '../../api/types.ts';

import { ApiError } from '../../api/client.ts';
import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useRecipe, useRecipes } from '../../hooks/useRecipes.ts';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard.ts';
import { cleanParameter } from './detail/recipe-detail-form.ts';
import { RecipeEditMode } from './detail/RecipeEditMode.tsx';
import { RecipeNotFound } from './detail/RecipeNotFound.tsx';
import { RecipeOverviewMode } from './detail/RecipeOverviewMode.tsx';
import { collectStepErrors, type StepDraft, toDrafts, toStep } from './recipe-steps.ts';

export function RecipeDetailPage() {
	const { id } = useParams();
	const navigate = useNavigate();
	const recipeQuery = useRecipe(id);
	const recipes = useRecipes();
	const [mode, setMode] = useState<'edit' | 'overview'>('overview');
	const [description, setDescription] = useState('');
	const [name, setName] = useState('');
	const [parameters, setParameters] = useState<RecipeParameterDefinition[]>([]);
	const [steps, setSteps] = useState<StepDraft[]>([]);
	const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
	const seededRecipeIdRef = useRef<string | undefined>(undefined);
	useDocumentTitle(recipeQuery.data ? `${recipeQuery.data.name} · Recipes` : 'Recipe');

	function seedFormFromRecipe(recipe: RecipeDefinition): void {
		setName(recipe.name);
		setDescription(recipe.description ?? '');
		setParameters(recipe.parameters);
		setSteps(toDrafts(recipe));
	}

	useEffect(() => {
		if (!recipeQuery.data) return;
		if (seededRecipeIdRef.current === recipeQuery.data.id) return;
		seededRecipeIdRef.current = recipeQuery.data.id;
		seedFormFromRecipe(recipeQuery.data);
	}, [recipeQuery.data]);

	function updateStep(stepId: string, patch: Partial<StepDraft>): void {
		setSteps((current) =>
			current.map((step) => (step.id === stepId ? { ...step, ...patch } : step)),
		);
	}

	const stepErrors = steps.map((step) => ({ id: step.id, ...collectStepErrors(step) }));
	const hasJsonErrors = stepErrors.some(
		(entry) => entry.configJson || entry.preHookJson || entry.postHookJson || entry.when,
	);

	function save(): void {
		if (!id || !name.trim()) {
			toast.error('Recipe name is required');
			return;
		}
		if (hasJsonErrors) {
			toast.error('Fix recipe step JSON errors before saving');
			return;
		}
		try {
			const updatedRecipe: RecipeDefinition = {
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
			if (description.trim()) updatedRecipe.description = description.trim();
			if (recipeQuery.data?.metadataOnly === true) updatedRecipe.metadataOnly = true;
			recipes.saveRecipe.mutate(updatedRecipe, {
				onSuccess: () => {
					toast.success('Recipe saved');
					setMode('overview');
				},
			});
		} catch (error) {
			toast.error(error instanceof Error ? error.message : 'Recipe JSON is invalid');
		}
	}

	function reload(): void {
		if (!id) return;
		recipes.reloadRecipe.mutate(id, {
			onSuccess: (r) => {
				seedFormFromRecipe(r);
				toast.success('Recipe reloaded');
			},
		});
	}

	function requestDelete(): void {
		setShowDeleteConfirm(true);
	}

	function confirmDelete(): void {
		if (!id) return;
		recipes.deleteRecipe.mutate(id, {
			onSettled: () => setShowDeleteConfirm(false),
			onSuccess: () => {
				toast.success('Recipe deleted');
				navigate('/recipes');
			},
		});
	}

	const recipe = recipeQuery.data;
	const dirty =
		mode === 'edit' && recipe
			? name !== recipe.name ||
				description !== (recipe.description ?? '') ||
				JSON.stringify(parameters) !== JSON.stringify(recipe.parameters) ||
				JSON.stringify(steps) !== JSON.stringify(toDrafts(recipe))
			: false;
	const blocker = useUnsavedGuard(dirty && !recipes.saveRecipe.isPending);

	if (!id) return null;

	const notFound = recipeQuery.error instanceof ApiError && recipeQuery.error.status === 404;
	if (notFound) return <RecipeNotFound />;

	const deleteConfirm = (
		<ConfirmDialog
			confirmLabel="Delete recipe"
			description={
				recipe
					? `${recipe.name} will be permanently removed. This cannot be undone.`
					: undefined
			}
			destructive
			isPending={recipes.deleteRecipe.isPending}
			onClose={() => {
				if (!recipes.deleteRecipe.isPending) setShowDeleteConfirm(false);
			}}
			onConfirm={confirmDelete}
			open={showDeleteConfirm}
			title="Delete recipe?"
		/>
	);
	const unsavedConfirm = (
		<ConfirmDialog
			confirmLabel="Discard changes"
			description="You have unsaved recipe changes. Leaving this page will discard them."
			destructive
			onClose={() => blocker.reset?.()}
			onConfirm={() => blocker.proceed?.()}
			open={blocker.state === 'blocked'}
			title="Discard unsaved changes?"
		/>
	);

	if (mode === 'overview' && recipe) {
		return (
			<div className="page-reveal">
				<RecipeOverviewMode
					onDelete={requestDelete}
					onEdit={() => setMode('edit')}
					onReload={reload}
					recipe={recipe}
				/>
				{deleteConfirm}
				{unsavedConfirm}
			</div>
		);
	}

	return (
		<div className="page-reveal">
			<RecipeEditMode
				description={description}
				hasJsonErrors={hasJsonErrors}
				id={id}
				name={name}
				nameReadOnly={recipe?.system === true}
				onCancel={() => setMode('overview')}
				onReload={reload}
				onSave={save}
				parameters={parameters}
				setDescription={setDescription}
				setName={setName}
				setParameters={setParameters}
				setSteps={setSteps}
				stepErrors={stepErrors}
				steps={steps}
				updateStep={updateStep}
			/>
			{deleteConfirm}
			{unsavedConfirm}
		</div>
	);
}

import { isSystemRecipeId } from 'aidd-shared/system-recipes';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';

import type { RecipeDefinition, RecipeParameterDefinition } from '../../api/types.ts';

import { ConfirmDialog } from '../../components/shared/ConfirmDialog.tsx';
import { useDocumentTitle } from '../../hooks/useDocumentTitle.ts';
import { useRecipes } from '../../hooks/useRecipes.ts';
import { useUnsavedGuard } from '../../hooks/useUnsavedGuard.ts';
import { CreateRecipeEditor } from './detail/CreateRecipeEditor.tsx';
import { cleanParameter } from './detail/recipe-detail-form.ts';
import { RecipeEditorProvider } from './detail/RecipeEditorProvider.tsx';
import { newRecipeDraft, useRecipeDraft } from './detail/useRecipeDraft.ts';
import { toStep } from './recipe-steps.ts';

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
	const draft = useRecipeDraft(newRecipeDraft);
	const { description, hasStepErrors, name, parameters, steps } = draft;

	// Navigate after the success render so the unsaved guard sees a clean form first.
	const created = recipes.saveRecipe.isSuccess ? recipes.saveRecipe.data : undefined;
	useEffect(() => {
		if (!created) return;
		void navigate(`/recipes/${created.id}`, { replace: true });
	}, [created, navigate]);

	function handleId(value: string): void {
		setIdTouched(value !== slugifyName(name));
		setId(value);
	}

	function handleName(value: string): void {
		draft.setName(value);
		if (!idTouched) setId(slugifyName(value));
	}

	const existingIds = new Set((recipes.recipes.data ?? []).map((recipe) => recipe.id));
	const idError = validateRecipeId(id, existingIds);

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
		const unnamedStepIndex = steps.findIndex((step) => !step.name.trim());
		if (unnamedStepIndex >= 0) {
			toast.error(`Step ${unnamedStepIndex + 1} needs a name`);
			return;
		}
		if (hasStepErrors) {
			toast.error('Fix recipe step errors before saving');
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
		(id !== slugifyName(name) ||
			name !== '' ||
			description !== '' ||
			parameters.length > 0 ||
			JSON.stringify(steps) !== JSON.stringify(draft.initial.steps));
	const blocker = useUnsavedGuard(dirty);

	return (
		// A fragment, not a wrapper: the editor frame carries `page-reveal` itself, and a div here
		// would add nothing but a single-child container for the stagger to find.
		<>
			{/* Typing a name also fills the id until the id is edited by hand, so the editor's name
			    setter is this page's, not the draft's own. */}
			<RecipeEditorProvider
				dirty={dirty}
				draft={{ ...draft, setName: handleName }}
				onCancel={() => {
					void navigate('/recipes');
				}}
				onSave={save}
				saving={recipes.saveRecipe.isPending}>
				<CreateRecipeEditor
					id={id}
					idError={idError}
					idHint={idTouched ? 'Custom id; it no longer updates from Name.' : undefined}
					onIdChange={handleId}
				/>
			</RecipeEditorProvider>
			<ConfirmDialog
				confirmLabel="Discard changes"
				description="You have unsaved recipe changes. Leaving this page will discard them."
				destructive
				onClose={() => blocker.reset?.()}
				onConfirm={() => blocker.proceed?.()}
				open={blocker.state === 'blocked'}
				title="Discard unsaved changes?"
			/>
		</>
	);
}

import type { PipelineSessionRecord, RecipeDefinition } from './types.ts';
import type { LaunchTargetValue } from './types/launchDefaults.ts';

import { apiGet, apiSend } from './client.ts';

export async function deleteRecipe(id: string): Promise<void> {
	await apiSend<{ ok: true }>(`/api/v1/recipes/${id}`, 'DELETE');
}

export async function getRecipe(id: string): Promise<RecipeDefinition> {
	const response = await apiGet<{ recipe: RecipeDefinition }>(`/api/v1/recipes/${id}`);
	return response.recipe;
}

export async function launchRecipe(input: {
	id: string;
	launchTarget?: LaunchTargetValue;
	parameters?: Record<string, string>;
	projectDir: string;
}): Promise<PipelineSessionRecord> {
	const response = await apiSend<{ session: PipelineSessionRecord }>(
		`/api/v1/recipes/${input.id}/launch`,
		'POST',
		{
			backend: input.launchTarget?.backend,
			model: input.launchTarget?.model,
			parameters: input.parameters ?? {},
			projectDir: input.projectDir,
			reasoningEffort: input.launchTarget?.reasoningEffort,
		},
	);
	return response.session;
}

export async function listRecipes(): Promise<RecipeDefinition[]> {
	const response = await apiGet<{ recipes: RecipeDefinition[] }>('/api/v1/recipes');
	return response.recipes;
}

export async function reloadRecipe(id: string): Promise<RecipeDefinition> {
	const response = await apiSend<{ recipe: RecipeDefinition }>(
		`/api/v1/recipes/${id}/reload`,
		'POST',
	);
	return response.recipe;
}

export async function reloadRecipes(): Promise<RecipeDefinition[]> {
	const response = await apiSend<{ recipes: RecipeDefinition[] }>(
		'/api/v1/recipes/reload',
		'POST',
	);
	return response.recipes;
}

export async function saveRecipe(recipe: RecipeDefinition): Promise<RecipeDefinition> {
	const response = await apiSend<{ recipe: RecipeDefinition }>(
		`/api/v1/recipes/${recipe.id}`,
		'PUT',
		recipe,
	);
	return response.recipe;
}

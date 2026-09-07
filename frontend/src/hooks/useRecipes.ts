import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import type { RecipeDefinition } from '../api/types.ts';

import {
	deleteRecipe,
	getRecipe,
	launchRecipe,
	listRecipes,
	reloadRecipe,
	reloadRecipes,
	saveRecipe,
} from '../api/recipes.ts';
import { retryUnlessClientError } from '../api/retry.ts';

export function useRecipe(id: string | undefined) {
	return useQuery({
		enabled: id !== undefined && id.length > 0,
		queryFn: () => getRecipe(id ?? ''),
		queryKey: ['recipe', id],
		retry: retryUnlessClientError,
	});
}

export function useRecipeCatalog() {
	return useQuery({ queryFn: listRecipes, queryKey: ['recipes'] });
}

export function useRecipes() {
	const queryClient = useQueryClient();
	const recipes = useRecipeCatalog();
	const refreshRecipes = () => {
		void queryClient.invalidateQueries({ queryKey: ['recipes'] });
	};
	return {
		deleteRecipe: useMutation({ mutationFn: deleteRecipe, onSuccess: refreshRecipes }),
		launchRecipe: useMutation({
			mutationFn: launchRecipe,
			onSuccess: () => {
				void queryClient.invalidateQueries({ queryKey: ['pipeline-sessions'] });
				void queryClient.invalidateQueries({ queryKey: ['runs'] });
				void queryClient.invalidateQueries({ queryKey: ['telemetry'] });
			},
		}),
		recipes,
		reloadRecipe: useMutation({
			mutationFn: reloadRecipe,
			onSuccess: (recipe) => {
				queryClient.setQueryData(['recipe', recipe.id], recipe);
				refreshRecipes();
			},
		}),
		reloadRecipes: useMutation({
			mutationFn: reloadRecipes,
			onSuccess: refreshRecipes,
		}),
		saveRecipe: useMutation({
			mutationFn: (recipe: RecipeDefinition) => saveRecipe(recipe),
			onSuccess: (recipe) => {
				queryClient.setQueryData(['recipe', recipe.id], recipe);
				refreshRecipes();
			},
		}),
	};
}

import { useState } from 'react';

import type { RecipeDefinition, ResourceUsageRow } from '../../api/types.ts';

export type RecipeSortKey = 'catalog' | 'parameters' | 'steps' | 'usage';

function sortValue(
	recipe: RecipeDefinition,
	key: RecipeSortKey,
	usageByResourceId: Map<string, ResourceUsageRow>,
): number {
	switch (key) {
		case 'catalog':
			return 0;
		case 'parameters':
			return recipe.parameters.length;
		case 'steps':
			return recipe.steps.length;
		case 'usage':
			return usageByResourceId.get(recipe.id)?.lastUsedAt ?? -1;
	}
}

export function useRecipeTableSort(
	recipes: RecipeDefinition[],
	usageByResourceId: Map<string, ResourceUsageRow>,
): {
	onSort: (key: RecipeSortKey) => void;
	orderedRecipes: RecipeDefinition[];
	sort: { direction: 'asc' | 'desc'; key: RecipeSortKey };
} {
	const [sort, setSort] = useState<{
		direction: 'asc' | 'desc';
		key: RecipeSortKey;
	}>({ direction: 'asc', key: 'catalog' });
	const orderedRecipes =
		sort.key === 'catalog'
			? recipes
			: recipes.toSorted((left, right) => {
					const comparison =
						sortValue(left, sort.key, usageByResourceId) -
						sortValue(right, sort.key, usageByResourceId);
					return sort.direction === 'asc' ? comparison : -comparison;
				});
	const onSort = (key: RecipeSortKey): void => {
		setSort((current) => ({
			direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc',
			key,
		}));
	};
	return { onSort, orderedRecipes, sort };
}

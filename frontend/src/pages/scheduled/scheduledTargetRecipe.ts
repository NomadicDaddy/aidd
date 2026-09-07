import type { RecipeDefinition } from '../../api/types.ts';
import type { SelectableTargetType } from './targetBuilder.ts';

import { useRecipeCatalog } from '../../hooks/useRecipes.ts';

/**
 * The catalog entry a target selection points at, or undefined when the target is not a recipe.
 *
 * The target fields need the recipe for its parameters and the save gate needs it for its
 * `metadataOnly` flag, so the lookup lives here rather than once in each — a second copy is how a
 * hard-coded list of recipe ids gets written, and such a list is wrong the moment a recipe changes.
 */
export function findTargetRecipe(
	recipes: RecipeDefinition[],
	targetType: SelectableTargetType,
	targetId: string,
): RecipeDefinition | undefined {
	if (targetType !== 'recipe' || !targetId) return undefined;
	return recipes.find((item) => item.id === targetId);
}

/** The same lookup against the recipe catalog the form already fetches. */
export function useTargetRecipe(
	targetType: SelectableTargetType,
	targetId: string,
): RecipeDefinition | undefined {
	const catalog = useRecipeCatalog();
	return findTargetRecipe(catalog.data ?? [], targetType, targetId);
}

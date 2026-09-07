import type {
	ProjectSummary,
	RecipeDefinition,
	RecipeParameterDefinition,
} from '../../api/types.ts';

import { autoParameters } from './recipe-parameters.ts';

/**
 * The one prerequisite every Launch button on the catalog shares.
 *
 * It lives in a module rather than beside the buttons because two files state it: the button's
 * `title`, and the notice above the results that `aria-describedby` points at. A `.tsx` that exports
 * both a component and a constant is a `react-refresh/only-export-components` error at
 * `--max-warnings 0`, so the string cannot live in RecipeGrid.tsx.
 */
export const launchHint = 'Choose a project to enable Launch';

export type RecipeLaunchProject = Pick<ProjectSummary, 'id' | 'name' | 'path'>;

export function resolveRecipeLaunchProject(
	projects: RecipeLaunchProject[],
	projectDir: string,
): null | RecipeLaunchProject {
	return projects.find((project) => project.path === projectDir) ?? null;
}

export function isRequiredRecipeParameter(parameter: RecipeParameterDefinition): boolean {
	return parameter.defaultValue === undefined && !autoParameters.has(parameter.name);
}

export function recipeLaunchBlocker(
	recipe: RecipeDefinition,
	parameters: Record<string, string>,
	projectDir: string,
): null | string {
	if (!projectDir) return 'Choose a project before starting this recipe.';
	const missing = recipe.parameters.filter(
		(parameter) =>
			isRequiredRecipeParameter(parameter) && !(parameters[parameter.name] ?? '').trim(),
	);
	if (missing.length === 0) return null;
	if (missing.length === 1)
		return `Enter ${missing[0]?.name ?? 'the required parameter'} before starting this recipe.`;
	return `Complete the required parameters (${missing.map((parameter) => parameter.name).join(', ')}) before starting this recipe.`;
}

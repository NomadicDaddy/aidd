import type { RecipeParameterDefinition } from '../../../api/types.ts';

export function cleanParameter(
	parameter: RecipeParameterDefinition
): RecipeParameterDefinition | undefined {
	const name = parameter.name.trim();
	if (!name) return undefined;
	const output: RecipeParameterDefinition = { name };
	if (parameter.description?.trim()) output.description = parameter.description.trim();
	if (parameter.defaultValue?.trim()) output.defaultValue = parameter.defaultValue.trim();
	return output;
}

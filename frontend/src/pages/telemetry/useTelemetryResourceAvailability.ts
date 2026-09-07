import type { TelemetryResourceAvailability } from './resourceLink.ts';

import { useRecipeCatalog } from '../../hooks/useRecipes.ts';
import { useSkillCatalog } from '../../hooks/useSkills.ts';

export function useTelemetryResourceAvailability(): TelemetryResourceAvailability {
	const recipes = useRecipeCatalog().data ?? [];
	const skills = useSkillCatalog().data ?? [];

	return {
		recipeIds: new Set(recipes.map((recipe) => recipe.id)),
		skillIds: new Set(skills.map((skill) => skill.id)),
	};
}

import type { RecipeStepType } from '../../api/types.ts';

/**
 * Explainer text for the badges shown on the Recipes catalog (table + card views).
 * Kept in a pure-data module so the wording is centralized and unit-tested, and the
 * badge components stay readable.
 */

export type RecipeTypeBadge = 'pipeline' | 'single-step';

export const recipeTypeExplainer: Record<RecipeTypeBadge, string> = {
	pipeline: 'Runs several steps in order.',
	'single-step': 'Runs a single step.',
};

export const recipeStepTypeExplainer: Record<RecipeStepType, string> = {
	'aidd-cli': 'Runs an aidd CLI mode such as coding, audit, or validate.',
	'recipe-ref': 'Launches another recipe as a nested pipeline.',
	shell: 'Runs a shell command.',
	skill: 'Runs an aidd skill.',
};

export const recipeStepCountExplainer = 'Total number of ordered steps in this recipe.';
export const recipeParameterCountExplainer = 'Number of launch parameters this recipe accepts.';
export const recipeSystemExplainer =
	'Built-in recipe. You can edit its steps, but cannot rename or delete it.';
export const recipeMetadataOnlyExplainer =
	'Requests an .aidd/-only write allowlist for its steps. This is not a shell sandbox.';

function stepWord(count: number): string {
	return count === 1 ? 'step' : 'steps';
}

export function stopPolicyExplainer(count: number): string {
	return `Stop the pipeline if a step fails. Used by ${count} ${stepWord(count)}.`;
}

export function continuePolicyExplainer(count: number): string {
	return `Continue after a step fails. Used by ${count} ${stepWord(count)}.`;
}

export function autoFixPolicyExplainer(count: number): string {
	return `Attempt a fix and retry a failed step. Used by ${count} ${stepWord(count)}.`;
}

export function retriesExplainer(count: number): string {
	return `Total retry attempts configured across all steps: ${count}.`;
}

export function reviewSkillExplainer(count: number): string {
	return `Asks the skill to review without edits. Used by ${count} ${stepWord(count)}.`;
}

export function applySkillExplainer(count: number): string {
	return `Skill instructions allow changes. Used by ${count} ${stepWord(count)}.`;
}

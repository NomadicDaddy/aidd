import type { RecipeStepType } from '../../api/types.ts';

/**
 * Explainer text for the badges shown on the Recipes catalog (table + card views).
 * Kept in a pure-data module so the wording is centralized and unit-tested, and the
 * badge components stay readable.
 */

export type RecipeTypeBadge = 'pipeline' | 'single-step';

export const recipeTypeExplainer: Record<RecipeTypeBadge, string> = {
	pipeline: 'Runs as a multi-step pipeline of ordered steps.',
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
	'Built-in recipe shipped with aidd. It is protected and cannot be edited or deleted.';
export const recipeMetadataOnlyExplainer =
	'Metadata-only recipe: writes are restricted to the .aidd/ folder and never touch application code.';

function stepWord(count: number): string {
	return count === 1 ? 'step' : 'steps';
}

export function stopPolicyExplainer(count: number): string {
	return `Failure policy: stop the pipeline. Applies to ${count} ${stepWord(count)} in this recipe.`;
}

export function continuePolicyExplainer(count: number): string {
	return `Failure policy: continue the pipeline after a failure. Applies to ${count} ${stepWord(
		count,
	)} in this recipe.`;
}

export function autoFixPolicyExplainer(count: number): string {
	return `Failure policy: run an automatic remediation and retry on failure. Applies to ${count} ${stepWord(
		count,
	)} in this recipe.`;
}

export function retriesExplainer(count: number): string {
	return `Total retry attempts configured across all steps: ${count}.`;
}

export function reviewSkillExplainer(count: number): string {
	return `Skill intent: review only, no changes written. Applies to ${count} ${stepWord(
		count,
	)} in this recipe.`;
}

export function applySkillExplainer(count: number): string {
	return `Skill intent: changes allowed. Applies to ${count} ${stepWord(count)} in this recipe.`;
}

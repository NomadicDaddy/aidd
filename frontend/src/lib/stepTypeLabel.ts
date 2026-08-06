import type { RecipeStepType } from '../api/types.ts';

/**
 * The one spelling of a pipeline step's type on an execution surface.
 *
 * The Runs table renders a session's KIND as `Skill` or `Pipeline` and, directly beneath it, the
 * expanded step rows rendered the raw `stepType` — so `Skill` sat above `skill` in the same column,
 * two rows apart, and the reader had to decide whether they were the same thing. They are.
 *
 * `aidd-cli` and `recipe-ref` are wire values rather than words; the labels say what the step does.
 * Unrecognised values fall through unchanged, because a backend that grows a fifth step type should
 * show it rather than swallow it.
 *
 * The Recipes catalog deliberately keeps the lowercase wire value: there the badge sits beside
 * `pipeline`, `system` and `metadata-only`, a row of taxonomy tokens describing a definition on
 * disk. This map is for the execution surfaces, where the same token is a column value.
 */
const stepTypeLabels: Record<RecipeStepType, string> = {
	'aidd-cli': 'aidd CLI',
	'recipe-ref': 'Nested recipe',
	shell: 'Shell',
	skill: 'Skill',
};

export function stepTypeLabel(stepType: string): string {
	return stepTypeLabels[stepType as RecipeStepType] ?? stepType;
}

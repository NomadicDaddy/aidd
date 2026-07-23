import type { RecipeDefinition, RecipeStepOnFailure } from '../../api/types.ts';

export interface RecipePolicySummary {
	applySkillSteps: number;
	autoFixSteps: number;
	continueSteps: number;
	retries: number;
	reviewSkillSteps: number;
	stopSteps: number;
}

export function getRecipePolicySummary(recipe: RecipeDefinition): RecipePolicySummary {
	const summary: RecipePolicySummary = {
		applySkillSteps: 0,
		autoFixSteps: 0,
		continueSteps: 0,
		retries: 0,
		reviewSkillSteps: 0,
		stopSteps: 0,
	};
	for (const step of recipe.steps) {
		const failurePolicy: RecipeStepOnFailure = step.onFailure ?? 'stop';
		if (failurePolicy === 'auto-fix') summary.autoFixSteps += 1;
		else if (failurePolicy === 'continue') summary.continueSteps += 1;
		else summary.stopSteps += 1;
		summary.retries += step.retryCount ?? (failurePolicy === 'auto-fix' ? 1 : 0);
		if (step.stepType !== 'skill') continue;
		if (step.configJson.executionIntent === 'review-only') summary.reviewSkillSteps += 1;
		if (step.configJson.executionIntent === 'apply-changes') summary.applySkillSteps += 1;
	}
	return summary;
}

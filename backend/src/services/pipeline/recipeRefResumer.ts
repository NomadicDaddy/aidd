import type { PipelineStepStatus, RecipeStepDefinition } from '../../types.ts';
import type { RecipeRefHandler } from './recipeRefHandler.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { ExecutionContext, ResumeRecipeRefStep, StepExecutionResult } from './types.ts';

import { substituteConfig } from './helpers.ts';
import { stepParameters } from './stepParameters.ts';

/**
 * Resume and terminalize one persisted recipe-ref wrapper row.
 *
 * @param deps - Pipeline services required to resume and persist the wrapper.
 * @param deps.lifecycle - Persists the wrapper's terminal result.
 * @param deps.recipeRefHandler - Resumes the referenced child recipe.
 * @param step - Current recipe definition for the persisted wrapper.
 * @param context - Execution context at the wrapper's recipe depth.
 * @param inFlightStep - Persisted nested resume frame.
 * @returns The nested recipe's execution outcome.
 */
export async function resumeRecipeRefStep(
	deps: { lifecycle: SessionLifecycle; recipeRefHandler: RecipeRefHandler },
	step: RecipeStepDefinition,
	context: ExecutionContext,
	inFlightStep: ResumeRecipeRefStep,
): Promise<StepExecutionResult> {
	const startedAt = inFlightStep.startedAt ?? Date.now();
	if (step.stepType !== 'recipe-ref') {
		const errorMessage = 'Persisted recipe-ref resume frame no longer matches its recipe step.';
		await deps.lifecycle.completeStep({
			completedAt: Date.now(),
			errorMessage,
			resultId: inFlightStep.resultId,
			startedAt,
			status: 'failed',
		});
		return { errorMessage, ok: false, stopped: false };
	}
	const result = await deps.recipeRefHandler.resume(
		substituteConfig(step.configJson, stepParameters(context)),
		context,
		inFlightStep.resultId,
		inFlightStep,
	);
	let status: PipelineStepStatus = 'failed';
	if (result.stopped) status = 'stopped';
	else if (result.ok) status = 'completed';
	await deps.lifecycle.completeStep({
		completedAt: Date.now(),
		errorMessage: result.errorMessage,
		resultId: inFlightStep.resultId,
		startedAt,
		status,
	});
	return result;
}

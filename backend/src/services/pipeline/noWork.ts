import type { RecipeStepDefinition } from '../../types.ts';
import type { StepExecutionResult } from './types.ts';

/**
 * The `aidd-cli` config flag that ends a recipe when its coding step finds nothing to do.
 *
 * Opt-in, because a later step is not always downstream of this one. `coding` reviews,
 * remediates and documents what its first step built, so with nothing built each of those steps
 * re-reviews older commits. `remediate-bugs` follows its coding pass with a validate pass over
 * completed features, which has work whether or not that coding pass found any.
 */
const SKIP_REMAINING_ON_NO_WORK = 'skipRemainingOnNoWork';

/**
 * The run's own account of why it selected nothing, when it ended `no_work`.
 *
 * Work selection happens before the agent starts, so the transcript of such a run is only the
 * launch banner, and a step showing that tail read as a run that hung. The reason the operator
 * needs — which features are blocked and which are waiting on approval — is in the run summary.
 * @param run The terminal run row.
 * @param run.status Its terminal status.
 * @param run.stopReason Why the orchestrator stopped it.
 * @param run.summary The orchestrator's closing summary.
 * @returns The summary for a completed no-work run, otherwise undefined.
 */
export function noWorkSummary(run: {
	status: string;
	stopReason: null | string;
	summary: null | string;
}): string | undefined {
	if (run.status !== 'completed' || run.stopReason !== 'no_work') return undefined;
	return run.summary?.trim() || 'No eligible work was selected.';
}

/**
 * Whether a step's config asks for its recipe to end when it finds no work.
 * @param step The recipe step.
 * @returns True when the step opts in.
 */
export function optsIntoNoWorkEnd(step: RecipeStepDefinition): boolean {
	return step.configJson[SKIP_REMAINING_ON_NO_WORK] === true;
}

/**
 * Whether a finished step should end its recipe rather than hand on to the next step.
 * @param step The step that just finished.
 * @param result Its execution result.
 * @returns True when the step found no work and its config opts into ending there.
 */
export function endsRecipeOnNoWork(
	step: RecipeStepDefinition,
	result: StepExecutionResult,
): boolean {
	return result.ok && result.noWork === true && optsIntoNoWorkEnd(step);
}

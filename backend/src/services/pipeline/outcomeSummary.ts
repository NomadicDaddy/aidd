import type { PipelineSessionStatus, PipelineStepResultRecord } from '../../types.ts';

// A top-level step that finished successfully, recorded so a consumer reading the
// session report can see what the session actually produced even when a later step
// failed. runId (when present) links to the managed run whose output survived.
export interface ProducedArtifact {
	runId: null | string;
	stepName: string;
	stepType: string;
}

export interface SessionOutcome {
	// Names of the top-level steps that failed, in display order.
	failedStepNames: string[];
	// Top-level steps that completed successfully.
	producedArtifacts: ProducedArtifact[];
	status: PipelineSessionStatus;
}

// Derives the terminal session status from the persisted step results. Only top-level
// steps (depth 0, phase 'step') count toward the recipe's own outcome — hooks and nested
// recipe-ref children are represented by their parent step. A session with at least one
// completed step AND at least one failed step reads as 'completed_with_failures', distinguishing
// partial success (e.g. 7-of-10 steps produced value before a late failure) from a step-1 crash.
// `baseOk` is the executor's own ok flag, used only to disambiguate the no-failures case (a clean
// run vs a run that stopped for another reason without a failed top-level step).
export function summarizeSessionOutcome(
	baseOk: boolean,
	stepResults: PipelineStepResultRecord[],
): SessionOutcome {
	const topLevel = stepResults.filter((step) => step.depth === 0 && step.phase === 'step');
	const failedStepNames = topLevel
		.filter((step) => step.status === 'failed')
		.map((step) => step.stepName);
	const completed = topLevel.filter((step) => step.status === 'completed');
	const producedArtifacts: ProducedArtifact[] = completed.map((step) => ({
		runId: step.runId,
		stepName: step.stepName,
		stepType: step.stepType,
	}));
	let status: PipelineSessionStatus;
	if (failedStepNames.length === 0) {
		status = baseOk ? 'completed' : 'failed';
	} else if (completed.length > 0) {
		status = 'completed_with_failures';
	} else {
		status = 'failed';
	}
	return { failedStepNames, producedArtifacts, status };
}

// Human-readable session errorMessage for a partial-success terminal state, naming the
// failed steps so the session list/detail UI reads as partial rather than a bare 'failed'.
export function summarizeFailedSteps(failedStepNames: string[]): string {
	const noun = failedStepNames.length === 1 ? 'step' : 'steps';
	return `${failedStepNames.length} ${noun} failed after earlier steps succeeded: ${failedStepNames.join(', ')}`;
}

// Terminal status + session-level errorMessage for a non-stopped session, derived from its
// persisted step results. A partial success resolves to 'completed_with_failures' with a
// failed-step summary; every other case keeps the executor's own ok flag and error message.
export function resolveSessionTerminal(
	baseOk: boolean,
	baseErrorMessage: string | undefined,
	stepResults: PipelineStepResultRecord[],
): { errorMessage: string | undefined; status: PipelineSessionStatus } {
	const outcome = summarizeSessionOutcome(baseOk, stepResults);
	const errorMessage =
		outcome.status === 'completed_with_failures'
			? summarizeFailedSteps(outcome.failedStepNames)
			: baseErrorMessage;
	return { errorMessage, status: outcome.status };
}

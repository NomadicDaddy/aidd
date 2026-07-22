import type { PipelineStepStatus, RecipeStepDefinition } from '../../types.ts';
import type { RunWaiter } from './runWaiter.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { ResumeInFlightStep, StepExecutionResult } from './types.ts';

import { runFailureNarrative, stringifyError } from './helpers.ts';

// Re-attach to a detached managed run if the runId is still resolvable, or terminalize
// the in-flight step row as failed and propagate onFailure semantics. The existing step
// row's id is reused so the resume preserves history rather than appending duplicates.
export async function resolveInFlightStep(
	deps: { lifecycle: SessionLifecycle; runWaiter: RunWaiter },
	step: RecipeStepDefinition,
	inFlightStep: ResumeInFlightStep,
	sessionId: string
): Promise<StepExecutionResult> {
	const { lifecycle, runWaiter } = deps;
	const startedAt = inFlightStep.startedAt ?? Date.now();
	if (inFlightStep.action === 'fail') {
		const errorMessage = inFlightStep.failReason ?? 'Step did not survive web restart.';
		await lifecycle.completeStep({
			completedAt: Date.now(),
			errorMessage,
			resultId: inFlightStep.resultId,
			startedAt,
			status: 'failed',
		});
		return {
			errorMessage,
			ok: (step.onFailure ?? 'stop') === 'continue',
			stopped: false,
		};
	}
	if (inFlightStep.runId === null) {
		const errorMessage = 'Managed step had no run id to re-attach to.';
		await lifecycle.completeStep({
			completedAt: Date.now(),
			errorMessage,
			resultId: inFlightStep.resultId,
			startedAt,
			status: 'failed',
		});
		return {
			errorMessage,
			ok: (step.onFailure ?? 'stop') === 'continue',
			stopped: false,
		};
	}
	try {
		// RunWaiter polls runs.status until terminal; managed runs detach via launchRun
		// + the cli heartbeat so the run stays alive across web restarts and we just
		// wait for its existing terminal-state update to land in the DB.
		const run = await runWaiter.waitForRun(inFlightStep.runId, sessionId);
		const ok = run.status === 'completed';
		const status: PipelineStepStatus = ok
			? 'completed'
			: run.status === 'stopped'
				? 'stopped'
				: run.status === 'killed'
					? 'failed'
					: 'failed';
		const outputSummary = await runWaiter.outputForRun(inFlightStep.runId);
		const failureNarrative = ok ? undefined : runFailureNarrative(run);
		await lifecycle.completeStep({
			completedAt: run.completedAt ?? Date.now(),
			errorMessage: failureNarrative,
			exitCode: run.exitCode ?? undefined,
			outputSummary,
			resultId: inFlightStep.resultId,
			startedAt,
			status,
		});
		if (status === 'stopped') return { ok: false, stopped: true };
		return {
			errorMessage: failureNarrative,
			ok: ok || (step.onFailure ?? 'stop') === 'continue',
			stopped: false,
		};
	} catch (err) {
		const errorMessage = stringifyError(err);
		await lifecycle.completeStep({
			completedAt: Date.now(),
			errorMessage,
			resultId: inFlightStep.resultId,
			startedAt,
			status: 'failed',
		});
		return {
			errorMessage,
			ok: (step.onFailure ?? 'stop') === 'continue',
			stopped: false,
		};
	}
}

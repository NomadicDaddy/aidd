import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { AgentRunResult, IterationMetrics } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import type { CompiledPrompt } from '../../prompts/types.ts';
import type { OrchestratorProgressReporter } from '../progress.ts';
import type { MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { runBackendStreamLoop } from './backend-stream.ts';
import { runTriumvirateIterationStep } from './triumvirate-iteration.ts';

interface ExecuteIterationInput {
	acc: RunAccumulator;
	compiled: CompiledPrompt;
	consecutiveAborts: number;
	consecutiveContinuableInterruptions: number;
	controller: AbortController;
	deps: OrchestratorDeps;
	gitHeadBefore: string | undefined;
	iteration: number;
	iterationArtifactIndex: number;
	move: MoveFn;
	plan: RunPlan;
	runStartedAtMs: number;
	startedAt: string;
	startedAtMs: number;
	work: SelectedWork;
}

type ExecuteIterationOutcome =
	| {
			consecutiveAborts: number;
			consecutiveContinuableInterruptions: number;
			kind: 'continue';
	  }
	| { exitCode: number; kind: 'return' }
	| { kind: 'complete'; state: ExecuteIterationState };

interface ExecuteIterationState {
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
	events: AgentEvent[];
	exitCode: number;
	idleWarningTimestamps: { afterMs: number; atMs: number }[];
	metrics: IterationMetrics;
	progress: OrchestratorProgressReporter | undefined;
	result: AgentRunResult;
	stopRequestedAfterRun: boolean;
	timeToFirstEventMs: number | undefined;
	triumvirateArtifacts: Record<string, unknown>;
	wallClockTimedOut: boolean;
}

export async function executeIteration(
	input: ExecuteIterationInput,
): Promise<ExecuteIterationOutcome> {
	if (!input.plan.triumvirate) {
		const streamResult = await runBackendStreamLoop(
			input.deps,
			input.plan,
			input.work,
			input.compiled,
			input.controller,
			input.iteration,
			input.startedAtMs,
			input.runStartedAtMs,
			input.gitHeadBefore,
		);
		return {
			kind: 'complete',
			state: {
				completionCommittedDuringGrace: streamResult.completionCommittedDuringGrace,
				completionFinalizedBeforeBackendExit:
					streamResult.completionFinalizedBeforeBackendExit,
				events: streamResult.events,
				exitCode: streamResult.exitCode,
				idleWarningTimestamps: streamResult.idleWarningTimestamps,
				metrics: streamResult.metrics,
				progress: streamResult.progress,
				result: streamResult.result,
				stopRequestedAfterRun: streamResult.stopRequestedAfterRun,
				timeToFirstEventMs: streamResult.timeToFirstEventMs,
				triumvirateArtifacts: {},
				wallClockTimedOut: streamResult.wallClockTimedOut,
			},
		};
	}
	const outcome = await runTriumvirateIterationStep(input);
	if (outcome.kind === 'return') return outcome;
	if (outcome.kind === 'continue') {
		return {
			consecutiveAborts: outcome.consecutiveAborts,
			consecutiveContinuableInterruptions: outcome.consecutiveContinuableInterruptions,
			kind: 'continue',
		};
	}
	// The remaining false/empty fields are truthful, not gaps: the completion-marker commit
	// grace and idle-warning capture are single-agent stream-loop concepts that do not run
	// in triumvirate stages. wallClockTimedOut comes from the stages' shared safety
	// envelope, so a timed-out execution stage finally reaches the post-iteration
	// wall-clock guard instead of being hardcoded away.
	return {
		kind: 'complete',
		state: {
			completionCommittedDuringGrace: false,
			completionFinalizedBeforeBackendExit: false,
			idleWarningTimestamps: [],
			progress: undefined,
			timeToFirstEventMs: undefined,
			...outcome,
		},
	};
}

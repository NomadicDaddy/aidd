import type { AgentEvent } from 'aidd-shared/backends/types';
import type { AiddStore } from 'aidd-shared/metadata/store';
import type { AgentRunResult, IterationMetrics } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import type { MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { writeRunSummary } from './artifacts.ts';
import { buildWallClockTimeoutSummary } from './run-ending.ts';
import { hasStopRequested } from './stop-request.ts';

export type TriumvirateIterationOutcome =
	| {
			completionCommittedDuringGrace: boolean;
			completionFinalizedBeforeBackendExit: boolean;
			events: AgentEvent[];
			exitCode: number;
			kind: 'executed';
			metrics: IterationMetrics;
			result: AgentRunResult;
			stopRequestedAfterRun: boolean;
			triumvirateArtifacts: Record<string, unknown>;
			wallClockTimedOut: boolean;
	  }
	| { consecutiveAborts: number; consecutiveContinuableInterruptions: number; kind: 'continue' }
	| { exitCode: number; kind: 'return' };

export async function finishTriumvirateWallClockTimeout(input: {
	acc: RunAccumulator;
	deps: OrchestratorDeps;
	move: MoveFn;
	plan: RunPlan;
	summary: string;
}): Promise<{ exitCode: number; kind: 'return' }> {
	const summary = buildWallClockTimeoutSummary(input.summary, input.plan);
	input.move({ summary, type: 'complete' });
	await writeRunSummary(
		input.deps,
		input.plan,
		input.acc,
		'exit_error',
		orchestratorExitCodes.aborted,
		summary,
	);
	return { exitCode: orchestratorExitCodes.aborted, kind: 'return' };
}

export async function planningStageFlailingOutcome(input: {
	artifacts: Record<string, unknown>;
	metrics: IterationMetrics;
	result: AgentRunResult;
	stopPolicy: RunPlan['stopPolicy'];
	store: AiddStore;
}): Promise<{
	completionCommittedDuringGrace: false;
	completionFinalizedBeforeBackendExit: false;
	events: AgentRunResult['events'];
	exitCode: number;
	kind: 'executed';
	metrics: IterationMetrics;
	result: AgentRunResult;
	stopRequestedAfterRun: boolean;
	triumvirateArtifacts: Record<string, unknown>;
	wallClockTimedOut: false;
}> {
	return {
		completionCommittedDuringGrace: false,
		completionFinalizedBeforeBackendExit: false,
		events: input.result.events,
		exitCode: orchestratorExitCodes.flailing,
		kind: 'executed',
		metrics: input.metrics,
		result: input.result,
		stopRequestedAfterRun: await hasStopRequested(input.store, input.stopPolicy),
		triumvirateArtifacts: input.artifacts,
		wallClockTimedOut: false,
	};
}

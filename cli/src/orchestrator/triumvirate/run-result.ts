import type { IterationMetrics } from 'aidd-shared/orchestrator/result';

import type { PlanningStageRunResult, StageRunResult, TriumvirateRunResult } from './types.ts';

export function guardedResult(
	summary: string,
	metrics: IterationMetrics,
	stageArtifacts: Record<string, unknown>,
): TriumvirateRunResult {
	return {
		artifact: { triumvirate: { ...stageArtifacts, guardFailure: summary } },
		metrics,
		status: 'invalid',
		summary,
	};
}

export function planningMirrorMutationResult(
	stage: string,
	result: PlanningStageRunResult,
	metrics: IterationMetrics,
	stageArtifacts: Record<string, unknown>,
): TriumvirateRunResult {
	const summary = `triumvirate ${stage} planning stage modified its planning mirror after retry`;
	return {
		artifact: {
			triumvirate: {
				...stageArtifacts,
				planningMirrorViolation: result.violation,
				stageFailure: summary,
			},
		},
		metrics,
		status: 'invalid',
		summary,
	};
}

export function failedStageResult(
	stage: string,
	result: StageRunResult,
	metrics: IterationMetrics,
	stageArtifacts: Record<string, unknown>,
): TriumvirateRunResult {
	const summary = `triumvirate ${stage} stage failed with exit code ${result.result.exitCode}`;
	return {
		artifact: { triumvirate: { ...stageArtifacts, stageFailure: summary } },
		metrics,
		result: result.result,
		status: 'invalid',
		summary,
		...(result.wallClockTimedOut ? { wallClockTimedOut: true } : {}),
	};
}

// The between-stage counterpart of the in-stage wall-clock abort: a panel whose earlier
// stages consumed the whole budget must not launch the next backend at all. Without this,
// only the loop-top check between ITERATIONS notices the deadline, after the whole panel
// has already overrun it.
export function wallClockExceededResult(
	nextStage: string,
	metrics: IterationMetrics,
	stageArtifacts: Record<string, unknown>,
): TriumvirateRunResult {
	const summary = `triumvirate halted before ${nextStage} stage: wall-clock budget exhausted`;
	return {
		artifact: { triumvirate: { ...stageArtifacts, stageFailure: summary } },
		metrics,
		status: 'invalid',
		summary,
		wallClockTimedOut: true,
	};
}

import type { IterationMetrics } from 'aidd-shared/orchestrator/result';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import type {
	PlanningStageRunResult,
	StageRunResult,
	TriumvirateRunOptions,
	TriumvirateRunResult,
} from './types.ts';

import { extractPlan } from './stage-prompts.ts';

// True when the run's wall-clock budget is spent. Stages enforce the same deadline
// internally (BackendSafetyEnvelope), but a stage that finishes just under the wire must
// not launch the NEXT backend into a dead run — the panel checks between stages too.
export function triumvirateDeadlinePassed(options: TriumvirateRunOptions): boolean {
	if (options.runStartedAtMs === undefined) return false;
	return Date.now() >= options.runStartedAtMs + options.plan.outputPolicy.timeoutSeconds * 1000;
}

/** Extract a planner's validated plan, or the invalid-planning failure result when the
 * stage exited 0 without a usable planMarkdown (after the guard's one marker retry). */
export function planOrInvalidResult(
	stage: 'primary' | 'secondary',
	result: StageRunResult,
	metrics: IterationMetrics,
	stageArtifacts: Record<string, unknown>,
): { failure: TriumvirateRunResult } | { plan: string } {
	const plan = extractPlan(result);
	if (plan.status === 'invalid') {
		return {
			failure: invalidPlanningOutputResult(
				stage,
				result,
				plan.reason,
				metrics,
				stageArtifacts,
			),
		};
	}
	return { plan: plan.planMarkdown };
}

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

// A planner that exited 0 without emitting a usable planMarkdown marker (after the guard's
// one marker retry) produced no plan. The stage result's exit code is rewritten to
// missingResult so the run ledgers this exactly like a single-agent missing AIDD_RESULT,
// instead of the generic validation-error classification.
export function invalidPlanningOutputResult(
	stage: string,
	result: StageRunResult,
	reason: string,
	metrics: IterationMetrics,
	stageArtifacts: Record<string, unknown>,
): TriumvirateRunResult {
	const summary = `triumvirate ${stage} planning stage produced no plan (${reason})`;
	return {
		artifact: { triumvirate: { ...stageArtifacts, stageFailure: summary } },
		metrics,
		result: { ...result.result, exitCode: orchestratorExitCodes.missingResult },
		status: 'invalid',
		summary,
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

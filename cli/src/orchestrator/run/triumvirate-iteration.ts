import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { createBackend } from 'aidd-shared/backends/factory';
import {
	type AgentRunResult,
	type IterationMetrics,
	orchestratorExitCodes,
} from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { CompiledPrompt } from '../../prompts/types.ts';

import { extractIterationDetails } from '../details.ts';
import { runTriumvirateIteration } from '../triumvirate.ts';
import { writeRunSummary } from './artifacts.ts';
import {
	continuableBackendInterruptionRetryLimit,
	formatContinuableBackendInterruptionLimitSummary,
	isContinuableBackendInterruption,
} from './continuation.ts';
import { gitDirtyFileCount } from './git.ts';
import { accumulateIterationEvidence, accumulateIterationMetrics } from './run-accumulator.ts';
import { buildWallClockTimeoutSummary } from './run-ending.ts';
import { buildRateLimitBudgetSummary, handleRateLimit } from './run-gates.ts';
import {
	type MoveFn,
	type OrchestratorDeps,
	type RunAccumulator,
	runRuntimeFields,
} from './types.ts';

export type TriumvirateIterationOutcome =
	| { consecutiveAborts: number; consecutiveContinuableInterruptions: number; kind: 'continue' }
	| {
			events: AgentEvent[];
			exitCode: number;
			kind: 'executed';
			metrics: IterationMetrics;
			result: AgentRunResult;
			stopRequestedAfterRun: boolean;
			triumvirateArtifacts: Record<string, unknown>;
			wallClockTimedOut: boolean;
	  }
	| { exitCode: number; kind: 'return' };

export async function runTriumvirateIterationStep(input: {
	acc: RunAccumulator;
	compiled: CompiledPrompt;
	consecutiveAborts: number;
	consecutiveContinuableInterruptions: number;
	controller: AbortController;
	deps: OrchestratorDeps;
	iteration: number;
	iterationArtifactIndex: number;
	move: MoveFn;
	plan: RunPlan;
	runStartedAtMs: number;
	startedAt: string;
	startedAtMs: number;
	work: SelectedWork;
}): Promise<TriumvirateIterationOutcome> {
	const {
		acc,
		compiled,
		consecutiveAborts,
		consecutiveContinuableInterruptions,
		controller,
		deps,
		iteration,
		iterationArtifactIndex,
		move,
		plan,
		runStartedAtMs,
		startedAt,
		startedAtMs,
		work,
	} = input;

	const triumvirate = await runTriumvirateIteration({
		backendFactory: deps.backendFactory ?? createBackend,
		compiledPrompt: compiled.text,
		iteration,
		plan,
		runStartedAtMs,
		// The run controller's signal reaches every stage, so a run-wide stop/abort ends the
		// in-flight backend instead of only being noticed between iterations.
		signal: controller.signal,
		work,
		...(deps.observer?.onAgentEvent ? { onAgentEvent: deps.observer.onAgentEvent } : {}),
	});
	const metrics = triumvirate.metrics;
	const triumvirateArtifacts = triumvirate.artifact;
	if (triumvirate.status === 'executed') {
		const result = triumvirate.result;
		const stopRequestedAfterRun = await deps.store.hasStopRequested(plan.stopPolicy.stopFile);
		return {
			events: result.events,
			exitCode: result.exitCode,
			kind: 'executed',
			metrics,
			result,
			stopRequestedAfterRun,
			triumvirateArtifacts,
			wallClockTimedOut: triumvirate.wallClockTimedOut ?? false,
		};
	}

	accumulateIterationMetrics(acc, metrics);
	const endedAtMs = Date.now();
	const endedAt = new Date(endedAtMs).toISOString();
	const stageResult = triumvirate.status === 'invalid' ? triumvirate.result : undefined;
	const stageDetails =
		stageResult !== undefined
			? extractIterationDetails(stageResult.events, stageResult.exitCode, work, {
					residualDirtyFilesCount: await gitDirtyFileCount(runRepoDir(plan)),
				})
			: undefined;
	// Failed-stage file counts flow into run totals via the metrics above, so the path lists must
	// accumulate too — otherwise the ledger shows nonzero counts with an empty path array.
	if (stageDetails !== undefined) {
		accumulateIterationEvidence(acc, stageDetails);
	}
	const shouldContinueAfterStageFailure =
		stageResult !== undefined &&
		stageDetails !== undefined &&
		isContinuableBackendInterruption(stageResult.exitCode, stageDetails) &&
		plan.stopPolicy.continueOnTimeout;
	const finalExitCode =
		triumvirate.status === 'aborted'
			? orchestratorExitCodes.success
			: orchestratorExitCodes.validationError;
	const recordedExitCode = stageResult?.exitCode ?? finalExitCode;
	const stopRequestedAfterStageFailure = await deps.store.hasStopRequested(
		plan.stopPolicy.stopFile,
	);
	const structured = {
		durationMs: endedAtMs - startedAtMs,
		endedAt,
		exitCode: recordedExitCode,
		iteration,
		promptChars: compiled.text.length,
		runId: acc.runId,
		snapshotKey: compiled.snapshotKey,
		startedAt,
		summary: triumvirate.summary,
		...runRuntimeFields(plan),
		metrics,
		...(stageDetails !== undefined
			? {
					commands: stageDetails.commands,
					detailsSummary: stageDetails.summary,
					errors: stageDetails.errors,
					filesCreated: stageDetails.filesCreated,
					filesEdited: stageDetails.filesEdited,
					filesRead: stageDetails.filesRead,
					outcome: stageDetails.outcome,
				}
			: {}),
		selectedWork: work,
		stopRequested: stopRequestedAfterStageFailure,
		...triumvirate.artifact,
	};
	const guardResult: AgentRunResult = stageResult ?? {
		events: [],
		exitCode: finalExitCode,
		filesModified: [],
		selectedWork: work,
		transcript: '',
	};
	move({ result: guardResult, type: 'process_result' });
	const log = stageResult !== undefined ? `${stageResult.transcript}\n` : '';
	await deps.store.writeIteration({ index: iterationArtifactIndex, log, structured });
	await deps.observer?.onIteration?.({ log, structured });
	move({ result: guardResult, type: 'write_artifacts' });
	if (stopRequestedAfterStageFailure) {
		move({
			reason: 'stop requested after triumvirate stage failure',
			type: 'stopped',
		});
		await writeRunSummary(
			deps,
			plan,
			acc,
			'stop_requested',
			orchestratorExitCodes.success,
			triumvirate.summary,
		);
		return { exitCode: orchestratorExitCodes.success, kind: 'return' };
	}
	// A stage (or the between-stage check) hit the run's wall-clock deadline. Classify the
	// run as an explicit timeout — without this branch the invalid-status fallthrough below
	// ledgers it as validation error (exit 7), masking the real cause, exactly the
	// misclassification the single-agent path fixes in post-iteration-guards.
	if (triumvirate.wallClockTimedOut === true) {
		const summary = buildWallClockTimeoutSummary(triumvirate.summary, plan);
		move({ summary, type: 'complete' });
		await writeRunSummary(
			deps,
			plan,
			acc,
			'exit_error',
			orchestratorExitCodes.aborted,
			summary,
		);
		return { exitCode: orchestratorExitCodes.aborted, kind: 'return' };
	}
	if (stageResult?.exitCode === orchestratorExitCodes.rateLimited) {
		const rate = await handleRateLimit(
			deps,
			plan,
			stageResult.events,
			controller,
			iteration,
			runStartedAtMs,
		);
		if (rate.stopRequested) {
			move({
				reason: 'stop requested during rate-limit wait',
				type: 'stopped',
			});
			await writeRunSummary(
				deps,
				plan,
				acc,
				'stop_requested',
				orchestratorExitCodes.success,
				triumvirate.summary,
			);
			return { exitCode: orchestratorExitCodes.success, kind: 'return' };
		}
		// Mirrors the single-agent path: avoid a pointless backoff while preserving the actual
		// provider rate-limit classification instead of reporting a timeout that never elapsed.
		if (rate.backoffExceedsDeadline) {
			const summary = buildRateLimitBudgetSummary(triumvirate.summary, plan);
			move({ summary, type: 'complete' });
			await writeRunSummary(
				deps,
				plan,
				acc,
				'exit_error',
				orchestratorExitCodes.rateLimited,
				summary,
			);
			return { exitCode: orchestratorExitCodes.rateLimited, kind: 'return' };
		}
		return {
			consecutiveAborts,
			consecutiveContinuableInterruptions: 0,
			kind: 'continue',
		};
	}
	if (shouldContinueAfterStageFailure) {
		const retryLimit = continuableBackendInterruptionRetryLimit(plan);
		if (
			retryLimit !== null &&
			consecutiveContinuableInterruptions >= retryLimit &&
			stageDetails !== undefined
		) {
			const summary = formatContinuableBackendInterruptionLimitSummary(
				triumvirate.summary,
				recordedExitCode,
				stageDetails,
				retryLimit,
			);
			move({ summary, type: 'complete' });
			await writeRunSummary(deps, plan, acc, 'exit_error', recordedExitCode, summary);
			return { exitCode: recordedExitCode, kind: 'return' };
		}
		return {
			consecutiveAborts: 0,
			consecutiveContinuableInterruptions: consecutiveContinuableInterruptions + 1,
			kind: 'continue',
		};
	}
	move({ summary: triumvirate.summary, type: 'complete' });
	await writeRunSummary(
		deps,
		plan,
		acc,
		triumvirate.status === 'aborted' ? 'blocked' : 'exit_error',
		finalExitCode,
		triumvirate.summary,
	);
	return { exitCode: finalExitCode, kind: 'return' };
}

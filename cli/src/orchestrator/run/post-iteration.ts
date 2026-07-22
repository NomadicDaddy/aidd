import type { AgentEvent } from 'aidd-shared/backends/types';
import type { AiddStore } from 'aidd-shared/metadata/store';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';

import type { FinalizeIterationResult, MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { type createModeHandler } from '../../modes/factory.ts';
import { writeRunSummary } from './artifacts.ts';
import { buildFeatureBlockingContext } from './blocking-context.ts';
import { determineRunContinuation } from './continuation.ts';
import { featureRecoveryTarget } from './feature-scope.ts';
import { buildWallClockTimeoutSummary } from './run-ending.ts';
import { buildRateLimitBudgetSummary, handleRateLimit } from './run-gates.ts';

export type PostIterationOutcome =
	| {
			carryoverNote?: string;
			consecutiveAborts: number;
			consecutiveContinuableInterruptions: number;
			consecutiveFlails: number;
			iteration: number;
			kind: 'continue';
	  }
	| { exitCode: number; kind: 'return' };

export async function handlePostIteration(input: {
	acc: RunAccumulator;
	consecutiveAborts: number;
	consecutiveContinuableInterruptions: number;
	consecutiveFlails: number;
	context: {
		projectDir: string;
		rootDir: string;
		scoringRoots?: readonly string[];
		store: AiddStore;
	};
	controller: AbortController;
	deps: OrchestratorDeps;
	events: AgentEvent[];
	exitCode: number;
	finalize: FinalizeIterationResult;
	iteration: number;
	mode: ReturnType<typeof createModeHandler>;
	move: MoveFn;
	plan: RunPlan;
	runStartedAtMs: number;
	stopRequestedAfterRun: boolean;
	wallClockTimedOut: boolean;
	work: SelectedWork;
}): Promise<PostIterationOutcome> {
	const {
		acc,
		context,
		controller,
		deps,
		events,
		exitCode,
		finalize,
		iteration,
		mode,
		move,
		plan,
		runStartedAtMs,
		stopRequestedAfterRun,
		wallClockTimedOut,
		work,
	} = input;
	let { consecutiveAborts, consecutiveContinuableInterruptions, consecutiveFlails } = input;

	// The wall-clock budget is exhausted: end the run as an explicit timeout. This must win
	// over the scope-overrun and completion-marker checks below — a run killed mid-completion
	// otherwise gets ledgered as "blocked by gates" (exit 7), masking the real cause. The one
	// exception is an accepted completion that landed before the abort; let the normal
	// continuation path record that success.
	if (wallClockTimedOut && finalize.completedResultFeature === undefined) {
		const summary = buildWallClockTimeoutSummary(finalize.displayedSummary, plan);
		move({ summary, type: 'complete' });
		await writeRunSummary(
			deps,
			plan,
			acc,
			'exit_error',
			orchestratorExitCodes.aborted,
			summary
		);
		return { exitCode: orchestratorExitCodes.aborted, kind: 'return' };
	}

	if (finalize.featureScope.scopeOverrun) {
		const overrunSummary = `${finalize.displayedSummary}; scope_overrun: completed non-selected feature(s): ${finalize.featureScope.extraCompletedFeatures.join(', ')}`;
		move({ summary: overrunSummary, type: 'complete' });
		await writeRunSummary(
			deps,
			plan,
			acc,
			'blocked',
			orchestratorExitCodes.validationError,
			overrunSummary
		);
		return { exitCode: orchestratorExitCodes.validationError, kind: 'return' };
	}
	if (finalize.featureScope.completionMarkerIssue !== undefined) {
		// Point the run summary at the same gate evidence the feature record carries, so an
		// unaccepted completion reads as "these gate(s) blocked it" instead of only the opaque
		// completion_marker_missing_or_unaccepted code.
		const markerEvidence = buildFeatureBlockingContext(
			finalize.details,
			finalize.featureScope.completionMarkerIssue,
			new Date().toISOString()
		);
		const gateNote =
			markerEvidence.commands.length > 0
				? `; blocking gate(s): ${markerEvidence.commands.join(', ')}`
				: '';
		const markerSummary = `${finalize.displayedSummary}; ${finalize.featureScope.completionMarkerIssue}: completed allowed feature(s): ${finalize.featureScope.unacceptedCompletedFeatures.join(', ')}${gateNote}`;
		move({ summary: markerSummary, type: 'complete' });
		await writeRunSummary(
			deps,
			plan,
			acc,
			'blocked',
			orchestratorExitCodes.validationError,
			markerSummary
		);
		return { exitCode: orchestratorExitCodes.validationError, kind: 'return' };
	}

	if (exitCode === orchestratorExitCodes.rateLimited) {
		const rate = await handleRateLimit(
			deps,
			plan,
			events,
			controller,
			iteration,
			runStartedAtMs
		);
		if (rate.stopRequested) {
			move({ reason: 'stop requested during rate-limit wait', type: 'stopped' });
			await writeRunSummary(
				deps,
				plan,
				acc,
				'stop_requested',
				orchestratorExitCodes.success,
				finalize.displayedSummary
			);
			return { exitCode: orchestratorExitCodes.success, kind: 'return' };
		}
		if (rate.backoffExceedsDeadline) {
			const summary = buildRateLimitBudgetSummary(finalize.displayedSummary, plan);
			move({ summary, type: 'complete' });
			await writeRunSummary(
				deps,
				plan,
				acc,
				'exit_error',
				orchestratorExitCodes.rateLimited,
				summary
			);
			return { exitCode: orchestratorExitCodes.rateLimited, kind: 'return' };
		}
		return {
			consecutiveAborts,
			consecutiveContinuableInterruptions: 0,
			consecutiveFlails,
			iteration,
			kind: 'continue',
		};
	}

	// A mode that has declared the run unrecoverable ends it here with its chosen
	// classification — bypassing the continuation gate, which would otherwise loop a
	// clean-exit-but-incomplete iteration until max iterations and record success.
	if (finalize.modeResult.fatal !== undefined) {
		const fatal = finalize.modeResult.fatal;
		move({ summary: finalize.displayedSummary, type: 'complete' });
		const fatalExit = await writeRunSummary(
			deps,
			plan,
			acc,
			fatal.stopReason ?? 'exit_error',
			fatal.exitCode,
			finalize.displayedSummary
		);
		return { exitCode: fatalExit, kind: 'return' };
	}

	const completed = await mode.isComplete(context, finalize.modeResult);
	const continuation = determineRunContinuation({
		backendExitCode: exitCode,
		completed,
		completedAfterBackendInterruption: finalize.completedAfterBackendInterruption,
		completedFeatureCount: acc.completedFeatures.size,
		completedResultFeature: finalize.completedResultFeature,
		consecutiveAborts,
		consecutiveContinuableInterruptions,
		consecutiveFlails,
		details: finalize.details,
		displayedSummary: finalize.displayedSummary,
		exitCode: finalize.recordedExitCode,
		plan,
		recoveredActiveVerification: finalize.recoveredActiveVerification,
		stopRequestedAfterRun,
	});
	if (continuation.kind === 'continue') {
		consecutiveAborts = continuation.consecutiveAborts;
		consecutiveFlails = continuation.consecutiveFlails;
		let nextIteration = iteration;
		if (continuation.reason === 'continuable_backend_interruption') {
			consecutiveContinuableInterruptions++;
		} else {
			consecutiveContinuableInterruptions = 0;
			nextIteration++;
		}
		return {
			consecutiveAborts,
			consecutiveContinuableInterruptions,
			consecutiveFlails,
			iteration: nextIteration,
			kind: 'continue',
			...(continuation.reason === 'flailing_nudge' && continuation.carryoverNote
				? { carryoverNote: continuation.carryoverNote }
				: {}),
		};
	}
	// Flailing stop: the run gave up after repeated non-productive iterations. Park the selected
	// feature as waiting_approval (mirroring the active-verification recovery idiom) so the outcome is
	// a clean "needs a human glance", not a silent failure leaving the feature stuck in_progress.
	if (continuation.stopReason === 'flailing') {
		const recoveredFeatureId = featureRecoveryTarget(work);
		if (recoveredFeatureId !== undefined) {
			const feature = await deps.store.readFeature(recoveredFeatureId);
			if (feature.status !== 'completed' || feature.passes !== true) {
				const parkedAt = new Date().toISOString();
				await deps.store.writeFeature({
					...feature,
					blockingContext: buildFeatureBlockingContext(
						finalize.details,
						'flailing',
						parkedAt
					),
					passes: false,
					status: 'waiting_approval',
					updatedAt: parkedAt,
				});
			}
		}
	}
	if (continuation.move === 'stopped') {
		move({ reason: continuation.stoppedReason ?? '', type: 'stopped' });
	} else {
		move({ summary: continuation.summary, type: 'complete' });
	}
	const finalExit = await writeRunSummary(
		deps,
		plan,
		acc,
		continuation.stopReason,
		continuation.exitCode,
		continuation.summary
	);
	return { exitCode: finalExit, kind: 'return' };
}

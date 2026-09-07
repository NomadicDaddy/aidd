import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import { writeIterationStart } from './formatters.ts';
import { writeStartedIterationArtifact } from './run/artifacts.ts';
import { executeIteration } from './run/execute-iteration.ts';
import { captureFeatureCompletionSnapshot } from './run/feature-scope.ts';
import { finalizeIteration } from './run/finalize.ts';
import { readGitHead } from './run/git.ts';
import { handlePostIteration } from './run/post-iteration.ts';
import {
	handleModeDirtyTreeSkip,
	handleNoWorkIteration,
	selectAndClaimIterationWork,
} from './run/preflight.ts';
import {
	armBaselineNoteIfNeeded,
	armWindDownNoteIfNeeded,
	iterationProvedCleanBaseline,
} from './run/prompt-context.ts';
import { warnIfBudgetExceeded } from './run/run-accumulator.ts';
import {
	endRunIfBudgetTooThinForIteration,
	endRunIfWallClockExpired,
	finalizeMaxIterationsRun,
} from './run/run-ending.ts';
import { initializeOrchestratorRun } from './run/startup.ts';
import { createStateMove } from './run/state-move.ts';
import { type OrchestratorDeps } from './run/types.ts';
import { recordIterationCheckpoint } from './run/worktree-manager.ts';
import { enforceWriteAllowlistForIteration } from './run/write-allowlist-iteration.ts';
import { captureWriteGuardSnapshot } from './run/write-allowlist.ts';

export type {
	OrchestratorDeps,
	RunFinalSummary,
	RunIterationArtifact,
	RunObserver,
} from './run/types.ts';

export async function runOrchestrator(plan: RunPlan, deps: OrchestratorDeps): Promise<number> {
	const move = createStateMove(plan, deps);

	const startup = await initializeOrchestratorRun(plan, deps, move);
	if (startup.kind === 'return') return startup.exitCode;
	const { acc, context, mode, promptContext, runStartedAtMs } = startup;
	let lastSummary = 'max iterations reached';

	let iteration = 0;
	let consecutiveAborts = 0;
	let consecutiveContinuableInterruptions = 0;
	let consecutiveFlails = 0;
	// Selections whose feature record vanished before the iteration could start. Skipped iterations
	// cost nothing and must not count against maxIterations, so this bounds them instead.
	let consecutiveVanishedClaims = 0;
	// Nudge iterations don't advance `iteration`, so this — not maxIterations — is what bounds them.
	let flailNudgeGrants = 0;
	let budgetWarned = false;
	// Set when an iteration ends clean with an accepted completion AND recorded a passing quality
	// gate, so the next iteration can skip re-establishing the same baseline. All three are
	// required — see iterationProvedCleanBaseline. Consumed (and cleared) at the next compile.
	let previousIterationVerifiedBaseline = false;
	while (plan.scope.maxIterations === null || iteration < plan.scope.maxIterations) {
		const wallClockExit = await endRunIfWallClockExpired({
			acc,
			deps,
			lastSummary,
			move,
			plan,
			runStartedAtMs,
		});
		if (wallClockExit !== undefined) return wallClockExit;
		// The deadline has not passed, but it may be too close to fit another iteration. Stopping
		// here ends the run deliberately instead of letting the watchdog kill an agent mid-edit.
		const thinBudgetExit = await endRunIfBudgetTooThinForIteration({
			acc,
			deps,
			lastSummary,
			move,
			plan,
			runStartedAtMs,
		});
		if (thinBudgetExit !== undefined) return thinBudgetExit;
		const dirtyTreeExit = await handleModeDirtyTreeSkip(deps, plan, acc, iteration, move);
		if (dirtyTreeExit !== undefined) return dirtyTreeExit;
		const selection = await selectAndClaimIterationWork({
			acc,
			consecutiveVanishedClaims,
			context,
			deps,
			mode,
			move,
			plan,
		});
		if (selection.kind === 'return') return selection.exitCode;
		consecutiveVanishedClaims = selection.consecutiveVanishedClaims;
		// Record deleted between selection and claim — reselect rather than dispatch at a dead dir.
		if (selection.kind === 'reselect') continue;
		const { work } = selection;
		move({ plan, type: 'compile_prompt', work });
		if (work.kind === 'none') {
			return await handleNoWorkIteration({
				acc,
				context,
				deps,
				iteration,
				mode,
				move,
				plan,
				work,
			});
		}
		const promptPlan = await mode.buildPromptPlan(context, work);
		armWindDownNoteIfNeeded(promptContext, plan, runStartedAtMs, iteration);
		await armBaselineNoteIfNeeded(promptContext, plan, previousIterationVerifiedBaseline);
		previousIterationVerifiedBaseline = false;
		const compiled = await promptContext.compile(promptPlan);
		move({ plan, prompt: compiled, type: 'run_agent' });
		const startedAtMs = Date.now();
		const startedAt = new Date(startedAtMs).toISOString();
		const featureSnapshotBefore = await captureFeatureCompletionSnapshot(deps.store);
		const gitHeadBefore = await readGitHead(runRepoDir(plan));
		// Covers triumvirate too: its execution stage writes to the real worktree.
		let writeGuardBaseline: Awaited<ReturnType<typeof captureWriteGuardSnapshot>> = null;
		if (plan.writeAllowlist !== undefined) {
			writeGuardBaseline = await captureWriteGuardSnapshot(runRepoDir(plan));
			if (writeGuardBaseline === null) {
				console.warn(
					'[orchestrator] --write-allowlist requested but the project is not a git repository; writes cannot be guarded this iteration.',
				);
			}
		}
		const iterationArtifactIndex = await writeStartedIterationArtifact({
			acc,
			compiled,
			deps,
			iteration,
			plan,
			startedAt,
			work,
		});
		writeIterationStart({ iteration, plan, promptChars: compiled.text.length, work });
		const controller = new AbortController();
		const iterationRun = await executeIteration({
			acc,
			compiled,
			consecutiveAborts,
			consecutiveContinuableInterruptions,
			controller,
			deps,
			gitHeadBefore,
			iteration,
			iterationArtifactIndex,
			move,
			plan,
			runStartedAtMs,
			startedAt,
			startedAtMs,
			work,
		});
		if (iterationRun.kind === 'return') return iterationRun.exitCode;
		if (iterationRun.kind === 'continue') {
			consecutiveContinuableInterruptions = iterationRun.consecutiveContinuableInterruptions;
			consecutiveAborts = iterationRun.consecutiveAborts;
			continue;
		}
		let {
			completionCommittedDuringGrace,
			completionFinalizedBeforeBackendExit,
			events,
			exitCode,
			idleWarningTimestamps,
			metrics,
			progress: activeProgress,
			result,
			stopRequestedAfterRun,
			timeToFirstEventMs,
			wallClockTimedOut,
		} = iterationRun.state;
		const { triumvirateArtifacts } = iterationRun.state;

		if (plan.writeAllowlist !== undefined && writeGuardBaseline !== null) {
			const writeGuard = await enforceWriteAllowlistForIteration({
				acc,
				activeProgress,
				compiled,
				completionCommittedDuringGrace,
				completionFinalizedBeforeBackendExit,
				controller,
				deps,
				events,
				exitCode,
				gitHeadBefore,
				idleWarningTimestamps,
				iteration,
				metrics,
				move,
				plan,
				result,
				runStartedAtMs,
				startedAtMs,
				stopRequestedAfterRun,
				timeToFirstEventMs,
				wallClockTimedOut,
				work,
				writeGuardBaseline,
			});
			if (writeGuard.kind === 'return') return writeGuard.exitCode;
			({
				activeProgress,
				completionCommittedDuringGrace,
				completionFinalizedBeforeBackendExit,
				events,
				exitCode,
				idleWarningTimestamps,
				metrics,
				result,
				stopRequestedAfterRun,
				timeToFirstEventMs,
				wallClockTimedOut,
			} = writeGuard.state);
		}

		const finalize = await finalizeIteration({
			acc,
			activeProgress,
			compiled,
			completionCommittedDuringGrace,
			completionFinalizedBeforeBackendExit,
			context,
			deps,
			events,
			exitCode,
			featureSnapshotBefore,
			gitHeadBefore,
			idleWarningTimestamps,
			iteration,
			iterationArtifactIndex,
			metrics,
			mode,
			move,
			plan,
			result,
			runStartedAtMs,
			startedAt,
			startedAtMs,
			stopRequestedAfterRun,
			timeToFirstEventMs,
			triumvirateArtifacts,
			work,
		});
		lastSummary = finalize.displayedSummary;
		previousIterationVerifiedBaseline =
			finalize.recordedExitCode === orchestratorExitCodes.success &&
			finalize.completedResultFeature !== undefined &&
			iterationProvedCleanBaseline(finalize.details);

		// Token/cost budget is warn-only: surface the first overrun in the run log (which the web
		// panel renders) and never alter control flow. Checked after each iteration's metrics.
		budgetWarned = warnIfBudgetExceeded(plan, acc, budgetWarned);

		// In worktree mode, stamp a restorable checkpoint at the iteration's HEAD so a run can be
		// rolled back to any iteration; the namespace is pruned when the worktree is torn down.
		if (plan.worktree) await recordIterationCheckpoint(plan.worktree, iteration);

		const postOutcome = await handlePostIteration({
			acc,
			consecutiveAborts,
			consecutiveContinuableInterruptions,
			consecutiveFlails,
			context,
			controller,
			deps,
			events,
			exitCode,
			featureSnapshotBefore,
			finalize,
			flailNudgeGrants,
			iteration,
			mode,
			move,
			plan,
			runStartedAtMs,
			stopRequestedAfterRun,
			wallClockTimedOut,
			work,
		});
		if (postOutcome.kind === 'return') return postOutcome.exitCode;
		iteration = postOutcome.iteration;
		consecutiveAborts = postOutcome.consecutiveAborts;
		consecutiveContinuableInterruptions = postOutcome.consecutiveContinuableInterruptions;
		consecutiveFlails = postOutcome.consecutiveFlails;
		flailNudgeGrants = postOutcome.flailNudgeGrants;
		promptContext.setCarryoverNote(postOutcome.carryoverNote);
	}

	return await finalizeMaxIterationsRun({ acc, deps, lastSummary, move, plan });
}

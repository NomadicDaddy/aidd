import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { FinalizeIterationResult, MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { writeRunSummary } from './artifacts.ts';
import { buildFeatureBlockingContext } from './blocking-context.ts';
import { invalidFeatureMetadataNote, scopeOverrunNote } from './carryover-notes.ts';
import { attemptCompletionMarkerRecovery } from './completion-recovery.ts';
import { buildWallClockTimeoutSummary } from './run-ending.ts';

// The post-iteration checks that run before the continuation state machine gets a say: wall-clock
// exhaustion, invalid feature metadata, scope overrun, and an unaccepted completion marker. The
// ones that end the run write their own run summary; the ones that only end the iteration raise a
// corrective note for the next prompt. Returning `undefined` means the run continues.
export async function endRunIfIterationGuardTripped(input: {
	acc: RunAccumulator;
	deps: OrchestratorDeps;
	finalize: FinalizeIterationResult;
	move: MoveFn;
	plan: RunPlan;
	wallClockTimedOut: boolean;
	work: SelectedWork;
}): Promise<number | undefined> {
	const { acc, deps, finalize, move, plan, wallClockTimedOut, work } = input;

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
			summary,
		);
		return orchestratorExitCodes.aborted;
	}

	// A feature record that will not parse is silent data loss: aidd's listings skip it, so the
	// feature disappears from selection and counts until someone repairs the file. Say so on the
	// console and hand the next iteration a repair instruction; it does not end the run, because
	// the agent is the one who can fix it.
	if (finalize.featureScope.invalidFeatureMetadata.length > 0) {
		for (const failure of finalize.featureScope.invalidFeatureMetadata) {
			console.error(
				`[feature-metadata] .aidd/features/${failure.directory}/feature.json will not parse and is invisible to aidd: ${failure.message}`,
			);
		}
		acc.pendingCarryoverNotes.push(
			invalidFeatureMetadataNote(finalize.featureScope.invalidFeatureMetadata),
		);
	}

	if (finalize.featureScope.scopeOverrun) {
		acc.scopeOverrunIterations += 1;
		const overrunSummary = `${finalize.displayedSummary}; scope_overrun: completed non-selected feature(s): ${finalize.featureScope.extraCompletedFeatures.join(', ')}`;
		// One overrun is a scoping mistake by one iteration, not grounds for discarding a run that
		// is otherwise committing clean work (observed: a 9-iteration, 7-commit run ended `blocked`
		// with three features still eligible). Correct the agent and keep going; a second overrun
		// means the boundary is not being respected, and that does end the run.
		if (acc.scopeOverrunIterations < 2) {
			console.warn(`[scope] ${overrunSummary}`);
			acc.pendingCarryoverNotes.push(
				scopeOverrunNote(finalize.featureScope.extraCompletedFeatures),
			);
		} else {
			move({ summary: overrunSummary, type: 'complete' });
			await writeRunSummary(
				deps,
				plan,
				acc,
				'blocked',
				orchestratorExitCodes.validationError,
				overrunSummary,
			);
			return orchestratorExitCodes.validationError;
		}
	}

	if (finalize.featureScope.completionMarkerIssue === undefined) return undefined;

	// A backend that dies between finishing the work and committing it (observed: claude-code
	// exited mid-smoke:qc twice in one run) strands a completed feature as unaccepted. When the
	// on-disk feature already says completed+passes and the project's own gate passes right
	// now, auto-commit the work and record the completion instead of failing the run.
	const recovery = plan.simulation
		? undefined
		: await attemptCompletionMarkerRecovery({
				dirtySourcePathsAtStart: acc.dirtySourcePathsAtStart,
				featureScope: finalize.featureScope,
				projectDir: runRepoDir(plan),
				runRecordedPaths: new Set([...acc.filesCreated, ...acc.filesEdited]),
				store: deps.store,
				work,
			});
	if (recovery !== undefined && work.kind === 'feature') {
		acc.completedFeatures.add(work.id);
		acc.commitsCreated.push(recovery.commit);
		acc.runTotals.commitsCreated += 1;
		const recoverySummary = `${finalize.displayedSummary}; completion_marker_recovered: feature ${work.id} completed on disk, recovery gate passed (${recovery.gateCommand}); work auto-committed (${recovery.commit.hash.slice(0, 10)})`;
		move({ summary: recoverySummary, type: 'complete' });
		return await writeRunSummary(
			deps,
			plan,
			acc,
			'completed',
			orchestratorExitCodes.success,
			recoverySummary,
		);
	}
	// Point the run summary at the same gate evidence the feature record carries, so an
	// unaccepted completion reads as "these gate(s) blocked it" instead of only the opaque
	// completion_marker_missing_or_unaccepted code.
	const markerEvidence = buildFeatureBlockingContext(
		finalize.details,
		finalize.featureScope.completionMarkerIssue,
		new Date().toISOString(),
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
		markerSummary,
	);
	return orchestratorExitCodes.validationError;
}

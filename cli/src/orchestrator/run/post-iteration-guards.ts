import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { readActiveFeatureLeases } from 'aidd-shared/metadata/feature-leases';
import { readFeatureIfPresent } from 'aidd-shared/metadata/store/read-optional';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import type {
	FeatureCompletionSnapshot,
	FinalizeIterationResult,
	MoveFn,
	OrchestratorDeps,
	RunAccumulator,
} from './types.ts';

import { writeRunSummary } from './artifacts.ts';
import { buildFeatureBlockingContext } from './blocking-context.ts';
import {
	destroyedLeasedFeaturesNote,
	featureContractIssuesNote,
	invalidFeatureMetadataNote,
	rejectedAuditReportsNote,
	scopeOverrunNote,
} from './carryover-notes.ts';
import { attemptCompletionMarkerRecovery } from './completion-recovery.ts';
import { buildWallClockTimeoutSummary } from './run-ending.ts';

// The post-iteration checks that run before the continuation state machine gets a say: wall-clock
// exhaustion, invalid feature metadata, scope overrun, and an unaccepted completion marker. The
// ones that end the run write their own run summary; the ones that only end the iteration raise a
// corrective note for the next prompt. Returning `undefined` means the run continues.
async function pushFeatureContractIssues(
	acc: RunAccumulator,
	deps: OrchestratorDeps,
): Promise<void> {
	// Fail-soft: an unreadable collection is already reported by the invalid-metadata guard, and a
	// validator that throws must not be what ends an otherwise good iteration. `try` rather than
	// `.catch()` — a store stub without the method throws synchronously, before there is a promise.
	let result;
	try {
		result = await deps.store.validateFeatures({ includeAudit: true });
	} catch {
		return;
	}
	if (result.valid || result.issues.length === 0) return;
	for (const issue of result.issues) {
		console.error(`[check-features] ${issue.id}: ${issue.message}`);
	}
	acc.pendingCarryoverNotes.push(featureContractIssuesNote(result.issues));
}

// A feature leased by another LIVE run is that run's for the duration: its agent is mid-flight
// against those bytes and will read them back when it finishes. Nothing can stop a run from
// deleting one — agents edit files with a shell, not through the store — so the enforceable half is
// the prompt notice (see renderLeasedFeatures) and this: name the destruction while the offending
// run is still around to be corrected, instead of leaving the victim to discover it as a missing
// file at completion time (run_1787610769365_f3b58391).
//
// Deletion is asserted only against `snapshotBefore`, the inventory captured from THIS run's store
// immediately before the backend was dispatched. "Leased but absent" on its own is not evidence:
// leases live in git's common directory and are shared by every linked worktree, while a worktree
// run reads a seed-time COPY of `.aidd` (worktree-metadata-session). A feature created and leased
// canonically after that seed never existed in the worktree's store, so absence there says nothing
// about who deleted what. Requiring presence at iteration start makes the claim provable and keeps
// the failure direction safe: an unknown record is silently skipped, never accused.
function presentAtIterationStart(
	snapshotBefore: FeatureCompletionSnapshot,
	featureId: string,
): boolean {
	// Both sides key on `directory ?? id` — selectLeasableFeature leases that name and
	// captureFeatureCompletionSnapshot records it — so the lookup needs no id/directory translation.
	if (snapshotBefore.completed.has(featureId)) return true;
	// A record that existed but would not parse is still a record that existed.
	return snapshotBefore.unreadable.some((failure) => failure.directory === featureId);
}

async function pushDestroyedLeasedFeatures(
	acc: RunAccumulator,
	deps: OrchestratorDeps,
	plan: RunPlan,
	snapshotBefore: FeatureCompletionSnapshot,
): Promise<void> {
	// Fail-soft throughout: a lease directory that cannot be read must not end an otherwise good
	// iteration. Worst case this reports nothing, which is the pre-existing behavior.
	const leases = await readActiveFeatureLeases(runRepoDir(plan)).catch(() => []);
	const destroyed: { featureId: string; runId: string }[] = [];
	for (const lease of leases) {
		if (lease.runId === acc.runId) continue;
		if (!presentAtIterationStart(snapshotBefore, lease.featureId)) continue;
		const present = await readFeatureIfPresent(deps.store, lease.featureId).then(
			(feature) => feature !== undefined,
			// Present but unreadable is a different fault with its own guard above, not a deletion.
			() => true,
		);
		if (!present) destroyed.push({ featureId: lease.featureId, runId: lease.runId });
	}
	if (destroyed.length === 0) return;
	for (const lease of destroyed) {
		console.error(
			`[feature-lease] .aidd/features/${lease.featureId}/feature.json was deleted while live run ${lease.runId} held its lease and was working on it`,
		);
	}
	// The note corrects a run that has another iteration coming; the accumulator carries the same
	// finding into the run summary for the single-iteration directives that do not.
	acc.destroyedLeasedFeatures.push(...destroyed);
	acc.pendingCarryoverNotes.push(destroyedLeasedFeaturesNote(destroyed));
}

// Audit mode rejects a report whole rather than persisting a partial one, and leaves the audit
// pending so the next iteration re-selects it. Hand the agent the rejection reasons so that retry
// is informed rather than a re-roll of the same report.
function pushRejectedAuditReports(acc: RunAccumulator, finalize: FinalizeIterationResult): void {
	// Fail-soft like the contract check above: reading an optional artifact must never be what
	// ends an otherwise good iteration, and non-audit modes carry no such artifact at all.
	const invalid = finalize.modeResult?.artifacts?.invalidAuditReports;
	if (!Array.isArray(invalid) || invalid.length === 0) return;
	const reports = invalid.filter(
		(report): report is { auditName?: string; reason: string } =>
			typeof report === 'object' &&
			report !== null &&
			typeof (report as { reason?: unknown }).reason === 'string',
	);
	if (reports.length === 0) return;
	for (const report of reports) {
		console.warn(
			`[audit-mode] report rejected and not persisted: ${report.auditName ?? 'unnamed'} — ${report.reason}`,
		);
	}
	acc.pendingCarryoverNotes.push(rejectedAuditReportsNote(reports));
}

export async function endRunIfIterationGuardTripped(input: {
	acc: RunAccumulator;
	deps: OrchestratorDeps;
	/** Feature inventory captured from this run's store just before the backend was dispatched.
	 * The deletion guard asserts disappearance against it rather than against absence alone. */
	featureSnapshotBefore: FeatureCompletionSnapshot;
	finalize: FinalizeIterationResult;
	move: MoveFn;
	plan: RunPlan;
	wallClockTimedOut: boolean;
	work: SelectedWork;
}): Promise<number | undefined> {
	const { acc, deps, featureSnapshotBefore, finalize, move, plan, wallClockTimedOut, work } =
		input;

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

	// The feature contract check (`--check-features`), run where the agent can
	// still act on it. Run-end reconciliation reports the same issues, but only to the operator and
	// only once the agent has gone; catching it here is what makes the loop closeable. Advisory by
	// design — like the metadata guard above, the agent is the one who can fix it.
	await pushFeatureContractIssues(acc, deps);

	await pushDestroyedLeasedFeatures(acc, deps, plan, featureSnapshotBefore);

	pushRejectedAuditReports(acc, finalize);

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

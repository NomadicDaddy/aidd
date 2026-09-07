import { readFeatureIfPresent } from 'aidd-shared/metadata/store/read-optional';
import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { FinalizeIterationInput, FinalizeIterationResult } from './types.ts';

import { extractIterationDetails } from '../details.ts';
import { formatFailureSummary, formatRecoverySummary } from '../formatters.ts';
import { OrchestratorProgressReporter } from '../progress.ts';
import {
	appendPlanningRecoverySummary,
	extractTriumviratePlanningRecovery,
} from '../triumvirate/planning-recovery.ts';
import { buildIterationStructured } from './artifacts.ts';
import { buildFeatureBlockingContext } from './blocking-context.ts';
import {
	applySimulatedFeatureCompletion,
	completionRequiresCommit,
	parkCompletionsPendingCommit,
	stampCompletedFeatures,
} from './completion-persistence.ts';
import { runEvidence } from './dirty-source-attribution.ts';
import {
	appendInvalidFeatureMetadata,
	auditFeatureScope,
	featureRecoveryTarget,
} from './feature-scope.ts';
import { listGitCommits, readGitHead } from './git.ts';
import { classifyIterationOutcome } from './iteration-outcome.ts';
import {
	accumulateAdditionalFileChanges,
	mergeModeFileChanges,
	resolveIterationFileChanges,
} from './mode-file-changes.ts';
import {
	accumulateIterationCommits,
	accumulateIterationEvidence,
	accumulateIterationMetrics,
} from './run-accumulator.ts';

export async function finalizeIteration(
	input: FinalizeIterationInput,
): Promise<FinalizeIterationResult> {
	const {
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
	} = input;

	const endedAtMs = Date.now();
	const endedAt = new Date(endedAtMs).toISOString();
	const durationMs = endedAtMs - startedAtMs;
	const structuredResult = result.structuredResult;
	const gitHeadAfter = await readGitHead(runRepoDir(plan));
	const iterationCommits = await listGitCommits(
		runRepoDir(plan),
		gitHeadBefore,
		gitHeadAfter,
		startedAtMs,
	);
	const completionPendingCommit = await completionRequiresCommit({
		completionCommittedDuringGrace,
		completionFinalizedBeforeBackendExit,
		dirtySourcePathsAtStart: acc.dirtySourcePathsAtStart,
		evidence: runEvidence({ events, prior: acc }),
		gitHeadBefore,
		iterationCommitCount: iterationCommits.length,
		projectDir: runRepoDir(plan),
		startedAtMs,
		store: deps.store,
		work,
	});
	if (plan.simulation) {
		await applySimulatedFeatureCompletion({
			iterationCommitCount: iterationCommits.length,
			store: deps.store,
			structuredResult,
			work,
		});
	}
	move({ result, type: 'process_result' });
	const modeResult = await mode.processResult(context, result);
	await deps.observer?.onModeResult?.(modeResult);
	const completedResultFeature = completionPendingCommit
		? undefined
		: typeof modeResult.artifacts?.completedFeature === 'string'
			? modeResult.artifacts.completedFeature
			: undefined;
	const featureScope = await auditFeatureScope(
		deps.store,
		work,
		featureSnapshotBefore,
		completedResultFeature,
	);
	// Classify the outcome and extract iteration details up front so the parking sites below can
	// persist the failing-gate context onto the feature they demote (see buildFeatureBlockingContext).
	const {
		completedAfterBackendInterruption,
		endedWithKilledBackgroundTasks,
		findingsContractDropped,
		malformedResultMarker,
		missingAiddResult,
		missingAuditArtifacts,
		recordedExitCode,
		residualDirtyFilesCount,
	} = await classifyIterationOutcome({
		completedResultFeature,
		completionFinalizedBeforeBackendExit,
		events,
		exitCode,
		iterationCommits,
		modeResult,
		plan,
		startedAtMs,
		structuredResult,
		work,
	});
	const details = extractIterationDetails(events, recordedExitCode, work, {
		completionPendingCommit,
		findingsContractDropped,
		missingAiddResult,
		missingAuditArtifacts,
		residualDirtyFilesCount,
	});
	if (completionPendingCommit) {
		const parkedAt = new Date().toISOString();
		await parkCompletionsPendingCommit({
			blockingContext: buildFeatureBlockingContext(
				details,
				'completion_pending_commit',
				parkedAt,
			),
			completedFeatures: featureScope.completedFeatures,
			parkedAt,
			snapshotBefore: featureSnapshotBefore,
			store: deps.store,
		});
	}
	for (const featureId of featureScope.selectedFeatures) acc.selectedFeatures.add(featureId);
	if (!completionPendingCommit) {
		for (const featureId of featureScope.completedFeatures)
			acc.completedFeatures.add(featureId);
		await stampCompletedFeatures(deps.store, featureScope.completedFeatures);
	}
	acc.scopeOverrun = acc.scopeOverrun || featureScope.scopeOverrun;
	const unexpectedAuditCommits = accumulateIterationCommits({
		acc,
		commits: iterationCommits,
		mode: plan.mode,
		work,
	});
	const iterationProgress =
		activeProgress ??
		new OrchestratorProgressReporter({
			backend: plan.backend,
			heartbeatMs: 0,
			iteration,
			iterationStartedAtMs: startedAtMs,
			runStartedAtMs,
			...(plan.triumvirate ? { stagePrefix: 'triumvirate' } : {}),
		});
	if (plan.triumvirate) {
		iterationProgress.setStage('process_result', { last: `exit ${exitCode}` });
	}
	const planningRecovery = extractTriumviratePlanningRecovery(triumvirateArtifacts);
	const recoveredActiveVerification = details.outcome.status === 'active_verification_recovery';
	const recoveredFeatureId = featureRecoveryTarget(work);
	if (recoveredActiveVerification && recoveredFeatureId !== undefined) {
		// `undefined` = deleted mid-iteration by a concurrent run; nothing left to park.
		const feature = await readFeatureIfPresent(deps.store, recoveredFeatureId);
		if (feature !== undefined && (feature.status !== 'completed' || feature.passes !== true)) {
			const parkedAt = new Date().toISOString();
			await deps.store.writeFeature({
				...feature,
				blockingContext: buildFeatureBlockingContext(
					details,
					'active_verification_recovery',
					parkedAt,
				),
				passes: false,
				status: 'waiting_approval',
				updatedAt: parkedAt,
			});
		}
	}
	// Gate on the classified code, not the raw backend exit: a backend that exits 0 but is
	// reclassified (e.g. missing AIDD_RESULT → 73) must not record a bare success-looking
	// summary while its exitCode field says otherwise.
	const baseIterationSummary =
		recordedExitCode !== orchestratorExitCodes.success &&
		!completedAfterBackendInterruption &&
		!recoveredActiveVerification
			? formatFailureSummary(modeResult.summary, recordedExitCode, details, exitCode)
			: recoveredActiveVerification
				? formatRecoverySummary(modeResult.summary, details)
				: modeResult.summary;
	const iterationSummary = appendPlanningRecoverySummary(baseIterationSummary, planningRecovery);
	move({ result, type: 'write_artifacts' });
	iterationProgress.setStage('write_artifacts', { last: `exit ${recordedExitCode}` });
	// Ledger's backendExitCode: the raw last-iteration exit before orchestrator classification.
	// Must be the raw exitCode, not recordedExitCode — a clean exit reclassified to 73 would
	// otherwise ledger backendExitCode: 73 while the summary reads "[backend exit 0]".
	acc.lastBackendExitCode = exitCode;
	acc.iterationDurationsMs.push(durationMs);
	accumulateIterationMetrics(acc, metrics);
	accumulateIterationEvidence(acc, details, modeResult);
	const modeFileChanges = await resolveIterationFileChanges({
		commits: iterationCommits,
		details,
		modeArtifacts: modeResult.artifacts,
		projectDir: runRepoDir(plan),
	});
	accumulateAdditionalFileChanges(acc, modeFileChanges);
	const detailsWithModeFileChanges = mergeModeFileChanges(details, modeFileChanges);
	const structured = buildIterationStructured({
		acc,
		compiled,
		completionFinalizedBeforeBackendExit,
		completionPendingCommit,
		details: detailsWithModeFileChanges,
		durationMs,
		endedAt,
		endedWithKilledBackgroundTasks,
		featureScope,
		findingsContractDropped,
		idleWarningTimestamps,
		iteration,
		iterationCommits,
		iterationSummary,
		malformedResultMarker,
		metrics,
		missingAiddResult,
		missingAuditArtifacts,
		modeResult,
		plan,
		planningRecovery,
		recordedExitCode,
		residualDirtyFilesCount,
		startedAt,
		stopRequestedAfterRun,
		timeToFirstEventMs,
		triumvirateArtifacts,
		unexpectedAuditCommits,
	});
	await deps.store.writeIteration({
		index: iterationArtifactIndex,
		log: `${result.transcript}\n`,
		structured,
	});
	await deps.observer?.onIteration?.({ log: `${result.transcript}\n`, structured });
	// Recognized-benign backend notices are excluded from the error accounting so they cannot
	// masquerade as a failure — but a truncated skill catalogue or a missing model profile is a
	// real configuration problem, so print the resolving action instead of discarding it silently.
	for (const advisory of detailsWithModeFileChanges.advisories ?? []) {
		console.warn(`[advisory] ${advisory}`);
	}
	const summary = await mode.summarize(context, modeResult);
	const displayedSummary = appendInvalidFeatureMetadata(
		appendPlanningRecoverySummary(summary.text, planningRecovery),
		featureScope.invalidFeatureMetadata,
	);
	console.log(`\n${displayedSummary}`);
	iterationProgress.setStage('iteration_complete', { last: displayedSummary });
	activeProgress?.stop();

	return {
		completedAfterBackendInterruption,
		completedResultFeature,
		details: detailsWithModeFileChanges,
		displayedSummary,
		featureScope,
		modeResult,
		planningRecovery,
		recordedExitCode,
		recoveredActiveVerification,
	};
}

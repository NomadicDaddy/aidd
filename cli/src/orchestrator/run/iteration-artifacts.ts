import type { ModeResult, SelectedWork } from 'aidd-shared/modes/types';
import type { IterationMetrics } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import type { CompiledPrompt } from '../../prompts/types.ts';
import type { IterationDetails } from '../details.ts';
import type { extractTriumviratePlanningRecovery } from '../triumvirate/planning-recovery.ts';

import { allowedFeatureIdsForWork } from './feature-scope.ts';
import {
	runRuntimeFields,
	type FeatureScopeAudit,
	type GitCommitSummary,
	type OrchestratorDeps,
	type RunAccumulator,
} from './types.ts';

export function buildIterationStructured(input: {
	acc: RunAccumulator;
	compiled: CompiledPrompt;
	completionFinalizedBeforeBackendExit: boolean;
	completionPendingCommit: boolean;
	details: IterationDetails;
	durationMs: number;
	endedAt: string;
	endedWithKilledBackgroundTasks: boolean;
	featureScope: FeatureScopeAudit;
	findingsContractDropped: boolean;
	idleWarningTimestamps: { afterMs: number; atMs: number }[];
	iteration: number;
	iterationCommits: GitCommitSummary[];
	iterationSummary: string;
	malformedResultMarker: boolean;
	metrics: IterationMetrics;
	missingAiddResult: boolean;
	missingAuditArtifacts: boolean;
	modeResult: ModeResult;
	plan: RunPlan;
	planningRecovery: ReturnType<typeof extractTriumviratePlanningRecovery>;
	recordedExitCode: number;
	residualDirtyFilesCount: number;
	startedAt: string;
	stopRequestedAfterRun: boolean;
	timeToFirstEventMs: number | undefined;
	triumvirateArtifacts: Record<string, unknown>;
	unexpectedAuditCommits: string[];
}): Record<string, unknown> {
	const {
		acc,
		compiled,
		completionFinalizedBeforeBackendExit,
		completionPendingCommit,
		details,
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
	} = input;
	return {
		durationMs,
		endedAt,
		iteration,
		runId: acc.runId,
		snapshotKey: compiled.snapshotKey,
		startedAt,
		summary: iterationSummary,
		...(timeToFirstEventMs !== undefined ? { timeToFirstEventMs } : {}),
		exitCode: recordedExitCode,
		idleWarningTimestamps,
		promptChars: compiled.text.length,
		...runRuntimeFields(plan),
		allowedFeatureIds: featureScope.allowedFeatureIds,
		commands: details.commands,
		commitsCreated: iterationCommits,
		completedFeatures: featureScope.completedFeatures,
		detailsSummary: details.summary,
		errors: details.errors,
		extraCompletedFeatures: featureScope.extraCompletedFeatures,
		failedCommands: details.failedCommands,
		filesCreated: details.filesCreated,
		filesEdited: details.filesEdited,
		filesRead: details.filesRead,
		metrics,
		outcome: details.outcome,
		scopeOverrun: featureScope.scopeOverrun,
		selectedFeatures: featureScope.selectedFeatures,
		unacceptedCompletedFeatures: featureScope.unacceptedCompletedFeatures,
		...(unexpectedAuditCommits.length > 0 ? { unexpectedAuditCommits } : {}),
		...(featureScope.completionMarkerIssue !== undefined
			? { completionMarkerIssue: featureScope.completionMarkerIssue }
			: {}),
		...(planningRecovery !== undefined
			? { triumviratePlanningRecovery: planningRecovery }
			: {}),
		...(completionFinalizedBeforeBackendExit ? { backendCompletionFinalizedEarly: true } : {}),
		...(completionPendingCommit ? { completionPendingCommit: true } : {}),
		...(missingAiddResult ? { missingAiddResult: true } : {}),
		// Distinguishes "the agent never emitted a marker" from "it emitted a placeholder marker
		// that could not be parsed" — both record missing_aidd_result, but only the latter means a
		// completed run's payload was lost at the last step.
		...(malformedResultMarker ? { malformedResultMarker: true } : {}),
		...(endedWithKilledBackgroundTasks ? { endedWithKilledBackgroundTasks: true } : {}),
		...(missingAuditArtifacts ? { missingAuditArtifacts: true } : {}),
		...(findingsContractDropped ? { findingsContractDropped: true } : {}),
		...(details.featureSlug !== undefined ? { featureSlug: details.featureSlug } : {}),
		...(details.featureDescription !== undefined
			? { featureDescription: details.featureDescription }
			: {}),
		commitsCreatedCount: iterationCommits.length,
		filesCreatedCount: details.filesCreated.length,
		filesEditedCount: details.filesEdited.length,
		residualDirtyFilesCount,
		stopRequested: stopRequestedAfterRun,
		...triumvirateArtifacts,
		...modeResult.artifacts,
	};
}

export async function writeStartedIterationArtifact(input: {
	acc: RunAccumulator;
	compiled: CompiledPrompt;
	deps: OrchestratorDeps;
	iteration: number;
	plan: RunPlan;
	startedAt: string;
	work: SelectedWork;
}): Promise<number> {
	const selectedFeatures = input.work.kind === 'feature' ? [input.work.id] : [];
	const structured = {
		durationMs: 0,
		endedAt: null,
		exitCode: null,
		iteration: input.iteration,
		lifecycle: 'started',
		promptChars: input.compiled.text.length,
		runId: input.acc.runId,
		snapshotKey: input.compiled.snapshotKey,
		startedAt: input.startedAt,
		summary:
			selectedFeatures.length > 0
				? `coding started ${selectedFeatures.join(', ')}`
				: `${input.plan.mode} iteration started`,
		...runRuntimeFields(input.plan),
		allowedFeatureIds: allowedFeatureIdsForWork(input.work),
		completedFeatures: [],
		lifecycleReason: 'pre_backend_claim',
		selectedFeatures,
		selectedWork: input.work,
	};
	const artifact = { log: '', structured };
	const index = await input.deps.store.writeIteration(artifact);
	await input.deps.observer?.onIteration?.(artifact);
	return index;
}

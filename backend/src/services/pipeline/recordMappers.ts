import type {
	PipelineActiveTopLevelStep,
	PipelineExecutionIdentity,
	PipelineSessionRecord,
	PipelineSessionStatus,
	PipelineStepPhase,
	PipelineStepResultRecord,
	PipelineStepStatus,
} from '../../types.ts';
import type { PipelineSessionRow, PipelineStepResultRow } from './types.ts';

function sessionLaunchIdentities(row: PipelineSessionRow): PipelineExecutionIdentity[] {
	const identity: PipelineExecutionIdentity = {
		backend: row.launchBackend,
		model: row.launchModel,
		provider: null,
		reasoningEffort: row.launchReasoningEffort,
	};
	return Object.values(identity).some((value) => value !== null) ? [identity] : [];
}

export function toSessionRecord(
	row: PipelineSessionRow,
	completedTopLevelSteps: number,
	executionIdentities: PipelineExecutionIdentity[] = [],
	activeTopLevelStep: null | PipelineActiveTopLevelStep = null,
	parkedWorkRuns = 0,
): PipelineSessionRecord {
	return {
		activeTopLevelStep,
		completedAt: row.completedAt,
		completedTopLevelSteps,
		durationMs: row.durationMs,
		errorMessage: row.errorMessage,
		executionIdentities:
			executionIdentities.length > 0 ? executionIdentities : sessionLaunchIdentities(row),
		id: row.id,
		parametersJson: row.parametersJson,
		parkedWorkRuns,
		projectName: row.projectName,
		projectPath: row.projectPath,
		recipeId: row.recipeId,
		recipeName: row.recipeName,
		recipeSha256: row.recipeSha256,
		scheduledTaskExecutionId: row.scheduledTaskExecutionId,
		startedAt: row.startedAt,
		status: row.status as PipelineSessionStatus,
		totalSteps: row.totalSteps,
	};
}

export function toStepResultRecord(
	row: PipelineStepResultRow,
	executionIdentity: null | PipelineExecutionIdentity = null,
): PipelineStepResultRecord {
	return {
		// Read straight through, never inferred: a row with no persisted attempt identity reaches
		// the report as null so the client can tell "written before 0003" from "attempt 1".
		attemptKind: (row.attemptKind ?? null) as PipelineStepResultRecord['attemptKind'],
		attemptNumber: row.attemptNumber ?? null,
		completedAt: row.completedAt,
		depth: row.depth,
		displayOrder: row.displayOrder,
		durationMs: row.durationMs,
		errorMessage: row.errorMessage,
		executionIdentity,
		exitCode: row.exitCode,
		id: row.id,
		outputSummary: row.outputSummary,
		parentStepResultId: row.parentStepResultId,
		phase: row.phase as PipelineStepPhase,
		runId: row.runId,
		sequenceNumber: row.sequenceNumber,
		sessionId: row.sessionId,
		startedAt: row.startedAt,
		status: row.status as PipelineStepStatus,
		stepDefinitionId: row.stepDefinitionId,
		stepName: row.stepName,
		stepType: row.stepType as PipelineStepResultRecord['stepType'],
	};
}

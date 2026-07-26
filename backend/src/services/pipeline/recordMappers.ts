import type {
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
	executionIdentities: PipelineExecutionIdentity[] = [],
): PipelineSessionRecord {
	return {
		completedAt: row.completedAt,
		currentStepIndex: row.currentStepIndex,
		durationMs: row.durationMs,
		errorMessage: row.errorMessage,
		executionIdentities:
			executionIdentities.length > 0 ? executionIdentities : sessionLaunchIdentities(row),
		id: row.id,
		parametersJson: row.parametersJson,
		projectName: row.projectName,
		projectPath: row.projectPath,
		recipeId: row.recipeId,
		recipeName: row.recipeName,
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
		stepName: row.stepName,
		stepType: row.stepType as PipelineStepResultRecord['stepType'],
	};
}

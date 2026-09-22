import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type {
	PipelineStepAttemptKind,
	PipelineStepPhase,
	PipelineStepResultRecord,
	PipelineStepStatus,
} from '../../types.ts';
import type { ExecutionContext } from './types.ts';

import { pipelineStepResults } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { createPipelineStepResultId } from './helpers.ts';
import { toStepResultRecord } from './recordMappers.ts';

/**
 * The four writes that mutate a single `pipeline_step_results` row: insert it, mark it running,
 * terminalize it, and link it to a run. Kept together and away from `SessionLifecycle`'s
 * session-level concerns because every one of them is called per attempt rather than per session,
 * and each traces its own data movement.
 */

export interface InsertStepResultInput {
	/**
	 * Supplied only by the two callers that create an actual attempt — stepRunner for ordinary
	 * dispatch, autoFixRunner for the remediation between two of them. Hook rows and skipped-step
	 * rows omit both and persist NULL, which keeps "not an attempt" distinct from "attempt 1".
	 */
	attemptKind?: PipelineStepAttemptKind | undefined;
	attemptNumber?: number | undefined;
	context: ExecutionContext;
	parentStepResultId?: string | undefined;
	phase: PipelineStepPhase;
	sequenceNumber: number;
	/**
	 * Inserts the row already terminal as `skipped`, carrying this summary. One write rather than
	 * insert-then-complete: a restart between the two left a `queued` row that reconciliation reads
	 * as a step in flight, and a managed step with no run id is failed on resume.
	 */
	skippedSummary?: string | undefined;
	stepDefinitionId?: string | undefined;
	stepName: string;
	stepType: string;
}

export interface CompleteStepRowInput {
	completedAt: number;
	errorMessage?: string | undefined;
	exitCode?: number | undefined;
	outputSummary?: string | undefined;
	resultId: string;
	startedAt: number;
	status: PipelineStepStatus;
}

export async function insertStepResult(
	db: WebDatabase,
	input: InsertStepResultInput,
): Promise<PipelineStepResultRecord> {
	const id = createPipelineStepResultId();
	input.context.displayOrder += 1;
	const skippedAt = input.skippedSummary === undefined ? undefined : Date.now();
	await db.insert(pipelineStepResults).values({
		attemptKind: input.attemptKind ?? null,
		attemptNumber: input.attemptNumber ?? null,
		depth: input.context.depth,
		displayOrder: input.context.displayOrder,
		id,
		parentStepResultId: input.parentStepResultId ?? null,
		phase: input.phase,
		sequenceNumber: input.sequenceNumber,
		sessionId: input.context.sessionId,
		...(skippedAt === undefined
			? { status: 'queued' as const }
			: {
					completedAt: skippedAt,
					durationMs: 0,
					outputSummary: input.skippedSummary,
					startedAt: skippedAt,
					status: 'skipped' as const,
				}),
		stepDefinitionId: input.stepDefinitionId ?? null,
		stepName: input.stepName,
		stepType: input.stepType,
	});
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.step.insert',
		status: 'success',
		summary: { resultId: id, sessionId: input.context.sessionId, stepType: input.stepType },
		target: 'pipelineStepResults',
	});
	const row = (
		await db.select().from(pipelineStepResults).where(eq(pipelineStepResults.id, id)).limit(1)
	)[0];
	if (!row) throw new Error(`Pipeline step result was not persisted: ${id}`);
	return toStepResultRecord(row);
}

export async function markStepRowRunning(
	db: WebDatabase,
	resultId: string,
	startedAt: number,
): Promise<void> {
	await db
		.update(pipelineStepResults)
		.set({ startedAt, status: 'running' })
		.where(eq(pipelineStepResults.id, resultId));
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.step.running',
		status: 'success',
		summary: { resultId },
		target: 'pipelineStepResults',
	});
}

export async function completeStepRow(db: WebDatabase, input: CompleteStepRowInput): Promise<void> {
	await db
		.update(pipelineStepResults)
		.set({
			completedAt: input.completedAt,
			durationMs: input.completedAt - input.startedAt,
			errorMessage: input.errorMessage ?? null,
			exitCode: input.exitCode ?? null,
			outputSummary: input.outputSummary ?? null,
			status: input.status,
		})
		.where(eq(pipelineStepResults.id, input.resultId));
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.step.complete',
		status: 'success',
		summary: { resultId: input.resultId, status: input.status },
		target: 'pipelineStepResults',
	});
}

export async function linkStepRowRun(
	db: WebDatabase,
	resultId: string,
	runId: string,
): Promise<void> {
	await db.update(pipelineStepResults).set({ runId }).where(eq(pipelineStepResults.id, resultId));
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.step.run.link',
		status: 'success',
		summary: { resultId, runId },
		target: 'pipelineStepResults',
	});
}

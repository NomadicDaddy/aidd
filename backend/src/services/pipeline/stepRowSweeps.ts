import { and, eq, inArray, notInArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';

import { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';

// Idempotent startup sweep: terminalize queued/running step rows whose session is already
// terminal. These are strandings left by historical duplicate executions (pre-guard) or by a
// crash between step and session terminalization; without the sweep they sit 'running'
// forever in the UI. Coarse 'failed' matches the failSessionInline precedent.
export async function sweepStrandedStepRows(db: WebDatabase): Promise<number> {
	const stranded = await db
		.select({ id: pipelineStepResults.id, sessionId: pipelineStepResults.sessionId })
		.from(pipelineStepResults)
		.innerJoin(pipelineSessions, eq(pipelineStepResults.sessionId, pipelineSessions.id))
		.where(
			and(
				inArray(pipelineStepResults.status, ['queued', 'running']),
				notInArray(pipelineSessions.status, ['queued', 'running']),
			),
		);
	if (stranded.length === 0) return 0;
	await db
		.update(pipelineStepResults)
		.set({
			completedAt: Date.now(),
			errorMessage: 'Stranded in-flight step row; session already terminal (startup sweep).',
			status: 'failed',
		})
		.where(
			inArray(
				pipelineStepResults.id,
				stranded.map((row) => row.id),
			),
		);
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.step.sweep.stranded',
		status: 'success',
		summary: { count: stranded.length },
		target: 'pipelineStepResults',
	});
	return stranded.length;
}

// Terminalize the older of N in-flight rows for one step — the artifact of a past duplicate
// execution. The caller resumes the most recent row; these can never be resolved again.
export async function terminalizeDuplicateInFlightRows(
	db: WebDatabase,
	sessionId: string,
	duplicateIds: string[],
): Promise<void> {
	if (duplicateIds.length === 0) return;
	await db
		.update(pipelineStepResults)
		.set({
			completedAt: Date.now(),
			errorMessage:
				'Duplicate in-flight step row from a concurrent execution; terminalized during resume reconciliation.',
			status: 'failed',
		})
		.where(inArray(pipelineStepResults.id, duplicateIds));
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.step.dedupe.inflight',
		status: 'success',
		summary: { count: duplicateIds.length, sessionId },
		target: 'pipelineStepResults',
	});
}

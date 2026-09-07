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

// Terminalize the rows hanging off an in-flight step that the resume path is about to re-run:
// the auto-fix remediation launched between two attempts, and any hook row still open. They are
// children, so `deriveResumeResolution` never considers them, and `sweepStrandedStepRows` skips
// them because their session is still 'running' — without this they sit 'running' in the report
// forever, beside a step the pipeline has already started over. Only called for a step whose own
// children are not themselves resumable work; a 'recipe-ref' row's children are its nested steps
// and are resolved rather than swept.
export async function terminalizeStrandedDescendants(
	db: WebDatabase,
	parentStepResultId: string,
	stepRows: readonly {
		id: string;
		parentStepResultId: null | string;
		status: string;
	}[],
): Promise<string[]> {
	const stranded: string[] = [];
	const frontier = [parentStepResultId];
	while (frontier.length > 0) {
		const current = frontier.pop()!;
		for (const row of stepRows) {
			if (row.parentStepResultId !== current) continue;
			frontier.push(row.id);
			if (row.status === 'queued' || row.status === 'running') stranded.push(row.id);
		}
	}
	if (stranded.length === 0) return stranded;
	await db
		.update(pipelineStepResults)
		.set({
			completedAt: Date.now(),
			errorMessage:
				'Remediation or hook row did not survive the web restart; terminalized while resuming the step it belongs to.',
			status: 'failed',
		})
		.where(inArray(pipelineStepResults.id, stranded));
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.step.sweep.descendants',
		status: 'success',
		summary: { count: stranded.length, parentStepResultId },
		target: 'pipelineStepResults',
	});
	return stranded;
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

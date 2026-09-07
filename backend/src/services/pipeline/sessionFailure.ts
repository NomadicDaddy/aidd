import { and, eq, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { PipelineSessionRow } from './types.ts';

import { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { countCompletedTopLevelSteps } from './progressService.ts';

export async function failUnresumableSession(
	deps: { db: WebDatabase; telemetryService: TelemetryService },
	session: PipelineSessionRow,
	errorMessage: string,
): Promise<void> {
	const completedAt = Date.now();
	const completedTopLevelSteps = await countCompletedTopLevelSteps(deps.db, session.id);
	await deps.db
		.update(pipelineSessions)
		.set({
			completedAt,
			currentStepIndex: completedTopLevelSteps,
			durationMs: completedAt - session.startedAt,
			errorMessage,
			status: 'failed',
		})
		.where(eq(pipelineSessions.id, session.id));
	await deps.db
		.update(pipelineStepResults)
		.set({
			completedAt,
			errorMessage: 'Pipeline step was active during web startup and cannot be resumed.',
			status: 'failed',
		})
		.where(
			and(
				eq(pipelineStepResults.sessionId, session.id),
				inArray(pipelineStepResults.status, ['queued', 'running']),
			),
		);
	await deps.telemetryService.recordCompletionBySessionId(session.id, {
		completedAt,
		durationMs: completedAt - session.startedAt,
		errorMessage,
		status: 'failed',
	});
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.session.fail.inline',
		status: 'success',
		summary: { sessionId: session.id },
		target: 'pipelineSessions',
	});
}

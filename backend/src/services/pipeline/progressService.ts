import { and, eq, isNull } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { BroadcastService } from './broadcastService.ts';

import { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';

export async function countCompletedTopLevelSteps(
	db: WebDatabase,
	sessionId: string,
): Promise<number> {
	const completedSteps = await db
		.selectDistinct({ sequenceNumber: pipelineStepResults.sequenceNumber })
		.from(pipelineStepResults)
		.where(
			and(
				eq(pipelineStepResults.sessionId, sessionId),
				eq(pipelineStepResults.depth, 0),
				isNull(pipelineStepResults.parentStepResultId),
				eq(pipelineStepResults.phase, 'step'),
				eq(pipelineStepResults.status, 'completed'),
			),
		);
	return completedSteps.length;
}

export class PipelineProgressService {
	private readonly broadcast: BroadcastService;
	private readonly db: WebDatabase;

	constructor(db: WebDatabase, broadcast: BroadcastService) {
		this.db = db;
		this.broadcast = broadcast;
	}

	async publishActive(resultId: string): Promise<void> {
		const step = (
			await this.db
				.select()
				.from(pipelineStepResults)
				.where(eq(pipelineStepResults.id, resultId))
				.limit(1)
		)[0];
		if (
			!step ||
			step.depth !== 0 ||
			step.parentStepResultId !== null ||
			step.phase !== 'step' ||
			(step.status !== 'queued' && step.status !== 'running')
		) {
			return;
		}
		const session = (
			await this.db
				.select({ currentStepIndex: pipelineSessions.currentStepIndex })
				.from(pipelineSessions)
				.where(eq(pipelineSessions.id, step.sessionId))
				.limit(1)
		)[0];
		if (!session) return;
		this.broadcast.sessionProgress(step.sessionId, {
			activeTopLevelStep: {
				sequenceNumber: step.sequenceNumber,
				stepName: step.stepName,
			},
			completedTopLevelSteps: session.currentStepIndex,
		});
	}

	async advance(sessionId: string, completedTopLevelSteps: number): Promise<void> {
		await this.db
			.update(pipelineSessions)
			.set({ currentStepIndex: completedTopLevelSteps })
			.where(eq(pipelineSessions.id, sessionId));
		recordDataMovement({
			category: 'database',
			operation: 'pipeline.session.progress',
			status: 'success',
			summary: { completedTopLevelSteps, sessionId },
			target: 'pipelineSessions',
		});
		this.broadcast.sessionProgress(sessionId, {
			activeTopLevelStep: null,
			completedTopLevelSteps,
		});
	}

	async refreshCompleted(sessionId: string): Promise<void> {
		await this.advance(sessionId, await countCompletedTopLevelSteps(this.db, sessionId));
	}
}

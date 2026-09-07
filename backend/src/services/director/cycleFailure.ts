import { and, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

import { directorCycles } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { broadcastCycle } from './cyclePersistence.ts';

export async function failCycle(
	db: WebDatabase,
	hub: WebSocketHub,
	cycleId: string,
	error: unknown,
): Promise<void> {
	const completedAt = Date.now();
	const failureReason = error instanceof Error ? error.message : String(error);
	const updated = await db
		.update(directorCycles)
		.set({ completedAt, failureReason, status: 'failed', totalSuggestions: 0 })
		.where(and(eq(directorCycles.id, cycleId), eq(directorCycles.status, 'running')))
		.returning({ id: directorCycles.id });
	if (updated.length === 0) return;
	webLogger.error({ cycleId, error }, 'Director cycle failed');
	broadcastCycle(hub, cycleId, 'failed', 'failed');
}

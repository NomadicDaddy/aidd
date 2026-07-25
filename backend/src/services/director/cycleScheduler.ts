import type { DirectAiMeta, DirectorCycleStage } from 'aidd-shared';

import { desc, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DirectorConfigProvider } from './types.ts';

import { directorCycles } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';

export interface ActiveCycleState {
	directAiMeta: DirectAiMeta | null;
	stage: DirectorCycleStage;
}

// Context the auto-cycle scheduler needs from the owning DirectorCycleService. Kept
// structural so the gate logic lives outside the class without coupling to it.
export interface ScheduledCycleContext {
	activeStages: Map<string, ActiveCycleState>;
	db: WebDatabase;
	disposed: boolean;
	getConfig: DirectorConfigProvider;
	startCycle(input: Record<string, never>): Promise<{ cycleId: string }>;
}

// Epoch-ms of the most recent cycle's start, or null when none have ever run. Uses
// startedAt (not completedAt) so an in-flight cycle counts as recent activity.
export async function lastCycleAt(db: WebDatabase): Promise<null | number> {
	const rows = await db
		.select({ startedAt: directorCycles.startedAt })
		.from(directorCycles)
		.orderBy(desc(directorCycles.startedAt))
		.limit(1);
	return rows[0]?.startedAt ?? null;
}

// Start an automatic cycle when the auto-cycle setting is enabled and the most recent
// cycle is older than the configured interval. Skips while a cycle is in flight
// (in-process stage or a 'running' row from a detached/resumed cycle) so auto-runs
// never stack.
export async function checkAndRunScheduledCycle(ctx: ScheduledCycleContext): Promise<void> {
	if (ctx.disposed) return;
	const schedule = ctx.getConfig().director?.schedule;
	if (!schedule?.enabled) return;
	if (ctx.activeStages.size > 0) return;
	const running = await ctx.db
		.select({ id: directorCycles.id })
		.from(directorCycles)
		.where(eq(directorCycles.status, 'running'))
		.limit(1);
	if (running.length > 0) return;
	const lastAt = await lastCycleAt(ctx.db);
	const intervalMs = Math.max(1, schedule.intervalHours) * 3_600_000;
	if (lastAt !== null && Date.now() - lastAt < intervalMs) return;
	webLogger.info(
		{ intervalHours: schedule.intervalHours, lastCycleAt: lastAt },
		'Starting scheduled director cycle',
	);
	await ctx.startCycle({});
}

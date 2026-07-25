import type { DirectAiMeta, DirectorCycleStage } from 'aidd-shared';

import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { WebRunStatus } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { DirectorConfigProvider, FleetSummary } from './types.ts';

import { directorCycles } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { advanceCycle, type CycleExecutorDeps } from './cycleExecutor.ts';
import { failCycle, findCycleRun, readFleetSummary, toCycleRecord } from './cyclePersistence.ts';
import { type ActiveCycleState } from './cycleScheduler.ts';

// Context the stale-cycle reconciliation needs from the owning DirectorCycleService.
// Kept structural so the recovery logic lives outside the class without coupling to it.
export interface ReconcileStaleCyclesContext {
	activeStages: Map<string, ActiveCycleState>;
	awaitAndPersistCycle(
		cycleId: string,
		runId: string,
		outputPath: string,
		fleetSummary: FleetSummary,
	): Promise<unknown>;
	db: WebDatabase;
	executorDeps(): CycleExecutorDeps;
	getConfig: DirectorConfigProvider;
	hub: WebSocketHub;
	setCycleStage(
		cycleId: string,
		stage: DirectorCycleStage,
		directAiMeta?: DirectAiMeta | null,
	): void;
}

export async function reconcileStaleCycles(ctx: ReconcileStaleCyclesContext): Promise<void> {
	const staleCycles = await ctx.db
		.select()
		.from(directorCycles)
		.where(eq(directorCycles.status, 'running'));
	let resumed = 0;
	let advanced = 0;
	let orphaned = 0;
	for (const cycle of staleCycles) {
		const run = await findCycleRun(ctx.db, cycle.id);
		if (!run) {
			await failCycle(
				ctx.db,
				ctx.hub,
				cycle.id,
				new Error('Director cycle has no associated run at web startup'),
			);
			orphaned++;
			continue;
		}
		const artifacts = toCycleRecord(cycle, ctx.getConfig, ctx.activeStages).artifacts;
		const fleetSummary = await readFleetSummary(artifacts.fleetSummaryPath);
		if (!fleetSummary) {
			await failCycle(
				ctx.db,
				ctx.hub,
				cycle.id,
				new Error('Director cycle fleet-summary artifact missing at web startup'),
			);
			orphaned++;
			continue;
		}
		if (run.status === 'running') {
			ctx.setCycleStage(cycle.id, 'running_backend');
			void ctx
				.awaitAndPersistCycle(cycle.id, run.id, artifacts.outputPath, fleetSummary)
				.catch((error: unknown) => {
					webLogger.error({ cycleId: cycle.id, error }, 'Resumed cycle await failed');
				});
			resumed++;
		} else {
			await advanceCycle(
				ctx.executorDeps(),
				cycle.id,
				run.status as WebRunStatus,
				artifacts.outputPath,
				fleetSummary,
				run.id,
			);
			advanced++;
		}
	}
	if (resumed > 0) {
		webLogger.info({ count: resumed }, 'Resumed in-flight director cycle(s) after web restart');
	}
	if (advanced > 0) {
		webLogger.info(
			{ count: advanced },
			'Advanced terminal director cycle(s) discovered at web startup',
		);
	}
	if (orphaned > 0) {
		webLogger.warn(
			{ count: orphaned },
			'Failed orphaned director cycle(s) at web startup (no associated run or missing artifacts)',
		);
	}
}

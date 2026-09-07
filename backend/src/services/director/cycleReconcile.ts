import type { DirectAiMeta, DirectorCycleStage } from 'aidd-shared';

import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { WebRunStatus } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { ActiveCycleState, DirectorConfigProvider, FleetSummary } from './types.ts';

import { directorCycles } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { resumableAutoLaunchCycleIds } from './autoLaunchDecision.ts';
import { advanceCycle, type CycleExecutorDeps } from './cycleExecutor.ts';
import { failCycle } from './cycleFailure.ts';
import { findCycleRun, readFleetSummary, toCycleRecord } from './cyclePersistence.ts';

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
		try {
			const outcome = await reconcileOneCycle(ctx, cycle);
			if (outcome === 'resumed') resumed++;
			else if (outcome === 'advanced') advanced++;
			else orphaned++;
		} catch (err) {
			await failReconciledCycle(ctx, cycle.id, err);
			orphaned++;
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
			'Failed unrecoverable director cycle(s) at web startup',
		);
	}
	await resumeAutoLaunchDecisions(ctx);
}

async function failReconciledCycle(
	ctx: ReconcileStaleCyclesContext,
	cycleId: string,
	error: unknown,
): Promise<void> {
	ctx.activeStages.delete(cycleId);
	try {
		await failCycle(ctx.db, ctx.hub, cycleId, error);
	} catch (err) {
		webLogger.error(
			{ cycleId, error: err },
			'Director cycle recovery failure could not be persisted',
		);
	}
}

async function reconcileOneCycle(
	ctx: ReconcileStaleCyclesContext,
	cycle: typeof directorCycles.$inferSelect,
): Promise<'advanced' | 'failed' | 'resumed'> {
	const run = await findCycleRun(ctx.db, cycle.id);
	if (!run) {
		await failReconciledCycle(
			ctx,
			cycle.id,
			new Error('Director cycle has no associated run at web startup'),
		);
		return 'failed';
	}
	const artifacts = toCycleRecord(cycle, ctx.getConfig, ctx.activeStages).artifacts;
	const fleetSummary = await readFleetSummary(artifacts.fleetSummaryPath);
	if (!fleetSummary) {
		await failReconciledCycle(
			ctx,
			cycle.id,
			new Error('Director cycle fleet-summary artifact missing at web startup'),
		);
		return 'failed';
	}
	if (run.status === 'running') {
		ctx.setCycleStage(cycle.id, 'running_backend');
		void ctx
			.awaitAndPersistCycle(cycle.id, run.id, artifacts.outputPath, fleetSummary)
			.catch(async (error: unknown) => {
				await failReconciledCycle(ctx, cycle.id, error);
			});
		return 'resumed';
	}
	await advanceCycle(
		ctx.executorDeps(),
		cycle.id,
		run.status as WebRunStatus,
		artifacts.outputPath,
		fleetSummary,
		run.id,
	);
	return 'advanced';
}

/**
 * Dispatches the completed automatic cycles whose auto-launch decision the last process left open.
 *
 * A cycle that finished is not finished with. Persisting its results and considering its
 * suggestions were two steps, and a restart between them stranded the second: the suggestions
 * existed, the cycle read as completed, and nothing was ever going to look at them again. Now the
 * obligation is a column written in the cycle's own transaction, so this pass is simply the list of
 * cycles still owed one.
 *
 * It re-enters `runCycleAutoLaunch`, which claims each decision before acting. That is what keeps
 * this safe to run concurrently with the ordinary post-persistence hook and with itself: whichever
 * one claims first dispatches, and the others find nothing to claim. Cycles already finalized,
 * completed while auto-launch was off, failed, or started by a person are not listed at all.
 *
 * @param ctx The reconciliation context, whose executor deps carry the dispatch.
 */
async function resumeAutoLaunchDecisions(ctx: ReconcileStaleCyclesContext): Promise<void> {
	const cycleIds = await resumableAutoLaunchCycleIds(ctx.db, Date.now());
	if (cycleIds.length === 0) return;
	const dispatch = ctx.executorDeps().autoLaunchSuggestions;
	for (const cycleId of cycleIds) {
		// Sequential, and each failure is contained: one cycle whose dispatch throws must not
		// prevent the rest from being considered. `runCycleAutoLaunch` already swallows its own
		// failures, so reaching the catch means the call itself could not be made.
		try {
			await dispatch(cycleId);
		} catch (err) {
			webLogger.error({ cycleId, err }, 'Resuming director auto-launch failed');
		}
	}
	webLogger.info(
		{ count: cycleIds.length },
		'Resumed director auto-launch decision(s) left open at web restart',
	);
}

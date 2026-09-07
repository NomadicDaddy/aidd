import type { CliActiveRunRecord } from 'aidd-shared/metadata/active-runs';

import { and, eq } from 'drizzle-orm';

import type { HeartbeatWatcherContext } from './heartbeatWatcherTypes.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';

export async function stopTail(ctx: HeartbeatWatcherContext, runId: string): Promise<void> {
	const tail = ctx.tailWatchers.get(runId);
	if (!tail) return;
	ctx.tailWatchers.delete(runId);
	await tail.stop();
}

// Mirror heartbeat freshness, current phase, pid, resolved mode, and provenance onto the run row.
// The running-row guard prevents a late heartbeat from resurrecting liveness on a terminal run.
//
// Update-only is correct by construction, not by luck: launchRun reserves the run row before it
// spawns anything (see launch.ts), so a web-launched child cannot be heartbeating without a row to
// update. A record with no row is a CLI-started run, which the watcher adopts through its own
// insert path rather than here.
export async function persistRunLiveness(
	ctx: HeartbeatWatcherContext,
	record: CliActiveRunRecord,
): Promise<void> {
	const set: Partial<typeof runs.$inferInsert> = {
		activityState: record.state,
		// A heartbeat without provenance must not erase launch-time provenance; new non-null values win.
		...(record.aiddDirty === null ? {} : { aiddDirty: record.aiddDirty }),
		...(record.aiddRevision === null ? {} : { aiddRevision: record.aiddRevision }),
		...(record.aiddVersion === null ? {} : { aiddVersion: record.aiddVersion }),
		...(record.driverId === null ? {} : { driverId: record.driverId }),
		...(record.driverKind === null ? {} : { driverKind: record.driverKind }),
		...(record.driverSha256 === null ? {} : { driverSha256: record.driverSha256 }),
		heartbeatAt: record.heartbeatAt,
		mode: record.mode,
	};
	if (record.pid !== null) set.pid = record.pid;
	try {
		await withSqliteRetry(
			() =>
				ctx.db
					.update(runs)
					.set(set)
					.where(and(eq(runs.id, record.id), eq(runs.status, 'running'))),
			{ label: 'heartbeat.persistLiveness' },
		);
	} catch (err) {
		webLogger.warn({ err, runId: record.id }, 'Failed to persist run liveness');
	}
}

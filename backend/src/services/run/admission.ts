import type { AiddRunDriver } from 'aidd-shared/run-provenance';

import {
	asRunInitiator,
	type CliActiveRunSource,
	type RunInitiator,
} from 'aidd-shared/metadata/active-runs';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { LaunchContext } from './launch.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { webLogger } from '../../logger.ts';
import { HeartbeatWatcher } from './heartbeatWatcher.ts';
import { failLaunch, recordSpawnedPid, releaseRunSlot } from './launchReservation.ts';
import { getRun } from './queries.ts';
import { spawnDetachedRun } from './spawnDetachedRun.ts';
import { RunTailWatcher } from './tailWatcher.ts';
import { RECONCILED_EXIT_CODE, TELEMETRY_RUN_SOURCES } from './types.ts';

function parseCommandArgs(commandArgsJson: null | string): string[] {
	if (!commandArgsJson) throw new Error('Queued run has no command args to spawn');
	const parsed: unknown = JSON.parse(commandArgsJson);
	if (!Array.isArray(parsed) || parsed.some((token) => typeof token !== 'string')) {
		throw new Error('Queued run command args are not a string array');
	}
	return parsed;
}

function driverFromRow(row: {
	driverId: null | string;
	driverKind: null | string;
	driverSha256: null | string;
}): AiddRunDriver | undefined {
	if (!row.driverId || !row.driverKind || !row.driverSha256) return undefined;
	return {
		driverId: row.driverId,
		driverKind: row.driverKind as AiddRunDriver['driverKind'],
		driverSha256: row.driverSha256,
	};
}

async function ensureHeartbeatWatcher(ctx: LaunchContext, projectPath: string): Promise<void> {
	if (ctx.heartbeatWatchers.has(projectPath)) return;
	const watcher = await HeartbeatWatcher.start(projectPath, {
		commands: ctx.commands,
		db: ctx.db,
		hub: ctx.hub,
		onRunTerminal: () => {
			if (ctx.isDisposed()) return;
			void admitQueuedRuns(ctx).catch((error: unknown) => {
				webLogger.error({ error }, 'Queued-run admission after a terminal run failed');
			});
		},
		tailWatchers: ctx.tailWatchers,
		telemetry: ctx.telemetry,
		...(ctx.onProjectChanged ? { onProjectChanged: ctx.onProjectChanged } : {}),
		...(ctx.onRunContinuation ? { onRunContinuation: ctx.onRunContinuation } : {}),
	});
	ctx.heartbeatWatchers.set(projectPath, watcher);
}

// A background-admitted run the operator already saw as queued must stay visible when its spawn
// fails, so it is driven failed with the reason instead of being deleted like a direct launch.
async function failAdmittedRun(
	ctx: LaunchContext,
	row: { id: string; source: string },
	err: unknown,
): Promise<void> {
	const message = err instanceof Error ? err.message : String(err);
	webLogger.error({ err, runId: row.id }, 'Failed to spawn an admitted queued run');
	await withSqliteRetry(
		() =>
			ctx.commands.reconcileDeadRun({
				completedAt: Date.now(),
				errorMessage: `Queued run could not be started: ${message}`,
				exitCode: RECONCILED_EXIT_CODE,
				runId: row.id,
				stopReason: 'process_exit',
			}),
		{ label: 'run.admit.spawnFailed' },
	);
	if (TELEMETRY_RUN_SOURCES.has(row.source as CliActiveRunSource)) {
		await ctx.telemetry.reconcileInvocationFromRun(row.id).catch((error: unknown) => {
			webLogger.warn(
				{ err: error, runId: row.id },
				'Failed to sync run invocation telemetry',
			);
		});
	}
	ctx.hub.broadcast({
		payload: { error: message, status: 'failed' },
		runId: row.id,
		type: 'run_status',
	});
}

async function spawnPromotedRun(
	ctx: LaunchContext,
	runId: string,
	launchedRunId: string,
): Promise<void> {
	const row = await getRun(ctx.db, runId);
	if (!row) throw new Error(`Promoted run was not persisted: ${runId}`);
	const entrypoint = join(ctx.rootDir, 'cli', 'src', 'index.ts');
	const logPath = row.logPath ?? join(ctx.config.web.dataDir, 'run-logs', `${runId}.log`);
	const driver = driverFromRow(row);
	const initiator: RunInitiator = asRunInitiator(row.initiator) ?? 'operator';
	const source = row.source as CliActiveRunSource;
	let recordPid: null | number;
	try {
		({ recordPid } = await spawnDetachedRun({
			command: {
				args: parseCommandArgs(row.commandArgsJson),
				launcherPrefix: ['bun', entrypoint],
			},
			dataDir: ctx.config.web.dataDir,
			...(driver ? { driver } : {}),
			hostname: ctx.config.web.hostname,
			initiator,
			logPath,
			port: ctx.config.web.port,
			projectDir: row.projectPath,
			rootDir: ctx.rootDir,
			runId,
			source,
		}));
	} catch (err: unknown) {
		if (runId === launchedRunId) {
			// Nothing started for the caller's own launch: release the row and report the error,
			// exactly as a direct launch that failed to spawn always has.
			await releaseRunSlot(ctx.commands, runId);
			await rm(logPath, { force: true }).catch(() => undefined);
			return failLaunch(ctx.hub, runId, err);
		}
		await failAdmittedRun(ctx, row, err);
		return;
	}
	if (recordPid !== null) await recordSpawnedPid(ctx.commands, runId, recordPid);
	await ensureHeartbeatWatcher(ctx, row.projectPath);
	if (!ctx.tailWatchers.has(runId)) {
		const tail = await RunTailWatcher.start(runId, logPath, ctx.hub);
		ctx.tailWatchers.set(runId, tail);
	}
	ctx.hub.broadcast({ payload: { status: 'running' }, runId, type: 'run_status' });
}

export async function admitQueuedRuns(ctx: LaunchContext, launchedRunId = ''): Promise<void> {
	if (ctx.isDisposed()) return;
	try {
		for (;;) {
			if (ctx.isDisposed()) return;
			const promoted = await withSqliteRetry(
				() =>
					ctx.commands.promoteOldestQueuedRun({
						dataDir: ctx.config.web.dataDir,
						maxConcurrentRuns: ctx.config.web.maxConcurrentRuns,
						maxConcurrentRunsPerProject: ctx.config.web.maxConcurrentRunsPerProject,
						useWorktrees: ctx.config.web.useWorktrees,
					}),
				{ label: 'run.admit.promote' },
			);
			if (promoted.kind !== 'promoted') return;
			await spawnPromotedRun(ctx, promoted.row.id, launchedRunId);
		}
	} catch (err) {
		if (ctx.isDisposed()) return;
		throw err;
	}
}

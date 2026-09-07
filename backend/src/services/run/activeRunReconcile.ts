import { isProcessAlive } from 'aidd-shared/lib/processTree';
import { activeRunFilePath, CLI_ACTIVE_RUN_STALE_MS } from 'aidd-shared/metadata/active-runs';
import { reapRunFeatureLeases } from 'aidd-shared/metadata/feature-leases';
import { eq, inArray } from 'drizzle-orm';
import { rm } from 'node:fs/promises';

import type { QueriesContext } from './queryContracts.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import {
	readHeartbeatRecord,
	type ResumeRunInfo,
	terminalStatusFromHeartbeat,
} from './activeRunHeartbeatFile.ts';
import { NON_TERMINAL_RUN_STATUSES, RECONCILED_EXIT_CODE } from './types.ts';
import { reapRunWorktree } from './worktreeReap.ts';

function commandArgsJson(commandArgs: null | string[] | undefined): null | string {
	return commandArgs && commandArgs.length > 0 ? JSON.stringify(commandArgs) : null;
}

// A run reconciled dead never released its cross-run feature leases in-process (a hard death
// skips finalization); deleting them here — alongside the worktree reap — is the release of
// record. Keyed by the dead run's id, so it covers live-tree runs and never touches a live run.
async function reapDeadRunLeases(projectPath: string, runId: string): Promise<void> {
	const reaped = await reapRunFeatureLeases(projectPath, runId);
	if (reaped > 0) {
		webLogger.warn({ count: reaped, runId }, 'Reaped feature leases held by dead run');
	}
}

// Invoked once at web startup before serving. Reads each non-terminal `runs` row's on-disk
// heartbeat: fresh + non-terminal records resume (watchers re-register and the WebSocket stream
// picks up where it left off), terminal records inline-terminalize the DB row, and missing/stale
// records force-fail with the reconciliation sentinel exit code.
export async function reconcileStaleRuns(ctx: QueriesContext): Promise<ResumeRunInfo[]> {
	const now = Date.now();
	const staleRuns = await ctx.db
		.select()
		.from(runs)
		.where(inArray(runs.status, [...NON_TERMINAL_RUN_STATUSES]));
	const resumable: ResumeRunInfo[] = [];
	let failedCount = 0;
	let resumedCount = 0;
	let terminalizedCount = 0;
	for (const run of staleRuns) {
		const heartbeat = await readHeartbeatRecord(run.projectPath, run.id);
		const isAuditMode = run.mode === 'audit';
		if (!heartbeat) {
			await withSqliteRetry(
				() =>
					ctx.db
						.update(runs)
						.set({
							completedAt: now,
							durationMs: run.startedAt ? now - run.startedAt : null,
							errorMessage:
								'Run was active during web startup and cannot be resumed; reconciled to failed.',
							exitCode: RECONCILED_EXIT_CODE,
							status: 'failed',
							stopReason: 'heartbeat_missing',
						})
						.where(eq(runs.id, run.id)),
				{ label: 'run.reconcileStale.missingHeartbeat' },
			);
			if (isAuditMode) ctx.onProjectChanged?.(run.projectPath);
			ctx.hub.broadcast({
				payload: {
					error: 'Run was active during web startup and cannot be resumed.',
					exitCode: RECONCILED_EXIT_CODE,
					status: 'failed',
					stopReason: 'heartbeat_missing',
				},
				runId: run.id,
				type: 'run_status',
			});
			// Run died with the web offline and never cleaned up its worktree — reap it.
			if (run.worktreePath) {
				await reapRunWorktree(run.projectPath, run.worktreePath, run.worktreeBranch);
			}
			await reapDeadRunLeases(run.projectPath, run.id);
			failedCount++;
			continue;
		}
		const isTerminalHeartbeat = [
			'blocked',
			'completed',
			'failed',
			'stopped',
			'waiting_approval',
		].includes(heartbeat.state);
		if (isTerminalHeartbeat) {
			const finalStatus = terminalStatusFromHeartbeat(heartbeat);
			const completedAt = heartbeat.completedAt ?? now;
			await withSqliteRetry(
				() =>
					ctx.db
						.update(runs)
						.set({
							aiSummary: heartbeat.aiSummary,
							commandArgsJson:
								run.commandArgsJson ?? commandArgsJson(heartbeat.commandArgs),
							completedAt,
							durationMs: heartbeat.durationMs ?? completedAt - run.startedAt,
							exitCode: heartbeat.exitCode,
							mode: heartbeat.mode,
							status: finalStatus,
							stopReason: heartbeat.stopReason,
							summary: heartbeat.summary,
						})
						.where(eq(runs.id, run.id)),
				{ label: 'run.reconcileStale.terminalHeartbeat' },
			);
			if (isAuditMode) ctx.onProjectChanged?.(run.projectPath);
			ctx.hub.broadcast({
				payload: {
					exitCode: heartbeat.exitCode,
					status: finalStatus,
					stopReason: heartbeat.stopReason,
				},
				runId: run.id,
				type: 'run_status',
			});
			await rm(activeRunFilePath(run.projectPath, run.id), { force: true }).catch(() => {});
			terminalizedCount++;
			continue;
		}
		if (now - heartbeat.heartbeatAt > CLI_ACTIVE_RUN_STALE_MS) {
			// CRITICAL: wall-clock staleness is only fatal when there is no pid to corroborate
			// or the pid is provably dead. When a pid is present and alive, a stale heartbeat
			// at web startup does NOT fail the run — a laptop sleep, NTP step, or container
			// suspend can advance Date.now() past the staleness window while the process is
			// still alive. Sweeping it to 'failed' would be a false positive that kills a
			// healthy run. The HeartbeatWatcher will re-evaluate and resume once the web is up.
			if (heartbeat.pid !== null && isProcessAlive(heartbeat.pid)) {
				resumable.push({ projectPath: run.projectPath, runId: run.id });
				resumedCount++;
				continue;
			}
			await withSqliteRetry(
				() =>
					ctx.db
						.update(runs)
						.set({
							completedAt: now,
							durationMs: run.startedAt ? now - run.startedAt : null,
							errorMessage: 'Heartbeat stale at web startup; process presumed dead.',
							exitCode: RECONCILED_EXIT_CODE,
							status: 'failed',
							stopReason: 'heartbeat_stale',
						})
						.where(eq(runs.id, run.id)),
				{ label: 'run.reconcileStale.staleHeartbeat' },
			);
			if (isAuditMode) ctx.onProjectChanged?.(run.projectPath);
			ctx.hub.broadcast({
				payload: {
					error: 'Heartbeat stale at web startup; process presumed dead.',
					exitCode: RECONCILED_EXIT_CODE,
					status: 'failed',
					stopReason: 'heartbeat_stale',
				},
				runId: run.id,
				type: 'run_status',
			});
			await rm(activeRunFilePath(run.projectPath, run.id), { force: true }).catch(() => {});
			// Stale + dead process: reap the worktree it left behind.
			if (run.worktreePath) {
				await reapRunWorktree(run.projectPath, run.worktreePath, run.worktreeBranch);
			}
			await reapDeadRunLeases(run.projectPath, run.id);
			failedCount++;
			continue;
		}
		resumable.push({ projectPath: run.projectPath, runId: run.id });
		resumedCount++;
	}
	if (failedCount > 0) {
		webLogger.warn(
			{ count: failedCount },
			'Reconciled orphaned runs with missing or stale heartbeats to failed',
		);
	}
	if (terminalizedCount > 0) {
		webLogger.info(
			{ count: terminalizedCount },
			'Terminalized runs that completed while web was offline',
		);
	}
	if (resumedCount > 0) {
		webLogger.info({ count: resumedCount }, 'Resumed in-flight run(s) after web restart');
	}
	return resumable;
}

import {
	activeRunFilePath,
	type CliActiveRunRecord,
	type CliActiveRunSource,
} from 'aidd-shared/metadata/active-runs';
import { and, eq } from 'drizzle-orm';
import { rm } from 'node:fs/promises';

import type { HeartbeatWriteOutcome } from '../../db/commands.ts';
import type { WebRunStatus } from '../../types.ts';
import type { HeartbeatWatcherContext, WebRunRow } from './heartbeatWatcherTypes.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { terminalStatusFromHeartbeat } from './activeRunHeartbeatFile.ts';
import { asContinuationReason, resolveHeartbeatContinuationValue } from './continuation.ts';
import { RECONCILED_EXIT_CODE, TELEMETRY_RUN_SOURCES } from './types.ts';

export async function stopTail(ctx: HeartbeatWatcherContext, runId: string): Promise<void> {
	const tail = ctx.tailWatchers.get(runId);
	if (!tail) return;
	ctx.tailWatchers.delete(runId);
	await tail.stop();
}

// Mirror the CLI heartbeat's freshness (heartbeatAt), current phase (state), pid, and resolved
// mode onto the run row so the control panel can render a live/idle/stalled signal and current
// activity without reading the on-disk active-run file. Guarded to `running` rows so a heartbeat
// that arrives just after a terminal transition cannot resurrect liveness on a finished run. The
// caller (HeartbeatWatcher) throttles invocation, so the write rate stays well below the CLI's
// heartbeat cadence.
//
// Mode is mirrored because launch.ts records `input.mode ?? 'coding'` before the CLI resolves the
// plan, so a directive run launched from the web (no explicit mode) lands in the DB as 'coding'
// while the CLI writes the true mode to the heartbeat and runs.jsonl. Without this sync the
// DB-sourced Recent Runs table mislabels the run while the ledger-sourced detail view is correct.
export async function persistRunLiveness(
	ctx: HeartbeatWatcherContext,
	record: CliActiveRunRecord,
): Promise<void> {
	const set: Partial<typeof runs.$inferInsert> = {
		activityState: record.state,
		// Do not let a legacy heartbeat erase the launch-time provenance seed. New CLIs supply
		// non-null values here and remain authoritative for every value they captured.
		...(record.aiddDirty === null ? {} : { aiddDirty: record.aiddDirty }),
		...(record.aiddRevision === null ? {} : { aiddRevision: record.aiddRevision }),
		...(record.aiddVersion === null ? {} : { aiddVersion: record.aiddVersion }),
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

// Sync the linked invocation_events row to the now-terminal `runs` row. The terminal write to
// `runs` has already committed by every caller, so this copies the authoritative facts (status,
// exit code, stop reason via the run row) onto telemetry — keeping the two ledgers in agreement
// without recomputing the outcome here.
async function syncInvocationFromRun(
	ctx: HeartbeatWatcherContext,
	existing: WebRunRow,
): Promise<void> {
	const source = existing.source as CliActiveRunSource;
	if (!TELEMETRY_RUN_SOURCES.has(source)) return;
	await ctx.telemetry.reconcileInvocationFromRun(existing.id).catch((error: unknown) => {
		webLogger.warn(
			{ err: error, runId: existing.id },
			'Failed to sync run invocation telemetry',
		);
	});
}

function broadcastInsertedRun(
	ctx: HeartbeatWatcherContext,
	record: CliActiveRunRecord,
	status: WebRunStatus,
	errorMessage: null | string,
): void {
	ctx.hub.broadcast({
		payload: {
			error: errorMessage ?? undefined,
			exitCode: record.exitCode,
			status,
			stopReason: record.stopReason,
			summary: record.summary,
		},
		runId: record.id,
		type: 'run_status',
	});
	if (record.mode === 'audit') {
		ctx.onProjectChanged?.(record.projectPath);
	}
}

export async function terminalize(
	ctx: HeartbeatWatcherContext,
	record: CliActiveRunRecord,
): Promise<void> {
	const completedAt = record.completedAt ?? Date.now();
	const durationMs = record.durationMs ?? completedAt - record.startedAt;
	const finalStatus: WebRunStatus = terminalStatusFromHeartbeat(record);
	const continuationValue = await resolveHeartbeatContinuationValue(record, finalStatus);

	// Atomic read-modify-write inside the DB worker's terminalizeRun command: the
	// existence/terminal check and the resulting insert-or-update commit as one IMMEDIATE
	// transaction, so they can no longer race a concurrent writer between read and write.
	// withSqliteRetry absorbs transient lock contention; a persistent failure leaves the
	// heartbeat file in place (we return before cleanup) so a later sweep retries — never
	// stranding the row in 'running' while deleting its retry signal.
	let outcome: HeartbeatWriteOutcome;
	try {
		outcome = await withSqliteRetry(
			() =>
				ctx.commands.terminalizeRun({
					completedAt,
					continuationValue,
					durationMs,
					finalStatus,
					record,
				}),
			{ label: 'heartbeat.terminalize' },
		);
	} catch (err) {
		webLogger.warn({ err, runId: record.id }, 'Failed to terminalize run');
		return;
	}

	// Drain and flush the log tail BEFORE announcing terminal status. stopTail emits any buffered
	// bytes as a final run_output frame; broadcasting it ahead of run_status means the client gets
	// the complete transcript first and never receives a late output chunk after the run ended —
	// which would otherwise flip the live console back into the "streaming" state post-termination.
	await stopTail(ctx, record.id);
	if (outcome.kind === 'inserted') {
		broadcastInsertedRun(ctx, record, finalStatus, null);
	} else if (outcome.kind === 'updated') {
		recordDataMovement({
			category: 'database',
			operation: 'run.terminalize',
			status: 'success',
			summary: { runId: record.id, status: finalStatus },
			target: 'runs',
		});
		ctx.hub.broadcast({
			payload: {
				exitCode: record.exitCode,
				status: finalStatus,
				stopReason: record.stopReason,
				summary: record.summary,
			},
			runId: record.id,
			type: 'run_status',
		});
		await syncInvocationFromRun(ctx, outcome.existing);
		if (outcome.existing.mode === 'audit') {
			ctx.onProjectChanged?.(outcome.existing.projectPath);
		}
	}
	// Continuation hook fires only for rows this transition actually terminalized (never the
	// already-terminal branch, so a duplicate heartbeat scan cannot double-chain). The command
	// forces 'none' for pipeline-owned rows, so re-deriving the reason from the persisted value
	// would race; the receiver re-reads the row and re-checks the pipeline gate itself.
	if (outcome.kind !== 'already-terminal') {
		const reason = asContinuationReason(continuationValue);
		if (
			reason !== null &&
			(outcome.kind === 'inserted' || outcome.existing.pipelineSessionId === null)
		) {
			ctx.onRunContinuation?.(record.id, reason);
		}
	}
	await rm(activeRunFilePath(record.projectPath, record.id), { force: true }).catch(() => {});
}

export async function markStale(
	ctx: HeartbeatWatcherContext,
	record: CliActiveRunRecord,
): Promise<void> {
	const completedAt = Date.now();
	const errorMessage = 'Heartbeat stale; run process appears to be dead.';

	let outcome: HeartbeatWriteOutcome;
	try {
		outcome = await withSqliteRetry(
			() => ctx.commands.markRunStale({ completedAt, errorMessage, record }),
			{ label: 'heartbeat.markStale' },
		);
	} catch (err) {
		webLogger.warn({ err, runId: record.id }, 'Failed to mark run stale');
		return;
	}

	if (outcome.kind === 'inserted') {
		broadcastInsertedRun(ctx, record, 'failed', errorMessage);
		await stopTail(ctx, record.id);
		await rm(activeRunFilePath(record.projectPath, record.id), { force: true }).catch(() => {});
		return;
	}
	if (outcome.kind === 'already-terminal') {
		await stopTail(ctx, record.id);
		// The row is terminal but its heartbeat file lingered; remove it so the watcher does
		// not keep re-reading a dead run every sweep.
		await rm(activeRunFilePath(record.projectPath, record.id), { force: true }).catch(() => {});
		return;
	}
	ctx.hub.broadcast({
		payload: { error: errorMessage, exitCode: -1, status: 'failed' },
		runId: record.id,
		type: 'run_status',
	});
	await syncInvocationFromRun(ctx, outcome.existing);
	if (outcome.existing.mode === 'audit') {
		ctx.onProjectChanged?.(outcome.existing.projectPath);
	}
	await stopTail(ctx, record.id);
	// Stale detection drove the row to terminal 'failed'; remove its authoritative-dead on-disk
	// heartbeat so later sweeps do not keep rescanning it.
	await rm(activeRunFilePath(record.projectPath, record.id), { force: true }).catch(() => {});
}

export async function reconcileRemovedRow(
	ctx: HeartbeatWatcherContext,
	runId: string,
): Promise<void> {
	const completedAt = Date.now();
	const errorMessage = 'Heartbeat file removed while run still active; reconciled to failed.';
	let outcome: HeartbeatWriteOutcome;
	try {
		outcome = await withSqliteRetry(
			() =>
				ctx.commands.reconcileDeadRun({
					completedAt,
					errorMessage,
					exitCode: RECONCILED_EXIT_CODE,
					runId,
					stopReason: 'heartbeat_removed',
				}),
			{ label: 'heartbeat.handleRemoved' },
		);
	} catch (err) {
		webLogger.warn({ err, runId }, 'Failed to reconcile removed-heartbeat run');
		return;
	}
	if (outcome.kind !== 'updated') return;
	ctx.hub.broadcast({
		payload: {
			error: errorMessage,
			exitCode: RECONCILED_EXIT_CODE,
			status: 'failed',
			stopReason: 'heartbeat_removed',
		},
		runId,
		type: 'run_status',
	});
	await syncInvocationFromRun(ctx, outcome.existing);
	if (outcome.existing.mode === 'audit') {
		ctx.onProjectChanged?.(outcome.existing.projectPath);
	}
}

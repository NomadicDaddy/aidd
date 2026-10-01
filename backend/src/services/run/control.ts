import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { CliActiveRunSource } from 'aidd-shared/metadata/active-runs';

import { killProcessTree } from 'aidd-shared/lib/processTree';
import { and, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { WebRunStatus } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { HeartbeatWatcher } from './heartbeatWatcher.ts';
import type { RunTailWatcher } from './tailWatcher.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { findCliActiveRun, killCliRun, requestCliRunStop } from './cliActiveRuns.ts';
import { readLedgerTerminalEntries } from './ledgerReconcile.ts';
import { getRun } from './queries.ts';
import { terminalizeQueuedRun } from './queuedRunControl.ts';
import { clearRunStopFile, leaveStopRequest, resolveRunProcess } from './runProcessState.ts';
import {
	RECONCILED_EXIT_CODE,
	RunControlError,
	TELEMETRY_RUN_SOURCES,
	TERMINAL_STATUSES,
} from './types.ts';

export interface ControlContext {
	config: { web: ResolvedWebConfig } & ResolvedConfig;
	db: WebDatabase;
	heartbeatWatchers: Map<string, HeartbeatWatcher>;
	hub: WebSocketHub;
	onProjectChanged?: (projectPath: string) => void;
	tailWatchers: Map<string, RunTailWatcher>;
	telemetry: TelemetryService;
}

// Mirror a direct stop/kill onto linked invocation telemetry once the runs row is terminal.
async function syncInvocationFromRun(
	ctx: ControlContext,
	runId: string,
	source: string,
): Promise<void> {
	if (!TELEMETRY_RUN_SOURCES.has(source as CliActiveRunSource)) return;
	await ctx.telemetry.reconcileInvocationFromRun(runId).catch((error: unknown) => {
		webLogger.warn({ err: error, runId }, 'Failed to sync run invocation telemetry');
	});
}

async function stopTailWatcher(ctx: ControlContext, runId: string): Promise<void> {
	const tail = ctx.tailWatchers.get(runId);
	if (!tail) return;
	ctx.tailWatchers.delete(runId);
	await tail.stop();
}

export async function killRun(ctx: ControlContext, id: string): Promise<void> {
	const run = await getRun(ctx.db, id);
	if (!run) {
		const cliCtx = { config: ctx.config, hub: ctx.hub };
		const cliRun = await findCliActiveRun(cliCtx, id);
		if (!cliRun) throw new RunControlError(`Run not found: ${id}`, 404);
		await killCliRun(cliCtx, cliRun);
		await stopTailWatcher(ctx, id);
		return;
	}
	if (TERMINAL_STATUSES.has(run.status as WebRunStatus)) {
		throw new RunControlError(
			`Run is already in terminal status '${run.status}' and cannot be killed: ${id}`,
		);
	}
	if (run.status === 'queued') {
		const cancel = {
			exitCode: -1,
			label: 'run.kill.queued',
			status: 'killed',
			stopReason: 'killed',
		} as const;
		await terminalizeQueuedRun(ctx, run, cancel, () =>
			syncInvocationFromRun(ctx, id, run.source),
		);
		return;
	}
	const { alive, pid, starting } = await resolveRunProcess(
		run.projectPath,
		id,
		run.pid,
		run.startedAt,
	);
	if (alive && pid !== null) {
		try {
			await killProcessTree(pid);
		} catch {
			// Best-effort: the process may have exited; the row is forced terminal below.
		}
	}
	// There is no pid to kill yet. The row still goes terminal, and the stop request stays behind
	// so the child ends itself when it comes up instead of running under a row that says killed.
	if (starting) await leaveStopRequest(run.projectPath, id);
	// Drive the row terminal regardless of whether a live process was found: a stranded row whose
	// process already exited (or never recorded a pid) must still clear instead of appearing inert.
	const completedAt = Date.now();
	const updated = await withSqliteRetry(
		() =>
			ctx.db
				.update(runs)
				.set({
					completedAt,
					durationMs: completedAt - run.startedAt,
					exitCode: -1,
					status: 'killed',
					stopReason: 'killed',
				})
				.where(and(eq(runs.id, id), eq(runs.status, 'running')))
				.returning({ id: runs.id }),
		{ label: 'run.kill' },
	);
	if (updated.length === 0) {
		if (!starting) await clearRunStopFile(run.projectPath, id);
		await stopTailWatcher(ctx, id);
		return;
	}
	if (!starting) await clearRunStopFile(run.projectPath, id);
	recordDataMovement({
		category: 'database',
		operation: 'run.kill',
		status: 'success',
		summary: { runId: id },
		target: 'runs',
	});
	await syncInvocationFromRun(ctx, id, run.source);
	if (run.mode === 'audit') {
		ctx.onProjectChanged?.(run.projectPath);
	}
	ctx.hub.broadcast({
		payload: { exitCode: -1, status: 'killed', stopReason: 'killed' },
		runId: id,
		type: 'run_status',
	});
	await stopTailWatcher(ctx, id);
}

export async function stopRun(ctx: ControlContext, id: string): Promise<void> {
	const run = await getRun(ctx.db, id);
	if (!run) {
		const cliRun = await findCliActiveRun({ config: ctx.config, hub: ctx.hub }, id);
		if (!cliRun) throw new RunControlError(`Run not found: ${id}`, 404);
		await requestCliRunStop({ config: ctx.config, hub: ctx.hub }, cliRun);
		return;
	}
	if (TERMINAL_STATUSES.has(run.status as WebRunStatus)) {
		throw new RunControlError(
			`Run is already in terminal status '${run.status}' and cannot be stopped: ${id}`,
		);
	}
	if (run.status === 'queued') {
		const cancel = {
			exitCode: RECONCILED_EXIT_CODE,
			label: 'run.stop.queued',
			status: 'stopped',
			stopReason: 'stop_requested',
		} as const;
		await terminalizeQueuedRun(ctx, run, cancel, () =>
			syncInvocationFromRun(ctx, id, run.source),
		);
		return;
	}
	const stopFile = await leaveStopRequest(run.projectPath, id);
	recordDataMovement({
		category: 'file',
		operation: 'run.stop-file.write',
		status: 'success',
		summary: { runId: id },
		target: stopFile,
	});
	const { alive, starting } = await resolveRunProcess(
		run.projectPath,
		id,
		run.pid,
		run.startedAt,
	);
	// A run that is still starting keeps its stop file and its row: the child reads the request
	// before its first iteration and its own heartbeat ends the row. If it never comes up, the
	// orphan sweep reconciles the row once the startup window has passed.
	if (!alive && !starting) {
		// The process has already exited, so the stop file will never be consumed and no heartbeat
		// will arrive to terminalize the row. Drive it to 'stopped' now instead of leaving it
		// 'running' with stopRequested forever. If the CLI already finalized and wrote its ledger
		// line, prefer the ledger's real exit/stop facts over the reconciled placeholders.
		const ledgerEntry = (await readLedgerTerminalEntries(run.projectPath)).get(id);
		const exitCode = run.exitCode ?? ledgerEntry?.exitCode ?? RECONCILED_EXIT_CODE;
		const stopReason = ledgerEntry?.stopReason ?? 'stop_requested';
		const completedAt = Date.now();
		const updated = await withSqliteRetry(
			() =>
				ctx.db
					.update(runs)
					.set({
						completedAt,
						durationMs: ledgerEntry?.durationMs ?? completedAt - run.startedAt,
						exitCode,
						status: 'stopped',
						stopReason,
					})
					.where(and(eq(runs.id, id), eq(runs.status, 'running')))
					.returning({ id: runs.id }),
			{ label: 'run.stop' },
		);
		if (updated.length === 0) {
			await clearRunStopFile(run.projectPath, id);
			await stopTailWatcher(ctx, id);
			return;
		}
		await clearRunStopFile(run.projectPath, id);
		recordDataMovement({
			category: 'database',
			operation: 'run.stop',
			status: 'success',
			summary: { runId: id },
			target: 'runs',
		});
		await syncInvocationFromRun(ctx, id, run.source);
		if (run.mode === 'audit') {
			ctx.onProjectChanged?.(run.projectPath);
		}
		ctx.hub.broadcast({
			payload: {
				exitCode,
				status: 'stopped',
				stopReason,
			},
			runId: id,
			type: 'run_status',
		});
		await stopTailWatcher(ctx, id);
		return;
	}
	ctx.hub.broadcast({
		payload: { source: run.source, status: 'running', stopRequested: true },
		runId: id,
		type: 'run_status',
	});
}

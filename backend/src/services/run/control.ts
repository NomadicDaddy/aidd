import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';
import type { CliActiveRunSource } from 'aidd-shared/metadata/active-runs';

import { isProcessAlive, killProcessTree } from 'aidd-shared/lib/processTree';
import {
	activeRunFilePath,
	CLI_ACTIVE_RUN_STALE_MS,
	type CliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import { stopFilePath } from 'aidd-shared/metadata/paths';
import { eq } from 'drizzle-orm';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

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

// Mirror a direct stop/kill onto the linked invocation telemetry. The `runs` row has already been
// driven terminal by the caller, so this syncs the authoritative status (stopped/killed) instead
// of leaving the invocation 'running' until the next startup sweep force-failed it.
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

async function readHeartbeat(
	projectPath: string,
	runId: string,
): Promise<CliActiveRunRecord | undefined> {
	try {
		const raw = await readFile(activeRunFilePath(projectPath, runId), 'utf8');
		return JSON.parse(raw) as CliActiveRunRecord;
	} catch {
		return undefined;
	}
}

async function stopTailWatcher(ctx: ControlContext, runId: string): Promise<void> {
	const tail = ctx.tailWatchers.get(runId);
	if (!tail) return;
	ctx.tailWatchers.delete(runId);
	await tail.stop();
}

// Resolve the run's supervised pid and whether that process is genuinely still alive. A run with
// no recorded pid, a dead pid, or a live pid paired with a stale heartbeat (most likely a reused
// pid for a run whose original process already exited) is treated as dead, so an explicit
// Stop/Kill drives the row terminal immediately instead of signalling an unrelated process or
// waiting on a heartbeat that will never arrive.
async function resolveRunProcess(
	projectPath: string,
	runId: string,
	fallbackPid: null | number,
): Promise<{ alive: boolean; pid: null | number }> {
	const heartbeat = await readHeartbeat(projectPath, runId);
	const pid = heartbeat?.pid ?? fallbackPid ?? null;
	if (pid === null) return { alive: false, pid: null };
	if (!isProcessAlive(pid)) return { alive: false, pid };
	if (heartbeat && Date.now() - heartbeat.heartbeatAt > CLI_ACTIVE_RUN_STALE_MS) {
		return { alive: false, pid };
	}
	return { alive: true, pid };
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
	const { alive, pid } = await resolveRunProcess(run.projectPath, id, run.pid);
	if (alive && pid !== null) {
		try {
			await killProcessTree(pid);
		} catch {
			// best-effort kill — the process may have already exited between the heartbeat
			// write and this call. The DB row is force-driven terminal below regardless.
		}
	}
	// Drive the row terminal regardless of whether a live process was found: a stranded row whose
	// process already exited (or never recorded a pid) must still clear instead of appearing inert.
	const completedAt = Date.now();
	await withSqliteRetry(
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
				.where(eq(runs.id, id)),
		{ label: 'run.kill' },
	);
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
	const stopFile = stopFilePath(run.projectPath);
	await mkdir(dirname(stopFile), { recursive: true });
	await writeFile(stopFile, `${new Date().toISOString()}\n`);
	recordDataMovement({
		category: 'file',
		operation: 'run.stop-file.write',
		status: 'success',
		summary: { runId: id },
		target: stopFile,
	});
	const { alive } = await resolveRunProcess(run.projectPath, id, run.pid);
	if (!alive) {
		// The process has already exited, so the stop file will never be consumed and no heartbeat
		// will arrive to terminalize the row. Drive it to 'stopped' now instead of leaving it
		// 'running' with stopRequested forever. If the CLI already finalized and wrote its ledger
		// line, prefer the ledger's real exit/stop facts over the reconciled placeholders.
		const ledgerEntry = (await readLedgerTerminalEntries(run.projectPath)).get(id);
		const exitCode = run.exitCode ?? ledgerEntry?.exitCode ?? RECONCILED_EXIT_CODE;
		const stopReason = ledgerEntry?.stopReason ?? 'stop_requested';
		const completedAt = Date.now();
		await withSqliteRetry(
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
					.where(eq(runs.id, id)),
			{ label: 'run.stop' },
		);
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

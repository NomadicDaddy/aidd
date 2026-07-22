import type { ResolvedConfig, ResolvedWebConfig } from 'aidd-shared/config';

import { isProcessAlive, killProcessTree } from 'aidd-shared/lib/processTree';
import {
	activeRunsDir,
	CLI_ACTIVE_RUN_STALE_MS,
	isCliRunTerminal,
	readCliActiveRunRecords,
	writeCliActiveRunRecord,
	type CliActiveRunRecord,
} from 'aidd-shared/metadata/active-runs';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { mkdir, readdir, stat, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

import type { RunRecord, WebRunStatus } from '../../types.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';

import { webLogger } from '../../logger.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { cliRunWebStatus, pathsMatch, toCliRunRecord } from './cliActiveRunRecord.ts';

export { pathsMatch };

interface CliActiveRunsContext {
	config: ResolvedConfig & { web: ResolvedWebConfig };
	hub: WebSocketHub;
}

function isIgnoredDirectory(name: string, ignoredFolders: readonly string[]): boolean {
	return ignoredFolders.includes(name);
}

async function directoryExists(path: string): Promise<boolean> {
	try {
		return (await stat(path)).isDirectory();
	} catch {
		return false;
	}
}

export async function scanCliActiveRunProjectDirs(
	root: string,
	ignoredFolders: readonly string[],
	maxDepth = 2
): Promise<string[]> {
	const resolvedRoot = resolve(root);
	if (!(await directoryExists(resolvedRoot))) return [];
	const projectDirs = new Set<string>();
	async function visit(path: string, depth: number): Promise<void> {
		if (await directoryExists(activeRunsDir(path))) {
			projectDirs.add(path);
			return;
		}
		if (await directoryExists(metadataPath(path))) return;
		if (depth >= maxDepth) return;
		let entries: { isDirectory(): boolean; name: string }[];
		try {
			entries = await readdir(path, { withFileTypes: true });
		} catch {
			return;
		}
		for (const entry of entries) {
			if (!entry.isDirectory()) continue;
			if (entry.name === '.aidd' || isIgnoredDirectory(entry.name, ignoredFolders)) continue;
			await visit(join(path, entry.name), depth + 1);
		}
	}
	await visit(resolvedRoot, 0);
	return [...projectDirs];
}

export async function listCliActiveRuns(ctx: CliActiveRunsContext): Promise<RunRecord[]> {
	const projectDirs = new Set<string>();
	await Promise.all(
		ctx.config.web.allowedRoots.map(async (root) => {
			for (const projectDir of await scanCliActiveRunProjectDirs(
				root,
				ctx.config.web.ignoredFolders
			)) {
				projectDirs.add(resolve(projectDir));
			}
		})
	);
	const rows = await Promise.all(
		[...projectDirs].map((projectDir) =>
			readCliActiveRunRecords(projectDir, { includeCompleted: true }).catch(
				(error: unknown) => {
					webLogger.warn({ error, projectDir }, 'Failed to read CLI active runs');
					return [];
				}
			)
		)
	);
	return rows.flat().map((run) => toCliRunRecord(run));
}

export async function listCliActiveRunsForProject(projectPath: string): Promise<RunRecord[]> {
	const rows = await readCliActiveRunRecords(projectPath, {
		includeCompleted: true,
	}).catch((error: unknown) => {
		webLogger.warn({ error, projectPath }, 'Failed to read project CLI active runs');
		return [];
	});
	return rows
		.filter((run) => pathsMatch(run.projectPath, projectPath))
		.map((run) => toCliRunRecord(run));
}

export async function findCliActiveRun(
	ctx: CliActiveRunsContext,
	id: string
): Promise<CliActiveRunRecord | undefined> {
	const allRuns = await listCliActiveRuns(ctx);
	const match = allRuns.find((run) => run.id === id);
	if (!match) return undefined;
	const records = await readCliActiveRunRecords(match.projectPath, {
		includeCompleted: true,
	});
	return records.find((run) => run.id === id);
}

// Whether a CLI run's supervised process is still alive. A run with no recorded pid, a dead pid,
// or a live pid paired with a stale heartbeat (most likely a reused pid for a run whose original
// process already exited) is treated as dead, so an explicit Stop/Kill drives the row terminal
// immediately rather than waiting on a heartbeat or stop file that will never be consumed.
export function isCliRunProcessAlive(run: CliActiveRunRecord, now = Date.now()): boolean {
	if (run.pid === null) return false;
	if (!isProcessAlive(run.pid)) return false;
	return now - run.heartbeatAt <= CLI_ACTIVE_RUN_STALE_MS;
}

// Re-announce an already-terminal CLI run's recorded outcome. Stop/Kill on a run that has already
// finished hits this path; the row is terminal, so we just rebroadcast for any client that missed
// the original transition.
function broadcastTerminalCliRun(ctx: CliActiveRunsContext, run: CliActiveRunRecord): void {
	ctx.hub.broadcast({
		payload: {
			exitCode: run.exitCode,
			status: cliRunWebStatus(run),
			stopReason: run.stopReason,
			summary: run.summary,
		},
		runId: run.id,
		type: 'run_status',
	});
}

async function terminalizeCliRun(
	ctx: CliActiveRunsContext,
	run: CliActiveRunRecord,
	options: { exitCode: number; status: WebRunStatus; stopReason: string; summary: string }
): Promise<void> {
	const now = Date.now();
	await writeCliActiveRunRecord({
		...run,
		completedAt: now,
		durationMs: now - run.startedAt,
		exitCode: options.exitCode,
		heartbeatAt: now,
		state: 'stopped',
		stopReason: options.stopReason,
		summary: options.summary,
	});
	recordDataMovement({
		category: 'file',
		operation: 'run.cli.terminalize',
		status: 'success',
		summary: { runId: run.id, source: 'cli', status: options.status },
		target: run.stopFile,
	});
	ctx.hub.broadcast({
		payload: {
			exitCode: options.exitCode,
			status: options.status,
			stopReason: options.stopReason,
			summary: options.summary,
		},
		runId: run.id,
		type: 'run_status',
	});
}

export async function requestCliRunStop(
	ctx: CliActiveRunsContext,
	run: CliActiveRunRecord
): Promise<void> {
	if (isCliRunTerminal(run)) {
		broadcastTerminalCliRun(ctx, run);
		return;
	}
	if (!isCliRunProcessAlive(run)) {
		await terminalizeCliRun(ctx, run, {
			exitCode: run.exitCode ?? -1,
			status: 'stopped',
			stopReason: 'stop_requested',
			summary: 'Stopped from aidd UI (process already exited).',
		});
		return;
	}
	await mkdir(dirname(run.stopFile), { recursive: true });
	await writeFile(run.stopFile, `${new Date().toISOString()}\n`);
	recordDataMovement({
		category: 'file',
		operation: 'run.stop-file.write',
		status: 'success',
		summary: { runId: run.id, source: 'cli' },
		target: run.stopFile,
	});
	await writeCliActiveRunRecord({
		...run,
		heartbeatAt: Date.now(),
		state: 'stop_requested',
		summary: 'Stop requested from aidd UI',
	});
	ctx.hub.broadcast({
		payload: { source: 'cli', status: 'running', stopRequested: true },
		runId: run.id,
		type: 'run_status',
	});
}

export async function killCliRun(
	ctx: CliActiveRunsContext,
	run: CliActiveRunRecord
): Promise<void> {
	if (isCliRunTerminal(run)) {
		broadcastTerminalCliRun(ctx, run);
		return;
	}
	if (isCliRunProcessAlive(run) && run.pid !== null) {
		try {
			await killProcessTree(run.pid);
		} catch {
			// best-effort kill — the process may have exited between the heartbeat write and this
			// call. The record is force-driven terminal below regardless.
		}
	}
	await terminalizeCliRun(ctx, run, {
		exitCode: -1,
		status: 'stopped',
		stopReason: 'killed',
		summary: 'Killed from aidd UI.',
	});
}

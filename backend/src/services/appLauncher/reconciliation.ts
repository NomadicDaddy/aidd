import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';

import { appLaunches } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { encodeProjectId } from '../../paths.ts';
import { HttpError } from '../errors.ts';
import {
	type AppLaunchRecord,
	type AppLaunchStatus,
	type CommandArgs,
	commandLabel,
	hasPackageScript,
	isPidAlive,
	isSpernakitPackage,
	readProjectPackage,
} from './shared.ts';
import {
	freshLiveSpernakitPidFile,
	readSpernakitPids,
	type SpernakitPidFile,
} from './spernakitPidFiles.ts';

type AppLaunchRow = typeof appLaunches.$inferSelect;

const SPERNAKIT_START_COMMAND = ['bun', 'run', 'start'] as const;

function isSpernakitStartRow(row: { command: string }): boolean {
	return row.command === commandLabel(SPERNAKIT_START_COMMAND);
}

export interface ReconciliationDeps {
	db: WebDatabase;
}

export function toRecord(row: {
	command: string;
	pid: null | number;
	projectPath: string;
	startedAt: null | number;
	status: string;
	stoppedAt: null | number;
}): AppLaunchRecord {
	return {
		command: row.command,
		pid: row.pid,
		projectId: encodeProjectId(row.projectPath),
		projectPath: row.projectPath,
		startedAt: row.startedAt,
		status: row.status as AppLaunchStatus,
		stoppedAt: row.stoppedAt,
	};
}

export async function isRowStillRunning(row: AppLaunchRow): Promise<boolean> {
	if (isSpernakitStartRow(row)) {
		const pids = await readSpernakitPids(row.projectPath);
		return pids.some((pid) => isPidAlive(pid));
	}
	return row.pid !== null && isPidAlive(row.pid);
}

/**
 * Distinguish an externally-stopped managed app from a genuinely crashed one when its
 * tracked process is no longer alive. A spernakit app's stop script removes its
 * `logs/<service>.pid` files on a clean stop, whereas a crash leaves a stale pid file
 * behind (spernakit's own stop script relies on this same "stale pid" signal to detect
 * a silent backend crash). So a vanished spernakit process whose pid files are gone was
 * stopped out-of-band (e.g. a concurrent `bun run stop`), not crashed — labelling it
 * 'crashed' left the UI stuck in a crash state until a manual Restart.
 *
 * Generic apps have no on-disk stop signal; a vanished tracked pid is treated as a
 * crash. A launcher-initiated stop of a generic app sets 'stopped' directly via the
 * exit handler / markStopped, so this only classifies processes that vanished without
 * the launcher's involvement.
 * @param row
 * @returns The classified status.
 */
async function classifyVanishedRow(row: AppLaunchRow): Promise<'crashed' | 'stopped'> {
	if (isSpernakitStartRow(row)) {
		const pids = await readSpernakitPids(row.projectPath);
		return pids.length === 0 ? 'stopped' : 'crashed';
	}
	return 'crashed';
}

async function persistStatus(
	deps: ReconciliationDeps,
	row: AppLaunchRow,
	status: AppLaunchStatus,
	stoppedAt: null | number
): Promise<AppLaunchRow> {
	const now = Date.now();
	await deps.db
		.update(appLaunches)
		.set({ status, stoppedAt, updatedAt: now })
		.where(eq(appLaunches.projectPath, row.projectPath));
	return { ...row, status, stoppedAt, updatedAt: now };
}

async function persistRunningStatus(
	deps: ReconciliationDeps,
	row: AppLaunchRow,
	pidFile: SpernakitPidFile
): Promise<AppLaunchRow> {
	const now = Date.now();
	const startedAt = pidFile.modifiedAt;
	await deps.db
		.update(appLaunches)
		.set({ pid: pidFile.pid, startedAt, status: 'running', stoppedAt: null, updatedAt: now })
		.where(eq(appLaunches.projectPath, row.projectPath));
	return {
		...row,
		pid: pidFile.pid,
		startedAt,
		status: 'running',
		stoppedAt: null,
		updatedAt: now,
	};
}

async function persistDiscoveredRunningStatus(
	deps: ReconciliationDeps,
	projectPath: string,
	command: string,
	pidFile: SpernakitPidFile
): Promise<AppLaunchRow> {
	const now = Date.now();
	const row = {
		command,
		pid: pidFile.pid,
		projectPath,
		startedAt: pidFile.modifiedAt,
		status: 'running',
		stoppedAt: null,
		updatedAt: now,
	} satisfies AppLaunchRow;
	await deps.db.insert(appLaunches).values(row);
	return row;
}

export async function reconcileRow(
	deps: ReconciliationDeps,
	row: AppLaunchRow
): Promise<AppLaunchRow> {
	if (row.status === 'running') {
		if (await isRowStillRunning(row)) return row;
		return persistStatus(deps, row, await classifyVanishedRow(row), Date.now());
	}
	// A spernakit row frozen at 'crashed' was classified while its pid files were still present
	// (a silent crash leaves them stale). Once those pid files are gone the app is no longer in a
	// crash state — it was cleanly stopped out-of-band — so downgrade to 'stopped'. Otherwise the
	// UI keeps offering 'Restart' for a project whose runtime is simply down. The original
	// stoppedAt is preserved as the truthful end-of-run time.
	if (row.status === 'crashed' && isSpernakitStartRow(row)) {
		const pids = await readSpernakitPids(row.projectPath);
		if (pids.length === 0) {
			return persistStatus(deps, row, 'stopped', row.stoppedAt);
		}
	}
	if (isSpernakitStartRow(row)) {
		const livePidFile = await freshLiveSpernakitPidFile(
			row.projectPath,
			row.stoppedAt ?? row.updatedAt
		);
		if (livePidFile !== undefined) {
			return persistRunningStatus(deps, row, livePidFile);
		}
	}
	return row;
}

export async function reconcileOnBoot(deps: ReconciliationDeps): Promise<void> {
	const rows = await deps.db.select().from(appLaunches);
	for (const row of rows) {
		const reconciled = await reconcileRow(deps, row);
		if (reconciled.status !== row.status) {
			webLogger.info(
				{
					from: row.status,
					pid: row.pid,
					projectPath: row.projectPath,
					to: reconciled.status,
				},
				'app launcher reconciled stale row'
			);
		}
	}
}

export async function resolveLaunchCommands(projectPath: string): Promise<{
	kind: 'generic' | 'spernakit';
	start: CommandArgs;
	stop: CommandArgs | null;
}> {
	const pkg = await readProjectPackage(projectPath);
	if (pkg && isSpernakitPackage(pkg)) {
		if (!hasPackageScript(pkg, 'start') || !hasPackageScript(pkg, 'stop')) {
			throw new HttpError('Spernakit project is missing required start/stop scripts', 400);
		}
		return {
			kind: 'spernakit' as const,
			start: ['bun', 'run', 'start'] as const,
			stop: ['bun', 'run', 'stop'] as const,
		};
	}
	if (pkg && !hasPackageScript(pkg, 'dev')) {
		throw new HttpError('Project is missing required dev script', 400);
	}
	return {
		kind: 'generic' as const,
		start: ['bun', 'run', 'dev'] as const,
		stop: null,
	};
}

export async function readRow(
	deps: ReconciliationDeps,
	projectPath: string
): Promise<AppLaunchRow | undefined> {
	const rows = await deps.db
		.select()
		.from(appLaunches)
		.where(eq(appLaunches.projectPath, projectPath))
		.limit(1);
	return rows[0];
}

export async function getStatus(
	deps: ReconciliationDeps,
	projectId: string,
	projectPath: string
): Promise<AppLaunchRecord> {
	const row = await readRow(deps, projectPath);
	if (!row) {
		let command = '';
		let kind: 'generic' | 'spernakit' = 'generic';
		try {
			const commands = await resolveLaunchCommands(projectPath);
			command = commandLabel(commands.start);
			kind = commands.kind;
		} catch (err) {
			if (!(err instanceof HttpError)) throw err;
		}
		if (kind === 'spernakit') {
			const livePidFile = await freshLiveSpernakitPidFile(projectPath, 0);
			if (livePidFile !== undefined) {
				return toRecord(
					await persistDiscoveredRunningStatus(deps, projectPath, command, livePidFile)
				);
			}
		}
		return {
			command,
			pid: null,
			projectId,
			projectPath,
			startedAt: null,
			status: 'stopped',
			stoppedAt: null,
		};
	}
	const reconciled = await reconcileRow(deps, row);
	return toRecord(reconciled);
}

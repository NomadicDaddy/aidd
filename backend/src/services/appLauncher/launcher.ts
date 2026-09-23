import { killCapturedDescendants } from 'aidd-shared/lib/processTree';
import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { WebSocketHub } from '../../webSocketHub.ts';
import type { ProjectService } from '../projectService.ts';

import { appLaunches } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { encodeProjectId } from '../../paths.ts';
import { HttpError } from '../errors.ts';
import { DescendantSampler } from './descendantSampler.ts';
import {
	lastMeaningfulLines,
	runProjectCommand,
	runStopCommand,
	spawnCommand,
	stopTrackedPid,
} from './launchProcess.ts';
import {
	getStatus as getStatusInternal,
	readRow,
	reconcileOnBoot,
	reconcileRow,
	type ReconciliationDeps,
	resolveLaunchCommands,
	toRecord,
} from './reconciliation.ts';
import {
	type AppLaunchRecord,
	type AppLaunchStatus,
	type CommandArgs,
	commandLabel,
	isPidAlive,
} from './shared.ts';
import { primarySpernakitPid, readSpernakitPids } from './spernakitPidFiles.ts';

export type { AppLaunchRecord, AppLaunchStatus } from './shared.ts';

const SPERNAKIT_START_COMMAND = ['bun', 'run', 'start'] as const;
const SPERNAKIT_STOP_COMMAND = ['bun', 'run', 'stop'] as const;
/** Number of trailing non-empty output lines surfaced in a failure message. */
const FAILURE_TAIL_LINES = 12;

interface LauncherDeps {
	db: WebDatabase;
	hub?: WebSocketHub;
	projectService: ProjectService;
}

export class AppLauncherService {
	private readonly db: WebDatabase;
	private readonly hub: undefined | WebSocketHub;
	private readonly projectService: ProjectService;
	private readonly children = new Map<string, ReturnType<typeof Bun.spawn>>();
	/**
	 * Project paths the launcher is deliberately stopping. The generic exit handler
	 * consults this so a launcher-initiated stop is never transiently labelled 'crashed'
	 * when the killed `bun run dev` exits non-zero without a signal (typical on Windows).
	 */
	private readonly stopping = new Set<string>();
	/** What each running app spawned, so an exit can sweep what it left behind. */
	private readonly descendants = new DescendantSampler((path) => this.children.has(path));

	constructor(deps: LauncherDeps) {
		this.db = deps.db;
		this.hub = deps.hub;
		this.projectService = deps.projectService;
	}

	private get reconDeps(): ReconciliationDeps {
		return { db: this.db };
	}

	/**
	 * Broadcast an app-launch lifecycle change so the frontend can invalidate the
	 * app-launch and port-status query keys without client-side polling. A started
	 * or stopped app is also exactly when its dev/start ports come up or down.
	 * @param projectPath
	 * @param status
	 */
	private broadcastStatus(projectPath: string, status: AppLaunchStatus): void {
		this.hub?.broadcast({
			payload: { projectId: encodeProjectId(projectPath), status },
			type: 'app_launch',
		});
	}

	async reconcileOnBoot(): Promise<void> {
		await reconcileOnBoot(this.reconDeps);
	}

	async start(projectId: string): Promise<AppLaunchRecord> {
		const projectPath = await this.projectService.resolveDiscoveredProject(projectId);
		const commands = await resolveLaunchCommands(projectPath);
		const current = await getStatusInternal(this.reconDeps, projectId, projectPath);
		if (current.status === 'running') {
			throw new HttpError(`App is already running for project (pid ${current.pid})`, 409);
		}
		if (commands.kind === 'spernakit') {
			return await this.startSpernakit(projectPath, commands.start);
		}
		return await this.startGeneric(projectPath, commands.start);
	}

	async stop(projectId: string): Promise<AppLaunchRecord> {
		const projectPath = await this.projectService.resolveDiscoveredProject(projectId);
		const current = await readRow(this.reconDeps, projectPath);
		if (!current) throw new HttpError('No launch record for project', 404);
		if (current.status !== 'running') {
			return toRecord(current);
		}
		const startedAsSpernakit = current.command === commandLabel(SPERNAKIT_START_COMMAND);
		this.stopping.add(projectPath);
		try {
			if (startedAsSpernakit) {
				await runStopCommand(projectPath, SPERNAKIT_STOP_COMMAND);
				const livePids = (await readSpernakitPids(projectPath)).filter(isPidAlive);
				for (const livePid of livePids) {
					await stopTrackedPid(livePid);
				}
			} else {
				const pid = current.pid;
				if (pid === null) throw new HttpError('Launch row has no pid', 500);
				if (isPidAlive(pid)) {
					await stopTrackedPid(pid);
				}
			}
		} finally {
			this.stopping.delete(projectPath);
		}
		this.children.delete(projectPath);
		return await this.markStopped(current, projectPath);
	}

	async getStatus(projectId: string): Promise<AppLaunchRecord> {
		const projectPath = await this.projectService.resolveDiscoveredProject(projectId);
		return getStatusInternal(this.reconDeps, projectId, projectPath);
	}

	async getAllStatuses(): Promise<AppLaunchRecord[]> {
		// Resolve a status for every discovered project in one round trip, so the
		// projects list renders launch controls from this single response instead of
		// fanning out to one /status/:id request per project. listProjectNames is the
		// lightweight discovery pass (no per-project metadata compute), so this batch is
		// not gated behind the heavier /projects listing scan.
		const { projects } = await this.projectService.listProjectNames();
		const discoveredPaths = new Set(projects.map((project) => project.path));
		const discovered = await Promise.all(
			projects.map((project) => getStatusInternal(this.reconDeps, project.id, project.path)),
		);
		// Preserve rows for projects launched in the past but no longer discovered, so a
		// still-running app is never silently dropped just because its root moved out of
		// the configured allowed roots.
		const rows = await this.db.select().from(appLaunches);
		const orphans = await Promise.all(
			rows
				.filter((row) => !discoveredPaths.has(row.projectPath))
				.map(async (row) => toRecord(await reconcileRow(this.reconDeps, row))),
		);
		return [...discovered, ...orphans];
	}

	private async startGeneric(
		projectPath: string,
		command: CommandArgs,
	): Promise<AppLaunchRecord> {
		let child: ReturnType<typeof Bun.spawn>;
		try {
			child = spawnCommand(command, projectPath);
		} catch (err) {
			const message = err instanceof Error ? err.message : String(err);
			throw new HttpError(`Failed to spawn app process: ${message}`, 500);
		}
		child.unref();
		const pid = child.pid;
		const startedAt = Date.now();
		this.children.set(projectPath, child);
		this.descendants.start(projectPath, pid);
		void child.exited.then(async () => {
			const code = child.exitCode;
			const signal = child.signalCode;
			// A launch command starts its servers detached, and when it dies on its own nothing has
			// signalled them: an orphaned Vite kept port 5173 after a crash and failed every
			// restart after it. stopTrackedPid sweeps a stop; this is the exit nobody asked for.
			const orphans = this.descendants.stop(projectPath);
			this.children.delete(projectPath);
			const intentionalStop = this.stopping.delete(projectPath);
			const stoppedAt = Date.now();
			const status: AppLaunchStatus =
				intentionalStop || code === 0 || signal !== null ? 'stopped' : 'crashed';
			this.db
				.update(appLaunches)
				.set({ status, stoppedAt, updatedAt: stoppedAt })
				.where(eq(appLaunches.projectPath, projectPath))
				.run();
			webLogger.info({ code, pid, projectPath, signal, status }, 'app launcher child exited');
			this.broadcastStatus(projectPath, status);
			// After the status is published, so a stop still reports promptly. An intentional stop
			// has already swept, so this normally finds nothing.
			const killed = await killCapturedDescendants(orphans);
			if (killed > 0) {
				webLogger.info(
					{ killed, pid, projectPath, status },
					'app launcher killed processes the exited app left holding resources',
				);
			}
		});
		return await this.persistRunning(projectPath, commandLabel(command), pid, startedAt);
	}

	private async startSpernakit(
		projectPath: string,
		command: CommandArgs,
	): Promise<AppLaunchRecord> {
		const result = await runProjectCommand(projectPath, command);
		if (result.code !== 0) {
			const exit =
				result.code === null ? `signal ${result.signal}` : `exit code ${result.code}`;
			webLogger.error(
				{
					code: result.code,
					command: commandLabel(command),
					output: result.output,
					projectPath,
					signal: result.signal,
				},
				'app launcher start command failed',
			);
			const detail = lastMeaningfulLines(result.output, FAILURE_TAIL_LINES);
			throw new HttpError(
				`App start command failed (${exit}).${detail ? `\n${detail}` : ' No output captured.'}`,
				500,
			);
		}
		const pid = await primarySpernakitPid(projectPath);
		const startedAt = Date.now();
		return await this.persistRunning(projectPath, commandLabel(command), pid, startedAt);
	}

	private async persistRunning(
		projectPath: string,
		command: string,
		pid: null | number,
		startedAt: number,
	): Promise<AppLaunchRecord> {
		await this.db
			.insert(appLaunches)
			.values({
				command,
				pid,
				projectPath,
				startedAt,
				status: 'running',
				stoppedAt: null,
				updatedAt: startedAt,
			})
			.onConflictDoUpdate({
				set: {
					command,
					pid,
					startedAt,
					status: 'running',
					stoppedAt: null,
					updatedAt: startedAt,
				},
				target: appLaunches.projectPath,
			});
		webLogger.info({ pid, projectPath }, 'app launcher started child');
		this.broadcastStatus(projectPath, 'running');
		return toRecord({
			command,
			pid,
			projectPath,
			startedAt,
			status: 'running',
			stoppedAt: null,
		});
	}

	private async markStopped(
		current: typeof appLaunches.$inferSelect,
		projectPath: string,
	): Promise<AppLaunchRecord> {
		const stoppedAt = Date.now();
		await this.db
			.update(appLaunches)
			.set({ status: 'stopped', stoppedAt, updatedAt: stoppedAt })
			.where(eq(appLaunches.projectPath, projectPath));
		this.children.delete(projectPath);
		webLogger.info({ pid: current.pid, projectPath }, 'app launcher stopped child');
		this.broadcastStatus(projectPath, 'stopped');
		return toRecord({
			...current,
			status: 'stopped',
			stoppedAt,
		});
	}
}

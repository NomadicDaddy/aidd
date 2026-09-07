import {
	defaultDirectorIntervalHours,
	defaultIgnoredFolders,
	type ResolvedConfig,
	WEB_AUTH_TOKEN_ENV,
} from 'aidd-shared/config';
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

import type { DirectorService } from './services/directorService.ts';
import type { ProjectService } from './services/projectService.ts';
import type { ScheduledTaskService } from './services/scheduledTaskService.ts';

import { webLogger } from './logger.ts';

/**
 * Point the scheduler at the Director and make sure the built-in task exists.
 *
 * The seed reads `director.schedule` once, on the first boot that finds no built-in task; every
 * later boot returns the stored row untouched. A failure costs the Director its automatic cadence,
 * which is not worth refusing to start the panel over.
 * @param config The effective configuration, read for the `director.schedule` seed block.
 * @param scheduledTaskService The scheduler that owns the task.
 * @param directorService The service the task's occurrences start cycles through.
 */
export async function wireDirectorScheduling(
	config: ResolvedConfig,
	scheduledTaskService: ScheduledTaskService,
	directorService: DirectorService,
): Promise<void> {
	scheduledTaskService.setDirectorCycleLauncher((executionId, initiator) =>
		directorService.startScheduledCycle(executionId, initiator),
	);
	await scheduledTaskService
		.ensureDirectorTask({
			enabled: config.director?.schedule.enabled ?? false,
			intervalHours: config.director?.schedule.intervalHours ?? defaultDirectorIntervalHours,
			timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
		})
		.catch((error: unknown) => {
			webLogger.warn({ error }, 'Seeding the built-in Director scheduled task failed');
		});
}

export function startSchedulesAfterProjectWarmup(
	projectService: ProjectService,
	scheduledTaskService: ScheduledTaskService,
): void {
	void projectService
		.listProjectListings()
		.catch((err) => webLogger.warn({ err }, 'project listing warm-up failed'))
		// Scheduling starts either way. A due occurrence prefers a warm listing, but a discovery
		// failure must degrade to visibly failed occurrences instead of disabling scheduling.
		.finally(() => {
			scheduledTaskService.start();
		});
}

// Resolve the effective web config: use config.web when present, otherwise fall back to a
// single-writer localhost default rooted at the given backend rootDir. Keeping this bootstrap
// helper separate leaves start.ts focused and under the 300-line cap.
export function resolveEffectiveWebConfig(
	config: ResolvedConfig,
	rootDir: string,
): NonNullable<ResolvedConfig['web']> {
	return (
		config.web ??
		({
			allowedOrigins: [],
			allowedRoots: [config.applicationsRoot ?? resolve(rootDir, '..')],
			allowRemote: false,
			autoChainLimit: 3,
			autoChainRuns: false,
			dataDir: resolve(rootDir, 'data'),
			hostname: '127.0.0.1',
			ignoredFolders: [...defaultIgnoredFolders],
			maxConcurrentRuns: 2,
			maxConcurrentRunsPerProject: 2,
			port: 3210,
			showSpernakitProject: false,
			spernakitFleetManifest: null,
			spernakitInitScript: null,
			spernakitTemplateRef: null,
			spernakitTemplateRepo: 'NomadicDaddy/spernakit',
			templates: [],
			traceDataMovement: false,
			useWorktrees: false,
		} satisfies NonNullable<ResolvedConfig['web']>)
	);
}

/**
 * Refuse to serve a remote-bound control panel with no `web.authToken`.
 *
 * Called from `start.ts` before anything binds. Having a token is a precondition of *serving*, not
 * of reading the configuration, which is why it is checked here rather than in `resolveWebConfig`:
 * every aidd process resolves the same config, including the coding CLI a run spawns, and that CLI
 * is deliberately handed an environment without `AIDD_WEB_AUTH_TOKEN` (`subprocess-env.ts`
 * withholds it so a coding CLI never receives the operator's credential). Throwing during
 * resolution therefore killed every detached run at startup over a panel setting none of them act
 * on. `isPeerAuthorized` holds such a panel to loopback as a second line, but a panel that binds to
 * the network and then refuses almost everything it receives is a configuration to reject outright.
 */
export function assertWebAuthTokenPresent(web: NonNullable<ResolvedConfig['web']>): void {
	if (!web.allowRemote) return;
	if (web.authToken?.trim()) return;
	// Naming the variable is the point. Saying only `web.authToken` sends the reader to
	// ~/.aidd/config.json, the one place the token must not go, and the place a blocked operator
	// will paste it to get the panel started again. That paste is silent, undoes the indirection
	// completely, and no gate looks at that file.
	throw new Error(
		'web.allowRemote is true but web.authToken is missing or blank. ' +
			'Remote-bound control panels must require an access token. Supply it as ' +
			`${WEB_AUTH_TOKEN_ENV} in the environment rather than writing it into ` +
			'~/.aidd/config.json, where any agent asked to read your configuration returns ' +
			'it. On Windows a variable added after this shell was opened is not visible to ' +
			'it: open a new terminal.',
	);
}

// Loud dual-channel warning (structured log + stderr) when the token-protected control plane is
// bound for remote access. No-op for the localhost default.
export function warnRemoteAccess(hostname: string, port: number): void {
	webLogger.warn(
		{ hostname, port },
		'WARNING: web.allowRemote is true — token-protected control plane is reachable from the network; protect web.authToken and restrict web.allowedOrigins',
	);
	console.warn(
		`⚠ WARNING: web.allowRemote is true — the token-protected aidd control plane at ` +
			`http://${hostname}:${port} is reachable from the network. Protect web.authToken and ` +
			`restrict web.allowedOrigins to trusted origins.`,
	);
}

/** Path to the web backend's PID file, consumed by `scripts/stop-web.ts`. */
function webPidFilePath(rootDir: string): string {
	return resolve(rootDir, 'logs', 'backend.pid');
}

export function writeWebPidFile(rootDir: string): void {
	const path = webPidFilePath(rootDir);
	try {
		mkdirSync(resolve(rootDir, 'logs'), { recursive: true });
		writeFileSync(path, `${process.pid}\n`, 'utf8');
	} catch (err) {
		webLogger.warn({ err, path }, 'failed to write web backend PID file');
	}
}

export function removeWebPidFile(rootDir: string): void {
	try {
		rmSync(webPidFilePath(rootDir), { force: true });
	} catch {
		// Best-effort cleanup; a stale file is reconciled on next stop.
	}
}

function openRestartLogFd(rootDir: string, filename: string): number {
	const logsDir = resolve(rootDir, 'logs');
	mkdirSync(logsDir, { recursive: true });
	return openSync(resolve(logsDir, filename), 'a');
}

export function createRestartSupervisorSpawnOptions(
	rootDir: string,
	stdoutFd: number,
	stderrFd: number,
) {
	return {
		cwd: rootDir,
		detached: true,
		stderr: stderrFd,
		stdin: 'ignore' as const,
		stdout: stdoutFd,
		windowsHide: true,
	};
}

export function startRestartSupervisor(rootDir: string, currentPort: number): boolean {
	let stdoutFd: null | number = null;
	let stderrFd: null | number = null;
	try {
		stdoutFd = openRestartLogFd(rootDir, 'backend-restart.log');
		stderrFd = openRestartLogFd(rootDir, 'backend-restart.error.log');
		// Bun.spawn (not node:child_process.spawn) so the supervisor never inherits the
		// listen socket — see appLauncher/launcher.ts for the full Windows rationale. A
		// Node-spawned supervisor would hold port `currentPort` open and deadlock its own
		// --wait-for-release. Detached lifetime comes from unref().
		const proc = Bun.spawn(
			[
				process.execPath,
				'scripts/start-web.ts',
				'--wait-for-release',
				'--wait-for-release-port',
				String(currentPort),
			],
			createRestartSupervisorSpawnOptions(rootDir, stdoutFd, stderrFd),
		);
		proc.unref();
		if (!proc.pid) {
			webLogger.error('failed to spawn web restart supervisor');
			return false;
		}
		webLogger.info({ pid: proc.pid }, 'spawned web restart supervisor');
		return true;
	} catch (err) {
		webLogger.error({ err }, 'failed to spawn web restart supervisor');
		return false;
	} finally {
		if (stdoutFd !== null) closeSync(stdoutFd);
		if (stderrFd !== null) closeSync(stderrFd);
	}
}

// Process-level diagnostics net for the long-lived control plane. Owned background
// failures (heartbeat sweeps, fs.watch, detached child exits) are contained at their
// own call sites — e.g. scanSafely() catches a rejected sweep and leaves the heartbeat
// file for retry. These handlers only catch what slips past that.
//
// unhandledRejection: an unowned background promise rejecting does not corrupt
// synchronous state, so we log and keep serving rather than letting Bun exit the panel.
// uncaughtException: a synchronous throw nobody caught means process state may be
// inconsistent; continuing is unsafe. Log the failure, then exit so the supervisor can restart
// from a clean slate.
// Registered once per process.
let processSafetyNetInstalled = false;
export function installProcessSafetyNet(): void {
	if (processSafetyNetInstalled) return;
	processSafetyNetInstalled = true;
	process.on('unhandledRejection', (reason) => {
		webLogger.error(
			{ err: reason },
			'Unhandled promise rejection (contained; panel kept alive)',
		);
	});
	process.on('uncaughtException', (error) => {
		webLogger.error({ err: error }, 'Uncaught exception (logged; exiting for a clean restart)');
		process.exit(1);
	});
}

export async function probePublicInterface(
	hostname: string,
	port: number,
	timeoutMs: number,
): Promise<null | string> {
	const net = await import('node:net');
	const interfaces = networkInterfaces();
	for (const entries of Object.values(interfaces)) {
		if (!entries) continue;
		for (const entry of entries) {
			if (entry.internal) continue;
			if (entry.family !== 'IPv4') continue;
			const address = entry.address;
			const reachable = await new Promise<boolean>((resolveProbe) => {
				const socket = new net.Socket();
				const timer = setTimeout(() => {
					socket.destroy();
					resolveProbe(false);
				}, timeoutMs);
				socket.connect(port, address, () => {
					clearTimeout(timer);
					socket.destroy();
					resolveProbe(true);
				});
				socket.on('error', () => {
					clearTimeout(timer);
					socket.destroy();
					resolveProbe(false);
				});
			});
			if (reachable) return address;
		}
	}
	return null;
}

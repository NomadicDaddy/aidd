import { defaultIgnoredFolders, type ResolvedConfig } from 'aidd-shared/config';
import { closeSync, mkdirSync, openSync, rmSync, writeFileSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { resolve } from 'node:path';

import { webLogger } from './logger.ts';

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

// Loud dual-channel warning (structured log + stderr) when the unauthenticated control plane is
// bound for remote access. No-op for the localhost default.
export function warnRemoteAccess(hostname: string, port: number): void {
	webLogger.warn(
		{ hostname, port },
		'WARNING: web.allowRemote is true — unauthenticated control plane is reachable from the network',
	);
	console.warn(
		`⚠ WARNING: web.allowRemote is true — the unauthenticated aidd control plane at ` +
			`http://${hostname}:${port} is reachable from the network.`,
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

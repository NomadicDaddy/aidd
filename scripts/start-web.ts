import { parseArgs as parseAiddArgs } from 'aidd-shared/args/index';
import { resolveConfig } from 'aidd-shared/config';
/**
 * Start the aidd web control panel as a detached background process.
 *
 * Spawning detached (like spernakit's start.ts) ensures the backend process
 * owns its own lifecycle. When stop-web.ts sends the graceful shutdown request
 * (POST /admin/shutdown), the backend calls app.stop(true) and releases its TCP
 * socket cleanly. This prevents the orphaned socket binding that occurs when a
 * non-detached child is killed without a catchable signal on Windows.
 *
 * Output is redirected to rotating log files in logs/. The backend writes its
 * own PID file (logs/backend.pid) after binding the port, which stop-web.ts
 * consumes for shutdown.
 */
import { closeSync, existsSync, mkdirSync, openSync } from 'node:fs';
import net from 'node:net';
import { join, resolve } from 'node:path';
import { parseArgs as parseNodeArgs } from 'node:util';

const repoRoot = resolve(import.meta.dirname, '..');
const logsDir = join(repoRoot, 'logs');
const PORT_READY_TIMEOUT_MS = 30_000;
const PORT_PROBE_INTERVAL_MS = 500;
const PORT_RELEASE_TIMEOUT_MS = 30_000;

interface StartWebOptions {
	foreground: boolean;
	waitForRelease: boolean;
	waitForReleasePort: null | number;
}

export function parseStartWebArgs(argv: string[]): StartWebOptions {
	const { values } = parseNodeArgs({
		args: argv,
		options: {
			foreground: { type: 'boolean' },
			'wait-for-release': { type: 'boolean' },
			'wait-for-release-port': { type: 'string' },
		},
		strict: true,
	});

	const releasePort =
		typeof values['wait-for-release-port'] === 'string'
			? Number(values['wait-for-release-port'])
			: null;
	if (
		releasePort !== null &&
		(!Number.isInteger(releasePort) || releasePort < 1 || releasePort > 65535)
	) {
		throw new Error('--wait-for-release-port must be an integer between 1 and 65535');
	}

	return {
		foreground: values.foreground === true,
		waitForRelease: values['wait-for-release'] === true,
		waitForReleasePort: releasePort,
	};
}

async function resolveWebPort(): Promise<number> {
	const config = await resolveConfig(parseAiddArgs(['--web']), { baseDir: repoRoot });
	if (!config.web) {
		throw new Error('web config is not available');
	}
	return config.web.port;
}

export function resolveReleasePort(options: StartWebOptions, targetPort: number): number {
	return options.waitForReleasePort ?? targetPort;
}

function openLogFd(filename: string): number {
	return openSync(join(logsDir, filename), 'a');
}

export function createBackendSpawnOptions(stdoutFd: number, stderrFd: number) {
	return {
		cwd: resolve(repoRoot, 'backend'),
		detached: true,
		stderr: stderrFd,
		stdin: 'ignore' as const,
		stdout: stdoutFd,
		windowsHide: true,
	};
}

export function createBackendForegroundSpawnOptions() {
	return {
		cwd: resolve(repoRoot, 'backend'),
		stderr: 'inherit' as const,
		stdin: 'inherit' as const,
		stdout: 'inherit' as const,
		windowsHide: true,
	};
}

async function waitForPort(port: number): Promise<boolean> {
	const deadline = Date.now() + PORT_READY_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const available = await new Promise<boolean>((res) => {
			const socket = new net.Socket();
			socket.setTimeout(PORT_PROBE_INTERVAL_MS);
			socket.once('connect', () => {
				socket.destroy();
				res(true);
			});
			socket.once('error', () => {
				socket.destroy();
				res(false);
			});
			socket.once('timeout', () => {
				socket.destroy();
				res(false);
			});
			socket.connect(port, '127.0.0.1');
		});
		if (available) return true;
	}
	return false;
}

async function runForegroundBackend(port: number): Promise<number> {
	const proc = Bun.spawn([process.execPath, 'src/app.ts'], createBackendForegroundSpawnOptions());
	if (!proc.pid) {
		console.error('Failed to spawn backend process');
		return 1;
	}
	const stopBackendGracefully = (): void => {
		Bun.spawnSync([process.execPath, 'run', 'stop:web'], {
			cwd: repoRoot,
			stderr: 'inherit',
			stdout: 'inherit',
			windowsHide: true,
		});
	};
	process.once('SIGINT', stopBackendGracefully);
	process.once('SIGTERM', stopBackendGracefully);
	try {
		console.log(`aidd web control panel starting on port ${port}...`);
		const startup = await Promise.race([
			proc.exited.then((exitCode) => ({ exitCode, status: 'exit' as const })),
			waitForPort(port).then((ready) => ({ ready, status: 'ready' as const })),
		]);
		if (startup.status === 'exit') return startup.exitCode ?? 1;
		if (!startup.ready) {
			console.error(`Backend failed to start within ${PORT_READY_TIMEOUT_MS / 1000}s`);
			stopBackendGracefully();
			return 1;
		}
		console.log(`aidd web control panel running at http://127.0.0.1:${port}`);
		console.log('   Foreground logs streaming in this terminal');
		console.log('   Stop: Ctrl+C or bun run stop:web from another terminal');
		return (await proc.exited) ?? 0;
	} finally {
		process.removeListener('SIGINT', stopBackendGracefully);
		process.removeListener('SIGTERM', stopBackendGracefully);
	}
}

async function waitForPortReleased(port: number): Promise<boolean> {
	const deadline = Date.now() + PORT_RELEASE_TIMEOUT_MS;
	while (Date.now() < deadline) {
		const occupied = await new Promise<boolean>((res) => {
			const socket = new net.Socket();
			socket.setTimeout(PORT_PROBE_INTERVAL_MS);
			socket.once('connect', () => {
				socket.destroy();
				res(true);
			});
			socket.once('error', () => {
				socket.destroy();
				res(false);
			});
			socket.once('timeout', () => {
				socket.destroy();
				res(true);
			});
			socket.connect(port, '127.0.0.1');
		});
		if (!occupied) return true;
		await Bun.sleep(PORT_PROBE_INTERVAL_MS);
	}
	return false;
}

async function main(argv: string[]): Promise<number> {
	const options = parseStartWebArgs(argv);
	const port = await resolveWebPort();
	const releasePort = resolveReleasePort(options, port);

	if (!existsSync(logsDir)) {
		mkdirSync(logsDir, { recursive: true });
	}

	if (options.waitForRelease) {
		console.log(`Waiting for existing aidd web listener on port ${releasePort} to stop...`);
		if (!(await waitForPortReleased(releasePort))) {
			console.error(
				`Existing backend did not release port ${releasePort} within ${
					PORT_RELEASE_TIMEOUT_MS / 1000
				}s`
			);
			return 1;
		}
	} else {
		const stopResult = Bun.spawnSync([process.execPath, 'run', 'stop:web'], {
			cwd: repoRoot,
			stderr: 'inherit',
			stdout: 'inherit',
			windowsHide: true,
		});

		if (stopResult.exitCode === 1) {
			console.error('Failed to stop existing backend');
			return 1;
		}
	}

	if (options.foreground) {
		return await runForegroundBackend(port);
	}

	const stdoutFd = openLogFd('backend.log');
	const stderrFd = openLogFd('backend.error.log');

	// Bun.spawn (not node:child_process.spawn) so the backend never inherits a listen
	// socket from this launcher's parent in the restart chain — see appLauncher/launcher.ts
	// for the full Windows rationale. Detached lifetime comes from unref().
	const proc = Bun.spawn(
		[process.execPath, 'src/app.ts'],
		createBackendSpawnOptions(stdoutFd, stderrFd)
	);

	proc.unref();
	closeSync(stdoutFd);
	closeSync(stderrFd);

	if (!proc.pid) {
		console.error('Failed to spawn backend process');
		return 1;
	}

	console.log(`aidd web control panel starting on port ${port}...`);

	const ready = await waitForPort(port);
	if (!ready) {
		console.error(`Backend failed to start within ${PORT_READY_TIMEOUT_MS / 1000}s`);
		console.error(`Check logs at ${logsDir}/backend.error.log`);
		return 1;
	}

	console.log(`aidd web control panel running at http://127.0.0.1:${port}`);
	console.log(`   Logs: ${logsDir}/`);
	console.log(`   Stop: bun run stop:web`);

	return 0;
}

if (import.meta.main) {
	process.exit(await main(process.argv.slice(2)));
}

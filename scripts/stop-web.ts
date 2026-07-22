import { parseArgs as parseAiddArgs } from 'aidd-shared/args/index';
import { resolveConfig } from 'aidd-shared/config';
import { Database } from 'bun:sqlite';
import { join, resolve } from 'node:path';

import { forceStopAllowed, parseStopWebArgs } from './lib/stop-web/args.ts';
import {
	findOrphanedSocketPids,
	findPidsOnPort,
	isProcessAlive,
	killProcessTree,
	reportOrphanedSocket,
	type ActiveRunPortPin,
	stopPidFileProcess,
	waitForPortReleased,
} from './lib/stop-web/process-control.ts';

export { forceStopAllowed, parseStopWebArgs, type StopWebOptions } from './lib/stop-web/args.ts';
export { isProcessAlive, parseNetstatListeningPids } from './lib/stop-web/process-control.ts';

/**
 * Stop the aidd web control panel.
 *
 * This is intentionally scoped to the web listener. It does not write the
 * orchestration `.aidd/.stop` sentinel used by CLI runs.
 */
const repoRoot = resolve(import.meta.dirname, '..');
const logsDir = join(repoRoot, 'logs');
const defaultDataDir = join(repoRoot, 'data');

async function resolveWebPort(portOverride: null | number): Promise<number> {
	if (portOverride !== null) return portOverride;
	const config = await resolveConfig(parseAiddArgs(['--web']), { baseDir: repoRoot });
	if (!config.web) {
		throw new Error('web config is not available');
	}
	return config.web.port;
}

/** Loopback path that triggers the backend's own graceful shutdown handler. */
const GRACEFUL_SHUTDOWN_PATH = '/api/v1/admin/shutdown';

/**
 * Ask the running backend to shut itself down gracefully. This is the preferred
 * path on every platform: the backend closes its own listener via app.stop(true),
 * so the socket is released cleanly. Crucially on Windows it avoids taskkill /F,
 * which delivers no catchable signal and leaves an orphaned port binding.
 *
 * Loopback callers are exempt from the bearer-token guard, so no token is needed.
 * Returns true only if the backend accepted the request (2xx).
 */
async function requestGracefulShutdown(port: number): Promise<boolean> {
	try {
		const response = await fetch(`http://127.0.0.1:${port}${GRACEFUL_SHUTDOWN_PATH}`, {
			method: 'POST',
			signal: AbortSignal.timeout(3_000),
		});
		return response.ok;
	} catch {
		// No listener, connection refused, or a build predating this endpoint —
		// fall through to the kill path.
		return false;
	}
}

export function listLiveRunningRuns(dataDir = defaultDataDir): ActiveRunPortPin[] {
	let db: Database | null = null;
	try {
		db = new Database(join(dataDir, 'aidd-panel.db'), { readonly: true });
		const rows = db
			.query(
				`select id, pid, project_path as projectPath
				 from runs
				 where status = 'running' and pid is not null
				 order by started_at desc`
			)
			.all() as { id: string; pid: number; projectPath: string }[];
		return rows.filter((row) => Number.isInteger(row.pid) && isProcessAlive(row.pid));
	} catch {
		return [];
	} finally {
		db?.close();
	}
}

export interface StopWebResult {
	/** True if we terminated at least one live process holding the port. */
	killedAny: boolean;
	/** Dead PIDs the OS still attributes to the port (orphaned socket only). */
	orphanedPids: number[];
	/**
	 * True if the port is still bound after our attempts but every PID reported
	 * for it no longer exists — an orphaned/ghost socket left by an
	 * ungracefully-terminated server. There is no process to kill in this case.
	 */
	orphanedSocket: boolean;
}

export async function stopWeb(port: number): Promise<StopWebResult> {
	let killedAny = await stopPidFileProcess(logsDir, port);
	for (let attempt = 0; attempt < 3; attempt++) {
		const pids = findPidsOnPort(port)
			.map(Number)
			.filter((pid) => pid !== process.pid);
		const alive = pids.filter((pid) => isProcessAlive(pid));
		// A PID reported for the port that no longer exists cannot be killed; it
		// is a stale socket binding, not a running server. Don't pretend we
		// stopped it.
		if (alive.length === 0) break;
		for (const pid of alive) {
			const killed = await killProcessTree(pid, `web port ${port}`);
			killedAny = killedAny || killed;
		}
		await Bun.sleep(300);
	}

	const remaining = findPidsOnPort(port)
		.map(Number)
		.filter((pid) => pid !== process.pid);
	const orphanedPids = remaining.filter((pid) => !isProcessAlive(pid));
	const orphanedSocket = remaining.length > 0 && orphanedPids.length === remaining.length;
	return { killedAny, orphanedPids, orphanedSocket };
}

export async function runStopWeb(argv: string[]): Promise<number> {
	try {
		const options = parseStopWebArgs(argv);
		const port = await resolveWebPort(options.port);
		console.log(`Stopping aidd web control panel on port ${port}...`);
		// Pre-flight: a port already held only by dead PID(s) is an orphaned binding.
		// Neither graceful shutdown nor a kill can free it (no live process exists), so
		// report it immediately rather than timing out a shutdown POST against a dead
		// socket and surfacing later as an opaque "unhealthy after start".
		const preflightOrphan = findOrphanedSocketPids(port);
		if (preflightOrphan) {
			reportOrphanedSocket(port, preflightOrphan, listLiveRunningRuns());
			return 2;
		}
		// Prefer the backend's own graceful shutdown: it closes its listener cleanly
		// and releases the port, avoiding the orphaned-socket binding that taskkill /F
		// leaves behind on Windows. Only escalate to killing if it doesn't comply.
		if (await requestGracefulShutdown(port)) {
			console.log('   Requested graceful shutdown; waiting for the listener to close...');
			// Allow more than the backend's own shutdown timeout (SHUTDOWN_TIMEOUT_MS).
			if (await waitForPortReleased(port, 8_000)) {
				console.log('aidd web control panel stopped (graceful).');
				return 0;
			}
			console.log('   Graceful shutdown did not release the port in time; escalating.');
		}
		const remaining = findPidsOnPort(port)
			.map(Number)
			.filter((pid) => pid !== process.pid);
		if (remaining.length === 0) {
			console.log(`No aidd web listener found on port ${port}.`);
			return 0;
		}
		const remainingOrphanedPids = remaining.filter((pid) => !isProcessAlive(pid));
		if (remainingOrphanedPids.length === remaining.length) {
			reportOrphanedSocket(port, remainingOrphanedPids, listLiveRunningRuns());
			return 2;
		}
		if (!forceStopAllowed(options)) {
			console.log(
				'   Graceful shutdown did not complete. Refusing to force-kill aidd on Windows by default.'
			);
			console.log('   Re-run with `bun run stop:web -- --force` to use taskkill /F /T.');
			return 2;
		}
		const { killedAny, orphanedPids, orphanedSocket } = await stopWeb(port);
		if (orphanedSocket) {
			reportOrphanedSocket(port, orphanedPids, listLiveRunningRuns());
			return 2;
		}
		if (killedAny) {
			console.log('aidd web control panel stopped.');
		} else {
			console.log(`No aidd web listener found on port ${port}.`);
		}
		return 0;
	} catch (err) {
		const message = err instanceof Error ? err.message : String(err);
		console.error(`Error: ${message}`);
		return 1;
	}
}

if (import.meta.main) {
	process.exit(await runStopWeb(process.argv.slice(2)));
}

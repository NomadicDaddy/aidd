import { isProcessAlive } from 'aidd-shared/lib/processTree';
import {
	activeRunFilePath,
	CLI_ACTIVE_RUN_STALE_MS,
	type CliActiveRunRecord,
	runProcessLiveness,
} from 'aidd-shared/metadata/active-runs';
import { runStopFilePath } from 'aidd-shared/metadata/paths';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

// What Stop and Kill can know about a run's process: whether it is there to signal, and its stop file.

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

export async function clearRunStopFile(projectPath: string, runId: string): Promise<void> {
	await rm(runStopFilePath(projectPath, runId), { force: true });
}

// The request a run reads before its first iteration and between iterations: it stops.
export async function leaveStopRequest(projectPath: string, runId: string): Promise<string> {
	const stopFile = runStopFilePath(projectPath, runId);
	await mkdir(dirname(stopFile), { recursive: true });
	await writeFile(stopFile, `${new Date().toISOString()}\n`);
	return stopFile;
}

// A missing, dead, or stale-heartbeat pid is treated as dead so Stop/Kill never signals a reused pid.
//
// `starting` is the one case that is neither: no heartbeat and no pid, inside the startup window.
// A detached launch records its pid only with the first heartbeat, and on Windows the launch
// bridge never records one, so a run that is seconds old looks exactly like a dead one. The orphan
// sweep already spares it (activeRunSweep.ts); Stop and Kill have to agree, or they mark the row
// terminal while the child is still coming up and it then runs with nothing able to stop it.
export async function resolveRunProcess(
	projectPath: string,
	runId: string,
	fallbackPid: null | number,
	startedAt: number,
): Promise<{ alive: boolean; pid: null | number; starting: boolean }> {
	const heartbeat = await readHeartbeat(projectPath, runId);
	const pid = heartbeat?.pid ?? fallbackPid ?? null;
	if (pid === null) {
		const starting = !heartbeat && Date.now() - startedAt <= CLI_ACTIVE_RUN_STALE_MS;
		return { alive: false, pid: null, starting };
	}
	if (!isProcessAlive(pid)) return { alive: false, pid, starting: false };
	if (heartbeat && Date.now() - heartbeat.heartbeatAt > CLI_ACTIVE_RUN_STALE_MS) {
		// A stale heartbeat with a live pid is either this run, still working but failing to write
		// its heartbeat, or a reused pid. Only a recorded start time tells them apart. When it
		// matches, Stop must leave its request and Kill must signal: driving the row terminal would
		// leave the run editing the repository with nothing able to stop it. Without a match
		// (unknown or different) the pid is never signalled.
		const liveness = await runProcessLiveness(pid, heartbeat.pidStartId ?? null);
		return { alive: liveness === 'alive', pid, starting: false };
	}
	return { alive: true, pid, starting: false };
}

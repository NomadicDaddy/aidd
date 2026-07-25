import { readFile, stat } from 'node:fs/promises';
import { join } from 'node:path';

import { isPidAlive } from './shared.ts';

export interface SpernakitPidFile {
	modifiedAt: number;
	pid: number;
}

async function readSpernakitPidFiles(projectPath: string): Promise<SpernakitPidFile[]> {
	const pidFiles: SpernakitPidFile[] = [];
	for (const name of ['backend', 'frontend'] as const) {
		try {
			const pidPath = join(projectPath, 'logs', `${name}.pid`);
			const [raw, stats] = await Promise.all([readFile(pidPath, 'utf8'), stat(pidPath)]);
			const pid = Number(raw.trim());
			if (Number.isInteger(pid) && pid > 0) {
				pidFiles.push({ modifiedAt: Math.trunc(stats.mtimeMs), pid });
			}
		} catch {
			// Missing PID files mean the app has not been started through the spernakit launcher.
		}
	}
	return pidFiles;
}

export async function readSpernakitPids(projectPath: string): Promise<number[]> {
	const pidFiles = await readSpernakitPidFiles(projectPath);
	return pidFiles.map((pidFile) => pidFile.pid);
}

export async function primarySpernakitPid(projectPath: string): Promise<null | number> {
	const pids = await readSpernakitPids(projectPath);
	return pids.find((pid) => isPidAlive(pid)) ?? pids[0] ?? null;
}

export async function freshLiveSpernakitPidFile(
	projectPath: string,
	freshAfter: number,
): Promise<SpernakitPidFile | undefined> {
	const pidFiles = await readSpernakitPidFiles(projectPath);
	return pidFiles.find((pidFile) => pidFile.modifiedAt > freshAfter && isPidAlive(pidFile.pid));
}

import { runStopFilePath, stopFilePath } from 'aidd-shared/metadata/paths';
import { stat } from 'node:fs/promises';

import type { RunRecord } from '../../types.ts';

// Marks running run records whose run or project has a pending stop request. A run-specific file
// comes from the web Stop action; `.aidd/.stop` comes from the project-wide CLI/Ctrl+C surfaces.
// The CLI honors either at its next gate, so their existence is the durable
// "stop requested, still winding down" signal. Deriving the flag here (instead of persisting a
// column or heartbeat field) keeps it correct across every stop surface (web Stop button, Ctrl+C,
// `aidd --stop`) and self-heals once the run terminalizes or a fresh run clears the file.
//
async function stopFileExists(projectPath: string): Promise<boolean> {
	try {
		await stat(stopFilePath(projectPath));
		return true;
	} catch {
		return false;
	}
}

async function runStopFileExists(projectPath: string, runId: string): Promise<boolean> {
	try {
		await stat(runStopFilePath(projectPath, runId));
		return true;
	} catch {
		return false;
	}
}

export async function annotateStopRequested(records: RunRecord[]): Promise<RunRecord[]> {
	const runningPaths = [
		...new Set(
			records
				.filter((record) => record.status === 'running')
				.map((record) => record.projectPath),
		),
	];
	if (runningPaths.length === 0) return records;
	const stopRequestedByPath = new Map(
		await Promise.all(
			runningPaths.map(async (path) => [path, await stopFileExists(path)] as const),
		),
	);
	return await Promise.all(
		records.map(async (record) =>
			record.status === 'running' &&
			(stopRequestedByPath.get(record.projectPath) ||
				(await runStopFileExists(record.projectPath, record.id)))
				? { ...record, stopRequested: true }
				: record,
		),
	);
}

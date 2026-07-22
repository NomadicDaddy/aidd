import { stopFilePath } from 'aidd-shared/metadata/paths';
import { stat } from 'node:fs/promises';

import type { RunRecord } from '../../types.ts';

// Marks running run records whose project has a pending stop request. The stop file
// (`.aidd/.stop`) IS the stop mechanism — stopRun/requestCliRunStop write it, the CLI honors it at
// its next gate, and the next run's startup clears it — so its existence is the single durable
// "stop requested, still winding down" signal. Deriving the flag here (instead of persisting a
// column or heartbeat field) keeps it correct across every stop surface (web Stop button, Ctrl+C,
// `aidd --stop`) and self-heals once the run terminalizes or a fresh run clears the file.
//
// The file is project-scoped, so every running run of that project is flagged — which matches
// runtime behavior: they all poll the same stop file and all stop.

async function stopFileExists(projectPath: string): Promise<boolean> {
	try {
		await stat(stopFilePath(projectPath));
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
				.map((record) => record.projectPath)
		),
	];
	if (runningPaths.length === 0) return records;
	const stopRequestedByPath = new Map(
		await Promise.all(
			runningPaths.map(async (path) => [path, await stopFileExists(path)] as const)
		)
	);
	return records.map((record) =>
		record.status === 'running' && stopRequestedByPath.get(record.projectPath)
			? { ...record, stopRequested: true }
			: record
	);
}

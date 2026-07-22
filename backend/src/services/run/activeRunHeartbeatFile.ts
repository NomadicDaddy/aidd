import { activeRunFilePath, type CliActiveRunRecord } from 'aidd-shared/metadata/active-runs';
import { readFile } from 'node:fs/promises';

import type { WebRunStatus } from '../../types.ts';

export interface ResumeRunInfo {
	projectPath: string;
	runId: string;
}

// One run force-failed by the in-session orphan sweep. Returned to RunService so it can run the
// side effects that depend on resources activeRunQueries does not own: stopping the launch-time
// RunTailWatcher and closing the matching invocation-telemetry row.
export interface SweptRunInfo {
	completedAt: number;
	durationMs: number;
	errorMessage: string;
	runId: string;
	source: string;
}

export async function readHeartbeatRecord(
	projectPath: string,
	runId: string
): Promise<CliActiveRunRecord | undefined> {
	try {
		const raw = await readFile(activeRunFilePath(projectPath, runId), 'utf8');
		return JSON.parse(raw) as CliActiveRunRecord;
	} catch {
		return undefined;
	}
}

export function terminalStatusFromHeartbeat(record: CliActiveRunRecord): WebRunStatus {
	if (record.state === 'completed') return 'completed';
	if (record.state === 'stopped') return 'stopped';
	if (record.state === 'waiting_approval') return 'waiting_approval';
	return 'failed';
}

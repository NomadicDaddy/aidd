import { basename } from 'node:path';

import { metadataPath } from '../paths.ts';

export const ACTIVE_RUNS_DIR = 'active-runs';

/**
 * A run id becomes a filename, so it must not be able to steer the write anywhere else.
 * Rejecting rather than sanitizing: an id that needed sanitizing did not come from
 * `createCliActiveRunId`, and silently writing it under a different name would split one run
 * across two records.
 */
export function assertRunIdFileSafe(id: string): string {
	if (
		id.length === 0 ||
		id !== basename(id) ||
		id.includes('/') ||
		id.includes('\\') ||
		id.includes('..')
	) {
		throw new Error(`Invalid active run id: ${id}`);
	}
	return id;
}

export function activeRunsDir(projectDir: string): string {
	return metadataPath(projectDir, ACTIVE_RUNS_DIR);
}

export function activeRunFilePath(projectDir: string, id: string): string {
	return metadataPath(projectDir, ACTIVE_RUNS_DIR, `${assertRunIdFileSafe(id)}.json`);
}

export function createCliActiveRunId(now = Date.now(), randomId = crypto.randomUUID()): string {
	return `cli_${now}_${randomId.replaceAll('-', '').slice(0, 8)}`;
}

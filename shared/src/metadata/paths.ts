import { join } from 'node:path';

export const METADATA_DIR = '.aidd';
export const STOP_FILE = '.stop';

export function metadataPath(projectDir: string, ...segments: string[]): string {
	return join(projectDir, METADATA_DIR, ...segments);
}

export function stopFilePath(projectDir: string): string {
	return metadataPath(projectDir, STOP_FILE);
}

/** Stop signal scoped to one run, so concurrent read-only runs do not stop together. */
export function runStopFilePath(projectDir: string, runId: string): string {
	if (!/^[A-Za-z0-9_-]+$/.test(runId)) throw new Error(`Unsafe run id: ${runId}`);
	return metadataPath(projectDir, `${STOP_FILE}-${runId}`);
}

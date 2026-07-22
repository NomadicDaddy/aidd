import { join } from 'node:path';

export const METADATA_DIR = '.aidd';
export const STOP_FILE = '.stop';

export function metadataPath(projectDir: string, ...segments: string[]): string {
	return join(projectDir, METADATA_DIR, ...segments);
}

export function stopFilePath(projectDir: string): string {
	return metadataPath(projectDir, STOP_FILE);
}

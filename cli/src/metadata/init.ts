import { ensureHistoryGuard } from 'aidd-shared/metadata/history-guard';
import { metadataPath } from 'aidd-shared/metadata/paths';
import { mkdir } from 'node:fs/promises';

// Creating .aidd/ and guarding it are one act, not two. Every ingestion lane passes through here,
// but only some init git — so hooking git-init guards only those, and misses `Ingest Existing`
// entirely (the lane that writes .aidd/ into a repo that already has a remote). See
// shared/src/metadata/history-guard.ts.
export async function ensureMetadata(projectDir: string, rootDir?: string): Promise<void> {
	await mkdir(metadataPath(projectDir, 'iterations'), { recursive: true });
	await mkdir(metadataPath(projectDir, 'features'), { recursive: true });
	if (rootDir !== undefined) await ensureHistoryGuard(projectDir, rootDir);
}

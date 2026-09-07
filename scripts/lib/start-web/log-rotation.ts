/**
 * Bounded rotation for the detached web backend's log files.
 *
 * The launcher redirects the detached backend's stdout and stderr into fixed append-only files,
 * so without a bound they grow for as long as the panel is used. Nothing supervises the process,
 * so rotation happens here, at startup, while both files are guaranteed to be closed.
 */
import {
	BACKEND_LOG_ARCHIVE_MAX_AGE_MS,
	BACKEND_LOG_MAX_ARCHIVES,
	BACKEND_LOG_MAX_BYTES,
} from 'aidd-shared/retention';
import { renameSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** Streams the launcher redirects; each is bounded on its own size. */
export const BACKEND_LOG_FILES = ['backend.log', 'backend.error.log'] as const;

export const MAX_LOG_ARCHIVES = BACKEND_LOG_MAX_ARCHIVES;
export const MAX_LOG_BYTES = BACKEND_LOG_MAX_BYTES;
export const MAX_LOG_ARCHIVE_AGE_MS = BACKEND_LOG_ARCHIVE_MAX_AGE_MS;

export type RotationOutcome = 'failed' | 'rotated' | 'skipped';

export interface RotationResult {
	file: string;
	outcome: RotationOutcome;
	reason: string;
}

function isMissing(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

function sizeOf(path: string): null | number {
	try {
		return statSync(path).size;
	} catch (err) {
		if (isMissing(err)) return null;
		throw err;
	}
}

/** Remove archives whose filesystem age exceeds the retention window. */
export function pruneExpiredLogArchives(
	logsDir: string,
	filename: string,
	maxArchives: number = MAX_LOG_ARCHIVES,
	now: number = Date.now(),
): number {
	let removed = 0;
	for (let index = 1; index <= maxArchives; index += 1) {
		const path = join(logsDir, `${filename}.${index}`);
		try {
			if (statSync(path).mtimeMs >= now - MAX_LOG_ARCHIVE_AGE_MS) continue;
			rmSync(path, { force: true });
			removed += 1;
		} catch (err) {
			if (!isMissing(err)) throw err;
		}
	}
	return removed;
}

/**
 * Rotate one log file if it has reached `maxBytes`, keeping at most `maxArchives` archives
 * named `<file>.1` (newest) through `<file>.<maxArchives>` (oldest).
 */
export function rotateLogFile(
	logsDir: string,
	filename: string,
	maxBytes: number = MAX_LOG_BYTES,
	maxArchives: number = MAX_LOG_ARCHIVES,
): RotationResult {
	pruneExpiredLogArchives(logsDir, filename, maxArchives);
	const active = join(logsDir, filename);
	const size = sizeOf(active);
	if (size === null) return { file: filename, outcome: 'skipped', reason: 'no log file yet' };
	if (size < maxBytes) {
		return { file: filename, outcome: 'skipped', reason: `${size} bytes is under the limit` };
	}

	const archive = (index: number): string => join(logsDir, `${filename}.${index}`);
	try {
		// Drop the oldest archive before shifting so the cap holds even if a previous run left a
		// full sequence behind. Walking downwards keeps a partial sequence intact: an index with
		// no file is skipped rather than collapsing the gap.
		rmSync(archive(maxArchives), { force: true });
		for (let index = maxArchives - 1; index >= 1; index -= 1) {
			if (sizeOf(archive(index)) === null) continue;
			renameSync(archive(index), archive(index + 1));
		}
		// Rename rather than truncate. The bytes are secured under `.1` before the active path is
		// free, so an interrupted rotation loses no log content.
		renameSync(active, archive(1));
	} catch (err) {
		// Windows refuses to rename a file another handle still holds open. A failed rotation
		// leaves the active log exactly as it was; the backend keeps appending to it and the next
		// start tries again.
		return {
			file: filename,
			outcome: 'failed',
			reason: err instanceof Error ? err.message : String(err),
		};
	}

	return { file: filename, outcome: 'rotated', reason: `rotated at ${size} bytes` };
}

/** Rotate both detached backend streams. Each stream is evaluated independently. */
export function rotateBackendLogs(logsDir: string): RotationResult[] {
	return BACKEND_LOG_FILES.map((filename) => rotateLogFile(logsDir, filename));
}

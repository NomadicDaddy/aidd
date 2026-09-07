import {
	BACKEND_LOG_ARCHIVE_MAX_AGE_MS,
	BACKEND_LOG_MAX_ARCHIVES,
	BACKEND_LOG_MAX_BYTES,
} from 'aidd-shared/retention';
import { copyFile, rename, rm, stat, truncate } from 'node:fs/promises';
import { join } from 'node:path';

import { webLogger } from '../logger.ts';

const BACKEND_LOG_FILES = ['backend.log', 'backend.error.log'] as const;
const LOG_SIZE_CHECK_INTERVAL_MS = 30_000;

function isMissing(error: unknown): boolean {
	return (
		typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT'
	);
}

async function moveIfPresent(source: string, destination: string): Promise<void> {
	try {
		await rename(source, destination);
	} catch (err) {
		if (!isMissing(err)) throw err;
	}
}

async function pruneExpired(logsDir: string, filename: string, now: number): Promise<void> {
	for (let index = 1; index <= BACKEND_LOG_MAX_ARCHIVES; index += 1) {
		const path = join(logsDir, `${filename}.${index}`);
		try {
			if ((await stat(path)).mtimeMs < now - BACKEND_LOG_ARCHIVE_MAX_AGE_MS) {
				await rm(path, { force: true });
			}
		} catch (err) {
			if (!isMissing(err)) throw err;
		}
	}
}

/**
 * Rotate one open append-only backend log by copying its bytes and truncating the active file.
 * @param logsDir Directory containing the active backend logs.
 * @param filename Active log filename.
 * @param maxBytes Size at which rotation begins.
 * @param now Current time used for archive expiry.
 * @returns Whether the active log was rotated.
 */
export async function rotateLiveBackendLog(
	logsDir: string,
	filename: string,
	maxBytes: number = BACKEND_LOG_MAX_BYTES,
	now: number = Date.now(),
): Promise<boolean> {
	await pruneExpired(logsDir, filename, now);
	const active = join(logsDir, filename);
	try {
		if ((await stat(active)).size < maxBytes) return false;
	} catch (err) {
		if (isMissing(err)) return false;
		throw err;
	}
	await rm(join(logsDir, `${filename}.${BACKEND_LOG_MAX_ARCHIVES}`), { force: true });
	for (let index = BACKEND_LOG_MAX_ARCHIVES - 1; index >= 1; index -= 1) {
		await moveIfPresent(
			join(logsDir, `${filename}.${index}`),
			join(logsDir, `${filename}.${index + 1}`),
		);
	}
	await copyFile(active, join(logsDir, `${filename}.1`));
	// The detached launcher opened stdout/stderr in append mode. Truncating the same active path
	// keeps those descriptors valid, and the next write resumes at the new end without a restart.
	await truncate(active, 0);
	return true;
}

/**
 * Keep the detached backend streams bounded for the full process lifetime.
 * @param logsDir Directory containing the backend logs.
 * @returns A disposer that stops periodic rotation.
 */
export function startBackendLogRotation(logsDir: string): () => void {
	let running = false;
	const timer = setInterval(() => {
		if (running) return;
		running = true;
		void Promise.all(
			BACKEND_LOG_FILES.map((filename) => rotateLiveBackendLog(logsDir, filename)),
		)
			.catch((error: unknown) => {
				webLogger.warn({ error }, 'Live backend log rotation failed');
			})
			.finally(() => {
				running = false;
			});
	}, LOG_SIZE_CHECK_INTERVAL_MS);
	timer.unref?.();
	return () => clearInterval(timer);
}

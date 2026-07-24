import { mkdir, readdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';

import {
	ACTIVE_RUNS_DIR,
	ACTIVE_RUN_TEMP_STALE_MS,
	CLI_ACTIVE_RUN_STALE_MS,
	COMPLETED_RUN_TTL_MS,
	activeRunFilePath,
	activeRunsDir,
	isCliRunTerminal,
	parseCliActiveRunRecord,
	type CliActiveRunRecord,
} from './active-runs/record.ts';
import { metadataPath } from './paths.ts';

export {
	CLI_ACTIVE_RUN_STALE_MS,
	EXT_APP_URL_ENV,
	EXT_LOG_PATH_ENV,
	EXT_RUN_ID_ENV,
	EXT_RUN_SOURCE_ENV,
	SUPPRESS_CLI_ACTIVE_RUN_ENV,
	activeRunFilePath,
	activeRunsDir,
	createCliActiveRunRecord,
	isCliActiveRunSuppressed,
	isCliRunTerminal,
	type CliActiveRunRecord,
	type CliActiveRunSource,
} from './active-runs/record.ts';

function isMissingPathError(error: unknown): boolean {
	return (
		typeof error === 'object' &&
		error !== null &&
		'code' in error &&
		(error as { code?: unknown }).code === 'ENOENT'
	);
}

export async function writeCliActiveRunRecord(record: CliActiveRunRecord): Promise<void> {
	const dir = activeRunsDir(record.projectPath);
	await mkdir(dir, { recursive: true });
	const target = activeRunFilePath(record.projectPath, record.id);
	// pid + timestamp + random keeps the temp name unique across concurrent processes (CLI heartbeat
	// vs. web supervisor) writing the same target, so two writers never share a temp path.
	const unique = crypto.randomUUID().replaceAll('-', '').slice(0, 8);
	const tmp = `${target}.${process.pid}.${Date.now()}.${unique}.tmp`;
	try {
		await writeFile(tmp, `${JSON.stringify(record, null, 2)}\n`);
		await rename(tmp, target);
	} catch (error) {
		// A failed write/rename (e.g. Windows EPERM/EEXIST on a concurrent rename) must not leave the
		// temp file orphaned in active-runs/, where it would linger forever (readers only sweep .json).
		await rm(tmp, { force: true });
		throw error;
	}
}

// Best-effort removal of orphaned atomic-write temp files. Normal writes self-clean via the
// try/finally above; this only reclaims temps left by a hard crash/kill mid-write. The age guard
// ensures a temp belonging to a live concurrent writer is never deleted.
export async function sweepStaleActiveRunTempFiles(
	projectDir: string,
	options: { now?: number; olderThanMs?: number } = {}
): Promise<void> {
	const now = options.now ?? Date.now();
	const olderThanMs = options.olderThanMs ?? ACTIVE_RUN_TEMP_STALE_MS;
	let entries: string[];
	try {
		entries = await readdir(activeRunsDir(projectDir));
	} catch (error) {
		if (isMissingPathError(error)) return;
		throw error;
	}
	await Promise.all(
		entries
			.filter((entry) => entry.endsWith('.tmp'))
			.map(async (entry) => {
				const path = metadataPath(projectDir, ACTIVE_RUNS_DIR, entry);
				try {
					const info = await stat(path);
					if (now - info.mtimeMs <= olderThanMs) return;
					await rm(path, { force: true });
				} catch {
					// Ignore races with a concurrent writer or a temp removed by another sweep.
				}
			})
	);
}

export async function removeCliActiveRunRecord(projectDir: string, id: string): Promise<void> {
	await rm(activeRunFilePath(projectDir, id), { force: true });
}

function staleCliRunRecord(record: CliActiveRunRecord, now: number): CliActiveRunRecord {
	return {
		...record,
		completedAt: now,
		durationMs: now - record.startedAt,
		exitCode: record.exitCode ?? 1,
		heartbeatAt: now,
		state: 'failed',
		stopReason: record.stopReason ?? 'heartbeat_stale',
		summary: record.summary ?? 'run heartbeat went stale before final summary',
	};
}

export async function readCliActiveRunRecords(
	projectDir: string,
	options: { includeCompleted?: boolean; now?: number; staleMs?: number } = {}
): Promise<CliActiveRunRecord[]> {
	const now = options.now ?? Date.now();
	const staleMs = options.staleMs ?? CLI_ACTIVE_RUN_STALE_MS;
	const includeCompleted = options.includeCompleted ?? false;
	let entries: string[];
	try {
		entries = await readdir(activeRunsDir(projectDir));
	} catch (error) {
		if (isMissingPathError(error)) return [];
		throw error;
	}

	const records: CliActiveRunRecord[] = [];
	for (const entry of entries) {
		if (!entry.endsWith('.json')) continue;
		try {
			const parsed = JSON.parse(
				await readFile(metadataPath(projectDir, ACTIVE_RUNS_DIR, entry), 'utf8')
			) as unknown;
			const record = parseCliActiveRunRecord(parsed);
			if (!record) continue;
			if (isCliRunTerminal(record)) {
				if (includeCompleted && now - record.heartbeatAt <= COMPLETED_RUN_TTL_MS) {
					records.push(record);
				}
				continue;
			}
			if (now - record.heartbeatAt > staleMs) {
				if (includeCompleted && now - record.heartbeatAt <= COMPLETED_RUN_TTL_MS) {
					records.push(staleCliRunRecord(record, now));
				}
				continue;
			}
			records.push(record);
		} catch {
			continue;
		}
	}
	return records.sort((a, b) => b.startedAt - a.startedAt);
}

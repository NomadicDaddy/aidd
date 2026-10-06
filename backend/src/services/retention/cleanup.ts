import {
	EXECUTION_HISTORY_MAX_AGE_MS,
	TRANSCRIPT_MAX_AGE_MS,
	TRANSCRIPT_MAX_BYTES,
} from 'aidd-shared/retention';
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { readdir, rm, stat } from 'node:fs/promises';
import { isAbsolute, join, relative, resolve } from 'node:path';

import type { WebDatabase } from '../../db/client.ts';

import { invocationEvents, pipelineSessions, runs } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { TERMINAL_STATUSES } from '../run/types.ts';

interface TranscriptCandidate {
	completedAt: null | number;
	id: string;
	logPath: null | string;
	startedAt: number;
	status: string;
}

/**
 * A file under run-logs that no `runs.logPath` references: a CLI run launched with no external
 * context, a spernakit-init log, a Windows launch payload, or the transcript of a row a project
 * purge removed. The sweep bounds these by mtime since there is no row to date them by.
 */
interface UnreferencedTranscript {
	mtime: number;
	path: string;
	size: number;
}

/** An unreferenced file written this recently may belong to a live CLI run; never evict it. */
const UNREFERENCED_GRACE_MS = 24 * 60 * 60 * 1_000;

function pathKey(path: string): string {
	const resolved = resolve(path);
	return process.platform === 'win32' ? resolved.toLowerCase() : resolved;
}

export interface RetentionSweepResult {
	history: { invocations: number; pipelineSessions: number; runs: number };
	transcripts: { bytes: number; removed: number };
}

function isInside(parent: string, candidate: string): boolean {
	const relation = relative(parent, candidate);
	return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation));
}

async function fileSize(path: string): Promise<null | number> {
	try {
		return (await stat(path)).size;
	} catch (err) {
		if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT')
			return null;
		throw err;
	}
}

async function removeTranscript(db: WebDatabase, row: TranscriptCandidate): Promise<boolean> {
	if (!row.logPath) return false;
	try {
		await rm(row.logPath, { force: true });
	} catch (err) {
		webLogger.warn({ err, runId: row.id }, 'Failed to remove expired run transcript');
		return false;
	}
	await db.update(runs).set({ logPath: null }).where(eq(runs.id, row.id));
	return true;
}

async function removeUnreferenced(file: UnreferencedTranscript): Promise<boolean> {
	try {
		await rm(file.path, { force: true });
		return true;
	} catch (err) {
		webLogger.warn({ err, path: file.path }, 'Failed to remove unreferenced run transcript');
		return false;
	}
}

// Every regular file under run-logs that no row references, with the size and mtime to bound it.
async function unreferencedTranscripts(
	transcriptRoot: string,
	referenced: ReadonlySet<string>,
): Promise<UnreferencedTranscript[]> {
	let names: string[];
	try {
		names = await readdir(transcriptRoot);
	} catch (err) {
		if (typeof err === 'object' && err !== null && 'code' in err && err.code === 'ENOENT')
			return [];
		throw err;
	}
	const files: UnreferencedTranscript[] = [];
	for (const name of names) {
		const path = join(transcriptRoot, name);
		if (referenced.has(pathKey(path))) continue;
		let info;
		try {
			info = await stat(path);
		} catch {
			continue;
		}
		if (info.isFile()) files.push({ mtime: info.mtimeMs, path, size: info.size });
	}
	return files;
}

// Sweep run transcripts: every file under run-logs counts toward the byte cap, whether a row
// references it or not. Expiry and eviction run oldest-first over terminal rows (by completion)
// and unreferenced files (by mtime) together; an unreferenced file modified within the last day
// is never touched, since a CLI run with no row writes its transcript there while it runs.
async function sweepTranscripts(
	db: WebDatabase,
	dataDir: string,
	now: number,
): Promise<{ bytes: number; removed: number }> {
	const transcriptRoot = resolve(dataDir, 'run-logs');
	const rows = await db
		.select({
			completedAt: runs.completedAt,
			id: runs.id,
			logPath: runs.logPath,
			startedAt: runs.startedAt,
			status: runs.status,
		})
		.from(runs)
		.where(isNotNull(runs.logPath));
	const candidates = rows.filter(
		(row) => row.logPath && isInside(transcriptRoot, resolve(row.logPath)),
	);
	const sizes = new Map<string, number>();
	const referenced = new Set<string>();
	let bytes = 0;
	for (const row of candidates) {
		const size = await fileSize(row.logPath as string);
		if (size === null) {
			await db.update(runs).set({ logPath: null }).where(eq(runs.id, row.id));
			continue;
		}
		sizes.set(row.id, size);
		referenced.add(pathKey(row.logPath as string));
		bytes += size;
	}
	const unreferenced = await unreferencedTranscripts(transcriptRoot, referenced);
	for (const file of unreferenced) bytes += file.size;

	type Evictable =
		| { at: number; file: UnreferencedTranscript; kind: 'file' }
		| { at: number; kind: 'row'; row: TranscriptCandidate };
	const evictable: Evictable[] = [
		...candidates
			.filter((row) => TERMINAL_STATUSES.has(row.status as never) && sizes.has(row.id))
			.map((row) => ({ at: row.completedAt ?? row.startedAt, kind: 'row' as const, row })),
		...unreferenced
			.filter((file) => file.mtime < now - UNREFERENCED_GRACE_MS)
			.map((file) => ({ at: file.mtime, file, kind: 'file' as const })),
	].sort((left, right) => left.at - right.at);
	let removed = 0;
	for (const entry of evictable) {
		const expired = entry.at < now - TRANSCRIPT_MAX_AGE_MS;
		if (!expired && bytes <= TRANSCRIPT_MAX_BYTES) continue;
		const ok =
			entry.kind === 'row'
				? await removeTranscript(db, entry.row)
				: await removeUnreferenced(entry.file);
		if (ok) {
			bytes -= entry.kind === 'row' ? (sizes.get(entry.row.id) ?? 0) : entry.file.size;
			removed += 1;
		}
	}
	return { bytes, removed };
}

async function pruneHistory(
	db: WebDatabase,
	now: number,
): Promise<RetentionSweepResult['history']> {
	const cutoff = now - EXECUTION_HISTORY_MAX_AGE_MS;
	const invocations = await db
		.delete(invocationEvents)
		.where(
			and(
				lt(invocationEvents.completedAt, cutoff),
				inArray(invocationEvents.status, ['completed', 'failed', 'killed', 'stopped']),
			),
		)
		.returning({ id: invocationEvents.id });
	const removedRuns = await db
		.delete(runs)
		.where(and(lt(runs.completedAt, cutoff), inArray(runs.status, [...TERMINAL_STATUSES])))
		.returning({ id: runs.id });
	const sessions = await db
		.delete(pipelineSessions)
		.where(
			and(
				lt(pipelineSessions.completedAt, cutoff),
				inArray(pipelineSessions.status, [
					'completed',
					'completed_with_failures',
					'failed',
					'stopped',
				]),
			),
		)
		.returning({ id: pipelineSessions.id });
	return {
		invocations: invocations.length,
		pipelineSessions: sessions.length,
		runs: removedRuns.length,
	};
}

/**
 * Apply the local transcript and execution-history retention policy. Repeat-safe by design.
 * @param db Database whose terminal execution history is pruned.
 * @param dataDir Root containing retained run transcripts.
 * @param now Current time used for expiry cutoffs.
 * @returns Counts and bytes remaining after cleanup.
 */
export async function sweepRetention(
	db: WebDatabase,
	dataDir: string,
	now: number = Date.now(),
): Promise<RetentionSweepResult> {
	const transcripts = await sweepTranscripts(db, dataDir, now);
	const history = await pruneHistory(db, now);
	return { history, transcripts };
}

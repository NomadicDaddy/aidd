import {
	EXECUTION_HISTORY_MAX_AGE_MS,
	TRANSCRIPT_MAX_AGE_MS,
	TRANSCRIPT_MAX_BYTES,
} from 'aidd-shared/retention';
import { and, eq, inArray, isNotNull, lt } from 'drizzle-orm';
import { rm, stat } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

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
	let bytes = 0;
	for (const row of candidates) {
		const size = await fileSize(row.logPath as string);
		if (size === null) {
			await db.update(runs).set({ logPath: null }).where(eq(runs.id, row.id));
			continue;
		}
		sizes.set(row.id, size);
		bytes += size;
	}
	const terminal = candidates
		.filter((row) => TERMINAL_STATUSES.has(row.status as never) && sizes.has(row.id))
		.sort(
			(left, right) =>
				(left.completedAt ?? left.startedAt) - (right.completedAt ?? right.startedAt),
		);
	let removed = 0;
	for (const row of terminal) {
		const expired = (row.completedAt ?? row.startedAt) < now - TRANSCRIPT_MAX_AGE_MS;
		if (!expired && bytes <= TRANSCRIPT_MAX_BYTES) continue;
		if (await removeTranscript(db, row)) {
			bytes -= sizes.get(row.id) ?? 0;
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

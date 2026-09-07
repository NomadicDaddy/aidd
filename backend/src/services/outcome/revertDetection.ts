import { metadataPath } from 'aidd-shared/metadata/paths';
import { and, eq, gte, inArray, isNull, or } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { RevertHistorySkipReason } from './revertHistory.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { runs, settings } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { canonicalProjectPath, encodeProjectId } from '../../paths.ts';
import { readTextOrNull } from '../fsHelpers.ts';
import {
	commitRefsFromUnknown,
	type RawRunLedgerEntry,
} from '../projectMetadata/iterationParseHelpers.ts';
import { TERMINAL_STATUSES } from '../run/types.ts';
import {
	countRevertedCommits,
	openRevertHistory,
	REVERT_HISTORY_SLACK_MS,
	REVERT_WINDOW_MS,
} from './revertHistory.ts';

export const REVERT_DETECTION_CURSOR_PREFIX = 'runs.revertDetection.';
/** Bare-key one-shot flag with no project scope; cleared on every sweep so only per-project cursors remain. */
const LEGACY_REVERT_DETECTION_KEY = 'runs.revertDetection';

interface RevertDetectionCursor {
	/** Terminal runs examined by the sweep that wrote this cursor. */
	inspected: number;
	reason?: RevertHistorySkipReason;
	state: 'skipped' | 'swept';
	sweptAt: number;
	/** Rows whose reverted_commits value changed. */
	updated: number;
}

export interface RevertSweepSummary {
	inspected: number;
	projects: number;
	skipped: number;
	updated: number;
}

interface CandidateRun {
	id: string;
	projectPath: string;
	revertedCommits: null | number;
}

export function revertDetectionCursorKey(projectPath: string): string {
	return `${REVERT_DETECTION_CURSOR_PREFIX}${encodeProjectId(canonicalProjectPath(projectPath))}`;
}

async function readLedgerCommits(projectPath: string): Promise<Map<string, string[]>> {
	const byRun = new Map<string, string[]>();
	const content = await readTextOrNull(metadataPath(projectPath, 'runs.jsonl')).catch(() => null);
	if (content === null) return byRun;
	for (const line of content.split(/\r?\n/u)) {
		if (!line.trim()) continue;
		let parsed: RawRunLedgerEntry;
		try {
			parsed = JSON.parse(line) as RawRunLedgerEntry;
		} catch {
			continue;
		}
		if (typeof parsed.runId !== 'string' || parsed.runId.length === 0) continue;
		byRun.set(
			parsed.runId,
			commitRefsFromUnknown(parsed.commitsCreated).map((commit) => commit.hash.toLowerCase()),
		);
	}
	return byRun;
}

async function writeCursor(
	db: WebDatabase,
	projectPath: string,
	cursor: RevertDetectionCursor,
): Promise<void> {
	const value = JSON.stringify(cursor);
	await withSqliteRetry(
		() =>
			db
				.insert(settings)
				.values({ key: revertDetectionCursorKey(projectPath), value })
				.onConflictDoUpdate({
					set: { updatedAt: Date.now(), value },
					target: settings.key,
				}),
		{ label: 'runs.revertDetection.cursor' },
	);
}

async function sweepProject(
	db: WebDatabase,
	projectPath: string,
	candidates: CandidateRun[],
	now: number,
): Promise<RevertDetectionCursor> {
	const history = await openRevertHistory(
		projectPath,
		now - REVERT_WINDOW_MS - REVERT_HISTORY_SLACK_MS,
	);
	if (history.kind === 'skipped') {
		return { inspected: 0, reason: history.reason, state: 'skipped', sweptAt: now, updated: 0 };
	}
	const ledger = await readLedgerCommits(projectPath);
	const references = candidates.flatMap((run) => ledger.get(run.id) ?? []);
	const resolved = await history.resolve(references);
	let updated = 0;
	for (const run of candidates) {
		const attributed = (ledger.get(run.id) ?? []).flatMap((reference) => {
			const commit = resolved.get(reference.toLowerCase());
			return commit ? [commit] : [];
		});
		// No resolvable attributed commit means nothing could be inspected: the row stays NULL
		// rather than claiming a clean zero.
		const revertedCommits =
			attributed.length === 0 ? null : countRevertedCommits(attributed, history.reverts);
		if (revertedCommits === run.revertedCommits) continue;
		try {
			await withSqliteRetry(
				() => db.update(runs).set({ revertedCommits }).where(eq(runs.id, run.id)),
				{ label: 'runs.revertDetection' },
			);
			updated += 1;
		} catch (err) {
			webLogger.warn({ err, runId: run.id }, 'Revert detection: row update failed');
		}
	}
	return { inspected: candidates.length, state: 'swept', sweptAt: now, updated };
}

/**
 * Per-project sweep that records standard git-revert evidence on terminal run rows. Every terminal
 * run started inside the attribution window is re-inspected each time, and any run not yet
 * inspected is inspected once its commits can be resolved; a run's start time bounds its commits'
 * committer dates, so it stands in for them when choosing what to re-read.
 * @param db
 * @param now
 * @returns Counts of projects, runs inspected, rows updated, and projects skipped.
 */
export async function sweepRevertedCommits(
	db: WebDatabase,
	now = Date.now(),
): Promise<RevertSweepSummary> {
	const windowStart = now - REVERT_WINDOW_MS - REVERT_HISTORY_SLACK_MS;
	const candidates: CandidateRun[] = await db
		.select({
			id: runs.id,
			projectPath: runs.projectPath,
			revertedCommits: runs.revertedCommits,
		})
		.from(runs)
		.where(
			and(
				inArray(runs.status, [...TERMINAL_STATUSES]),
				or(isNull(runs.revertedCommits), gte(runs.startedAt, windowStart)),
			),
		);
	// Grouped by canonical path so one project keeps one cursor whatever spelling a row carries.
	const byProject = new Map<string, CandidateRun[]>();
	for (const run of candidates) {
		const projectPath = canonicalProjectPath(run.projectPath);
		const group = byProject.get(projectPath) ?? [];
		group.push(run);
		byProject.set(projectPath, group);
	}
	const summary: RevertSweepSummary = {
		inspected: 0,
		projects: byProject.size,
		skipped: 0,
		updated: 0,
	};
	for (const [projectPath, projectRuns] of byProject) {
		const cursor = await sweepProject(db, projectPath, projectRuns, now);
		if (cursor.state === 'skipped') {
			summary.skipped += 1;
			webLogger.info(
				{ projectPath, reason: cursor.reason },
				'Revert detection: project skipped',
			);
		}
		summary.inspected += cursor.inspected;
		summary.updated += cursor.updated;
		await writeCursor(db, projectPath, cursor);
	}
	await withSqliteRetry(
		() => db.delete(settings).where(eq(settings.key, LEGACY_REVERT_DETECTION_KEY)),
		{ label: 'runs.revertDetection.legacy' },
	).catch(() => undefined);
	return summary;
}

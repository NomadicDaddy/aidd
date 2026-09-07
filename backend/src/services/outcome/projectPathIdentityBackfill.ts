import { eq, like } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { invocationEvents, pipelineSessions, runs, settings } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { canonicalProjectPath, decodeProjectId } from '../../paths.ts';
import {
	type KeyedRewriteCounts,
	rewriteKeyedTables,
	stalePaths,
} from './projectPathIdentityKeyedTables.ts';
import { REVERT_DETECTION_CURSOR_PREFIX } from './revertDetection.ts';

/** Written once the stored project paths carry their canonical spelling. */
export const PROJECT_PATH_IDENTITY_KEY = 'runs.projectPathIdentity';

/**
 * Version the flag records. Version 1 covered runs, pipeline_sessions, and invocation_events;
 * version 2 added app_launches, diary_entries, and scheduled_task_projects. A flag below the
 * current version, or one written without a version, reruns the backfill.
 */
export const PROJECT_PATH_IDENTITY_VERSION = 2;

export interface ProjectPathIdentitySummary extends KeyedRewriteCounts {
	/** Revert-detection cursors keyed on a non-canonical spelling, removed for the sweep to rewrite. */
	cursorsRemoved: number;
	/** True when the flag already carried the current version and nothing was examined. */
	skipped: boolean;
}

type FreeTable = typeof invocationEvents | typeof pipelineSessions | typeof runs;

const LABEL = 'runs.projectPathIdentity';

/**
 * Rewrites a table whose project_path is not part of a key, so every row simply moves.
 * @param db
 * @param table
 * @returns Rows rewritten.
 */
async function rewriteFreeTable(db: WebDatabase, table: FreeTable): Promise<number> {
	let rewritten = 0;
	for (const { canonical, stale } of await stalePaths(db, table)) {
		const updated = await withSqliteRetry(
			() =>
				db
					.update(table)
					.set({ projectPath: canonical })
					.where(eq(table.projectPath, stale))
					.returning({ id: table.id }),
			{ label: `${LABEL}.rewrite` },
		);
		rewritten += updated.length;
	}
	return rewritten;
}

async function removeStaleCursors(db: WebDatabase): Promise<number> {
	const rows = await db
		.select({ key: settings.key })
		.from(settings)
		.where(like(settings.key, `${REVERT_DETECTION_CURSOR_PREFIX}%`));
	let removed = 0;
	for (const { key } of rows) {
		let projectPath: string;
		try {
			projectPath = decodeProjectId(key.slice(REVERT_DETECTION_CURSOR_PREFIX.length));
		} catch {
			continue;
		}
		if (canonicalProjectPath(projectPath) === projectPath) continue;
		await withSqliteRetry(() => db.delete(settings).where(eq(settings.key, key)), {
			label: `${LABEL}.cursor`,
		});
		removed += 1;
	}
	return removed;
}

/**
 * Reads the version the existing flag records.
 * @param db
 * @returns 0 without a flag, 1 for a flag that records no version, else the recorded version.
 */
async function recordedVersion(db: WebDatabase): Promise<number> {
	const [row] = await db
		.select({ value: settings.value })
		.from(settings)
		.where(eq(settings.key, PROJECT_PATH_IDENTITY_KEY));
	if (!row) return 0;
	try {
		const parsed: unknown = JSON.parse(row.value);
		const version =
			parsed && typeof parsed === 'object' ? (parsed as { version?: unknown }).version : null;
		return typeof version === 'number' ? version : 1;
	} catch {
		return 1;
	}
}

async function writeFlag(db: WebDatabase, summary: ProjectPathIdentitySummary): Promise<void> {
	const value = JSON.stringify({
		completedAt: Date.now(),
		cursorsRemoved: summary.cursorsRemoved,
		duplicatesRemoved: summary.duplicatesRemoved,
		rewritten: summary.rewritten,
		version: PROJECT_PATH_IDENTITY_VERSION,
	});
	await withSqliteRetry(
		() =>
			db
				.insert(settings)
				.values({ key: PROJECT_PATH_IDENTITY_KEY, value })
				.onConflictDoUpdate({
					set: { updatedAt: Date.now(), value },
					target: settings.key,
				}),
		{ label: `${LABEL}.flag` },
	);
}

/**
 * Rewrites every stored project path to its canonical spelling, once per version. Rows written
 * before canonicalization could carry the spelling of the shell (a CLI-adopted run) or of the
 * registry (a web launch) for the same project; on Windows those differ only by case, and every
 * consumer that joins on project_path compared them as unequal strings. Where project_path is part
 * of a key, a row that already exists under the canonical spelling wins and the stale row is
 * dropped, except that app_launches keeps whichever record was updated later. Revert-detection
 * cursors keyed on a non-canonical spelling are removed so the next sweep keeps one cursor per
 * project. scheduled_task_executions.project_paths_json is a snapshot and is left as recorded. On
 * a platform other than win32 the rows are left alone and only the flag is written.
 * @param db
 * @returns What was rewritten, or that the flag already carried the current version.
 */
export async function backfillProjectPathIdentity(
	db: WebDatabase,
): Promise<ProjectPathIdentitySummary> {
	const summary: ProjectPathIdentitySummary = {
		cursorsRemoved: 0,
		duplicatesRemoved: 0,
		rewritten: 0,
		skipped: false,
	};
	if ((await recordedVersion(db)) >= PROJECT_PATH_IDENTITY_VERSION) {
		return { ...summary, skipped: true };
	}
	if (process.platform === 'win32') {
		for (const table of [runs, pipelineSessions, invocationEvents]) {
			summary.rewritten += await rewriteFreeTable(db, table);
		}
		await rewriteKeyedTables(db, summary);
		summary.cursorsRemoved = await removeStaleCursors(db);
	}
	await writeFlag(db, summary);
	if (summary.rewritten > 0 || summary.cursorsRemoved > 0 || summary.duplicatesRemoved > 0) {
		webLogger.info(
			{ ...summary, version: PROJECT_PATH_IDENTITY_VERSION },
			'Rewrote stored project paths to their canonical spelling',
		);
	}
	return summary;
}

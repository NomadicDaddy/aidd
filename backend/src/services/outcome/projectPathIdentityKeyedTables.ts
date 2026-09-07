import { and, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import {
	appLaunches,
	diaryEntries,
	type invocationEvents,
	type pipelineSessions,
	type runs,
	scheduledTaskProjects,
} from '../../db/schema.ts';
import { canonicalProjectPath } from '../../paths.ts';

// The project path identity backfill for the tables where project_path is part of a key. A row
// that already exists under the canonical spelling cannot simply be rewritten over, so each table
// resolves the twin its own way; see projectPathIdentityBackfill.ts for the orchestration.

/** Counters the keyed rewrites advance; the backfill summary carries them. */
export interface KeyedRewriteCounts {
	/** Rows dropped because a row under the canonical spelling already held the same key. */
	duplicatesRemoved: number;
	/** Rows whose project_path was rewritten. */
	rewritten: number;
}

interface ProjectPathRewrite {
	canonical: string;
	stale: string;
}

type PathTable =
	| typeof appLaunches
	| typeof diaryEntries
	| typeof invocationEvents
	| typeof pipelineSessions
	| typeof runs
	| typeof scheduledTaskProjects;

const LABEL = 'runs.projectPathIdentity';

/**
 * Lists the distinct stored spellings of a table that differ from their canonical form.
 * @param db
 * @param table
 * @returns One entry per stale spelling with the spelling it should carry.
 */
export async function stalePaths(db: WebDatabase, table: PathTable): Promise<ProjectPathRewrite[]> {
	const distinct = await db.selectDistinct({ projectPath: table.projectPath }).from(table);
	return distinct
		.map(({ projectPath }) => ({
			canonical: canonicalProjectPath(projectPath),
			stale: projectPath,
		}))
		.filter((entry) => entry.canonical !== entry.stale);
}

/**
 * app_launches is keyed by project_path; two spellings of one project keep the later record.
 * @param db
 * @param counts
 */
async function rewriteAppLaunches(db: WebDatabase, counts: KeyedRewriteCounts): Promise<void> {
	for (const { canonical, stale } of await stalePaths(db, appLaunches)) {
		const [twin] = await db
			.select({ updatedAt: appLaunches.updatedAt })
			.from(appLaunches)
			.where(eq(appLaunches.projectPath, canonical));
		const [current] = await db
			.select({ updatedAt: appLaunches.updatedAt })
			.from(appLaunches)
			.where(eq(appLaunches.projectPath, stale));
		if (twin && current) {
			const loser = current.updatedAt > twin.updatedAt ? canonical : stale;
			await withSqliteRetry(
				() => db.delete(appLaunches).where(eq(appLaunches.projectPath, loser)),
				{ label: `${LABEL}.launch` },
			);
			counts.duplicatesRemoved += 1;
			if (loser === stale) continue;
		}
		await withSqliteRetry(
			() =>
				db
					.update(appLaunches)
					.set({ projectPath: canonical })
					.where(eq(appLaunches.projectPath, stale)),
			{ label: `${LABEL}.launch` },
		);
		counts.rewritten += 1;
	}
}

/**
 * diary_entries is unique on (project_path, entry_date); a dated twin keeps the canonical row.
 * @param db
 * @param counts
 */
async function rewriteDiaryEntries(db: WebDatabase, counts: KeyedRewriteCounts): Promise<void> {
	for (const { canonical, stale } of await stalePaths(db, diaryEntries)) {
		const rows = await db
			.select({ entryDate: diaryEntries.entryDate, id: diaryEntries.id })
			.from(diaryEntries)
			.where(eq(diaryEntries.projectPath, stale));
		for (const row of rows) {
			const twin = await db
				.select({ id: diaryEntries.id })
				.from(diaryEntries)
				.where(
					and(
						eq(diaryEntries.projectPath, canonical),
						eq(diaryEntries.entryDate, row.entryDate),
					),
				);
			if (twin.length > 0) {
				await withSqliteRetry(
					() => db.delete(diaryEntries).where(eq(diaryEntries.id, row.id)),
					{ label: `${LABEL}.diary` },
				);
				counts.duplicatesRemoved += 1;
				continue;
			}
			await withSqliteRetry(
				() =>
					db
						.update(diaryEntries)
						.set({ projectPath: canonical })
						.where(eq(diaryEntries.id, row.id)),
				{ label: `${LABEL}.diary` },
			);
			counts.rewritten += 1;
		}
	}
}

/**
 * scheduled_task_projects is unique on (task_id, project_path); a pinned twin wins.
 * @param db
 * @param counts
 */
async function rewriteScheduledTaskProjects(
	db: WebDatabase,
	counts: KeyedRewriteCounts,
): Promise<void> {
	for (const { canonical, stale } of await stalePaths(db, scheduledTaskProjects)) {
		const rows = await db
			.select({ taskId: scheduledTaskProjects.taskId })
			.from(scheduledTaskProjects)
			.where(eq(scheduledTaskProjects.projectPath, stale));
		for (const { taskId } of rows) {
			const staleRow = and(
				eq(scheduledTaskProjects.taskId, taskId),
				eq(scheduledTaskProjects.projectPath, stale),
			);
			const twin = await db
				.select({ taskId: scheduledTaskProjects.taskId })
				.from(scheduledTaskProjects)
				.where(
					and(
						eq(scheduledTaskProjects.taskId, taskId),
						eq(scheduledTaskProjects.projectPath, canonical),
					),
				);
			if (twin.length > 0) {
				await withSqliteRetry(() => db.delete(scheduledTaskProjects).where(staleRow), {
					label: `${LABEL}.scheduled`,
				});
				counts.duplicatesRemoved += 1;
				continue;
			}
			await withSqliteRetry(
				() =>
					db
						.update(scheduledTaskProjects)
						.set({ projectPath: canonical })
						.where(staleRow),
				{ label: `${LABEL}.scheduled` },
			);
			counts.rewritten += 1;
		}
	}
}

/**
 * Rewrites the tables where project_path is part of a key, resolving each canonical twin.
 * @param db
 * @param counts Counters advanced in place.
 */
export async function rewriteKeyedTables(
	db: WebDatabase,
	counts: KeyedRewriteCounts,
): Promise<void> {
	await rewriteAppLaunches(db, counts);
	await rewriteDiaryEntries(db, counts);
	await rewriteScheduledTaskProjects(db, counts);
}

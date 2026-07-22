import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

import { eq, sql, type SQL } from 'drizzle-orm';

import type { LocalTransaction, PurgeProjectRunsArgs, UpdateProjectPathArgs } from './types.ts';

import { invocationEvents, pipelineSessions, runs } from '../schema.ts';

export function updateProjectPathReferences(
	tx: LocalTransaction,
	args: UpdateProjectPathArgs
): void {
	const { destinationPath, projectName, sourcePath } = args;
	tx.update(runs)
		.set({ projectName, projectPath: destinationPath })
		.where(eq(runs.projectPath, sourcePath))
		.run();
	tx.update(pipelineSessions)
		.set({ projectName, projectPath: destinationPath })
		.where(eq(pipelineSessions.projectPath, sourcePath))
		.run();
}

// SQL mirror of projectPathFilter() (services/run/historyQueries.ts): fold '/' to '\\' on both
// sides and, on win32, compare case-insensitively. Using the same normalization here means the
// purge deletes exactly the rows the project Runs tab surfaces for a path — no more, no fewer.
function projectPathMatches(column: AnySQLiteColumn, projectPath: string): SQL {
	const normalizedColumn = sql`replace(${column}, '/', '\\')`;
	const target = projectPath.replaceAll('/', '\\');
	return process.platform === 'win32'
		? sql`lower(${normalizedColumn}) = ${target.toLowerCase()}`
		: sql`${normalizedColumn} = ${target}`;
}

// Delete every denormalized, path-keyed row for a project_path across the three tables that carry
// it (runs, pipeline_sessions, invocation_events). Run when a project folder is created fresh at —
// or deleted from — a path, so stale rows left by a prior project at the same path never resurface
// in the project Runs tab (projects are discovered, not FK-anchored; see assertion DATA-007).
// pipeline_step_results rows are removed transitively: deleting a pipeline_session cascades to its
// step results (fk onDelete cascade). invocation_events are deleted first so their set-null FKs to
// runs/pipeline_sessions never churn rows that are about to be deleted anyway. Returns the number
// of run rows deleted so the caller can skip trace noise when nothing was stale.
export function purgeProjectRuns(tx: LocalTransaction, args: PurgeProjectRunsArgs): number {
	const { projectPath } = args;
	const matchedRuns = tx
		.select({ id: runs.id })
		.from(runs)
		.where(projectPathMatches(runs.projectPath, projectPath))
		.all();
	tx.delete(invocationEvents)
		.where(projectPathMatches(invocationEvents.projectPath, projectPath))
		.run();
	tx.delete(runs).where(projectPathMatches(runs.projectPath, projectPath)).run();
	tx.delete(pipelineSessions)
		.where(projectPathMatches(pipelineSessions.projectPath, projectPath))
		.run();
	return matchedRuns.length;
}

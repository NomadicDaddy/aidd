import { rm } from 'node:fs/promises';
import { isAbsolute, relative, resolve } from 'node:path';

import type { DbCommands } from '../../db/commands.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { webLogger } from '../../logger.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';

export interface PurgeProjectRunsDeps {
	commands: DbCommands;
	/** The panel data directory; only transcripts under its run-logs/ are removed. */
	dataDir: string;
}

/**
 * Purge every path-keyed run/pipeline/invocation row for a project_path, then the removed rows'
 * transcripts. Called at the project create/delete lifecycle boundary so a folder recreated fresh
 * at a reused path (or a deleted project) never leaves prior rows behind for the project Runs tab
 * to surface. The files go with the rows: once a row is gone the retention sweep can only date its
 * transcript by mtime, so a purge that left the files would leave them to age out on their own.
 * The data-movement trace is recorded only when something was actually purged.
 * @param deps The command surface and the data directory whose run-logs/ holds transcripts.
 * @param projectPath The project_path whose rows and transcripts are purged.
 * @returns The number of run rows removed.
 */
export async function purgeProjectRuns(
	deps: PurgeProjectRunsDeps,
	projectPath: string,
): Promise<number> {
	const purged = await withSqliteRetry(() => deps.commands.purgeProjectRuns({ projectPath }), {
		label: 'project.runs.purge',
	});
	const transcriptRoot = resolve(deps.dataDir, 'run-logs');
	for (const logPath of purged.logPaths) {
		const relation = relative(transcriptRoot, resolve(logPath));
		if (relation === '' || relation.startsWith('..') || isAbsolute(relation)) continue;
		try {
			await rm(logPath, { force: true });
		} catch (err) {
			webLogger.warn({ err, logPath }, 'Failed to remove a purged run transcript');
		}
	}
	if (purged.removed > 0) {
		recordDataMovement({
			category: 'database',
			operation: 'project.runs.purge',
			status: 'success',
			summary: { projectPath, purgedRuns: purged.removed },
			target: 'runs,pipeline_sessions,invocation_events',
		});
	}
	return purged.removed;
}

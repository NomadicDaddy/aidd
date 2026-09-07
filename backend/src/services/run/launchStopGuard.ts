import { stopFilePath } from 'aidd-shared/metadata/paths';
import { and, notInArray } from 'drizzle-orm';
import { rm, stat } from 'node:fs/promises';

import type { WebDatabase } from '../../db/client.ts';

import { projectPathMatches } from '../../db/commands/projectPaths.ts';
import { runs } from '../../db/schema.ts';
import { RunControlError, TERMINAL_STATUSES } from './types.ts';

/**
 * The stop file is project-wide, and up to maxConcurrentRunsPerProject runs share it. A stop
 * requested for a still-live sibling run must not be revoked by a new launch (and the fresh
 * CLI's own boot-time clearStaleStopFile would revoke it too) — refuse the launch until the
 * stop is consumed. Only a genuinely stale file — no live run left to consume it — is cleared,
 * so it cannot read as a pending stop (annotateStopRequested) and flash a false "Stopping…"
 * on the fresh run.
 * @param db - Web database handle.
 * @param projectDir - Resolved project directory the launch targets.
 */
export async function guardPendingProjectStop(db: WebDatabase, projectDir: string): Promise<void> {
	if (!(await stopFileExists(projectDir))) return;
	const liveSiblings = await db
		.select({ id: runs.id })
		.from(runs)
		.where(
			and(
				projectPathMatches(runs.projectPath, projectDir),
				notInArray(runs.status, [...TERMINAL_STATUSES]),
			),
		)
		.limit(1);
	const pendingFor = liveSiblings[0]?.id;
	if (pendingFor !== undefined) {
		throw new RunControlError(
			`A stop is pending for run ${pendingFor} in this project; wait for it to stop before launching another run`,
			409,
		);
	}
	await rm(stopFilePath(projectDir), { force: true }).catch(() => {});
}

async function stopFileExists(projectDir: string): Promise<boolean> {
	try {
		await stat(stopFilePath(projectDir));
		return true;
	} catch {
		return false;
	}
}

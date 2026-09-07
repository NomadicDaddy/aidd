import { desc, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';

import { pipelineStepResults, runs } from '../../db/schema.ts';

/**
 * Finds the newest run belonging to a pipeline session that has not yet been linked
 * to a step-result row. This closes the crash window between launching a managed run
 * and persisting that relationship, whether the run is still active or finished while
 * the web process was down.
 *
 * @param db - Web database containing run and pipeline step rows.
 * @param sessionId - Pipeline session whose unlinked managed run is needed.
 * @returns The newest unlinked run id, if one exists.
 */
export async function findOrphanedRunForStep(
	db: WebDatabase,
	sessionId: string,
): Promise<{ id: string } | undefined> {
	const candidates = await db
		.select({ id: runs.id })
		.from(runs)
		.where(eq(runs.pipelineSessionId, sessionId))
		.orderBy(desc(runs.startedAt));
	for (const candidate of candidates) {
		const linked = await db
			.select({ id: pipelineStepResults.id })
			.from(pipelineStepResults)
			.where(eq(pipelineStepResults.runId, candidate.id))
			.limit(1);
		if (linked.length === 0) return candidate;
	}
	return undefined;
}

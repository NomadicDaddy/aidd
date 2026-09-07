import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';

import { runs } from '../../db/schema.ts';

export async function getRun(
	db: WebDatabase,
	id: string,
): Promise<typeof runs.$inferSelect | undefined> {
	return (await db.select().from(runs).where(eq(runs.id, id)).limit(1))[0];
}

// Re-export from domain modules so runService.ts can import every query
// function from this single module.
export { reconcileStaleRuns, sweepOrphanedRuns } from './activeRunQueries.ts';
export {
	hasActiveRunForProject,
	latestProjectAuditRun,
	listRuns,
	listRunsForProject,
	listRunsForProjectPage,
	listRunsPage,
	type ListRunsPageOptions,
	purgeProjectRuns,
	updateProjectPathReferences,
} from './historyQueries.ts';
export {
	listActiveRunSummaries,
	type ProjectActiveRunSummary,
} from './projectActiveRunSummaries.ts';
export type { QueriesContext } from './queryContracts.ts';
export { annotatedWebRunRecord, toWebRunRecord } from './runRecordMapper.ts';

import { inArray } from 'drizzle-orm';

import type { RunRecord } from '../../types.ts';
import type { QueriesContext } from './queryContracts.ts';

import { runs } from '../../db/schema.ts';

// Heartbeat records intentionally stay independent from the web database, so they do not carry
// pipelineSessionId. Reattach that durable relationship before merging them into a list: otherwise
// a top-level query can exclude the database row and then reintroduce its pipeline child from the
// heartbeat scan.
export async function reconcileCliPipelineSessions(
	ctx: QueriesContext,
	cliItems: RunRecord[],
	topLevel?: boolean,
): Promise<RunRecord[]> {
	if (cliItems.length === 0) return cliItems;
	const persistedRows = await ctx.db
		.select({ id: runs.id, pipelineSessionId: runs.pipelineSessionId })
		.from(runs)
		.where(
			inArray(
				runs.id,
				cliItems.map((run) => run.id),
			),
		);
	const pipelineSessionIds = new Map(
		persistedRows
			.filter(
				(row): row is { id: string; pipelineSessionId: string } =>
					row.pipelineSessionId !== null,
			)
			.map((row) => [row.id, row.pipelineSessionId]),
	);
	const reconciled = cliItems.map((run) => {
		const pipelineSessionId = pipelineSessionIds.get(run.id);
		return pipelineSessionId === undefined ? run : { ...run, pipelineSessionId };
	});
	return topLevel ? reconciled.filter((run) => run.pipelineSessionId === null) : reconciled;
}

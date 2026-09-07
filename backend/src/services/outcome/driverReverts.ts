import { and, eq, isNotNull } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DriverRevertMeasure } from './types.ts';

import { runs } from '../../db/schema.ts';

interface RevertAccumulator {
	driverId: string;
	driverSha256: string;
	revertedCommits: number;
	revertedRuns: number;
	runs: number;
}

/**
 * Read-time revert rates grouped by the stable driver identity and its exact content revision.
 * @param db
 * @param filter
 * @param filter.driverId
 * @returns Revert measures ordered by driver identity and revision.
 */
export async function getDriverRevertMeasures(
	db: WebDatabase,
	filter: { driverId?: string | undefined } = {},
): Promise<DriverRevertMeasure[]> {
	const rows = await db
		.select({
			driverId: runs.driverId,
			driverSha256: runs.driverSha256,
			revertedCommits: runs.revertedCommits,
		})
		.from(runs)
		.where(
			and(
				isNotNull(runs.driverId),
				isNotNull(runs.driverSha256),
				isNotNull(runs.revertedCommits),
				...(filter.driverId === undefined ? [] : [eq(runs.driverId, filter.driverId)]),
			),
		);
	const groups = new Map<string, RevertAccumulator>();
	for (const row of rows) {
		if (row.driverId === null || row.driverSha256 === null || row.revertedCommits === null)
			continue;
		const key = `${row.driverId}\0${row.driverSha256}`;
		const group = groups.get(key) ?? {
			driverId: row.driverId,
			driverSha256: row.driverSha256,
			revertedCommits: 0,
			revertedRuns: 0,
			runs: 0,
		};
		group.runs += 1;
		group.revertedCommits += row.revertedCommits;
		if (row.revertedCommits > 0) group.revertedRuns += 1;
		groups.set(key, group);
	}
	return [...groups.values()]
		.map((group) => ({
			driverId: group.driverId,
			driverSha256: group.driverSha256,
			revertedCommits: group.revertedCommits,
			revertRate: {
				denominator: group.runs,
				numerator: group.revertedRuns,
				value: group.runs > 0 ? group.revertedRuns / group.runs : null,
			},
		}))
		.sort(
			(left, right) =>
				left.driverId.localeCompare(right.driverId) ||
				left.driverSha256.localeCompare(right.driverSha256),
		);
}

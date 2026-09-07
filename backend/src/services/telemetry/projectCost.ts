import { and, eq, gte } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { ProjectCostRow, TelemetryResourceType } from './types.ts';

import { invocationEvents, runs } from '../../db/schema.ts';

interface ProjectCostAccumulator {
	costedInvocationCount: number;
	costUsd: number;
	countedRunIds: Set<string>;
	invocationCount: number;
	lastInvocationAt: number;
	projectName: string;
	projectPath: string;
}

// What each project cost over the selected window, rolled up from the same filtered
// invocation_events set the rest of the Telemetry surface reads.
//
// `invocation_events` carries no cost of its own: dollars live on the `runs` row an invocation
// points at, so cost reaches a project only through the left join, and an invocation with no run
// (or a run whose backend reported no dollars) contributes an invocation but no money. That is why
// the row reports `costedInvocationCount` beside `invocationCount` — a project the backends never
// priced must read as unknown coverage, not as a project that cost $0.00.
//
// Grouping is by canonical projectPath alone, with the name taken from the most recent invocation:
// projectPath is canonicalized at insert time, so it is the stable identity, while a renamed
// project would otherwise split into two rows that each hold half its spend.
export async function getProjectCosts(
	db: WebDatabase,
	input?: {
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	},
): Promise<ProjectCostRow[]> {
	const sinceFilter =
		input?.windowMs !== undefined
			? gte(invocationEvents.startedAt, Date.now() - input.windowMs)
			: undefined;
	const typeFilter =
		input?.resourceType !== undefined
			? eq(invocationEvents.resourceType, input.resourceType)
			: undefined;
	const filters = [sinceFilter, typeFilter].filter(
		(value): value is NonNullable<typeof value> => value !== undefined,
	);
	const rows = await db
		.select({
			projectName: invocationEvents.projectName,
			projectPath: invocationEvents.projectPath,
			runCostUsd: runs.costUsd,
			runId: invocationEvents.runId,
			startedAt: invocationEvents.startedAt,
		})
		.from(invocationEvents)
		.leftJoin(runs, eq(invocationEvents.runId, runs.id))
		.where(filters.length > 0 ? and(...filters) : undefined);

	const groups = new Map<string, ProjectCostAccumulator>();
	for (const row of rows) {
		let group = groups.get(row.projectPath);
		if (!group) {
			group = {
				costedInvocationCount: 0,
				costUsd: 0,
				countedRunIds: new Set<string>(),
				invocationCount: 0,
				lastInvocationAt: row.startedAt,
				projectName: row.projectName,
				projectPath: row.projectPath,
			};
			groups.set(row.projectPath, group);
		}
		group.invocationCount += 1;
		if (row.startedAt >= group.lastInvocationAt) {
			group.lastInvocationAt = row.startedAt;
			group.projectName = row.projectName;
		}
		// A zero is ambiguous the same way it is in the project ledger — a genuinely free run and a
		// backend that reported tokens without dollars look alike — so only a positive figure counts
		// as reported cost.
		if (row.runCostUsd === null || row.runCostUsd <= 0) continue;
		group.costedInvocationCount += 1;
		// Two invocations can name the same run (a run invocation and the skill invocation that
		// drove it). The run was billed once, so its dollars are added once even though both rows
		// count as covered.
		if (row.runId === null || group.countedRunIds.has(row.runId)) continue;
		group.countedRunIds.add(row.runId);
		group.costUsd += row.runCostUsd;
	}

	return [...groups.values()]
		.map((group) => ({
			costedInvocationCount: group.costedInvocationCount,
			costUsd: group.costUsd,
			invocationCount: group.invocationCount,
			lastInvocationAt: group.lastInvocationAt,
			projectName: group.projectName,
			projectPath: group.projectPath,
		}))
		.sort(
			(left, right) =>
				right.costUsd - left.costUsd ||
				right.invocationCount - left.invocationCount ||
				left.projectPath.localeCompare(right.projectPath),
		);
}

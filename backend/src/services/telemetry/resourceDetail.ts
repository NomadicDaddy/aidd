import { and, eq, gte, sql } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type {
	BackendUsageRow,
	ResourceDetail,
	SkillRevisionUsage,
	TelemetryResourceType,
} from './types.ts';

import { invocationEvents, runs } from '../../db/schema.ts';
import { getDriverRevertMeasures } from '../outcome/driverReverts.ts';
import { getResourceUsage, telemetryOutcomeBucket } from './aggregation.ts';
import { listInvocations } from './queries.ts';

interface RevisionAccumulator extends Omit<SkillRevisionUsage, 'avgDurationMs'> {
	durationCount: number;
	durationSum: number;
}

function createRevision(resourceSha256: null | string, startedAt: number): RevisionAccumulator {
	return {
		cachedTokens: 0,
		completed: 0,
		durationCount: 0,
		durationSum: 0,
		failed: 0,
		flagged: 0,
		inputTokens: 0,
		killed: 0,
		lastUsedAt: startedAt,
		noWork: 0,
		outputTokens: 0,
		reasoningTokens: 0,
		resourceSha256,
		revertRate: { denominator: 0, numerator: 0, value: null },
		running: 0,
		runsWithTokenData: 0,
		stopped: 0,
		total: 0,
		totalTokens: 0,
		warnings: 0,
	};
}

export async function getSkillRevisionUsage(
	db: WebDatabase,
	resourceId: string,
): Promise<SkillRevisionUsage[]> {
	const rows = await db
		.select({
			cachedTokens: runs.cachedTokens,
			durationMs: invocationEvents.durationMs,
			inputTokens: runs.inputTokens,
			outputTokens: runs.outputTokens,
			reasoningTokens: runs.reasoningTokens,
			resourceSha256: invocationEvents.resourceSha256,
			runExitCode: runs.exitCode,
			runStatus: runs.status,
			runStopReason: runs.stopReason,
			runSummary: runs.summary,
			startedAt: invocationEvents.startedAt,
			status: invocationEvents.status,
		})
		.from(invocationEvents)
		.leftJoin(runs, eq(invocationEvents.runId, runs.id))
		.where(
			and(
				eq(invocationEvents.resourceType, 'skill'),
				eq(invocationEvents.resourceId, resourceId),
			),
		);
	const revisions = new Map<string, RevisionAccumulator>();
	for (const row of rows) {
		const key = row.resourceSha256 ?? 'not-captured';
		const revision = revisions.get(key) ?? createRevision(row.resourceSha256, row.startedAt);
		revision.total += 1;
		revision[telemetryOutcomeBucket(row)] += 1;
		if (row.startedAt > revision.lastUsedAt) revision.lastUsedAt = row.startedAt;
		if (row.durationMs !== null) {
			revision.durationCount += 1;
			revision.durationSum += row.durationMs;
		}
		if (row.inputTokens !== null && row.outputTokens !== null) {
			revision.runsWithTokenData += 1;
			revision.inputTokens += row.inputTokens;
			revision.outputTokens += row.outputTokens;
			revision.totalTokens += row.inputTokens + row.outputTokens;
			revision.cachedTokens += row.cachedTokens ?? 0;
			revision.reasoningTokens += row.reasoningTokens ?? 0;
		}
		revisions.set(key, revision);
	}
	// Revert rates come from the runs the skill drove, keyed by the same content hash the
	// invocation carries as resource_sha256; a revision with no inspected run keeps 0/0.
	const revertRates = new Map(
		(await getDriverRevertMeasures(db, { driverId: resourceId })).map((measure) => [
			measure.driverSha256,
			measure.revertRate,
		]),
	);
	return [...revisions.values()]
		.map(({ durationCount, durationSum, ...revision }) => ({
			...revision,
			avgDurationMs: durationCount > 0 ? Math.round(durationSum / durationCount) : null,
			revertRate:
				(revision.resourceSha256 === null
					? undefined
					: revertRates.get(revision.resourceSha256)) ?? revision.revertRate,
		}))
		.sort((left, right) => right.lastUsedAt - left.lastUsedAt);
}

export async function getBackendUsage(
	db: WebDatabase,
	input?: {
		resourceId?: string | undefined;
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	},
): Promise<BackendUsageRow[]> {
	const filters = [];
	if (input?.resourceType !== undefined) {
		filters.push(eq(invocationEvents.resourceType, input.resourceType));
	}
	if (input?.resourceId !== undefined) {
		filters.push(eq(invocationEvents.resourceId, input.resourceId));
	}
	if (input?.windowMs !== undefined) {
		filters.push(gte(invocationEvents.startedAt, Date.now() - input.windowMs));
	}
	const rows = await db
		.select({
			backend: invocationEvents.backend,
			count: sql<number>`COUNT(*)`,
		})
		.from(invocationEvents)
		.where(filters.length > 0 ? and(...filters) : undefined)
		.groupBy(invocationEvents.backend);
	return rows
		.map((row) => ({ backend: row.backend, count: Number(row.count) || 0 }))
		.sort((left, right) => right.count - left.count);
}

export async function getResourceDetail(
	db: WebDatabase,
	resourceType: TelemetryResourceType,
	resourceId: string,
): Promise<null | ResourceDetail> {
	const [backendRows, recent, revisions, usageRows] = await Promise.all([
		getBackendUsage(db, { resourceId, resourceType }),
		listInvocations(db, { limit: 50, resourceId, resourceType }),
		resourceType === 'skill' ? getSkillRevisionUsage(db, resourceId) : [],
		getResourceUsage(db, { resourceType }),
	]);
	const usage = usageRows.find((row) => row.resourceId === resourceId);
	if (!usage) return null;
	return {
		backendCounts: backendRows,
		recent,
		revisions,
		usage,
	};
}

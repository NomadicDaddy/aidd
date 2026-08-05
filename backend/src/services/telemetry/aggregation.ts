import {
	classifyWebRunTelemetryBucket,
	type TelemetryOutcomeBucket,
	type WebRunOutcomeStatus,
} from 'aidd-shared/runs/outcome';
import { and, eq, gte } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { ResourceUsageRow, TelemetryResourceType, TimeseriesPoint } from './types.ts';

import { invocationEvents, runs } from '../../db/schema.ts';
import { bucketKeysForWindow } from './buckets.ts';

// Fold every invocation into one explicit outcome. Run-backed rows defer to the shared classifier
// on authoritative `runs` facts, but retain stopped/killed/running as distinct telemetry outcomes
// instead of hiding them under Failed. Non-run invocations use their raw lifecycle status.
function outcomeBucket(row: {
	runExitCode: null | number;
	runStatus: null | string;
	runStopReason: null | string;
	runSummary: null | string;
	status: string;
}): TelemetryOutcomeBucket {
	if (row.runStatus !== null) {
		return classifyWebRunTelemetryBucket({
			exitCode: row.runExitCode,
			status: row.runStatus as WebRunOutcomeStatus,
			stopReason: row.runStopReason,
			summary: row.runSummary,
		});
	}
	return rawStatusBucket(row.status);
}

// Every raw invocation lifecycle status currently doubles as a bucket name, but the cast is not
// safe on its own: an unrecognized status would increment an undefined key, so the seven buckets
// would silently stop summing to `total` — the exact invariant the dashboard states in prose.
// Fold anything unknown into `failed`, matching the pre-split behavior where any non-completed,
// non-running status counted as a failure.
// Exported so a test can pin this against the ck_invocation_events_status CHECK values: widening
// that constraint without teaching the aggregator is the one way an unhandled status ships.
export const rawStatusBuckets = new Set<TelemetryOutcomeBucket>([
	'completed',
	'failed',
	'killed',
	'running',
	'stopped',
]);

function rawStatusBucket(status: string): TelemetryOutcomeBucket {
	return rawStatusBuckets.has(status as TelemetryOutcomeBucket)
		? (status as TelemetryOutcomeBucket)
		: 'failed';
}

export async function getResourceUsage(
	db: WebDatabase,
	input?: {
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	},
): Promise<ResourceUsageRow[]> {
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
	// Outcome bucketing needs the shared run classifier, which can't run in SQL
	// without re-encoding it (and inviting drift), so fetch the joined rows and aggregate in JS. The
	// telemetry table is single-user/local, so the row count is small.
	const rows = await db
		.select({
			durationMs: invocationEvents.durationMs,
			parentInvocationId: invocationEvents.parentInvocationId,
			resourceId: invocationEvents.resourceId,
			resourceName: invocationEvents.resourceName,
			resourceType: invocationEvents.resourceType,
			runExitCode: runs.exitCode,
			runStatus: runs.status,
			runStopReason: runs.stopReason,
			runSummary: runs.summary,
			startedAt: invocationEvents.startedAt,
			status: invocationEvents.status,
		})
		.from(invocationEvents)
		.leftJoin(runs, eq(invocationEvents.runId, runs.id))
		.where(filters.length > 0 ? and(...filters) : undefined);

	interface UsageAccumulator {
		completed: number;
		durationCount: number;
		durationSum: number;
		failed: number;
		flagged: number;
		killed: number;
		lastUsedAt: null | number;
		nested: number;
		noWork: number;
		resourceId: string;
		resourceName: string;
		resourceType: string;
		running: number;
		stopped: number;
		topLevel: number;
		total: number;
		warnings: number;
	}
	const groups = new Map<string, UsageAccumulator>();
	for (const row of rows) {
		const key = `${row.resourceType}:${row.resourceId}`;
		let group = groups.get(key);
		if (!group) {
			group = {
				completed: 0,
				durationCount: 0,
				durationSum: 0,
				failed: 0,
				flagged: 0,
				killed: 0,
				lastUsedAt: null,
				nested: 0,
				noWork: 0,
				resourceId: row.resourceId,
				resourceName: row.resourceName,
				resourceType: row.resourceType,
				running: 0,
				stopped: 0,
				topLevel: 0,
				total: 0,
				warnings: 0,
			};
			groups.set(key, group);
		}
		group.total += 1;
		if (row.parentInvocationId === null) group.topLevel += 1;
		else group.nested += 1;
		group.resourceName = row.resourceName;
		if (row.durationMs !== null) {
			group.durationSum += row.durationMs;
			group.durationCount += 1;
		}
		if (group.lastUsedAt === null || row.startedAt > group.lastUsedAt) {
			group.lastUsedAt = row.startedAt;
		}
		group[outcomeBucket(row)] += 1;
	}
	return [...groups.values()].map((group) => ({
		avgDurationMs: group.durationCount
			? Math.round(group.durationSum / group.durationCount)
			: null,
		completed: group.completed,
		failed: group.failed,
		flagged: group.flagged,
		killed: group.killed,
		lastUsedAt: group.lastUsedAt,
		nested: group.nested,
		noWork: group.noWork,
		resourceId: group.resourceId,
		resourceName: group.resourceName,
		resourceType: group.resourceType as TelemetryResourceType,
		running: group.running,
		stopped: group.stopped,
		topLevel: group.topLevel,
		total: group.total,
		warnings: group.warnings,
	}));
}

export async function getTopUsed(
	db: WebDatabase,
	input: {
		limit: number;
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	},
): Promise<ResourceUsageRow[]> {
	const rows = await getResourceUsage(db, {
		resourceType: input.resourceType,
		windowMs: input.windowMs,
	});
	return rows.sort((left, right) => right.total - left.total).slice(0, input.limit);
}

export async function getTimeseries(
	db: WebDatabase,
	input: {
		bucket: 'day' | 'hour';
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	},
): Promise<TimeseriesPoint[]> {
	const bucketMs = input.bucket === 'hour' ? 60 * 60 * 1000 : 24 * 60 * 60 * 1000;
	const filters = [];
	if (input.windowMs !== undefined) {
		filters.push(gte(invocationEvents.startedAt, Date.now() - input.windowMs));
	}
	if (input.resourceType !== undefined) {
		filters.push(eq(invocationEvents.resourceType, input.resourceType));
	}
	// Join + JS bucketing for the same reason as getResourceUsage: the Warnings band depends on the
	// shared run classifier.
	const rows = await db
		.select({
			runExitCode: runs.exitCode,
			runStatus: runs.status,
			runStopReason: runs.stopReason,
			runSummary: runs.summary,
			startedAt: invocationEvents.startedAt,
			status: invocationEvents.status,
		})
		.from(invocationEvents)
		.leftJoin(runs, eq(invocationEvents.runId, runs.id))
		.where(filters.length > 0 ? and(...filters) : undefined);

	interface BucketAccumulator {
		completed: number;
		failed: number;
		flagged: number;
		killed: number;
		noWork: number;
		running: number;
		stopped: number;
		total: number;
		warnings: number;
	}
	const emptyBucket = (): BucketAccumulator => ({
		completed: 0,
		failed: 0,
		flagged: 0,
		killed: 0,
		noWork: 0,
		running: 0,
		stopped: 0,
		total: 0,
		warnings: 0,
	});

	const points = new Map<number, BucketAccumulator>();
	for (const row of rows) {
		const bucketKey = Math.floor(row.startedAt / bucketMs) * bucketMs;
		let point = points.get(bucketKey);
		if (!point) {
			point = emptyBucket();
			points.set(bucketKey, point);
		}
		point.total += 1;
		point[outcomeBucket(row)] += 1;
	}
	// Emit the whole window, zeroes included. Dropping empty buckets and drawing the survivors at
	// equal width made unequal gaps look identical and left this chart covering a different set of
	// dates from the output chart beneath it.
	return bucketKeysForWindow({
		bucketMs,
		now: Date.now(),
		observed: points.keys(),
		windowMs: input.windowMs,
	}).map((bucket) => {
		const point = points.get(bucket) ?? emptyBucket();
		return {
			bucket,
			completed: point.completed,
			failed: point.failed,
			flagged: point.flagged,
			killed: point.killed,
			noWork: point.noWork,
			running: point.running,
			stopped: point.stopped,
			total: point.total,
			warnings: point.warnings,
		};
	});
}

import { and, eq, gte, sql } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { BackendUsageRow, ResourceDetail, TelemetryResourceType } from './types.ts';

import { invocationEvents } from '../../db/schema.ts';
import { getResourceUsage } from './aggregation.ts';
import { listInvocations } from './queries.ts';

export async function getBackendUsage(
	db: WebDatabase,
	input?: {
		resourceId?: string | undefined;
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	}
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
	resourceId: string
): Promise<null | ResourceDetail> {
	const usageRows = await getResourceUsage(db, { resourceType });
	const usage = usageRows.find((row) => row.resourceId === resourceId);
	if (!usage) return null;
	const recent = await listInvocations(db, { limit: 50, resourceId, resourceType });
	const backendRows = await getBackendUsage(db, { resourceId, resourceType });
	return {
		backendCounts: backendRows,
		recent,
		usage,
	};
}

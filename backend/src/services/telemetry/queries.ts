import { and, asc, desc, eq, gte, inArray, isNull } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type {
	InvocationRecord,
	TelemetryInvocationSource,
	TelemetryInvocationStatus,
	TelemetryResourceType,
	TelemetryRunStatus,
} from './types.ts';

import { invocationEvents, runs } from '../../db/schema.ts';

/**
 * The root invocation of a pipeline session: the parentless 'recipe' event its launch recorded.
 *
 * Resume reads it back rather than recording a new one. The session row is the same session, so a
 * second root event would double-count the launch; but a resumed step that runs without any root
 * writes a child event carrying a parent resource id and a NULL parent invocation, and the
 * nested/top-level split on /telemetry then reads a resumed session's steps as top-level launches.
 *
 * A synthetic one-shot session records no recipe event at all, so this correctly finds nothing
 * there and its skill step stays top-level, exactly as its launch recorded it.
 * @param db The web database.
 * @param sessionId The pipeline session whose root invocation to recover.
 * @returns The root invocation id, or undefined when the session recorded none.
 */
export async function findSessionRootInvocationId(
	db: WebDatabase,
	sessionId: string,
): Promise<string | undefined> {
	const rows = await db
		.select({ id: invocationEvents.id })
		.from(invocationEvents)
		.where(
			and(
				eq(invocationEvents.sessionId, sessionId),
				isNull(invocationEvents.parentInvocationId),
				eq(invocationEvents.resourceType, 'recipe'),
			),
		)
		.orderBy(asc(invocationEvents.startedAt))
		.limit(1);
	return rows[0]?.id;
}

export async function listInvocations(
	db: WebDatabase,
	input: {
		limit: number;
		resourceId?: string | undefined;
		resourceType?: TelemetryResourceType | undefined;
		windowMs?: number | undefined;
	},
): Promise<InvocationRecord[]> {
	const filters = [];
	if (input.resourceType !== undefined) {
		filters.push(eq(invocationEvents.resourceType, input.resourceType));
	}
	if (input.resourceId !== undefined) {
		filters.push(eq(invocationEvents.resourceId, input.resourceId));
	}
	if (input.windowMs !== undefined) {
		filters.push(gte(invocationEvents.startedAt, Date.now() - input.windowMs));
	}
	// Correlate run-backed invocations with their authoritative `runs` row so the UI can derive the
	// same rich outcome (stopReason/summary/exitCode) the Runs page shows. Raw run facts only — the
	// display outcome is derived once from the shared classifier, never stored.
	const rows = await db
		.select({
			inv: invocationEvents,
			runExitCode: runs.exitCode,
			runStatus: runs.status,
			runStopReason: runs.stopReason,
			runSummary: runs.summary,
		})
		.from(invocationEvents)
		.leftJoin(runs, eq(invocationEvents.runId, runs.id))
		.where(filters.length > 0 ? and(...filters) : undefined)
		.orderBy(desc(invocationEvents.startedAt))
		.limit(input.limit);
	const parentIds = Array.from(
		new Set(
			rows.map((row) => row.inv.parentInvocationId).filter((id): id is string => id !== null),
		),
	);
	const parents = parentIds.length
		? await db
				.select({
					id: invocationEvents.id,
					resourceName: invocationEvents.resourceName,
				})
				.from(invocationEvents)
				.where(inArray(invocationEvents.id, parentIds))
		: [];
	const parentNameById = new Map(parents.map((row) => [row.id, row.resourceName]));
	return rows.map(({ inv, runExitCode, runStatus, runStopReason, runSummary }) => ({
		argsPresent: inv.argsPresent === 1,
		backend: inv.backend,
		completedAt: inv.completedAt,
		durationMs: inv.durationMs,
		errorMessage: inv.errorMessage,
		exitCode: inv.exitCode,
		id: inv.id,
		model: inv.model,
		parentInvocationId: inv.parentInvocationId,
		parentResourceId: inv.parentResourceId,
		parentResourceName: inv.parentInvocationId
			? (parentNameById.get(inv.parentInvocationId) ?? null)
			: null,
		parentResourceType: inv.parentResourceType as null | TelemetryResourceType,
		projectName: inv.projectName,
		projectPath: inv.projectPath,
		resourceId: inv.resourceId,
		resourceName: inv.resourceName,
		resourceSha256: inv.resourceSha256,
		resourceType: inv.resourceType as TelemetryResourceType,
		runExitCode,
		runId: inv.runId,
		runStatus: runStatus as null | TelemetryRunStatus,
		runStopReason,
		runSummary,
		sessionId: inv.sessionId,
		source: inv.source as TelemetryInvocationSource,
		startedAt: inv.startedAt,
		status: inv.status as TelemetryInvocationStatus,
	}));
}

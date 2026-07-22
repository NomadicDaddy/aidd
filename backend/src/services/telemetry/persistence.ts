import { and, eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { DbCommands } from '../../db/commands.ts';
import type { RecordCompletionInput, RecordStartInput } from './types.ts';

import { withSqliteRetry } from '../../db/retry.ts';
import { invocationEvents } from '../../db/schema.ts';
import { webLogger } from '../../logger.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';

function createInvocationId(): string {
	return `inv_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
}

export async function recordStart(
	db: WebDatabase,
	input: RecordStartInput
): Promise<string | undefined> {
	const id = createInvocationId();
	try {
		await withSqliteRetry(
			() =>
				db.insert(invocationEvents).values({
					argsPresent: input.argsPresent ? 1 : 0,
					backend: input.backend ?? null,
					id,
					model: input.model ?? null,
					parentInvocationId: input.parentInvocationId ?? null,
					parentResourceId: input.parentResourceId ?? null,
					parentResourceType: input.parentResourceType ?? null,
					projectName: input.projectName,
					projectPath: input.projectPath,
					resourceId: input.resourceId,
					resourceName: input.resourceName,
					resourceType: input.resourceType,
					runId: input.runId ?? null,
					sessionId: input.sessionId ?? null,
					source: input.source,
					startedAt: input.startedAt,
					status: 'running',
				}),
			{ label: 'telemetry.recordStart' }
		);
		recordDataMovement({
			category: 'database',
			operation: 'telemetry.invocation.insert',
			status: 'success',
			summary: {
				invocationId: id,
				resourceId: input.resourceId,
				resourceType: input.resourceType,
				source: input.source,
			},
			target: 'invocation_events',
		});
		return id;
	} catch (err) {
		webLogger.error(
			{
				err,
				resourceId: input.resourceId,
				resourceType: input.resourceType,
				runId: input.runId,
				sessionId: input.sessionId,
			},
			'telemetry.recordStart failed'
		);
		return undefined;
	}
}

export async function recordCompletionByInvocationId(
	db: WebDatabase,
	invocationId: string,
	input: RecordCompletionInput
): Promise<void> {
	if (input.status === 'running') return;
	try {
		await withSqliteRetry(
			() =>
				db
					.update(invocationEvents)
					.set({
						completedAt: input.completedAt,
						durationMs: input.durationMs,
						errorMessage: input.errorMessage ?? null,
						exitCode: input.exitCode ?? null,
						status: input.status,
					})
					.where(
						and(
							eq(invocationEvents.id, invocationId),
							eq(invocationEvents.status, 'running')
						)
					),
			{ label: 'telemetry.recordCompletionByInvocationId' }
		);
		recordDataMovement({
			category: 'database',
			operation: 'telemetry.invocation.update',
			status: 'success',
			summary: { invocationId, status: input.status },
			target: 'invocation_events',
		});
	} catch (err) {
		webLogger.error(
			{ err, invocationId, status: input.status },
			'telemetry.recordCompletionByInvocationId failed'
		);
	}
}

export async function recordCompletionBySessionId(
	db: WebDatabase,
	sessionId: string,
	input: RecordCompletionInput
): Promise<void> {
	if (input.status === 'running') return;
	try {
		await withSqliteRetry(
			() =>
				db
					.update(invocationEvents)
					.set({
						completedAt: input.completedAt,
						durationMs: input.durationMs,
						errorMessage: input.errorMessage ?? null,
						exitCode: input.exitCode ?? null,
						status: input.status,
					})
					.where(
						and(
							eq(invocationEvents.sessionId, sessionId),
							eq(invocationEvents.status, 'running')
						)
					),
			{ label: 'telemetry.recordCompletionBySessionId' }
		);
		recordDataMovement({
			category: 'database',
			operation: 'telemetry.invocation.update',
			status: 'success',
			summary: { sessionId, status: input.status },
			target: 'invocation_events',
		});
	} catch (err) {
		webLogger.error(
			{ err, sessionId, status: input.status },
			'telemetry.recordCompletionBySessionId failed'
		);
	}
}

// Sync the invocation_events row(s) linked to a run to that run's authoritative terminal facts.
// Called at every run terminal transition and right after recordStart, so the telemetry ledger
// never drifts from the `runs` row (runs is the source of truth). Idempotent — a no-op when the
// run is still running or has no telemetry row (e.g. direct-CLI runs).
export async function reconcileInvocationFromRun(
	commands: DbCommands,
	runId: string
): Promise<void> {
	try {
		const synced = await withSqliteRetry(() => commands.reconcileInvocationFromRun({ runId }), {
			label: 'telemetry.reconcileInvocationFromRun',
		});
		if (synced === 0) return;
		recordDataMovement({
			category: 'database',
			operation: 'telemetry.invocation.sync',
			status: 'success',
			summary: { runId, synced },
			target: 'invocation_events',
		});
	} catch (err) {
		webLogger.error({ err, runId }, 'telemetry.reconcileInvocationFromRun failed');
	}
}

export async function reconcileStaleInvocations(commands: DbCommands): Promise<number> {
	try {
		// The select-and-fail loop commits as one IMMEDIATE transaction inside the DB worker:
		// one fsync instead of N, the ledger is never observed half-reconciled, and the write
		// lock is taken up front so it cannot fail the deferred read->write upgrade under WAL.
		const reconciled = await withSqliteRetry(
			() => commands.reconcileStaleInvocations({ now: Date.now() }),
			{ label: 'telemetry.reconcileStaleInvocations' }
		);
		if (reconciled === 0) return 0;
		recordDataMovement({
			category: 'database',
			operation: 'telemetry.invocation.reconcile',
			status: 'success',
			summary: { reconciled },
			target: 'invocation_events',
		});
		webLogger.info({ reconciled }, 'Reconciled stale invocation_events on startup');
		return reconciled;
	} catch (err) {
		webLogger.error({ err }, 'telemetry.reconcileStaleInvocations failed');
		return 0;
	}
}

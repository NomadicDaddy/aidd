import { and, desc, eq, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { RunService } from '../runService.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { PipelineSessionRow, ResumeInFlightStep, ResumeResolution } from './types.ts';

import { pipelineSessions, pipelineStepResults, runs } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { isManagedStepType } from './helpers.ts';
import { sweepStrandedStepRows, terminalizeDuplicateInFlightRows } from './stepRowSweeps.ts';

export interface ResumableSession {
	resolution: ResumeResolution;
	session: PipelineSessionRow;
}

export interface ReconcileResult {
	failedCount: number;
	resumable: ResumableSession[];
}

interface ReconcilerDeps {
	/** Session ids with a live in-process execution — never resumed or failed by reconcile. */
	activeSessionIds: () => ReadonlySet<string>;
	db: WebDatabase;
	runService: RunService;
	telemetryService: TelemetryService;
}

// Snapshot in-flight sessions for the orchestrator to resume. Each `running`/`queued`
// row is classified: rows whose recipe is still readable and whose in-flight step (if
// any) is either re-attachable to a live managed run, terminalizable from a finished
// managed run, or recoverable by failing the step under `onFailure`, get returned as
// resumable. Rows that cannot be reconstructed (missing recipe, corrupt parametersJson)
// are marked failed inline here so resume callers only see actionable work.
export async function reconcileStaleSessions(
	deps: ReconcilerDeps,
	classifier: (session: PipelineSessionRow) => Promise<{ fail: string } | ResumeResolution>
): Promise<ReconcileResult> {
	await sweepStrandedStepRows(deps.db);
	const staleSessions = await deps.db
		.select()
		.from(pipelineSessions)
		.where(inArray(pipelineSessions.status, ['queued', 'running']));
	const resumable: ResumableSession[] = [];
	let failedCount = 0;
	const active = deps.activeSessionIds();
	for (const session of staleSessions) {
		// A session with a live execution is not stale — resuming it would run the same
		// steps twice and insert duplicate step rows (observed: two identical 'running'
		// rows for one step).
		if (active.has(session.id)) continue;
		let outcome: { fail: string } | ResumeResolution;
		try {
			outcome = await classifier(session);
		} catch (err) {
			outcome = {
				fail: `Pipeline session could not be classified for resume: ${
					err instanceof Error ? err.message : String(err)
				}`,
			};
		}
		if ('fail' in outcome) {
			await failSessionInline(deps, session, outcome.fail);
			failedCount += 1;
			continue;
		}
		resumable.push({ resolution: outcome, session });
	}
	return { failedCount, resumable };
}

async function failSessionInline(
	deps: ReconcilerDeps,
	session: PipelineSessionRow,
	errorMessage: string
): Promise<void> {
	const completedAt = Date.now();
	await deps.db
		.update(pipelineSessions)
		.set({
			completedAt,
			durationMs: completedAt - session.startedAt,
			errorMessage,
			status: 'failed',
		})
		.where(eq(pipelineSessions.id, session.id));
	await deps.db
		.update(pipelineStepResults)
		.set({
			completedAt,
			errorMessage: 'Pipeline step was active during web startup and cannot be resumed.',
			status: 'failed',
		})
		.where(
			and(
				eq(pipelineStepResults.sessionId, session.id),
				inArray(pipelineStepResults.status, ['queued', 'running'])
			)
		);
	await deps.telemetryService.recordCompletionBySessionId(session.id, {
		completedAt,
		durationMs: completedAt - session.startedAt,
		errorMessage,
		status: 'failed',
	});
	recordDataMovement({
		category: 'database',
		operation: 'pipeline.session.fail.inline',
		status: 'success',
		summary: { sessionId: session.id },
		target: 'pipelineSessions',
	});
}

// Inspects pipeline_step_results to derive resume coordinates for a session. The
// caller has already loaded the recipe; this method does not validate that the
// recipe still matches the persisted shape — recipe edits between launch and resume
// could shift sequence numbers and produce surprising results. That is an accepted
// trade-off for V1: recipes are operator-owned and rarely edited mid-flight.
export async function deriveResumeResolution(
	deps: ReconcilerDeps,
	session: PipelineSessionRow
): Promise<ResumeResolution> {
	const stepRows = await deps.db
		.select()
		.from(pipelineStepResults)
		.where(eq(pipelineStepResults.sessionId, session.id))
		.orderBy(desc(pipelineStepResults.displayOrder));
	const displayOrder = stepRows[0]?.displayOrder ?? 0;
	const inFlightRows = stepRows.filter(
		(row) =>
			row.depth === 0 &&
			row.phase === 'step' &&
			(row.status === 'running' || row.status === 'queued')
	);
	// More than one in-flight row means a duplicate execution. Resume the most recent (descending
	// displayOrder puts it first) and terminalize every other row so none remain stuck 'running'.
	const inFlightRow = inFlightRows[0];
	await terminalizeDuplicateInFlightRows(
		deps.db,
		session.id,
		inFlightRows.slice(1).map((row) => row.id)
	);
	if (!inFlightRow) {
		return {
			displayOrder,
			startSequenceNumber: Math.max(session.currentStepIndex + 1, 1),
		};
	}
	const stepIndex = inFlightRow.sequenceNumber - 1;
	const classification = await classifyInFlightStep(deps, inFlightRow);
	// If classification reconciled an orphaned run (the step row had no runId but a
	// matching non-terminal run exists for this session), persist the linkage so
	// resolveInFlightStep can re-attach instead of failing with "no run id".
	const effectiveRunId = classification.runId ?? inFlightRow.runId;
	if (effectiveRunId !== inFlightRow.runId && effectiveRunId !== null) {
		await deps.db
			.update(pipelineStepResults)
			.set({ runId: effectiveRunId })
			.where(eq(pipelineStepResults.id, inFlightRow.id));
	}
	const inFlightStep: ResumeInFlightStep = {
		action: classification.action,
		resultId: inFlightRow.id,
		runId: effectiveRunId,
		sequenceNumber: inFlightRow.sequenceNumber,
		startedAt: inFlightRow.startedAt,
		stepIndex,
		stepType: inFlightRow.stepType,
	};
	if (classification.failReason !== undefined)
		inFlightStep.failReason = classification.failReason;
	return {
		displayOrder,
		inFlightStep,
		startSequenceNumber: inFlightRow.sequenceNumber,
	};
}

interface InFlightClassification {
	action: 'fail' | 're-attach';
	failReason?: string;
	/** When set, overrides the step row's runId (orphan reconciliation). */
	runId?: null | string;
}

async function classifyInFlightStep(
	deps: ReconcilerDeps,
	row: typeof pipelineStepResults.$inferSelect
): Promise<InFlightClassification> {
	// Shell steps and hooks ran as attached children of the web process: they died
	// at SIGINT and cannot be revived. Managed steps (aidd-cli/skill) launch
	// via runService.launchRun, which detaches the child + writes a heartbeat — those
	// runs survive web restarts and the orchestrator can re-attach to them by runId.
	if (!isManagedStepType(row.stepType)) {
		return {
			action: 'fail',
			failReason: 'Shell or hook step did not survive web restart.',
		};
	}
	if (row.runId === null) {
		// Orphan reconciliation: a managed run may have been launched by the step
		// but not yet linked to the step-result row when the web process crashed
		// (the linkage happens after dispatch returns, but dispatch waits for the
		// run to complete). Search for a non-terminal run that belongs to this
		// session — if found, reconnect it so resume can re-attach instead of
		// orphaning the live process.
		const orphanedRun = await findOrphanedRunForStep(deps, row.sessionId);
		if (orphanedRun) {
			return { action: 're-attach', runId: orphanedRun.id };
		}
		return {
			action: 'fail',
			failReason: 'Managed step had no associated run id to re-attach to.',
		};
	}
	const run = await deps.runService.getRun(row.runId);
	if (!run) {
		return {
			action: 'fail',
			failReason: `Managed step's run row ${row.runId} was not found at resume.`,
		};
	}
	return { action: 're-attach' };
}

/**
 * Searches for a non-terminal `runs` row that belongs to the given pipeline session
 * but is not linked to any step-result row. This handles the launched-but-not-yet-linked
 * window where a managed run was started but the web process crashed before
 * `setStepRunId` persisted the linkage.
 *
 * @param deps - Reconciler dependencies (db, runService, telemetryService).
 * @param sessionId - The pipeline session id to search for orphaned runs under.
 * @returns The orphaned run's id, or undefined if no unlinked non-terminal run exists.
 */
async function findOrphanedRunForStep(
	deps: ReconcilerDeps,
	sessionId: string
): Promise<{ id: string } | undefined> {
	// Find non-terminal runs for this session.
	const candidates = await deps.db
		.select({ id: runs.id })
		.from(runs)
		.where(and(eq(runs.pipelineSessionId, sessionId), inArray(runs.status, ['running'])));
	if (candidates.length === 0) return undefined;
	// Exclude runs that are already linked to a step-result row.
	for (const candidate of candidates) {
		const linked = await deps.db
			.select({ id: pipelineStepResults.id })
			.from(pipelineStepResults)
			.where(eq(pipelineStepResults.runId, candidate.id))
			.limit(1);
		if (linked.length === 0) return candidate;
	}
	return undefined;
}

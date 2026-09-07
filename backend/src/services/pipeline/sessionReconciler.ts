import { desc, eq, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { PipelineStepStatus } from '../../types.ts';
import type { RunService } from '../runService.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { PipelineSessionRow, ResumeInFlightStep, ResumeResolution } from './types.ts';

import { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import { isManagedStepType } from './helpers.ts';
import { findOrphanedRunForStep } from './orphanedRunResolver.ts';
import { countCompletedTopLevelSteps } from './progressService.ts';
import { failUnresumableSession } from './sessionFailure.ts';
import {
	sweepStrandedStepRows,
	terminalizeDuplicateInFlightRows,
	terminalizeStrandedDescendants,
} from './stepRowSweeps.ts';

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
	runService: Pick<RunService, 'getRun'>;
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
	classifier: (session: PipelineSessionRow) => Promise<{ fail: string } | ResumeResolution>,
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
			await failUnresumableSession(deps, session, outcome.fail);
			failedCount += 1;
			continue;
		}
		resumable.push({ resolution: outcome, session });
	}
	return { failedCount, resumable };
}

// Inspects pipeline_step_results to derive resume coordinates for a session. The
// caller has already loaded the recipe; this method does not validate that the
// recipe still matches the persisted shape — recipe edits between launch and resume
// could shift sequence numbers and produce surprising results. That is an accepted
// trade-off: recipes are operator-owned and rarely edited mid-flight.
export async function deriveResumeResolution(
	deps: ReconcilerDeps,
	session: PipelineSessionRow,
): Promise<ResumeResolution> {
	const stepRows = await deps.db
		.select()
		.from(pipelineStepResults)
		.where(eq(pipelineStepResults.sessionId, session.id))
		.orderBy(desc(pipelineStepResults.displayOrder));
	const displayOrder = stepRows[0]?.displayOrder ?? 0;
	const completedTopLevelSteps = await countCompletedTopLevelSteps(deps.db, session.id);
	const lastTerminalTopLevelSequence = Math.max(
		0,
		...stepRows
			.filter(
				(row) =>
					row.parentStepResultId === null &&
					row.phase === 'step' &&
					row.status !== 'running' &&
					row.status !== 'queued',
			)
			.map((row) => row.sequenceNumber),
	);
	if (session.currentStepIndex !== completedTopLevelSteps) {
		await deps.db
			.update(pipelineSessions)
			.set({ currentStepIndex: completedTopLevelSteps })
			.where(eq(pipelineSessions.id, session.id));
	}
	const inFlightRows = stepRows.filter(
		(row) =>
			row.parentStepResultId === null &&
			row.phase === 'step' &&
			(row.status === 'running' || row.status === 'queued'),
	);
	// More than one in-flight row means a duplicate execution. Resume the most recent (descending
	// displayOrder puts it first) and terminalize every other row so none remain stuck 'running'.
	const inFlightRow = inFlightRows[0];
	await terminalizeDuplicateInFlightRows(
		deps.db,
		session.id,
		inFlightRows.slice(1).map((row) => row.id),
	);
	if (!inFlightRow) {
		return {
			displayOrder,
			startSequenceNumber: lastTerminalTopLevelSequence + 1,
		};
	}
	const inFlightStep = await resolveInFlightStepTree(deps, inFlightRow, stepRows);
	return {
		displayOrder,
		inFlightStep,
		startSequenceNumber: inFlightRow.sequenceNumber,
	};
}

async function resolveInFlightStepTree(
	deps: ReconcilerDeps,
	row: typeof pipelineStepResults.$inferSelect,
	stepRows: (typeof pipelineStepResults.$inferSelect)[],
): Promise<ResumeInFlightStep> {
	const stepIndex = row.sequenceNumber - 1;
	if (row.stepType === 'recipe-ref') {
		const directStepRows = stepRows.filter(
			(candidate) => candidate.parentStepResultId === row.id && candidate.phase === 'step',
		);
		const activeChildren = directStepRows.filter(
			(candidate) => candidate.status === 'running' || candidate.status === 'queued',
		);
		const activeChild = activeChildren[0];
		const previousChild = activeChild
			? undefined
			: directStepRows.find(
					(candidate) => candidate.status !== 'running' && candidate.status !== 'queued',
				);
		await terminalizeDuplicateInFlightRows(
			deps.db,
			row.sessionId,
			activeChildren.slice(1).map((candidate) => candidate.id),
		);
		const child = activeChild
			? await resolveInFlightStepTree(deps, activeChild, stepRows)
			: undefined;
		return {
			action: 'resume-recipe',
			...(child ? { child } : {}),
			childStartSequenceNumber:
				activeChild?.sequenceNumber ??
				Math.max(0, ...directStepRows.map((candidate) => candidate.sequenceNumber)) + 1,
			...(previousChild
				? {
						previousChildResult: {
							...(previousChild.errorMessage
								? { errorMessage: previousChild.errorMessage }
								: {}),
							sequenceNumber: previousChild.sequenceNumber,
							status: previousChild.status as PipelineStepStatus,
						},
					}
				: {}),
			resultId: row.id,
			runId: null,
			sequenceNumber: row.sequenceNumber,
			startedAt: row.startedAt,
			stepIndex,
			stepType: row.stepType,
		};
	}
	await terminalizeStrandedDescendants(deps.db, row.id, stepRows);
	const classification = await classifyInFlightStep(deps, row);
	// If classification reconciled an orphaned run (the step row had no runId but a
	// matching run exists for this session), persist the linkage so
	// resolveInFlightStep can re-attach instead of failing with "no run id".
	const effectiveRunId = classification.runId ?? row.runId;
	if (effectiveRunId !== row.runId && effectiveRunId !== null) {
		await deps.db
			.update(pipelineStepResults)
			.set({ runId: effectiveRunId })
			.where(eq(pipelineStepResults.id, row.id));
	}
	const inFlightStep: ResumeInFlightStep = {
		action: classification.action,
		resultId: row.id,
		runId: effectiveRunId,
		sequenceNumber: row.sequenceNumber,
		startedAt: row.startedAt,
		stepIndex,
		stepType: row.stepType,
	};
	if (classification.failReason !== undefined)
		inFlightStep.failReason = classification.failReason;
	return inFlightStep;
}

interface InFlightClassification {
	action: 'fail' | 're-attach';
	failReason?: string;
	/** When set, overrides the step row's runId (orphan reconciliation). */
	runId?: null | string;
}

async function classifyInFlightStep(
	deps: ReconcilerDeps,
	row: typeof pipelineStepResults.$inferSelect,
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
		// run to complete). Search for an unlinked run that belongs to this session,
		// including a run that finished during the restart, so resume can re-attach
		// without losing its terminal result and output.
		const orphanedRun = await findOrphanedRunForStep(deps.db, row.sessionId);
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

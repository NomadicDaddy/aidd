import { killProcessTree } from 'aidd-shared/lib/processTree';
import { and, eq, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type {
	PipelineSessionStatus,
	PipelineStepPhase,
	PipelineStepResultRecord,
	PipelineStepStatus,
} from '../../types.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { BroadcastService } from './broadcastService.ts';
import type { ReportBuilder } from './reportBuilder.ts';
import type { ExecutionContext, PipelineSessionRow, ResumeResolution } from './types.ts';

import { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { RunControlError, type RunService } from '../runService.ts';
import { PROCESS_CLEANUP_TIMEOUT_MS, STEP_CLEANUP_TIMEOUT_MS } from './constants.ts';
import { createPipelineStepResultId, isActiveSessionStatus } from './helpers.ts';
import { toStepResultRecord } from './recordMappers.ts';
import {
	deriveResumeResolution as deriveResumeResolutionFn,
	type ReconcileResult,
	reconcileStaleSessions as reconcileStaleSessionsFn,
} from './sessionReconciler.ts';

export type { ReconcileResult } from './sessionReconciler.ts';

export class SessionLifecycle {
	private readonly db: WebDatabase;
	private readonly broadcast: BroadcastService;
	private readonly report: ReportBuilder;
	private readonly runService: RunService;
	private readonly telemetryService: TelemetryService;
	private readonly activeShellProcesses: Map<string, Set<ReturnType<typeof Bun.spawn>>>;
	private readonly stopFlags: Set<string>;
	private readonly activeExecutions: Map<string, Promise<void>>;

	constructor(input: {
		activeExecutions: Map<string, Promise<void>>;
		activeShellProcesses: Map<string, Set<ReturnType<typeof Bun.spawn>>>;
		broadcast: BroadcastService;
		db: WebDatabase;
		report: ReportBuilder;
		runService: RunService;
		stopFlags: Set<string>;
		telemetryService: TelemetryService;
	}) {
		this.db = input.db;
		this.broadcast = input.broadcast;
		this.report = input.report;
		this.runService = input.runService;
		this.telemetryService = input.telemetryService;
		this.activeShellProcesses = input.activeShellProcesses;
		this.stopFlags = input.stopFlags;
		this.activeExecutions = input.activeExecutions;
	}

	async reconcileStaleSessions(
		classifier: (session: PipelineSessionRow) => Promise<{ fail: string } | ResumeResolution>,
	): Promise<ReconcileResult> {
		return reconcileStaleSessionsFn(
			{
				activeSessionIds: () => new Set(this.activeExecutions.keys()),
				db: this.db,
				runService: this.runService,
				telemetryService: this.telemetryService,
			},
			classifier,
		);
	}

	async deriveResumeResolution(session: PipelineSessionRow): Promise<ResumeResolution> {
		return deriveResumeResolutionFn(
			{
				activeSessionIds: () => new Set(this.activeExecutions.keys()),
				db: this.db,
				runService: this.runService,
				telemetryService: this.telemetryService,
			},
			session,
		);
	}

	async stopSession(id: string): Promise<void> {
		const session = await this.report.getSession(id);
		if (!session) throw new RunControlError(`Pipeline session not found: ${id}`, 404);
		if (!isActiveSessionStatus(session.status)) {
			throw new RunControlError(
				`Pipeline session is already in terminal status '${session.status}': ${id}`,
			);
		}
		this.stopFlags.add(id);
		recordDataMovement({
			category: 'database',
			operation: 'pipeline.session.stop.request',
			status: 'success',
			summary: { sessionId: id },
			target: 'pipelineSessions',
		});
		const activeSteps = await this.db
			.select()
			.from(pipelineStepResults)
			.where(
				and(
					eq(pipelineStepResults.sessionId, id),
					inArray(pipelineStepResults.status, ['queued', 'running']),
				),
			);
		for (const step of activeSteps) {
			if (step.runId === null) continue;
			try {
				await this.runService.stopRun(step.runId);
			} catch {
				continue;
			}
		}
		const shellProcesses = [...(this.activeShellProcesses.get(id) ?? [])];
		for (const childProcess of shellProcesses) {
			await killProcessTree(childProcess.pid);
			childProcess.kill();
		}
		await Promise.allSettled(
			shellProcesses.map(
				(childProcess) =>
					Promise.race([
						childProcess.exited,
						Bun.sleep(STEP_CLEANUP_TIMEOUT_MS),
					]) as Promise<number | void>,
			),
		);
		const completedAt = Date.now();
		await this.db
			.update(pipelineStepResults)
			.set({ completedAt, status: 'stopped' })
			.where(
				and(
					eq(pipelineStepResults.sessionId, id),
					inArray(pipelineStepResults.status, ['queued', 'running']),
				),
			);
		await this.finishSession(id, 'stopped', completedAt, undefined);
		const execution = this.activeExecutions.get(id);
		if (execution) {
			await Promise.race([execution, Bun.sleep(PROCESS_CLEANUP_TIMEOUT_MS)]);
		}
	}

	async finishSession(
		sessionId: string,
		status: PipelineSessionStatus,
		completedAt: number,
		errorMessage: string | undefined,
	): Promise<void> {
		const session = await this.report.getSession(sessionId);
		if (!session) return;
		if (!isActiveSessionStatus(session.status)) return;
		await this.db
			.update(pipelineSessions)
			.set({
				completedAt,
				durationMs: completedAt - session.startedAt,
				errorMessage: errorMessage ?? null,
				status,
			})
			.where(eq(pipelineSessions.id, sessionId));
		recordDataMovement({
			category: 'database',
			operation: 'pipeline.session.finish',
			status: 'success',
			summary: { sessionId, status },
			target: 'pipelineSessions',
		});
		if (status !== 'queued') {
			// invocation_events.status has no 'completed_with_failures' member; a partial
			// success is recorded as 'failed' for telemetry (the recipe did not complete
			// cleanly) while the richer status lives on the session row.
			await this.telemetryService.recordCompletionBySessionId(sessionId, {
				completedAt,
				durationMs: completedAt - session.startedAt,
				errorMessage,
				status: status === 'completed_with_failures' ? 'failed' : status,
			});
		}
		this.broadcast.sessionStatus(sessionId, status);
	}

	async createStepResult(input: {
		context: ExecutionContext;
		parentStepResultId?: string | undefined;
		phase: PipelineStepPhase;
		sequenceNumber: number;
		stepName: string;
		stepType: string;
	}): Promise<PipelineStepResultRecord> {
		const id = createPipelineStepResultId();
		input.context.displayOrder += 1;
		await this.db.insert(pipelineStepResults).values({
			depth: input.context.depth,
			displayOrder: input.context.displayOrder,
			id,
			parentStepResultId: input.parentStepResultId ?? null,
			phase: input.phase,
			sequenceNumber: input.sequenceNumber,
			sessionId: input.context.sessionId,
			status: 'queued',
			stepName: input.stepName,
			stepType: input.stepType,
		});
		recordDataMovement({
			category: 'database',
			operation: 'pipeline.step.insert',
			status: 'success',
			summary: { resultId: id, sessionId: input.context.sessionId, stepType: input.stepType },
			target: 'pipelineStepResults',
		});
		const row = (
			await this.db
				.select()
				.from(pipelineStepResults)
				.where(eq(pipelineStepResults.id, id))
				.limit(1)
		)[0];
		if (!row) throw new Error(`Pipeline step result was not persisted: ${id}`);
		return toStepResultRecord(row);
	}

	async markStepRunning(resultId: string, startedAt: number): Promise<void> {
		await this.db
			.update(pipelineStepResults)
			.set({ startedAt, status: 'running' })
			.where(eq(pipelineStepResults.id, resultId));
		recordDataMovement({
			category: 'database',
			operation: 'pipeline.step.running',
			status: 'success',
			summary: { resultId },
			target: 'pipelineStepResults',
		});
	}

	async completeStep(input: {
		completedAt: number;
		errorMessage?: string | undefined;
		exitCode?: number | undefined;
		outputSummary?: string | undefined;
		resultId: string;
		startedAt: number;
		status: PipelineStepStatus;
	}): Promise<void> {
		await this.db
			.update(pipelineStepResults)
			.set({
				completedAt: input.completedAt,
				durationMs: input.completedAt - input.startedAt,
				errorMessage: input.errorMessage ?? null,
				exitCode: input.exitCode ?? null,
				outputSummary: input.outputSummary ?? null,
				status: input.status,
			})
			.where(eq(pipelineStepResults.id, input.resultId));
		recordDataMovement({
			category: 'database',
			operation: 'pipeline.step.complete',
			status: 'success',
			summary: { resultId: input.resultId, status: input.status },
			target: 'pipelineStepResults',
		});
	}

	async setStepRunId(resultId: string, runId: string): Promise<void> {
		await this.db
			.update(pipelineStepResults)
			.set({ runId })
			.where(eq(pipelineStepResults.id, resultId));
		recordDataMovement({
			category: 'database',
			operation: 'pipeline.step.run.link',
			status: 'success',
			summary: { resultId, runId },
			target: 'pipelineStepResults',
		});
	}
}

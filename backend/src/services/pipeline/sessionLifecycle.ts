import { killProcessTree } from 'aidd-shared/lib/processTree';
import { and, eq, inArray } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { PipelineSessionStatus, PipelineStepResultRecord } from '../../types.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { BroadcastService } from './broadcastService.ts';
import type { ReportBuilder } from './reportBuilder.ts';
import type { CompleteStepRowInput, InsertStepResultInput } from './stepRowWriter.ts';
import type { PipelineSessionRow, ResumeResolution } from './types.ts';

import { pipelineSessions, pipelineStepResults } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { RunControlError, type RunService } from '../runService.ts';
import { PROCESS_CLEANUP_TIMEOUT_MS, STEP_CLEANUP_TIMEOUT_MS } from './constants.ts';
import { isActiveSessionStatus } from './helpers.ts';
import { PipelineProgressService } from './progressService.ts';
import {
	deriveResumeResolution as deriveResumeResolutionFn,
	type ReconcileResult,
	reconcileStaleSessions as reconcileStaleSessionsFn,
} from './sessionReconciler.ts';
import {
	completeStepRow,
	insertStepResult,
	linkStepRowRun,
	markStepRowRunning,
} from './stepRowWriter.ts';

export type { ReconcileResult } from './sessionReconciler.ts';

export class SessionLifecycle {
	readonly progress: PipelineProgressService;
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
		this.progress = new PipelineProgressService(input.db, input.broadcast);
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
		await this.progress.refreshCompleted(id);
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
		this.runService.requestRetentionSweep();
	}

	// The four per-row writes live in `stepRowWriter.ts`; they stay on this class because every
	// caller already holds a lifecycle, and because `markStepRunning` has to publish progress after
	// the write — the one thing the writer module deliberately does not know about.
	async createStepResult(input: InsertStepResultInput): Promise<PipelineStepResultRecord> {
		return insertStepResult(this.db, input);
	}

	async markStepRunning(resultId: string, startedAt: number): Promise<void> {
		await markStepRowRunning(this.db, resultId, startedAt);
		await this.progress.publishActive(resultId);
	}

	async completeStep(input: CompleteStepRowInput): Promise<void> {
		await completeStepRow(this.db, input);
	}

	async setStepRunId(resultId: string, runId: string): Promise<void> {
		await linkStepRowRun(this.db, resultId, runId);
	}
}

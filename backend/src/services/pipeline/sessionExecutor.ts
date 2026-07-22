import { eq } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { PipelineSessionStatus, RecipeDefinition } from '../../types.ts';
import type { BroadcastService } from './broadcastService.ts';
import type { ReportBuilder } from './reportBuilder.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { StepExecutor } from './stepExecutor.ts';
import type { ExecutionContext, ResumeResolution } from './types.ts';

import { pipelineSessions } from '../../db/schema.ts';
import { recordDataMovement } from '../dataMovementTrace.ts';
import { stringifyError } from './helpers.ts';
import { resolveSessionTerminal } from './outcomeSummary.ts';
import { dumpSessionMetrics } from './sessionMetricsDump.ts';

interface PipelineSessionExecutorInput {
	broadcast: BroadcastService;
	db: WebDatabase;
	lifecycle: SessionLifecycle;
	report: ReportBuilder;
	stepExecutor: StepExecutor;
	stopFlags: Set<string>;
}

export class PipelineSessionExecutor {
	private readonly input: PipelineSessionExecutorInput;

	constructor(input: PipelineSessionExecutorInput) {
		this.input = input;
	}

	async execute(recipe: RecipeDefinition, context: ExecutionContext): Promise<void> {
		await this.markRunning(context.sessionId, 'pipeline.session.running');
		try {
			const result = await this.input.stepExecutor.executeRecipeSteps(recipe, context);
			await this.finishResult(context, result);
		} catch (err) {
			await this.finalize(context, 'failed', Date.now(), stringifyError(err));
		} finally {
			this.input.stopFlags.delete(context.sessionId);
		}
	}

	async resume(
		recipe: RecipeDefinition,
		context: ExecutionContext,
		resolution: ResumeResolution
	): Promise<void> {
		await this.markRunning(context.sessionId, 'pipeline.session.resume');
		try {
			const result = resolution.inFlightStep
				? await this.input.stepExecutor.resumeRecipeSteps(
						recipe,
						context,
						resolution.inFlightStep
					)
				: await this.input.stepExecutor.executeRecipeSteps(
						recipe,
						context,
						undefined,
						resolution.startSequenceNumber
					);
			await this.finishResult(context, result);
		} catch (err) {
			await this.finalize(context, 'failed', Date.now(), stringifyError(err));
		} finally {
			this.input.stopFlags.delete(context.sessionId);
		}
	}

	// Terminalizes a non-stopped session from its persisted step results so a partial
	// success (some steps completed, a later one failed) resolves to
	// 'completed_with_failures' with a failed-step summary rather than a bare 'failed'.
	private async finishResult(
		context: ExecutionContext,
		result: { errorMessage?: string | undefined; ok: boolean; stopped?: boolean }
	): Promise<void> {
		const completedAt = Date.now();
		if (result.stopped || this.input.stopFlags.has(context.sessionId)) {
			await this.finalize(context, 'stopped', completedAt, undefined);
			return;
		}
		const report = await this.input.report.getReport(context.sessionId);
		const outcome = resolveSessionTerminal(
			result.ok,
			result.errorMessage,
			report?.stepResults ?? []
		);
		await this.finalize(context, outcome.status, completedAt, outcome.errorMessage);
	}

	private async markRunning(sessionId: string, operation: string): Promise<void> {
		await this.input.db
			.update(pipelineSessions)
			.set({ status: 'running' })
			.where(eq(pipelineSessions.id, sessionId));
		recordDataMovement({
			category: 'database',
			operation,
			status: 'success',
			summary: { sessionId },
			target: 'pipelineSessions',
		});
		this.input.broadcast.sessionStatus(sessionId, 'running');
	}

	private async finalize(
		context: ExecutionContext,
		status: PipelineSessionStatus,
		completedAt: number,
		errorMessage: string | undefined
	): Promise<void> {
		// Write the session-metrics dump BEFORE persisting the terminal status, so a consumer
		// that observes a completed session always finds its dump on disk (the dump is best-
		// effort and swallows its own errors, so this never blocks finishSession).
		await dumpSessionMetrics(this.input.report, context.sessionId, context.projectDir, {
			completedAt,
			status,
		});
		await this.input.lifecycle.finishSession(
			context.sessionId,
			status,
			completedAt,
			errorMessage
		);
	}
}

import { and, eq, isNull, lt } from 'drizzle-orm';

import type { WebDatabase } from '../../db/client.ts';
import type { RecipeDefinition } from '../../types.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { ExecutionContext, StepExecutionResult } from './types.ts';

import { pipelineStepResults, runs } from '../../db/schema.ts';
import { optsIntoNoWorkEnd } from './noWork.ts';

export interface SkippedStepDeps {
	afterTopLevelStep: ((sessionId: string, projectDir: string) => Promise<void>) | undefined;
	db: WebDatabase;
	lifecycle: SessionLifecycle;
}

interface NoWorkStep {
	name: string;
	sequenceNumber: number;
}

// Writes a step that will not run as a row born `skipped`, so the session report still accounts
// for it and a restart never finds it half-written.
export async function recordSkippedStep(
	deps: SkippedStepDeps,
	step: RecipeDefinition['steps'][number],
	sequenceNumber: number,
	context: ExecutionContext,
	parentStepResultId: string | undefined,
	outputSummary: string,
): Promise<void> {
	await deps.lifecycle.createStepResult({
		context,
		parentStepResultId,
		phase: 'step',
		sequenceNumber,
		skippedSummary: outputSummary,
		stepDefinitionId: step.id,
		stepName: step.name,
		stepType: step.stepType,
	});
	if (context.depth === 0) {
		await deps.lifecycle.progress.refreshCompleted(context.sessionId);
		if (deps.afterTopLevelStep) {
			await deps.afterTopLevelStep(context.sessionId, context.projectDir);
		}
	}
}

// Ends a recipe after a step that found no work, recording every later step as skipped rather
// than leaving it unrun, so the session terminalizes green with its whole shape in the report.
// `fromSequenceNumber` lets a resumed session write only the skips a restart interrupted.
export async function skipRemainingSteps(
	deps: SkippedStepDeps,
	recipe: RecipeDefinition,
	context: ExecutionContext,
	parentStepResultId: string | undefined,
	noWorkStep: NoWorkStep,
	fromSequenceNumber = noWorkStep.sequenceNumber + 1,
): Promise<StepExecutionResult> {
	for (const [index, step] of recipe.steps.entries()) {
		const sequenceNumber = index + 1;
		if (sequenceNumber <= noWorkStep.sequenceNumber || sequenceNumber < fromSequenceNumber) {
			continue;
		}
		await recordSkippedStep(
			deps,
			step,
			sequenceNumber,
			context,
			parentStepResultId,
			`Skipped: ${noWorkStep.name} found no eligible work`,
		);
	}
	return { ok: true, stopped: false };
}

// Finishes the skips a restart interrupted, when an earlier step of this frame already ended the
// recipe; undefined when the frame should carry on from `startSequenceNumber` as normal.
export async function finishNoWorkEnd(
	deps: SkippedStepDeps,
	recipe: RecipeDefinition,
	context: ExecutionContext,
	parentStepResultId: string | undefined,
	startSequenceNumber: number,
): Promise<StepExecutionResult | undefined> {
	if (startSequenceNumber <= 1) return undefined;
	const noWorkStep = await persistedNoWorkStep(
		deps.db,
		recipe,
		context,
		parentStepResultId,
		startSequenceNumber,
	);
	if (!noWorkStep) return undefined;
	return await skipRemainingSteps(
		deps,
		recipe,
		context,
		parentStepResultId,
		noWorkStep,
		startSequenceNumber,
	);
}

// A resumed recipe frame is told only where to restart, so it must rediscover whether an earlier
// step already ended it. The durable record is the one the run itself wrote: the step row links a
// run whose stop reason is `no_work`. Without this, a restart between that step finishing and the
// last skip being written resumed at the next sequence and launched the review it was meant to
// skip.
async function persistedNoWorkStep(
	db: WebDatabase,
	recipe: RecipeDefinition,
	context: ExecutionContext,
	parentStepResultId: string | undefined,
	beforeSequenceNumber: number,
): Promise<NoWorkStep | undefined> {
	const rows = await db
		.select({ sequenceNumber: pipelineStepResults.sequenceNumber })
		.from(pipelineStepResults)
		.innerJoin(runs, eq(runs.id, pipelineStepResults.runId))
		.where(
			and(
				eq(pipelineStepResults.sessionId, context.sessionId),
				parentStepResultId === undefined
					? isNull(pipelineStepResults.parentStepResultId)
					: eq(pipelineStepResults.parentStepResultId, parentStepResultId),
				eq(pipelineStepResults.phase, 'step'),
				eq(pipelineStepResults.status, 'completed'),
				lt(pipelineStepResults.sequenceNumber, beforeSequenceNumber),
				eq(runs.status, 'completed'),
				eq(runs.stopReason, 'no_work'),
			),
		);
	const sequences = rows.map((row) => row.sequenceNumber).sort((a, b) => b - a);
	for (const sequenceNumber of sequences) {
		const step = recipe.steps[sequenceNumber - 1];
		if (step && optsIntoNoWorkEnd(step)) return { name: step.name, sequenceNumber };
	}
	return undefined;
}

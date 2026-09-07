import type { WebDatabase } from '../../db/client.ts';
import type { RecipeDefinition } from '../../types.ts';
import type { RecipeService } from '../recipeService.ts';
import type { RunService } from '../runService.ts';
import type { SkillService } from '../skillService.ts';
import type { TelemetryService } from '../telemetryService.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';

import { AutoFixRunner } from './autoFixRunner.ts';
import { HookRunner } from './hookRunner.ts';
import { resolveInFlightStep } from './inFlightStepResolver.ts';
import { ManagedStepHandler } from './managedStepHandler.ts';
import { RecipeRefHandler } from './recipeRefHandler.ts';
import { resumeRecipeRefStep } from './recipeRefResumer.ts';
import { RunWaiter } from './runWaiter.ts';
import { ShellCommandRunner } from './shellCommandRunner.ts';
import { ShellStepHandler } from './shellStepHandler.ts';
import { StepDispatcher } from './stepDispatcher.ts';
import { executeStep } from './stepRunner.ts';
import {
	type ExecutionContext,
	type ResumeInFlightStep,
	type StepExecutionResult,
} from './types.ts';

export function shouldRunRecipeStep(
	step: RecipeDefinition['steps'][number],
	parameters: Record<string, string>,
): boolean {
	return step.when === undefined || parameters[step.when.parameter] === step.when.equals;
}

// Orchestrator facade: owns the step iteration / retry / hook loop and delegates
// every leaf concern (dispatch, shell, managed runs, recipe recursion, auto-fix,
// hooks, run-waiting) to focused, independently-testable units. The constructor
// signature is unchanged so PipelineService wiring does not change.
export class StepExecutor {
	private readonly lifecycle: SessionLifecycle;
	private readonly stopFlags: Set<string>;
	private readonly dispatcher: StepDispatcher;
	private readonly autoFix: AutoFixRunner;
	private readonly hooks: HookRunner;
	private readonly runWaiter: RunWaiter;
	private readonly recipeRefHandler: RecipeRefHandler;
	// Refreshes the session-metrics dump after each top-level step so an in-session report
	// step (e.g. new-app-from-idea's first-session report) can read prior steps' timings.
	private readonly afterTopLevelStep:
		((sessionId: string, projectDir: string) => Promise<void>) | undefined;

	constructor(input: {
		activeShellProcesses: Map<string, Set<ReturnType<typeof Bun.spawn>>>;
		afterTopLevelStep?: (sessionId: string, projectDir: string) => Promise<void>;
		db: WebDatabase;
		getAllowedRoots: () => readonly string[];
		lifecycle: SessionLifecycle;
		recipeService: RecipeService;
		runService: RunService;
		skillService: SkillService;
		stopFlags: Set<string>;
		telemetryService: TelemetryService;
	}) {
		this.lifecycle = input.lifecycle;
		this.stopFlags = input.stopFlags;
		this.afterTopLevelStep = input.afterTopLevelStep;
		const runWaiter = new RunWaiter({
			runService: input.runService,
			stopFlags: input.stopFlags,
		});
		this.runWaiter = runWaiter;
		const shell = new ShellCommandRunner({
			activeShellProcesses: input.activeShellProcesses,
			getAllowedRoots: input.getAllowedRoots,
		});
		this.recipeRefHandler = new RecipeRefHandler({
			recipeService: input.recipeService,
			resumeRecipeSteps: (recipe, context, inFlightStep, parentStepResultId, startSequence) =>
				this.resumeRecipeSteps(
					recipe,
					context,
					inFlightStep,
					parentStepResultId,
					startSequence,
				),
			runRecipeSteps: (recipe, context, parentStepResultId) =>
				this.executeRecipeSteps(recipe, context, parentStepResultId),
			telemetryService: input.telemetryService,
		});
		this.dispatcher = new StepDispatcher({
			managedStepHandler: new ManagedStepHandler({
				runService: input.runService,
				runWaiter,
				skillService: input.skillService,
				telemetryService: input.telemetryService,
			}),
			recipeRefHandler: this.recipeRefHandler,
			shellStepHandler: new ShellStepHandler({ shell }),
		});
		this.autoFix = new AutoFixRunner({
			lifecycle: input.lifecycle,
			runService: input.runService,
			runWaiter,
		});
		this.hooks = new HookRunner({ lifecycle: input.lifecycle, shell });
	}

	async executeRecipeSteps(
		recipe: RecipeDefinition,
		context: ExecutionContext,
		parentStepResultId?: string,
		startSequenceNumber = 1,
	): Promise<StepExecutionResult> {
		// Carried on `context` itself so a review -> remediate chain can hand its findings forward
		// instead of making the remediation run rediscover them. It must be the same object, not a
		// per-step copy: createStepResult increments context.displayOrder in place, so cloning the
		// context per step would strand that counter and collide on the session's display order.
		// Cleared at entry because a nested recipe inherits a spread copy of its parent's context
		// and its first step is not downstream of the parent's last one. Skipped steps do not
		// overwrite it; a resumed session starts with none, since the prior run's output is not
		// re-read from the step-result row.
		context.priorStepOutput = undefined;
		for (const [index, step] of recipe.steps.entries()) {
			const sequenceNumber = index + 1;
			if (sequenceNumber < startSequenceNumber) continue;
			if (this.stopFlags.has(context.sessionId)) return { ok: false, stopped: true };
			if (!shouldRunRecipeStep(step, context.parameters)) {
				const condition = step.when;
				if (!condition) throw new Error('Skipped recipe step is missing its condition');
				const skippedAt = Date.now();
				const skipped = await this.lifecycle.createStepResult({
					context,
					parentStepResultId,
					phase: 'step',
					sequenceNumber,
					stepDefinitionId: step.id,
					stepName: step.name,
					stepType: step.stepType,
				});
				await this.lifecycle.completeStep({
					completedAt: skippedAt,
					outputSummary: `Skipped: ${condition.parameter} did not equal ${condition.equals}`,
					resultId: skipped.id,
					startedAt: skippedAt,
					status: 'skipped',
				});
				if (context.depth === 0) {
					await this.lifecycle.progress.refreshCompleted(context.sessionId);
					if (this.afterTopLevelStep) {
						await this.afterTopLevelStep(context.sessionId, context.projectDir);
					}
				}
				continue;
			}
			// The persisted completed count is intentionally NOT bumped before executeStep.
			// The advance happens AFTER the step terminalizes (below). executeStep creates
			// the step-result row at its start, so a crash during execution leaves an
			// in-flight row for resume to re-attach/fail. A crash before the row is
			// created leaves the count on the last terminal step, so reconciliation retries
			// the correct next step rather than silently skipping it.
			const result = await executeStep(
				{
					autoFix: this.autoFix,
					dispatcher: this.dispatcher,
					hooks: this.hooks,
					lifecycle: this.lifecycle,
					stopFlags: this.stopFlags,
				},
				step,
				context,
				sequenceNumber,
				parentStepResultId,
			);
			// The agent message first, the transcript tail only as a fallback. outputSummary is a
			// byte-aligned tail of raw NDJSON, so forwarding it handed a remediation step a fragment
			// that began mid-line and cut the report off wherever 4000 bytes landed. Shell steps have
			// no agent message, and their stdout tail is the only thing there is to pass on.
			const producedOutput = (result.agentMessage ?? result.outputSummary)?.trim();
			context.priorStepOutput = producedOutput
				? { stepName: step.name, text: producedOutput }
				: undefined;
			// Refresh successful completion progress only after the step terminalizes. Combined
			// with the no-pre-bump approach above, this eliminates the bump-before-row window.
			if (context.depth === 0) {
				await this.lifecycle.progress.refreshCompleted(context.sessionId);
			}
			// Refresh the dump after each completed top-level step so a later in-session
			// report step reads the prior steps' metrics. Best-effort; never blocks the run.
			if (context.depth === 0 && this.afterTopLevelStep) {
				await this.afterTopLevelStep(context.sessionId, context.projectDir);
			}
			if (result.stopped) return result;
			if (!result.ok && (step.onFailure ?? 'stop') !== 'continue') return result;
		}
		return { ok: true, stopped: false };
	}

	// Resume entry point for sessions that were 'running'/'queued' at last web shutdown.
	// Resolves the persisted in-flight tree. A top-level recipe-ref recursively resumes
	// its active child until the deepest detached managed run has finished, then each
	// recipe frame unwinds before the normal iteration advances at that level.
	async resumeRecipeSteps(
		recipe: RecipeDefinition,
		context: ExecutionContext,
		inFlightStep: ResumeInFlightStep | undefined,
		parentStepResultId?: string,
		startSequenceNumber = inFlightStep?.sequenceNumber ?? 1,
	): Promise<StepExecutionResult> {
		if (!inFlightStep) {
			return await this.executeRecipeSteps(
				recipe,
				context,
				parentStepResultId,
				startSequenceNumber,
			);
		}
		if (inFlightStep.stepIndex >= recipe.steps.length) {
			return await this.executeRecipeSteps(
				recipe,
				context,
				parentStepResultId,
				recipe.steps.length + 1,
			);
		}
		const step = recipe.steps[inFlightStep.stepIndex];
		if (!step) {
			return await this.executeRecipeSteps(
				recipe,
				context,
				parentStepResultId,
				recipe.steps.length + 1,
			);
		}
		await this.lifecycle.progress.publishActive(inFlightStep.resultId);
		const inFlightResult =
			inFlightStep.action === 'resume-recipe'
				? await resumeRecipeRefStep(
						{
							lifecycle: this.lifecycle,
							recipeRefHandler: this.recipeRefHandler,
						},
						step,
						context,
						inFlightStep,
					)
				: await resolveInFlightStep(
						{ lifecycle: this.lifecycle, runWaiter: this.runWaiter },
						step,
						inFlightStep,
						context.sessionId,
					);
		if (context.depth === 0) {
			await this.lifecycle.progress.refreshCompleted(context.sessionId);
		}
		if (inFlightResult.stopped) return inFlightResult;
		if (!inFlightResult.ok && (step.onFailure ?? 'stop') !== 'continue') return inFlightResult;
		return await this.executeRecipeSteps(
			recipe,
			context,
			parentStepResultId,
			inFlightStep.sequenceNumber + 1,
		);
	}
}

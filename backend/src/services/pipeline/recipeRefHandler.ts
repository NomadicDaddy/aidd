import { sha256Json } from 'aidd-shared/content-hash';
import { basename } from 'node:path';

import type { RecipeConfigValue, RecipeDefinition } from '../../types.ts';
import type { RecipeService } from '../recipeService.ts';
import type { TelemetryService } from '../telemetryService.ts';

import { configString, configStringRecord, resolveParameters } from './helpers.ts';
import {
	type ExecutionContext,
	maxRecipeDepth,
	type ResumeRecipeRefStep,
	type StepDispatchResult,
	type StepExecutionResult,
} from './types.ts';

// Runs a nested recipe. The orchestrator injects its own recipe-steps runner so the
// recursion stays one-directional (orchestrator -> handler -> orchestrator) without a
// hard import cycle.
export type RecipeStepsRunner = (
	recipe: RecipeDefinition,
	context: ExecutionContext,
	parentStepResultId?: string,
) => Promise<{ errorMessage?: string | undefined; ok: boolean; stopped: boolean }>;

export type ResumeRecipeStepsRunner = (
	recipe: RecipeDefinition,
	context: ExecutionContext,
	inFlightStep: ResumeRecipeRefStep['child'],
	parentStepResultId: string,
	startSequenceNumber: number,
) => Promise<StepExecutionResult>;

export class RecipeRefHandler {
	private readonly recipeService: RecipeService;
	private readonly runRecipeSteps: RecipeStepsRunner;
	private readonly resumeRecipeSteps: ResumeRecipeStepsRunner;
	private readonly telemetryService: TelemetryService;

	constructor(input: {
		recipeService: RecipeService;
		resumeRecipeSteps: ResumeRecipeStepsRunner;
		runRecipeSteps: RecipeStepsRunner;
		telemetryService: TelemetryService;
	}) {
		this.recipeService = input.recipeService;
		this.runRecipeSteps = input.runRecipeSteps;
		this.resumeRecipeSteps = input.resumeRecipeSteps;
		this.telemetryService = input.telemetryService;
	}

	async handle(
		config: Record<string, RecipeConfigValue>,
		context: ExecutionContext,
		parentStepResultId: string,
	): Promise<StepDispatchResult> {
		const resolved = await this.resolveReference(config, context);
		if ('errorMessage' in resolved) return { errorMessage: resolved.errorMessage, ok: false };
		const startedAt = Date.now();
		const parentResourceId = context.lineage[context.lineage.length - 1];
		const childInvocationId = await this.telemetryService.recordStart({
			parentInvocationId: context.invocationId,
			parentResourceId,
			parentResourceType: 'recipe',
			projectName: basename(context.projectDir),
			projectPath: context.projectDir,
			resourceId: resolved.recipe.id,
			resourceName: resolved.recipe.name,
			resourceSha256: sha256Json(resolved.recipe),
			resourceType: 'recipe',
			sessionId: context.sessionId,
			source: 'recipe-step',
			startedAt,
		});
		const childContext: ExecutionContext = {
			...context,
			depth: context.depth + 1,
			invocationId: childInvocationId,
			lineage: [...context.lineage, resolved.recipe.id],
			parameters: resolved.parameters,
		};
		const childResult = await this.runRecipeSteps(
			resolved.recipe,
			childContext,
			parentStepResultId,
		);
		context.displayOrder = childContext.displayOrder;
		if (childInvocationId !== undefined) {
			const completedAt = Date.now();
			await this.telemetryService.recordCompletionByInvocationId(childInvocationId, {
				completedAt,
				durationMs: completedAt - startedAt,
				errorMessage: childResult.errorMessage,
				status: childResult.stopped ? 'stopped' : childResult.ok ? 'completed' : 'failed',
			});
		}
		return {
			errorMessage: childResult.errorMessage,
			ok: childResult.ok,
		};
	}

	async resume(
		config: Record<string, RecipeConfigValue>,
		context: ExecutionContext,
		parentStepResultId: string,
		resumeStep: ResumeRecipeRefStep,
	): Promise<StepExecutionResult> {
		const resolved = await this.resolveReference(config, context);
		if ('errorMessage' in resolved) {
			return { errorMessage: resolved.errorMessage, ok: false, stopped: false };
		}
		const previousResult = this.previousChildOutcome(resolved.recipe, resumeStep);
		if (previousResult) return previousResult;
		// No recordStart here: the child recipe's own invocation was recorded by the original
		// launch and is not re-derivable from the resume coordinates. Inheriting the session's
		// root through the spread keeps the resumed steps nested, where clearing it left them
		// claiming a parent recipe by id with no invocation to hang it on.
		const childContext: ExecutionContext = {
			...context,
			depth: context.depth + 1,
			lineage: [...context.lineage, resolved.recipe.id],
			parameters: resolved.parameters,
		};
		const result = await this.resumeRecipeSteps(
			resolved.recipe,
			childContext,
			resumeStep.child,
			parentStepResultId,
			resumeStep.childStartSequenceNumber,
		);
		context.displayOrder = childContext.displayOrder;
		return result;
	}

	private previousChildOutcome(
		recipe: RecipeDefinition,
		resumeStep: ResumeRecipeRefStep,
	): StepExecutionResult | undefined {
		const previous = resumeStep.previousChildResult;
		if (!previous) return undefined;
		if (previous.status === 'stopped') return { ok: false, stopped: true };
		if (previous.status !== 'failed') return undefined;
		const childStep = recipe.steps[previous.sequenceNumber - 1];
		if (childStep?.onFailure === 'continue') return undefined;
		return {
			errorMessage: previous.errorMessage ?? 'Nested recipe step failed before web restart.',
			ok: false,
			stopped: false,
		};
	}

	private async resolveReference(
		config: Record<string, RecipeConfigValue>,
		context: ExecutionContext,
	): Promise<
		{ errorMessage: string } | { parameters: Record<string, string>; recipe: RecipeDefinition }
	> {
		const recipeName = configString(config, 'recipeName');
		if (recipeName === undefined) return { errorMessage: 'recipe-ref is missing recipeName' };
		const recipe = await this.recipeService.findRecipeByName(recipeName);
		if (!recipe) return { errorMessage: `Referenced recipe not found: ${recipeName}` };
		if (context.lineage.includes(recipe.id)) {
			return {
				errorMessage: `Recipe cycle detected: ${[...context.lineage, recipe.id].join(' -> ')}`,
			};
		}
		if (context.depth + 1 > maxRecipeDepth) {
			return { errorMessage: `Recipe reference depth exceeded ${maxRecipeDepth}` };
		}
		const childParams = {
			...context.parameters,
			...configStringRecord(config, 'params'),
		};
		return {
			parameters: resolveParameters({
				parameters: childParams,
				projectDir: context.projectDir,
				recipe,
			}),
			recipe,
		};
	}
}

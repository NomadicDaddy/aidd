import { basename } from 'node:path';

import type { RecipeConfigValue, RecipeDefinition } from '../../types.ts';
import type { RecipeService } from '../recipeService.ts';
import type { TelemetryService } from '../telemetryService.ts';

import { configString, configStringRecord, resolveParameters } from './helpers.ts';
import { type ExecutionContext, maxRecipeDepth, type StepDispatchResult } from './types.ts';

// Runs a nested recipe. The orchestrator injects its own recipe-steps runner so the
// recursion stays one-directional (orchestrator -> handler -> orchestrator) without a
// hard import cycle.
export type RecipeStepsRunner = (
	recipe: RecipeDefinition,
	context: ExecutionContext,
	parentStepResultId?: string,
) => Promise<{ errorMessage?: string | undefined; ok: boolean; stopped: boolean }>;

export class RecipeRefHandler {
	private readonly recipeService: RecipeService;
	private readonly runRecipeSteps: RecipeStepsRunner;
	private readonly telemetryService: TelemetryService;

	constructor(input: {
		recipeService: RecipeService;
		runRecipeSteps: RecipeStepsRunner;
		telemetryService: TelemetryService;
	}) {
		this.recipeService = input.recipeService;
		this.runRecipeSteps = input.runRecipeSteps;
		this.telemetryService = input.telemetryService;
	}

	async handle(
		config: Record<string, RecipeConfigValue>,
		context: ExecutionContext,
		parentStepResultId: string,
	): Promise<StepDispatchResult> {
		const recipeName = configString(config, 'recipeName');
		if (recipeName === undefined)
			return { errorMessage: 'recipe-ref is missing recipeName', ok: false };
		const recipe = await this.recipeService.findRecipeByName(recipeName);
		if (!recipe)
			return { errorMessage: `Referenced recipe not found: ${recipeName}`, ok: false };
		if (context.lineage.includes(recipe.id)) {
			return {
				errorMessage: `Recipe cycle detected: ${[...context.lineage, recipe.id].join(' -> ')}`,
				ok: false,
			};
		}
		if (context.depth + 1 > maxRecipeDepth) {
			return { errorMessage: `Recipe reference depth exceeded ${maxRecipeDepth}`, ok: false };
		}
		const childParams = {
			...context.parameters,
			...configStringRecord(config, 'params'),
		};
		const resolvedParams = resolveParameters({
			parameters: childParams,
			projectDir: context.projectDir,
			recipe,
		});
		const startedAt = Date.now();
		const parentResourceId = context.lineage[context.lineage.length - 1];
		const childInvocationId = await this.telemetryService.recordStart({
			parentInvocationId: context.invocationId,
			parentResourceId,
			parentResourceType: 'recipe',
			projectName: basename(context.projectDir),
			projectPath: context.projectDir,
			resourceId: recipe.id,
			resourceName: recipe.name,
			resourceType: 'recipe',
			sessionId: context.sessionId,
			source: 'recipe-step',
			startedAt,
		});
		const childContext: ExecutionContext = {
			...context,
			depth: context.depth + 1,
			invocationId: childInvocationId,
			lineage: [...context.lineage, recipe.id],
			parameters: resolvedParams,
		};
		const childResult = await this.runRecipeSteps(recipe, childContext, parentStepResultId);
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
}

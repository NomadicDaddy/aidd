import type { RecipeConfigValue, RecipeStepDefinition } from '../../types.ts';
import type { ManagedStepHandler } from './managedStepHandler.ts';
import type { RecipeRefHandler } from './recipeRefHandler.ts';
import type { ShellStepHandler } from './shellStepHandler.ts';
import type { ExecutionContext, StepDispatchResult } from './types.ts';

import { isManagedStepType } from './helpers.ts';

// Routes a step to the focused handler for its type. Adding a new step type means
// adding one branch here and one handler module, not editing the orchestrator.
export class StepDispatcher {
	private readonly shellStepHandler: ShellStepHandler;
	private readonly recipeRefHandler: RecipeRefHandler;
	private readonly managedStepHandler: ManagedStepHandler;

	constructor(input: {
		managedStepHandler: ManagedStepHandler;
		recipeRefHandler: RecipeRefHandler;
		shellStepHandler: ShellStepHandler;
	}) {
		this.shellStepHandler = input.shellStepHandler;
		this.recipeRefHandler = input.recipeRefHandler;
		this.managedStepHandler = input.managedStepHandler;
	}

	async dispatch(
		step: RecipeStepDefinition,
		config: Record<string, RecipeConfigValue>,
		context: ExecutionContext,
		resultId: string,
		linkRun: (runId: string) => Promise<void>,
	): Promise<StepDispatchResult> {
		if (step.stepType === 'shell') return await this.shellStepHandler.handle(config, context);
		if (step.stepType === 'recipe-ref') {
			return await this.recipeRefHandler.handle(config, context, resultId);
		}
		if (isManagedStepType(step.stepType)) {
			return await this.managedStepHandler.handle(step, config, context, linkRun);
		}
		return {
			errorMessage: `Unsupported pipeline step type: ${step.stepType}`,
			ok: false,
		};
	}
}

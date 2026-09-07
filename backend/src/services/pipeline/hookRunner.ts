import type { RecipeConfigValue } from '../../types.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { ShellCommandRunner } from './shellCommandRunner.ts';
import type { ExecutionContext } from './types.ts';

import { configString } from './helpers.ts';

// Runs a step's pre/post hook as a tracked shell command and records its own
// step-result row so hook failures are visible without aborting the parent step.
export class HookRunner {
	private readonly lifecycle: SessionLifecycle;
	private readonly shell: ShellCommandRunner;

	constructor(input: { lifecycle: SessionLifecycle; shell: ShellCommandRunner }) {
		this.lifecycle = input.lifecycle;
		this.shell = input.shell;
	}

	async run(input: {
		context: ExecutionContext;
		hookConfig: Record<string, RecipeConfigValue>;
		parentStepResultId: string;
		phase: 'post-hook' | 'pre-hook';
		sequenceNumber: number;
		stepDefinitionId: string;
		stepName: string;
	}): Promise<void> {
		const result = await this.lifecycle.createStepResult({
			context: input.context,
			parentStepResultId: input.parentStepResultId,
			phase: input.phase,
			sequenceNumber: input.sequenceNumber,
			stepDefinitionId: input.stepDefinitionId,
			stepName: input.stepName,
			stepType: 'hook',
		});
		const startedAt = Date.now();
		await this.lifecycle.markStepRunning(result.id, startedAt);
		const command = configString(input.hookConfig, 'command');
		if (command === undefined) {
			await this.lifecycle.completeStep({
				completedAt: Date.now(),
				errorMessage: 'Hook is missing command',
				resultId: result.id,
				startedAt,
				status: 'failed',
			});
			return;
		}
		const dispatch = await this.shell.run(
			command,
			input.context.projectDir,
			input.context.sessionId,
		);
		await this.lifecycle.completeStep({
			completedAt: Date.now(),
			errorMessage: dispatch.errorMessage,
			exitCode: dispatch.exitCode,
			outputSummary: dispatch.outputSummary,
			resultId: result.id,
			startedAt,
			status: dispatch.ok ? 'completed' : 'failed',
		});
	}
}

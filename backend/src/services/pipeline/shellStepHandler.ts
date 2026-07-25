import type { RecipeConfigValue } from '../../types.ts';
import type { ShellCommandRunner } from './shellCommandRunner.ts';
import type { ExecutionContext, StepDispatchResult } from './types.ts';

import { configString } from './helpers.ts';

// Resolves a shell step's config and delegates to the shared command runner.
export class ShellStepHandler {
	private readonly shell: ShellCommandRunner;

	constructor(input: { shell: ShellCommandRunner }) {
		this.shell = input.shell;
	}

	async handle(
		config: Record<string, RecipeConfigValue>,
		context: ExecutionContext,
	): Promise<StepDispatchResult> {
		const command = configString(config, 'command');
		if (command === undefined)
			return { errorMessage: 'Shell step is missing command', ok: false };
		return await this.shell.run(
			command,
			configString(config, 'cwd') ?? context.projectDir,
			context.sessionId,
		);
	}
}

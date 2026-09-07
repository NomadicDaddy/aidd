import { sha256Json } from 'aidd-shared/content-hash';

import type { RecipeStepDefinition } from '../../types.ts';
import type { RunService } from '../runService.ts';
import type { RunWaiter } from './runWaiter.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { ExecutionContext } from './types.ts';

import { stringifyError } from './helpers.ts';

// Launches a remediation run for a failed step (onFailure: 'auto-fix') and reports
// whether the fix run completed so the orchestrator can decide to retry.
export class AutoFixRunner {
	private readonly lifecycle: SessionLifecycle;
	private readonly runService: RunService;
	private readonly runWaiter: RunWaiter;

	constructor(input: {
		lifecycle: SessionLifecycle;
		runService: RunService;
		runWaiter: RunWaiter;
	}) {
		this.lifecycle = input.lifecycle;
		this.runService = input.runService;
		this.runWaiter = input.runWaiter;
	}

	// `attemptNumber` is the ordinary attempt this remediation follows, not an attempt count of its
	// own — an auto-fix row is recorded as attempt N of kind 'auto-fix' so the report can seat it
	// between attempt N and attempt N+1 without inferring anything from the ' auto-fix' name suffix.
	async run(input: {
		attemptNumber: number;
		context: ExecutionContext;
		errorMessage: string;
		parentStepResultId: string;
		sequenceNumber: number;
		step: RecipeStepDefinition;
	}): Promise<boolean> {
		const fixResult = await this.lifecycle.createStepResult({
			attemptKind: 'auto-fix',
			attemptNumber: input.attemptNumber,
			context: input.context,
			parentStepResultId: input.parentStepResultId,
			phase: 'step',
			sequenceNumber: input.sequenceNumber,
			stepDefinitionId: input.step.id,
			stepName: `${input.step.name} auto-fix`,
			stepType: 'aidd-cli',
		});
		const startedAt = Date.now();
		await this.lifecycle.markStepRunning(fixResult.id, startedAt);
		try {
			const run = await this.runService.launchRun(
				{
					driver: {
						driverId: input.step.id,
						driverKind: 'recipe-step',
						driverSha256: sha256Json(input.step),
					},
					maxIterations: 1,
					// Auto-fix runs execute a supplied prompt verbatim — that is a directive run.
					// Labeling it 'coding' here diverges from the mode the CLI resolves from the
					// prompt and writes to the ledger.
					mode: 'directive',
					pipelineSessionId: input.context.sessionId,
					projectDir: input.context.projectDir,
					// The step's configJson must NOT be inlined here: the prompt becomes a --prompt
					// process argument persisted verbatim in commandArgsJson, so any secret in a
					// custom recipe config (tokens, headers, passwords) would be exposed.
					prompt: [
						`Pipeline step "${input.step.name}" (type: ${input.step.stepType}) failed.`,
						'Diagnose and remediate the failure so the step can be retried.',
						`Failure: ${input.errorMessage}`,
						'After fixing, re-run the failing command and include its output in your summary; if it still fails, report the exact error instead of claiming success.',
					].join('\n'),
					// Propagate the metadata-only write boundary into auto-fix runs so the
					// fix does not write outside .aidd/ in a session that promised it would.
					...(input.context.metadataOnly === true ? { writeAllowlist: ['.aidd'] } : {}),
				},
				{ initiator: input.context.initiator },
			);
			await this.lifecycle.setStepRunId(fixResult.id, run.id);
			const completedRun = await this.runWaiter.waitForRun(run.id, input.context.sessionId);
			const completedAt = Date.now();
			await this.lifecycle.completeStep({
				completedAt,
				exitCode: completedRun.exitCode ?? undefined,
				outputSummary: await this.runWaiter.outputForRun(run.id),
				resultId: fixResult.id,
				startedAt,
				status: completedRun.status === 'completed' ? 'completed' : 'failed',
			});
			return completedRun.status === 'completed';
		} catch (err) {
			const completedAt = Date.now();
			await this.lifecycle.completeStep({
				completedAt,
				errorMessage: stringifyError(err),
				resultId: fixResult.id,
				startedAt,
				status: 'failed',
			});
			return false;
		}
	}
}

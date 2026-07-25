import {
	captureWriteGuardSnapshot,
	diffWriteViolations,
	revertWriteViolations,
	type WriteGuardSnapshot,
} from 'aidd-shared/pipeline/writeAllowlist';

import type { PipelineStepStatus, RecipeStepDefinition } from '../../types.ts';
import type { AutoFixRunner } from './autoFixRunner.ts';
import type { HookRunner } from './hookRunner.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { StepDispatcher } from './stepDispatcher.ts';
import type { ExecutionContext, StepDispatchResult, StepExecutionResult } from './types.ts';

import { stringifyError, substituteConfig } from './helpers.ts';

const METADATA_ALLOWLIST = ['.aidd'];

export interface StepRunnerDeps {
	autoFix: AutoFixRunner;
	dispatcher: StepDispatcher;
	hooks: HookRunner;
	lifecycle: SessionLifecycle;
	stopFlags: Set<string>;
}

// Runs a single step end-to-end: pre-hook, dispatch with retry/auto-fix, terminalization,
// and post-hook. Returns the step's execution result honoring the step's onFailure policy.
export async function executeStep(
	deps: StepRunnerDeps,
	step: RecipeStepDefinition,
	context: ExecutionContext,
	sequenceNumber: number,
	parentStepResultId?: string,
): Promise<StepExecutionResult> {
	const { autoFix, dispatcher, hooks, lifecycle, stopFlags } = deps;
	const result = await lifecycle.createStepResult({
		context,
		parentStepResultId,
		phase: 'step',
		sequenceNumber,
		stepName: step.name,
		stepType: step.stepType,
	});
	const config = substituteConfig(step.configJson, context.parameters);
	// Metadata-only sessions: snapshot worktree dirt before the step using the full
	// write-allowlist guard (with HEAD tracking). recipe-ref recursion is skipped
	// because its leaf steps each guard themselves. Null baseline means the project
	// is not a git repo — non-git metadata-only sessions should have been refused at
	// launch time; this guard fails the step immediately rather than proceeding
	// unguarded, closing the non-git fail-open.
	const guardBaseline: null | WriteGuardSnapshot =
		context.metadataOnly === true && step.stepType !== 'recipe-ref'
			? await captureWriteGuardSnapshot(context.projectDir)
			: null;
	if (context.metadataOnly === true && step.stepType !== 'recipe-ref' && guardBaseline === null) {
		await lifecycle.completeStep({
			completedAt: Date.now(),
			errorMessage:
				'Metadata-only session cannot enforce the .aidd/ write boundary on a non-git project; refusing to run unguarded.',
			resultId: result.id,
			startedAt: Date.now(),
			status: 'failed',
		});
		return { ok: false, stopped: false };
	}
	if (step.preHookJson) {
		await hooks.run({
			context,
			hookConfig: substituteConfig(step.preHookJson, context.parameters),
			parentStepResultId: result.id,
			phase: 'pre-hook',
			sequenceNumber,
			stepName: `${step.name} pre-hook`,
		});
	}
	const startedAt = Date.now();
	await lifecycle.markStepRunning(result.id, startedAt);
	const attempts = (step.retryCount ?? (step.onFailure === 'auto-fix' ? 1 : 0)) + 1;
	let lastDispatch: StepDispatchResult = { errorMessage: 'Step did not run', ok: false };
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		if (stopFlags.has(context.sessionId)) {
			await lifecycle.completeStep({
				completedAt: Date.now(),
				resultId: result.id,
				startedAt,
				status: 'stopped',
			});
			return { ok: false, stopped: true };
		}
		try {
			lastDispatch = await dispatcher.dispatch(step, config, context, result.id);
		} catch (err) {
			lastDispatch = { errorMessage: stringifyError(err), ok: false };
		}
		if (lastDispatch.runId !== undefined) {
			await lifecycle.setStepRunId(result.id, lastDispatch.runId);
		}
		if (stopFlags.has(context.sessionId)) {
			await lifecycle.completeStep({
				completedAt: Date.now(),
				resultId: result.id,
				startedAt,
				status: 'stopped',
			});
			return { ok: false, stopped: true };
		}
		if (lastDispatch.ok) break;
		if (attempt < attempts && step.onFailure === 'auto-fix') {
			const fixed = await autoFix.run({
				context,
				errorMessage: lastDispatch.errorMessage ?? 'Step failed',
				parentStepResultId: result.id,
				sequenceNumber,
				step,
			});
			if (!fixed) break;
		}
	}
	if (lastDispatch.ok && guardBaseline) {
		// The metadata-only backstop now REVERTS the non-.aidd/ writes server-side
		// using the same snapshot/diff/revert logic the CLI --write-allowlist guard
		// uses, so detected foreign files do not remain on disk after a metadata-only
		// step violates the boundary.
		const violations = await diffWriteViolations(
			context.projectDir,
			METADATA_ALLOWLIST,
			guardBaseline,
		);
		if (violations !== null && violations.length > 0) {
			const revertFailed = await revertWriteViolations(
				context.projectDir,
				guardBaseline,
				violations,
			);
			const failedSummary =
				revertFailed.length > 0 ? ` (revert failed for: ${revertFailed.join(', ')})` : '';
			const hasDestructive = violations.some((v) => v.destructivelyDiscarded);
			const violationVerb = hasDestructive ? 'destructively modified' : 'wrote';
			lastDispatch = {
				...lastDispatch,
				errorMessage: `Metadata-only session ${violationVerb} outside .aidd/: ${violations
					.map((v) => v.path)
					.join(', ')} — writes reverted${failedSummary}`,
				ok: false,
			};
		}
	}
	const completedAt = Date.now();
	const status: PipelineStepStatus = lastDispatch.ok ? 'completed' : 'failed';
	await lifecycle.completeStep({
		completedAt,
		errorMessage: lastDispatch.errorMessage,
		exitCode: lastDispatch.exitCode,
		outputSummary: lastDispatch.outputSummary,
		resultId: result.id,
		startedAt,
		status,
	});
	if (step.postHookJson) {
		await hooks.run({
			context,
			hookConfig: substituteConfig(step.postHookJson, context.parameters),
			parentStepResultId: result.id,
			phase: 'post-hook',
			sequenceNumber,
			stepName: `${step.name} post-hook`,
		});
	}
	return {
		errorMessage: lastDispatch.errorMessage,
		ok: lastDispatch.ok || (step.onFailure ?? 'stop') === 'continue',
		stopped: false,
	};
}

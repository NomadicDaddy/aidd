import {
	captureWriteGuardSnapshot,
	diffWriteViolations,
	revertWriteViolations,
	type WriteGuardSnapshot,
} from 'aidd-shared/pipeline/writeAllowlist';

import type {
	PipelineStepResultRecord,
	PipelineStepStatus,
	RecipeStepDefinition,
} from '../../types.ts';
import type { AutoFixRunner } from './autoFixRunner.ts';
import type { HookRunner } from './hookRunner.ts';
import type { SessionLifecycle } from './sessionLifecycle.ts';
import type { StepDispatcher } from './stepDispatcher.ts';
import type { ExecutionContext, StepDispatchResult, StepExecutionResult } from './types.ts';

import { stringifyError, substituteConfig } from './helpers.ts';
import { stepParameters } from './stepParameters.ts';

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
		attemptKind: 'ordinary',
		attemptNumber: 1,
		context,
		parentStepResultId,
		phase: 'step',
		sequenceNumber,
		stepDefinitionId: step.id,
		stepName: step.name,
		stepType: step.stepType,
	});
	await lifecycle.progress.publishActive(result.id);
	const config = substituteConfig(step.configJson, stepParameters(context));
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
			hookConfig: substituteConfig(step.preHookJson, stepParameters(context)),
			parentStepResultId: result.id,
			phase: 'pre-hook',
			sequenceNumber,
			stepDefinitionId: step.id,
			stepName: `${step.name} pre-hook`,
		});
	}
	const startedAt = Date.now();
	await lifecycle.markStepRunning(result.id, startedAt);
	const attempts = (step.retryCount ?? (step.onFailure === 'auto-fix' ? 1 : 0)) + 1;
	let lastDispatch: StepDispatchResult = { errorMessage: 'Step did not run', ok: false };
	// Each attempt owns a persisted row. Attempt 1 reuses the row created above — the pre-hook
	// already parents to it — and every retry inserts a sibling carrying the same parent, depth,
	// sequence number and step definition. Before this, the loop overwrote one row, so a step that
	// failed and then succeeded reported only the success and the failure that provoked the retry
	// was never written down at all.
	let attemptRow = result;
	let attemptStartedAt = startedAt;
	// The attempt that the next one supersedes, terminalized only once its successor row exists.
	// Resume reconciliation reads a step as in flight from a parentless queued/running row at its
	// sequence number, and nothing else: a failed attempt row looks exactly like a step that is
	// finished for good. So the step must never be without such a row while it is still owed an
	// attempt, or a restart in that window skips the retry and moves the session on.
	// Set at the tail of the iteration that failed and read at the top of the next one, so it is
	// live only across the handover itself.
	let superseded:
		| { dispatch: StepDispatchResult; row: PipelineStepResultRecord; startedAt: number }
		| undefined;
	for (let attempt = 1; attempt <= attempts; attempt += 1) {
		if (attempt > 1) {
			attemptRow = await lifecycle.createStepResult({
				attemptKind: 'ordinary',
				attemptNumber: attempt,
				context,
				parentStepResultId,
				phase: 'step',
				sequenceNumber,
				stepDefinitionId: step.id,
				stepName: step.name,
				stepType: step.stepType,
			});
			attemptStartedAt = Date.now();
			if (superseded) {
				// The two rows overlap for one write. Reconciliation resolves that shape already:
				// it resumes the newest in-flight row and terminalizes the older ones.
				await lifecycle.completeStep({
					completedAt: attemptStartedAt,
					errorMessage: superseded.dispatch.errorMessage,
					exitCode: superseded.dispatch.exitCode,
					outputSummary: superseded.dispatch.outputSummary,
					resultId: superseded.row.id,
					startedAt: superseded.startedAt,
					status: 'failed',
				});
			}
			await lifecycle.markStepRunning(attemptRow.id, attemptStartedAt);
		}
		if (stopFlags.has(context.sessionId)) {
			await lifecycle.completeStep({
				completedAt: Date.now(),
				resultId: attemptRow.id,
				startedAt: attemptStartedAt,
				status: 'stopped',
			});
			return { ok: false, stopped: true };
		}
		try {
			lastDispatch = await dispatcher.dispatch(
				step,
				config,
				context,
				attemptRow.id,
				async (runId) => lifecycle.setStepRunId(attemptRow.id, runId),
			);
		} catch (err) {
			lastDispatch = { errorMessage: stringifyError(err), ok: false };
		}
		if (stopFlags.has(context.sessionId)) {
			await lifecycle.completeStep({
				completedAt: Date.now(),
				resultId: attemptRow.id,
				startedAt: attemptStartedAt,
				status: 'stopped',
			});
			return { ok: false, stopped: true };
		}
		if (lastDispatch.ok || attempt >= attempts) break;
		if (step.onFailure === 'auto-fix') {
			// This attempt stays in flight for the whole remediation, which can be a managed run
			// lasting minutes. Terminalizing it first would leave the remediation as the only
			// live row, and reconciliation never looks at a row with a parent.
			const fixed = await autoFix.run({
				attemptNumber: attempt,
				context,
				errorMessage: lastDispatch.errorMessage ?? 'Step failed',
				parentStepResultId: attemptRow.id,
				sequenceNumber,
				step,
			});
			// Breaking here leaves this attempt open for the tail to terminalize, which is what
			// records the dispatch failure that the remediation could not fix.
			if (!fixed) break;
		}
		superseded = { dispatch: lastDispatch, row: attemptRow, startedAt: attemptStartedAt };
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
		resultId: attemptRow.id,
		startedAt: attemptStartedAt,
		status,
	});
	if (step.postHookJson) {
		await hooks.run({
			context,
			hookConfig: substituteConfig(step.postHookJson, stepParameters(context)),
			parentStepResultId: result.id,
			phase: 'post-hook',
			sequenceNumber,
			stepDefinitionId: step.id,
			stepName: `${step.name} post-hook`,
		});
	}
	return {
		agentMessage: lastDispatch.agentMessage,
		errorMessage: lastDispatch.errorMessage,
		ok: lastDispatch.ok || (step.onFailure ?? 'stop') === 'continue',
		outputSummary: lastDispatch.outputSummary,
		stopped: false,
	};
}

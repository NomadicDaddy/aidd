import type { AgentEvent } from 'aidd-shared/backends/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { setTimeout as sleep } from 'node:timers/promises';

import type { MoveFn, OrchestratorDeps } from './types.ts';

import {
	computeRateLimitSleep,
	extractRateLimitMessage,
	extractRateLimitResetAt,
} from '../../backends/rate-limit.ts';
import { formatArtifactCheck, formatFeatureValidation } from '../formatters.ts';
import { OrchestratorProgressReporter } from '../progress.ts';
import { wallClockDeadlineMs } from './run-ending.ts';

export interface PreRunCheckResult {
	exitCode: number;
	stopReason: 'completed' | 'exit_error';
	summary: string;
}

export function buildRateLimitBudgetSummary(baseSummary: string, plan: RunPlan): string {
	const budgetDetail =
		"rate_limit_wait_exceeds_budget: provider reset/backoff would cross the run's " +
		`wall-clock deadline (timeoutSeconds=${plan.outputPolicy.timeoutSeconds}); ending without waiting`;
	return `${baseSummary}; ${budgetDetail}`;
}

export async function handlePreRunChecks(
	plan: RunPlan,
	deps: OrchestratorDeps,
	move: MoveFn,
): Promise<PreRunCheckResult | undefined> {
	if (await deps.store.hasStopRequested(plan.stopPolicy.stopFile)) {
		const summary = 'stop requested before run';
		move({ reason: summary, type: 'stopped' });
		console.log('Stop requested before run.');
		return {
			exitCode: orchestratorExitCodes.success,
			stopReason: 'completed',
			summary,
		};
	}

	if (plan.checks.features) {
		const result = await deps.store.validateFeatures();
		const formatted = formatFeatureValidation(plan.projectDir, result);
		console.log(formatted);
		await emitPreRunCheckLog(deps, formatted);
		const exitCode = result.valid
			? orchestratorExitCodes.success
			: orchestratorExitCodes.validationError;
		const invalidCount = new Set(result.issues.map((issue) => issue.id)).size;
		const summary = result.valid
			? `feature validation passed: ${result.total} feature file(s) valid`
			: `feature validation FAILED: ${invalidCount} invalid feature file(s) of ${result.total}`;
		return completePreRunCheck(move, exitCode, summary);
	}

	if (plan.checks.artifacts) {
		const result = await deps.store.checkArtifacts();
		const formatted = `${formatArtifactCheck(plan.projectDir, result)}\n[INFO] Artifact check JSON: ${result.path}`;
		console.log(formatted);
		await emitPreRunCheckLog(deps, formatted);
		const exitCode = result.valid
			? orchestratorExitCodes.success
			: orchestratorExitCodes.validationError;
		const summary = result.valid
			? `artifact check passed: ${result.summary.present}/${result.summary.total} present (${result.summary.stale} stale)`
			: `artifact check FAILED: ${result.summary.requiredMissing} required artifact(s) missing (${result.missing.join(', ')}) — see ${result.path}`;
		return completePreRunCheck(move, exitCode, summary);
	}

	return undefined;
}

// Pre-run checks finish before any backend streams, so without this the web run log stays
// 0 bytes and a failed check gives the operator nothing to act on (observed as blind
// re-runs of --check-artifacts). The heartbeat's raw_log writer persists the chunk.
async function emitPreRunCheckLog(deps: OrchestratorDeps, formatted: string): Promise<void> {
	await deps.observer?.onAgentEvent?.({
		chunk: `${formatted}\n`,
		stream: 'stdout',
		type: 'raw_log',
	});
}

function completePreRunCheck(move: MoveFn, exitCode: number, summary: string): PreRunCheckResult {
	move({ summary, type: 'complete' });
	return {
		exitCode,
		stopReason: exitCode === orchestratorExitCodes.success ? 'completed' : 'exit_error',
		summary,
	};
}

export async function handleRateLimit(
	deps: OrchestratorDeps,
	plan: RunPlan,
	events: AgentEvent[],
	controller: AbortController,
	iteration: number,
	runStartedAtMs: number,
): Promise<{ backoffExceedsDeadline: boolean; stopRequested: boolean }> {
	const decision = computeRateLimitSleep(
		extractRateLimitMessage(events),
		new Date(),
		plan.outputPolicy.rateLimitBufferSeconds,
		plan.outputPolicy.rateLimitBackoffSeconds,
		extractRateLimitResetAt(events),
	);
	// A backoff that would sleep across the run's wall-clock deadline can never lead to a
	// productive iteration — the next iteration would be killed at spawn. Skip the sleep and
	// tell the caller to end the run as rate-limited instead of burning the wait
	// (observed: a 31-minute rate-limit sleep past the 3h budget, then a doomed 39s iteration).
	if (Date.now() + decision.sleepMs >= wallClockDeadlineMs(plan, runStartedAtMs)) {
		console.log(
			`\nRate limited, but the ${Math.round(decision.sleepMs / 1000)}s backoff crosses the wall-clock deadline; ending the run instead of waiting.`,
		);
		const stopRequested = await deps.store.hasStopRequested(plan.stopPolicy.stopFile);
		return { backoffExceedsDeadline: true, stopRequested };
	}
	const reasonText =
		decision.reason === 'until_reset' && decision.resetAt
			? `until ${decision.resetAt.toISOString()} + ${plan.outputPolicy.rateLimitBufferSeconds}s buffer`
			: decision.reason === 'passed'
				? 'reset already passed; retrying immediately'
				: `fallback ${plan.outputPolicy.rateLimitBackoffSeconds}s (could not parse reset)`;
	console.log(
		`\nRate limited. Sleeping ${Math.round(decision.sleepMs / 1000)}s (${reasonText}).`,
	);
	if (decision.sleepMs > 0) {
		const waitProgress = new OrchestratorProgressReporter({
			backend: plan.backend,
			iteration,
			iterationStartedAtMs: Date.now(),
			runStartedAtMs,
		});
		waitProgress.start();
		waitProgress.setStage('rate_limit_sleep', { last: reasonText });
		try {
			await sleep(decision.sleepMs, undefined, { signal: controller.signal }).catch(() => {});
		} finally {
			waitProgress.stop();
		}
	}
	const stopRequested = await deps.store.hasStopRequested(plan.stopPolicy.stopFile);
	return { backoffExceedsDeadline: false, stopRequested };
}

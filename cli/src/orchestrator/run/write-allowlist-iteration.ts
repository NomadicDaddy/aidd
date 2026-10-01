import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { AgentRunResult, IterationMetrics } from 'aidd-shared/orchestrator/result';
import type { RunPlan } from 'aidd-shared/plan/types';

import { orchestratorExitCodes } from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { CompiledPrompt } from '../../prompts/types.ts';
import type { OrchestratorProgressReporter } from '../progress.ts';
import type { MoveFn, OrchestratorDeps, RunAccumulator } from './types.ts';

import { writeRunSummary } from './artifacts.ts';
import { runBackendStreamLoop } from './backend-stream.ts';
import {
	buildWriteAllowlistRetryPrompt,
	describeWriteGuardRevert,
	diffWriteViolations,
	formatViolationPaths,
	revertWriteViolations,
	type WriteGuardSnapshot,
} from './write-allowlist.ts';

interface WriteAllowlistIterationInput {
	acc: RunAccumulator;
	activeProgress: OrchestratorProgressReporter | undefined;
	compiled: CompiledPrompt;
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
	controller: AbortController;
	deps: OrchestratorDeps;
	events: AgentEvent[];
	exitCode: number;
	gitHeadBefore: string | undefined;
	idleWarningTimestamps: { afterMs: number; atMs: number }[];
	iteration: number;
	metrics: IterationMetrics;
	move: MoveFn;
	plan: RunPlan;
	result: AgentRunResult;
	runStartedAtMs: number;
	startedAtMs: number;
	stopRequestedAfterRun: boolean;
	timeToFirstEventMs: number | undefined;
	wallClockTimedOut: boolean;
	work: SelectedWork;
	writeGuardBaseline: WriteGuardSnapshot;
}

interface WriteAllowlistIterationState {
	activeProgress: OrchestratorProgressReporter | undefined;
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
	events: AgentEvent[];
	exitCode: number;
	idleWarningTimestamps: { afterMs: number; atMs: number }[];
	metrics: IterationMetrics;
	result: AgentRunResult;
	stopRequestedAfterRun: boolean;
	timeToFirstEventMs: number | undefined;
	wallClockTimedOut: boolean;
}

type WriteAllowlistIterationOutcome =
	| { exitCode: number; kind: 'return' }
	| { kind: 'continue'; state: WriteAllowlistIterationState };

export async function enforceWriteAllowlistForIteration(
	input: WriteAllowlistIterationInput,
): Promise<WriteAllowlistIterationOutcome> {
	const violations = await diffWriteViolations(
		runRepoDir(input.plan),
		input.plan.writeAllowlist ?? [],
		input.writeGuardBaseline,
	);
	if (violations === null) {
		// An unreadable worktree is not a clean one: the allowlist was armed and could not be
		// checked, so the iteration fails instead of passing as if nothing was written.
		const summary =
			'write allowlist could not be verified (git status failed); the worktree is unchecked';
		console.error(`[orchestrator] ${summary}`);
		endIterationWithViolation(input, summary);
		await writeRunSummary(
			input.deps,
			input.plan,
			input.acc,
			'exit_error',
			orchestratorExitCodes.writeAllowlistViolation,
			summary,
		);
		return { exitCode: orchestratorExitCodes.writeAllowlistViolation, kind: 'return' };
	}
	if (violations.length === 0) return { kind: 'continue', state: toState(input) };
	// Only a run in its own worktree is reverted. In the live tree the guard reports and fails.
	const checkout = input.plan.worktree ? 'isolated' : 'shared';
	// Triumvirate: the single-agent retry below would re-run runBackendStreamLoop against a
	// panel-shaped run, which is wrong — and silently continuing after the revert would
	// swallow the violation. Revert and fail fast; retrying just the execution stage is a
	// possible follow-up.
	if (input.plan.triumvirate) {
		const failed = await revertWriteViolations(
			runRepoDir(input.plan),
			input.writeGuardBaseline,
			violations,
			checkout,
		);
		const summary = `write allowlist violated by triumvirate execution stage: ${formatViolationPaths(violations)} (${describeWriteGuardRevert(violations, failed, checkout)}; no retry in triumvirate mode)`;
		console.error(`[orchestrator] ${summary}`);
		endIterationWithViolation(input, summary);
		await writeRunSummary(
			input.deps,
			input.plan,
			input.acc,
			'exit_error',
			orchestratorExitCodes.writeAllowlistViolation,
			summary,
		);
		return { exitCode: orchestratorExitCodes.writeAllowlistViolation, kind: 'return' };
	}
	const revertFailed = await revertWriteViolations(
		runRepoDir(input.plan),
		input.writeGuardBaseline,
		violations,
		checkout,
	);
	// A retry over an un-reverted tree is a paid re-run of a run that cannot pass: the retry reads
	// the violating content the revert failed to remove, the recheck finds the identical violation,
	// and the iteration ends where it already was — after a second full backend run. Fail here
	// instead, and say which paths are still dirty so the operator can see what to clean.
	if (revertFailed.length > 0) {
		const summary = `write allowlist violated: ${formatViolationPaths(violations)} — ${describeWriteGuardRevert(violations, revertFailed, checkout)}; not retrying over an un-reverted worktree`;
		console.error(`[orchestrator] ${summary}`);
		endIterationWithViolation(input, summary);
		await writeRunSummary(
			input.deps,
			input.plan,
			input.acc,
			'exit_error',
			orchestratorExitCodes.writeAllowlistViolation,
			summary,
		);
		return { exitCode: orchestratorExitCodes.writeAllowlistViolation, kind: 'return' };
	}
	console.warn(
		`[orchestrator] Write allowlist violated (${formatViolationPaths(violations)}); ${describeWriteGuardRevert(violations, revertFailed, checkout)}, retrying once.`,
	);
	let state = toState(input);
	if (!input.stopRequestedAfterRun) {
		const retry = await runBackendStreamLoop(
			input.deps,
			input.plan,
			input.work,
			{
				...input.compiled,
				text: buildWriteAllowlistRetryPrompt(
					input.compiled.text,
					input.plan.writeAllowlist ?? [],
					violations,
				),
			},
			input.controller,
			input.iteration,
			input.startedAtMs,
			input.runStartedAtMs,
			input.gitHeadBefore,
		);
		state = {
			activeProgress: retry.progress,
			completionCommittedDuringGrace: retry.completionCommittedDuringGrace,
			completionFinalizedBeforeBackendExit: retry.completionFinalizedBeforeBackendExit,
			events: retry.events,
			exitCode: retry.exitCode,
			idleWarningTimestamps: retry.idleWarningTimestamps,
			metrics: retry.metrics,
			result: retry.result,
			stopRequestedAfterRun: retry.stopRequestedAfterRun,
			timeToFirstEventMs: retry.timeToFirstEventMs,
			wallClockTimedOut: input.wallClockTimedOut || retry.wallClockTimedOut,
		};
	}
	const recheck = await diffWriteViolations(
		runRepoDir(input.plan),
		input.plan.writeAllowlist ?? [],
		input.writeGuardBaseline,
	);
	if (recheck !== null && recheck.length === 0) return { kind: 'continue', state };
	const recheckFailed =
		recheck === null
			? []
			: await revertWriteViolations(
					runRepoDir(input.plan),
					input.writeGuardBaseline,
					recheck,
					checkout,
				);
	const summary =
		recheck === null
			? 'write allowlist could not be verified after retry (git status failed); the worktree is unchecked'
			: `write allowlist violated after retry: ${formatViolationPaths(recheck)} (${describeWriteGuardRevert(recheck, recheckFailed, checkout)})`;
	console.error(`[orchestrator] ${summary}`);
	endIterationWithViolation(input, summary, state.result);
	await writeRunSummary(
		input.deps,
		input.plan,
		input.acc,
		'exit_error',
		orchestratorExitCodes.writeAllowlistViolation,
		summary,
	);
	return { exitCode: orchestratorExitCodes.writeAllowlistViolation, kind: 'return' };
}

// The guard runs while the state machine still sits in run_agent, and run_agent -> complete
// is not a legal transition; walk the machine through its normal iteration tail first.
function endIterationWithViolation(
	input: WriteAllowlistIterationInput,
	summary: string,
	result: AgentRunResult = input.result,
): void {
	input.move({ result, type: 'process_result' });
	input.move({ result, type: 'write_artifacts' });
	input.move({ summary, type: 'complete' });
}

function toState(input: WriteAllowlistIterationInput): WriteAllowlistIterationState {
	return {
		activeProgress: input.activeProgress,
		completionCommittedDuringGrace: input.completionCommittedDuringGrace,
		completionFinalizedBeforeBackendExit: input.completionFinalizedBeforeBackendExit,
		events: input.events,
		exitCode: input.exitCode,
		idleWarningTimestamps: input.idleWarningTimestamps,
		metrics: input.metrics,
		result: input.result,
		stopRequestedAfterRun: input.stopRequestedAfterRun,
		timeToFirstEventMs: input.timeToFirstEventMs,
		wallClockTimedOut: input.wallClockTimedOut,
	};
}

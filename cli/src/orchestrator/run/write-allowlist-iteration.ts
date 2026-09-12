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
	if (violations === null || violations.length === 0) {
		return { kind: 'continue', state: toState(input) };
	}
	// Triumvirate: the single-agent retry below would re-run runBackendStreamLoop against a
	// panel-shaped run, which is wrong — and silently continuing after the revert would
	// swallow the violation. Revert and fail fast; retrying just the execution stage is a
	// possible follow-up.
	if (input.plan.triumvirate) {
		const failed = await revertWriteViolations(
			runRepoDir(input.plan),
			input.writeGuardBaseline,
			violations,
		);
		const summary = `write allowlist violated by triumvirate execution stage: ${formatViolationPaths(violations)} (${describeRevert(failed)}; no retry in triumvirate mode)`;
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
	);
	// A retry over an un-reverted tree is a paid re-run of a run that cannot pass: the retry reads
	// the violating content the revert failed to remove, the recheck finds the identical violation,
	// and the iteration ends where it already was — after a second full backend run. Fail here
	// instead, and say which paths are still dirty so the operator can see what to clean.
	if (revertFailed.length > 0) {
		const summary = `write allowlist violated: ${formatViolationPaths(violations)} — ${describeRevert(revertFailed)}; not retrying over an un-reverted worktree`;
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
		`[orchestrator] Write allowlist violated (${formatViolationPaths(violations)}); writes reverted, retrying once.`,
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
	if (recheck === null || recheck.length === 0) return { kind: 'continue', state };
	const recheckFailed = await revertWriteViolations(
		runRepoDir(input.plan),
		input.writeGuardBaseline,
		recheck,
	);
	const summary = `write allowlist violated after retry: ${formatViolationPaths(recheck)} (${describeRevert(recheckFailed)})`;
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

// "writes reverted" is a claim about the operator's worktree, and for years it was printed
// unconditionally while revertWriteViolations' failure list was discarded — so a violation aidd
// could not clean up (a staged path, a locked index) read exactly like one it had.
function describeRevert(failed: string[], limit = 8): string {
	if (failed.length === 0) return 'writes reverted';
	const shown = failed.slice(0, limit).join(', ');
	const rest = failed.length > limit ? ` … and ${failed.length - limit} more` : '';
	return `REVERT FAILED, still dirty: ${shown}${rest}`;
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

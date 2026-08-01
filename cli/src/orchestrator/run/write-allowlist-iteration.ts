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
	// possible follow-up, not v1.
	if (input.plan.triumvirate) {
		await revertWriteViolations(runRepoDir(input.plan), input.writeGuardBaseline, violations);
		const summary = `write allowlist violated by triumvirate execution stage: ${formatViolationPaths(violations)} (writes reverted; no retry in triumvirate mode)`;
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
		`[orchestrator] Write allowlist violated (${formatViolationPaths(violations)}); reverting and retrying once.`,
	);
	await revertWriteViolations(runRepoDir(input.plan), input.writeGuardBaseline, violations);
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
	await revertWriteViolations(runRepoDir(input.plan), input.writeGuardBaseline, recheck);
	const summary = `write allowlist violated after retry: ${formatViolationPaths(recheck)} (writes reverted)`;
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

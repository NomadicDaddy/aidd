import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import { monitorBackend } from 'aidd-shared/backends/monitor';
import {
	type AgentRunResult,
	exitCodeFromEvents,
	extractStructuredResult,
	filesModifiedFromEvents,
	type IterationMetrics,
	metricsFromEvents,
	orchestratorExitCodes,
} from 'aidd-shared/orchestrator/result';
import { runRepoDir } from 'aidd-shared/plan/types';

import type { CompiledPrompt } from '../../prompts/types.ts';
import type { OrchestratorDeps } from './types.ts';

import { type BackendEventLoopResult, consumeBackendStream } from '../backend-event-loop.ts';
import { BackendSafetyEnvelope } from '../backend-safety.ts';
import { isAgentSignalEvent } from '../formatters.ts';
import { OrchestratorProgressReporter } from '../progress.ts';
import { buildPromptInput } from './git.ts';
import { emitRunLogLine } from './run-log.ts';
import { hasStopRequested } from './stop-request.ts';

export interface BackendStreamLoopResult {
	acceptedCompletionFeature?: string;
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
	events: AgentEvent[];
	exitCode: number;
	idleWarningTimestamps: { afterMs: number; atMs: number }[];
	metrics: IterationMetrics;
	progress: OrchestratorProgressReporter;
	result: AgentRunResult;
	stopRequestedAfterRun: boolean;
	timeToFirstEventMs?: number;
	wallClockTimedOut: boolean;
}

/** Everything one backend iteration needs, named so two adjacent timestamps cannot be swapped. */
export interface BackendStreamLoopInput {
	compiled: CompiledPrompt;
	controller: AbortController;
	deps: OrchestratorDeps;
	gitHeadBefore: string | undefined;
	iteration: number;
	iterationStartedAtMs: number;
	plan: RunPlan;
	runStartedAtMs: number;
	work: SelectedWork;
}

export async function runBackendStreamLoop(
	input: BackendStreamLoopInput,
): Promise<BackendStreamLoopResult> {
	const { compiled, controller, deps, gitHeadBefore, iteration, plan, work } = input;
	const { iterationStartedAtMs, runStartedAtMs } = input;
	const events: AgentEvent[] = [];
	const idleWarningTimestamps: { afterMs: number; atMs: number }[] = [];
	let timeToFirstEventMs: number | undefined;
	// Wall-clock deadline, flailing guard, and child-process reaper — the shared safety
	// envelope both this loop and triumvirate stages run inside (see backend-safety.ts).
	const envelope = new BackendSafetyEnvelope({
		controller,
		onLogLine: (line) => emitRunLogLine(deps, line),
		runStartedAtMs,
		wallClockTimeoutMs: plan.outputPolicy.timeoutSeconds * 1000,
	});
	const progress = new OrchestratorProgressReporter({
		backend: plan.backend,
		iteration,
		iterationStartedAtMs,
		runStartedAtMs,
	});
	progress.start();
	progress.setStage('waiting_for_backend', {
		last: `prompt ${compiled.text.length} chars`,
	});

	const stream = monitorBackend(
		deps.backend,
		buildPromptInput(plan, compiled.text),
		controller.signal,
		{
			idleNudgeTimeoutMs: plan.outputPolicy.idleNudgeTimeoutSeconds * 1000,
			idleTimeoutMs: plan.outputPolicy.idleTimeoutSeconds * 1000,
		},
	)[Symbol.asyncIterator]();

	envelope.arm();

	let closeStream = true;
	let loop: BackendEventLoopResult | undefined;
	try {
		loop = await consumeBackendStream({
			backend: plan.backend,
			completion: {
				cwd: runRepoDir(plan),
				gitHeadBefore,
				graceMs: deps.completionMarkerGraceMs ?? 60_000,
				store: deps.store,
				work,
			},
			controller,
			envelope,
			events,
			onAgentEvent: async (event) => {
				await deps.observer?.onAgentEvent?.(event);
				if (timeToFirstEventMs === undefined && isAgentSignalEvent(event.type)) {
					timeToFirstEventMs = Date.now() - iterationStartedAtMs;
				}
				if (event.type === 'idle_warning') {
					idleWarningTimestamps.push({
						afterMs: event.afterMs,
						atMs: Date.now() - iterationStartedAtMs,
					});
				}
			},
			progress,
			stream,
		});
		closeStream = loop.closeStream;
	} finally {
		if (closeStream) await stream.return?.();
		// Envelope teardown runs on every exit path — normal backend exit, completion grace,
		// flailing/wall-clock abort, and thrown errors — so a leaked timer, listener, or
		// child process never survives the iteration.
		const reapLine = await envelope.teardown();
		if (reapLine) process.stdout.write(reapLine);
	}

	const completionFinalizedBeforeBackendExit =
		loop?.completionFinalizedBeforeBackendExit ?? false;
	const completionCommittedDuringGrace = loop?.completionCommittedDuringGrace ?? false;
	const acceptedCompletionFeature = loop?.acceptedCompletionFeature;
	const stopRequestedAfterRun = await hasStopRequested(deps.store, plan.stopPolicy);
	const exitCode = completionFinalizedBeforeBackendExit
		? orchestratorExitCodes.success
		: envelope.flailingDetected
			? orchestratorExitCodes.flailing
			: exitCodeFromEvents(events);
	progress.setStage('process_result', { last: `exit ${exitCode}` });
	const structuredResult = extractStructuredResult(events);
	const metrics = metricsFromEvents(events);
	const result: AgentRunResult = {
		events,
		exitCode,
		filesModified: filesModifiedFromEvents(events),
		selectedWork: work,
		transcript: events.map((e) => JSON.stringify(e)).join('\n'),
	};
	if (structuredResult) result.structuredResult = structuredResult;

	return {
		events,
		exitCode,
		metrics,
		result,
		stopRequestedAfterRun,
		wallClockTimedOut: envelope.wallClockTimedOut,
		...(timeToFirstEventMs !== undefined ? { timeToFirstEventMs } : {}),
		completionCommittedDuringGrace,
		completionFinalizedBeforeBackendExit,
		idleWarningTimestamps,
		...(acceptedCompletionFeature !== undefined ? { acceptedCompletionFeature } : {}),
		progress,
	};
}

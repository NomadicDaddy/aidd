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

import { BackendSafetyEnvelope } from '../backend-safety.ts';
import { CompletionUsageDrain } from '../completion-usage-drain.ts';
import { isAgentSignalEvent } from '../formatters.ts';
import {
	formatBackendStarted,
	formatIdleWarningLine,
	formatThinkingLine,
	formatToolArgs,
} from '../formatters.ts';
import { OrchestratorProgressReporter } from '../progress.ts';
import { acceptedCompletedFeatureFromEvents } from './feature-scope.ts';
import { buildPromptInput, waitForCommitOrTimeout } from './git.ts';
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

export async function runBackendStreamLoop(
	deps: OrchestratorDeps,
	plan: RunPlan,
	work: SelectedWork,
	compiled: CompiledPrompt,
	controller: AbortController,
	iteration: number,
	iterationStartedAtMs: number,
	runStartedAtMs: number,
	gitHeadBefore: string | undefined,
): Promise<BackendStreamLoopResult> {
	const events: AgentEvent[] = [];
	const idleWarningTimestamps: { afterMs: number; atMs: number }[] = [];
	const completionMarkerGrace = 'completion_marker_grace' as const;
	const completionMarkerGraceMs = deps.completionMarkerGraceMs ?? 60_000;
	let acceptedCompletionFeature: string | undefined;
	let timeToFirstEventMs: number | undefined;
	let completionFinalizedBeforeBackendExit = false;
	let completionCommittedDuringGrace = false;
	const completionUsageDrain = new CompletionUsageDrain();
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
	try {
		while (true) {
			const nextEvent = stream.next();
			let stepResult =
				acceptedCompletionFeature !== undefined
					? await Promise.race([
							nextEvent,
							waitForCommitOrTimeout(
								runRepoDir(plan),
								gitHeadBefore,
								completionMarkerGraceMs,
							).then((outcome) => {
								completionCommittedDuringGrace = outcome.committed;
								return completionMarkerGrace;
							}),
						])
					: await nextEvent;
			if (stepResult === completionMarkerGrace) {
				const drainedEvent = await completionUsageDrain.afterCommit(
					plan.backend,
					completionCommittedDuringGrace,
					nextEvent,
				);
				if (drainedEvent !== undefined) stepResult = drainedEvent;
			}
			if (stepResult === completionMarkerGrace) {
				completionFinalizedBeforeBackendExit = true;
				controller.abort('completion_marker_accepted');
				break;
			}
			if (stepResult.done) {
				closeStream = false;
				// The per-assistant_text acceptance check only catches a completion whose
				// feature.json was already flipped to completed+passes when the AIDD_RESULT
				// marker streamed. An agent that prints the marker and writes feature.json a
				// beat later (or is aborted mid-turn) leaves acceptedCompletionFeature unset, so
				// the commit-grace verification below never runs — and coding.ts then accepts
				// the completed_after_backend_abort completion with the feature's work still
				// uncommitted. Re-check at backend exit so a late completion goes through the
				// same commit-landed gate.
				if (acceptedCompletionFeature === undefined) {
					const lateFeature = await acceptedCompletedFeatureFromEvents(
						deps.store,
						events,
						work,
					);
					if (lateFeature !== undefined) acceptedCompletionFeature = lateFeature;
				}
				if (acceptedCompletionFeature !== undefined && gitHeadBefore !== undefined) {
					const outcome = await waitForCommitOrTimeout(
						runRepoDir(plan),
						gitHeadBefore,
						completionMarkerGraceMs,
					);
					completionCommittedDuringGrace = outcome.committed;
					completionFinalizedBeforeBackendExit = true;
				}
				break;
			}

			const event = stepResult.value;
			completionUsageDrain.record(event);
			// Live deltas are presentation-only duplicates of the turn's final assistant_text:
			// they feed the observer (run-log tail) and progress, but persisting them in `events`
			// would double the transcript and every marker/metrics scan over it.
			if (event.type !== 'assistant_delta') events.push(event);
			progress.recordAgentEvent(event);
			await deps.observer?.onAgentEvent?.(event);
			if ((await envelope.observe(event)) === 'abort_flailing') break;
			if (timeToFirstEventMs === undefined && isAgentSignalEvent(event.type)) {
				timeToFirstEventMs = Date.now() - iterationStartedAtMs;
			}
			if (event.type === 'idle_warning') {
				idleWarningTimestamps.push({
					afterMs: event.afterMs,
					atMs: Date.now() - iterationStartedAtMs,
				});
			}
			if (event.type === 'started') {
				process.stdout.write(formatBackendStarted(event.backend, event.pid));
				process.stdout.write(formatThinkingLine(event.backend));
			} else if (event.type === 'idle_warning') {
				process.stdout.write(formatIdleWarningLine(event.afterMs));
			} else if (event.type === 'assistant_text') {
				process.stdout.write(event.chunk.endsWith('\n') ? event.chunk : `${event.chunk}\n`);
				const acceptedFeature = await acceptedCompletedFeatureFromEvents(
					deps.store,
					events,
					work,
				);
				if (acceptedCompletionFeature === undefined && acceptedFeature !== undefined) {
					acceptedCompletionFeature = acceptedFeature;
					progress.setStage('completion_marker_grace', {
						last: `accepted ${acceptedFeature}`,
					});
				}
			} else if (event.type === 'tool_call') {
				process.stdout.write(`· ${event.tool}${formatToolArgs(event.args)}\n`);
			}
		}
	} finally {
		if (closeStream) await stream.return?.();
		// Envelope teardown runs on every exit path — normal backend exit, completion grace,
		// flailing/wall-clock abort, and thrown errors — so a leaked timer, listener, or
		// child process never survives the iteration.
		const reapLine = await envelope.teardown();
		if (reapLine) process.stdout.write(reapLine);
	}

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

import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { RunPlan } from 'aidd-shared/plan/types';

import {
	FlailingDetector,
	formatFlailingSignature,
	isFlailingGuardDisabled,
} from 'aidd-shared/backends/flailing';
import { monitorBackend } from 'aidd-shared/backends/monitor';
import { ChildProcessReaper, type ReapDiagnostic } from 'aidd-shared/lib/childProcessReaper';
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
	let wallClockTimedOut = false;
	let flailingDetected = false;
	// Guardrail: a continuously-emitting agent stuck repeating the same diagnostic/lifecycle shell
	// commands without making file changes never trips the idle killer. The detector watches the
	// tool-call stream and aborts the iteration so the run can nudge-then-stop instead of burning
	// the whole wall-clock window. Opt out with AIDD_DISABLE_FLAILING_GUARD=1.
	const flailingDetector = isFlailingGuardDisabled() ? undefined : new FlailingDetector();
	// Teardown hygiene: a verification/dev server the agent starts and fails to stop outlives the
	// backend (Windows breakaway spawns escape the job object; POSIX detached grandchildren leave
	// the process group) and keeps holding its listen port, wedging later boots. The reaper
	// snapshots the pid/ppid table while the backend runs and kills surviving descendants after it
	// exits.
	let reapDiagnostic: ReapDiagnostic | undefined;
	const childReaper = new ChildProcessReaper({
		onReap: (diagnostic) => {
			reapDiagnostic = diagnostic;
		},
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

	// Wall-clock abort: enforce the advertised --timeout ceiling. A continuously-emitting
	// runaway agent never trips the idle-based abort inside monitorBackend; this timer
	// fires at runStartedAtMs + timeoutSeconds * 1000 regardless of event activity.
	const wallClockTimeoutMs = plan.outputPolicy.timeoutSeconds * 1000;
	const wallClockDeadlineMs = runStartedAtMs + wallClockTimeoutMs;
	const wallClockRemainingMs = wallClockDeadlineMs - Date.now();
	const wallClockTimer: ReturnType<typeof setTimeout> | undefined =
		wallClockRemainingMs > 0
			? setTimeout(() => {
					wallClockTimedOut = true;
					controller.abort('wall_clock_timeout');
				}, wallClockRemainingMs)
			: undefined;
	if (wallClockRemainingMs <= 0) {
		wallClockTimedOut = true;
		controller.abort('wall_clock_timeout');
	}

	let closeStream = true;
	try {
		while (true) {
			const nextEvent = stream.next();
			const stepResult =
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
			// Live deltas are presentation-only duplicates of the turn's final assistant_text:
			// they feed the observer (run-log tail) and progress, but persisting them in `events`
			// would double the transcript and every marker/metrics scan over it.
			if (event.type !== 'assistant_delta') events.push(event);
			progress.recordAgentEvent(event);
			await deps.observer?.onAgentEvent?.(event);
			if (flailingDetector) {
				const signal = flailingDetector.record(event);
				if (signal.kind === 'warn') {
					process.stdout.write(
						`⚠ possible flailing (${signal.reason}, ×${signal.count}): ${formatFlailingSignature(signal.signature)}\n`,
					);
				} else if (signal.kind === 'trip') {
					flailingDetected = true;
					process.stdout.write(
						`✋ flailing detected (${signal.reason}, ×${signal.count}): ${formatFlailingSignature(signal.signature)} — aborting iteration\n`,
					);
					controller.abort('flailing');
					break;
				}
			}
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
				// Only external-process backends report a pid. The in-process native backend's
				// tool children are direct children of the orchestrator, indistinguishable by
				// ppid from the CLI's own git/doctor spawns — tracking them would risk reaping
				// our own in-flight subprocesses, so pid-less backends are not tracked.
				if (event.pid !== undefined) childReaper.attach(event.pid);
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
				childReaper.noteActivity();
				process.stdout.write(`· ${event.tool}${formatToolArgs(event.args)}\n`);
			}
		}
	} finally {
		if (wallClockTimer !== undefined) clearTimeout(wallClockTimer);
		if (closeStream) await stream.return?.();
		// Runs on every exit path — normal backend exit, completion grace, flailing/wall-clock
		// abort, and thrown errors — so a leaked listener never survives the iteration.
		const reapedPids = await childReaper.reap();
		if (reapedPids.length > 0) {
			// Says which table the decision came from: the stale-snapshot path only runs when the
			// teardown probe failed, and how often that happens is worth knowing.
			const source = reapDiagnostic?.usedStaleTable
				? ` (from a ${Math.round(reapDiagnostic.tableAgeMs / 1000)}s-old snapshot: the teardown process-table probe timed out)`
				: '';
			process.stdout.write(
				`♻ reaped ${reapedPids.length} leaked child process(es) at teardown${source}: ${reapedPids.join(', ')}\n`,
			);
		}
	}

	const stopRequestedAfterRun = await deps.store.hasStopRequested(plan.stopPolicy.stopFile);
	const exitCode = completionFinalizedBeforeBackendExit
		? orchestratorExitCodes.success
		: flailingDetected
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
		wallClockTimedOut,
		...(timeToFirstEventMs !== undefined ? { timeToFirstEventMs } : {}),
		completionCommittedDuringGrace,
		completionFinalizedBeforeBackendExit,
		idleWarningTimestamps,
		...(acceptedCompletionFeature !== undefined ? { acceptedCompletionFeature } : {}),
		progress,
	};
}

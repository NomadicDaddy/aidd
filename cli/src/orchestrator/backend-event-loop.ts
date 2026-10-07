import type { AgentEvent } from 'aidd-shared/backends/types';
import type { SelectedWork } from 'aidd-shared/modes/types';
import type { BackendName } from 'aidd-shared/plan/types';

import type { BackendSafetyEnvelope } from './backend-safety.ts';
import type { OrchestratorProgressReporter } from './progress.ts';
import type { OrchestratorDeps } from './run/types.ts';

import { CompletionUsageDrain } from './completion-usage-drain.ts';
import {
	formatBackendStarted,
	formatIdleWarningLine,
	formatThinkingLine,
	formatToolArgs,
} from './formatters.ts';
import { acceptedCompletedFeatureFromEvents } from './run/feature-scope.ts';
import { waitForCommitOrTimeout } from './run/git.ts';

/**
 * Completion-marker handling for a loop that may accept a feature completion mid-stream: where
 * to watch for the commit, which head it must move past, how long to wait, and the store and
 * selected work the acceptance check reads. Absent for stages that never accept a completion.
 */
export interface BackendEventLoopCompletion {
	cwd: string;
	gitHeadBefore: string | undefined;
	graceMs: number;
	store: OrchestratorDeps['store'];
	work: SelectedWork;
}

export interface BackendEventLoopOptions {
	/** Backend name the usage drain reports under after a commit lands. */
	backend: BackendName;
	completion?: BackendEventLoopCompletion | undefined;
	controller: AbortController;
	envelope: BackendSafetyEnvelope;
	/** The transcript the loop appends to; owned by the caller so its finally can read it. */
	events: AgentEvent[];
	/** Called per event before the safety envelope observes it: the caller's observer and timing. */
	onAgentEvent?: ((event: AgentEvent) => Promise<void> | void) | undefined;
	progress: OrchestratorProgressReporter;
	stream: AsyncIterator<AgentEvent>;
}

export interface BackendEventLoopResult {
	acceptedCompletionFeature?: string;
	/** False when the stream ended on its own, so the caller must not call `return()` on it. */
	closeStream: boolean;
	completionCommittedDuringGrace: boolean;
	completionFinalizedBeforeBackendExit: boolean;
}

const completionMarkerGrace = 'completion_marker_grace' as const;

// The operator-facing console lines; the run log and progress see every event separately.
function printOperatorLine(event: AgentEvent): void {
	if (event.type === 'started') {
		process.stdout.write(formatBackendStarted(event.backend, event.pid));
		process.stdout.write(formatThinkingLine(event.backend));
	} else if (event.type === 'idle_warning') {
		process.stdout.write(formatIdleWarningLine(event.afterMs));
	} else if (event.type === 'assistant_text') {
		process.stdout.write(event.chunk.endsWith('\n') ? event.chunk : `${event.chunk}\n`);
	} else if (event.type === 'tool_call') {
		process.stdout.write(`· ${event.tool}${formatToolArgs(event.args)}\n`);
	}
}

/**
 * The one backend event loop both the iteration runner and a triumvirate stage drive: race the
 * next event against the completion-marker commit grace once a completion is accepted, drain the
 * usage the backend reports after the commit, re-check a late acceptance at backend exit and wait
 * for its commit, feed every event to the progress reporter, the caller's observer and the
 * safety envelope (breaking on a flailing abort), and print the operator-facing lines. The caller
 * owns setup (stream, envelope, progress), teardown and result shaping, which is what differs.
 */
export async function consumeBackendStream(
	options: BackendEventLoopOptions,
): Promise<BackendEventLoopResult> {
	const { completion, controller, envelope, events, progress, stream } = options;
	const completionUsageDrain = new CompletionUsageDrain();
	let acceptedCompletionFeature: string | undefined;
	let completionCommittedDuringGrace = false;
	let completionFinalizedBeforeBackendExit = false;
	let closeStream = true;

	const acceptFromEvents = async (): Promise<void> => {
		if (completion === undefined || acceptedCompletionFeature !== undefined) return;
		const accepted = await acceptedCompletedFeatureFromEvents(
			completion.store,
			events,
			completion.work,
		);
		if (accepted !== undefined) acceptedCompletionFeature = accepted;
	};
	// At backend exit, an accepted completion still has to land its commit before it counts.
	const waitForAcceptedCommit = async (): Promise<void> => {
		if (acceptedCompletionFeature === undefined || completion?.gitHeadBefore === undefined)
			return;
		const outcome = await waitForCommitOrTimeout(
			completion.cwd,
			completion.gitHeadBefore,
			completion.graceMs,
		);
		completionCommittedDuringGrace = outcome.committed;
		completionFinalizedBeforeBackendExit = true;
	};

	while (true) {
		const nextEvent = stream.next();
		let stepResult =
			acceptedCompletionFeature !== undefined && completion !== undefined
				? await Promise.race([
						nextEvent,
						waitForCommitOrTimeout(
							completion.cwd,
							completion.gitHeadBefore,
							completion.graceMs,
						).then((outcome) => {
							completionCommittedDuringGrace = outcome.committed;
							return completionMarkerGrace;
						}),
					])
				: await nextEvent;
		if (stepResult === completionMarkerGrace) {
			const drainedEvent = await completionUsageDrain.afterCommit(options.backend, nextEvent);
			if (drainedEvent !== undefined) stepResult = drainedEvent;
		}
		if (stepResult === completionMarkerGrace) {
			completionFinalizedBeforeBackendExit = true;
			controller.abort('completion_marker_accepted');
			break;
		}
		if (stepResult.done) {
			closeStream = false;
			// The per-assistant_text acceptance check only catches a completion whose feature.json
			// was already flipped to completed+passes when the AIDD_RESULT marker streamed. An
			// agent that prints the marker and writes feature.json a beat later (or is aborted
			// mid-turn) leaves acceptedCompletionFeature unset, so the commit-grace verification
			// below never runs, and the completed_after_backend_abort completion would be accepted
			// with the feature's work still uncommitted. Re-check at backend exit so a late
			// completion goes through the same commit-landed gate.
			await acceptFromEvents();
			await waitForAcceptedCommit();
			break;
		}

		const event = stepResult.value;
		completionUsageDrain.record(event);
		// Live deltas are presentation-only duplicates of the turn's final assistant_text: they
		// feed the observer (run-log tail) and progress, but persisting them in `events` would
		// double the transcript and every marker/metrics scan over it.
		if (event.type !== 'assistant_delta') events.push(event);
		progress.recordAgentEvent(event);
		await options.onAgentEvent?.(event);
		if ((await envelope.observe(event)) === 'abort_flailing') break;
		printOperatorLine(event);
		if (event.type === 'assistant_text') {
			const before = acceptedCompletionFeature;
			await acceptFromEvents();
			if (before === undefined && acceptedCompletionFeature !== undefined) {
				progress.setStage('completion_marker_grace', {
					last: `accepted ${acceptedCompletionFeature}`,
				});
			}
		}
	}

	return {
		closeStream,
		completionCommittedDuringGrace,
		completionFinalizedBeforeBackendExit,
		...(acceptedCompletionFeature !== undefined ? { acceptedCompletionFeature } : {}),
	};
}

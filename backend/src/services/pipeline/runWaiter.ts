import { setTimeout as sleep } from 'node:timers/promises';

import type { WebRunStatus } from '../../types.ts';
import type { RunService } from '../runService.ts';

import { terminalAgentMessage } from '../run/staleResultRecovery.ts';
import { RUN_WAIT_MAX_MS } from './constants.ts';
import { formatForwardedAgentMessage, formatOutputSummary } from './helpers.ts';
import { type RunRow, terminalRunStatuses } from './types.ts';

// Isolate run polling and backstop logic so it can be tested independently of StepExecutor. The
// session stop flag is the primary cancellation path; the deadline only exists so a step cannot
// block a session forever on a run row that never becomes terminal.
export class RunWaiter {
	private readonly runService: RunService;
	private readonly stopFlags: Set<string>;

	constructor(input: { runService: RunService; stopFlags: Set<string> }) {
		this.runService = input.runService;
		this.stopFlags = input.stopFlags;
	}

	async waitForRun(runId: string, sessionId: string): Promise<RunRow> {
		let deadline = Date.now() + RUN_WAIT_MAX_MS;
		let lastHeartbeat: null | number = null;
		for (;;) {
			const run = await this.runService.getRun(runId);
			if (run && terminalRunStatuses.has(run.status as WebRunStatus)) return run;
			// The backstop bounds execution, not admission: time spent queued behind the run
			// ceiling must not fail the step, so the clock starts once the run is admitted.
			if (run?.status === 'queued') deadline = Date.now() + RUN_WAIT_MAX_MS;
			// What the bound is actually for is a row nothing is working on any more — an orphan
			// left 'running' by a process kill. A live run writes its heartbeat every few seconds,
			// so an advancing heartbeat restarts the clock. Measuring elapsed time instead aborted
			// a coding run that was working the whole time and had an hour left to go: the step
			// failed, the run carried on detached, and the review and documentation steps behind it
			// never ran.
			const heartbeat = run?.heartbeatAt ?? null;
			if (heartbeat !== null && heartbeat !== lastHeartbeat) {
				lastHeartbeat = heartbeat;
				deadline = Date.now() + RUN_WAIT_MAX_MS;
			}
			if (this.stopFlags.has(sessionId)) {
				throw new Error(
					`Pipeline session was stopped while waiting for run ${runId} to finish.`,
				);
			}
			if (Date.now() >= deadline) {
				throw new Error(
					`Run ${runId} has not reached a terminal state or written a heartbeat in ` +
						`${RUN_WAIT_MAX_MS} ms; aborting the waiting step instead of blocking the ` +
						'pipeline session forever.',
				);
			}
			await sleep(200);
		}
	}

	async outputForRun(runId: string): Promise<string | undefined> {
		try {
			const result = await this.runService.readOutput(runId);
			return formatOutputSummary(result.output, '');
		} catch {
			return undefined;
		}
	}

	/**
	 * The run's closing assistant message, for handing one step's findings to the next.
	 *
	 * outputForRun is the wrong source for that: it is a byte-aligned tail of the raw transcript,
	 * so a review step forwarded a fragment starting mid-JSON-line — tool envelopes, a truncated
	 * todo list, and the report itself cut off wherever 4000 bytes happened to land. The terminal
	 * agent message is the report, and nothing else.
	 * @param runId
	 * @returns The message, or undefined when the transcript is unreadable or holds none.
	 */
	async agentMessageForRun(runId: string): Promise<string | undefined> {
		try {
			const result = await this.runService.readOutput(runId);
			return formatForwardedAgentMessage(terminalAgentMessage(result.output));
		} catch {
			return undefined;
		}
	}
}

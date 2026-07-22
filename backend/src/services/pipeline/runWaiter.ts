import { setTimeout as sleep } from 'node:timers/promises';

import type { WebRunStatus } from '../../types.ts';
import type { RunService } from '../runService.ts';

import { RUN_WAIT_MAX_MS } from './constants.ts';
import { formatOutputSummary } from './helpers.ts';
import { terminalRunStatuses, type RunRow } from './types.ts';

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
		const deadline = Date.now() + RUN_WAIT_MAX_MS;
		for (;;) {
			const run = await this.runService.getRun(runId);
			if (run && terminalRunStatuses.has(run.status as WebRunStatus)) return run;
			if (this.stopFlags.has(sessionId)) {
				throw new Error(
					`Pipeline session was stopped while waiting for run ${runId} to finish.`
				);
			}
			if (Date.now() >= deadline) {
				throw new Error(
					`Run ${runId} did not reach a terminal state within ${RUN_WAIT_MAX_MS} ms; ` +
						'aborting the waiting step instead of blocking the pipeline session forever.'
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
}

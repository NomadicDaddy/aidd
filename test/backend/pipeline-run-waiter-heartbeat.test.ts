import { describe, expect, test } from 'bun:test';

import type { RunService } from '../../backend/src/services/runService.ts';

import { RUN_WAIT_MAX_MS } from '../../backend/src/services/pipeline/constants.ts';
import { RunWaiter } from '../../backend/src/services/pipeline/runWaiter.ts';

// A 7-hour coding run was aborted by this backstop at the 6-hour mark while it was working and
// heartbeating: the step failed, the run carried on detached and finished, and the review and
// documentation steps behind it never ran. The bound is there for an orphaned 'running' row that
// nothing is working on, so it has to measure silence rather than elapsed time.

/**
 * A run service whose row advances through the states the test dictates, with the clock under the
 * test's control so a six-hour bound can be crossed without waiting for it.
 */
function waiterOver(rows: Record<string, unknown>[], now: () => number) {
	let index = 0;
	const runService = {
		getRun: async () => {
			const row = rows[Math.min(index, rows.length - 1)];
			index += 1;
			return row;
		},
	} as unknown as RunService;
	const waiter = new RunWaiter({ runService, stopFlags: new Set<string>() });
	const realNow = Date.now;
	Date.now = now;
	return {
		restore: () => {
			Date.now = realNow;
		},
		waiter,
	};
}

function row(status: string, heartbeatAt: null | number): Record<string, unknown> {
	return { heartbeatAt, id: 'run_1', status };
}

describe('run waiter backstop', () => {
	test('keeps waiting on a run that is still writing its heartbeat', async () => {
		// Each poll jumps an hour and the run heartbeats every time, so the bound is crossed in
		// wall-clock terms several times over before the run finally terminalizes.
		let clock = 1_000_000;
		const hour = 60 * 60 * 1000;
		const rows = [
			row('running', clock),
			row('running', clock + hour),
			row('running', clock + 2 * hour),
			row('running', clock + 7 * hour),
			row('completed', clock + 7 * hour),
		];
		const { restore, waiter } = waiterOver(rows, () => {
			clock += hour;
			return clock;
		});
		try {
			const finished = await waiter.waitForRun('run_1', 'pipe_1');
			expect(finished.status).toBe('completed');
		} finally {
			restore();
		}
	});

	test('gives up on a row that has gone silent', async () => {
		// The shape the bound exists for: a 'running' row whose heartbeat never advances because
		// the process behind it was killed out of band.
		let clock = 1_000_000;
		const frozen = clock;
		const { restore, waiter } = waiterOver([row('running', frozen)], () => {
			clock += RUN_WAIT_MAX_MS / 4;
			return clock;
		});
		try {
			await expect(waiter.waitForRun('run_1', 'pipe_1')).rejects.toThrow(
				/has not reached a terminal state or written a heartbeat/,
			);
		} finally {
			restore();
		}
	});

	test('gives up on a row that never reports a heartbeat at all', async () => {
		let clock = 1_000_000;
		const { restore, waiter } = waiterOver([row('running', null)], () => {
			clock += RUN_WAIT_MAX_MS / 4;
			return clock;
		});
		try {
			await expect(waiter.waitForRun('run_1', 'pipe_1')).rejects.toThrow(
				/aborting the waiting step/,
			);
		} finally {
			restore();
		}
	});

	test('stops immediately when the session is stopped', async () => {
		const stopFlags = new Set<string>(['pipe_1']);
		const runService = {
			getRun: async () => row('running', Date.now()),
		} as unknown as RunService;
		const waiter = new RunWaiter({ runService, stopFlags });

		await expect(waiter.waitForRun('run_1', 'pipe_1')).rejects.toThrow(
			/Pipeline session was stopped/,
		);
	});
});

import { describe, expect, test } from 'bun:test';

import { runTestPhase } from '../../scripts/lib/test-run/stall-watchdog.ts';

/** Collects what the watchdog forwards, standing in for the console streams. */
function collectingSinks(): {
	sinks: {
		stderr: { write: (chunk: Uint8Array) => boolean };
		stdout: { write: (chunk: Uint8Array) => boolean };
	};
	text: () => string;
} {
	const decoder = new TextDecoder();
	let text = '';
	const sink = {
		write: (chunk: Uint8Array): boolean => {
			text += decoder.decode(chunk, { stream: true });
			return true;
		},
	};
	return { sinks: { stderr: sink, stdout: sink }, text: () => text };
}

describe('test phase stall watchdog', () => {
	test('reports a phase that exits on its own, forwarding its output', async () => {
		const { sinks, text } = collectingSinks();
		const result = await runTestPhase(['-e', 'console.log("alive"); process.exit(3);'], {
			sinks,
			// Far above anything this child can take, so a loaded machine cannot make it look stalled.
			stallTimeoutMs: 30_000,
		});

		expect(result.stalled).toBe(false);
		expect(result.exitCode).toBe(3);
		expect(text()).toContain('alive');
	});

	test('hands the spawned pid to the caller before reading output', async () => {
		const pids: number[] = [];
		const result = await runTestPhase(['-e', 'console.log("ok");'], {
			onSpawn: (pid) => pids.push(pid),
			sinks: collectingSinks().sinks,
			stallTimeoutMs: 30_000,
		});

		expect(result.stalled).toBe(false);
		expect(pids).toHaveLength(1);
		expect(pids[0]).toBeGreaterThan(0);
	});

	test('kills a phase that goes silent and reports the silence', async () => {
		const { sinks, text } = collectingSinks();
		const started = performance.now();
		// Speaks once, then wedges the way a deadlocked worker does: alive, quiet, and never
		// exiting. Without the watchdog this call would outlive the test itself.
		const result = await runTestPhase(
			['-e', 'console.log("start"); await Bun.sleep(600_000);'],
			{
				sinks,
				stallTimeoutMs: 500,
			},
		);

		expect(result.stalled).toBe(true);
		expect(result.idleMs ?? 0).toBeGreaterThanOrEqual(500);
		expect(text()).toContain('start');
		// The point of the watchdog is that it returns; a kill that waited on the wedged tree's
		// pipes would pass every assertion above and still hang the run.
		expect(performance.now() - started).toBeLessThan(20_000);
	}, 30_000);

	test('a zero threshold disables the watchdog', async () => {
		const result = await runTestPhase(['-e', 'process.exit(0);'], {
			sinks: collectingSinks().sinks,
			stallTimeoutMs: 0,
		});

		expect(result.stalled).toBe(false);
		expect(result.exitCode).toBe(0);
	});
});

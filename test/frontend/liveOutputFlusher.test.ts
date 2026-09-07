import { describe, expect, test } from 'bun:test';

import {
	createFlushScheduler,
	type FlushSchedulerOptions,
} from '../../frontend/src/hooks/liveOutputFlusher.ts';

// Controllable timer + frame doubles: callbacks are captured, not run, so a test can fire either
// mechanism on demand (or never — simulating a hidden tab where rAF is paused).
function makeHarness() {
	const timers = new Map<number, () => void>();
	const frames = new Map<number, () => void>();
	let nextTimer = 0;
	let nextFrame = 0;
	const options: FlushSchedulerOptions = {
		cancelFrame: (handle) => {
			frames.delete(handle);
		},
		cancelTimer: (handle) => {
			timers.delete(handle as unknown as number);
		},
		fallbackMs: 150,
		requestFrame: (callback) => {
			const id = ++nextFrame;
			frames.set(id, callback);
			return id;
		},
		scheduleTimer: (callback) => {
			const id = ++nextTimer;
			timers.set(id, callback);
			return id as unknown as ReturnType<typeof setTimeout>;
		},
	};
	function fireOne(map: Map<number, () => void>): void {
		const entry = [...map.entries()][0];
		if (!entry) return;
		map.delete(entry[0]);
		entry[1]();
	}
	return {
		fireFrame: () => fireOne(frames),
		fireTimer: () => fireOne(timers),
		options,
		pendingFrames: () => frames.size,
		pendingTimers: () => timers.size,
	};
}

describe('createFlushScheduler', () => {
	test('flushes via the timeout fallback when rAF never fires (hidden-tab regression)', () => {
		const harness = makeHarness();
		let flushes = 0;
		const scheduler = createFlushScheduler(() => flushes++, harness.options);

		scheduler.schedule();
		// Both mechanisms armed; nothing flushed yet.
		expect(harness.pendingTimers()).toBe(1);
		expect(harness.pendingFrames()).toBe(1);
		expect(flushes).toBe(0);

		// rAF is paused (never fires) — the timeout fallback must still flush.
		harness.fireTimer();
		expect(flushes).toBe(1);
		// The now-redundant frame is cancelled so it cannot double-flush later.
		expect(harness.pendingFrames()).toBe(0);
	});

	test('rAF wins the race and cancels the pending timeout', () => {
		const harness = makeHarness();
		let flushes = 0;
		const scheduler = createFlushScheduler(() => flushes++, harness.options);

		scheduler.schedule();
		harness.fireFrame();
		expect(flushes).toBe(1);
		expect(harness.pendingTimers()).toBe(0);
	});

	test('coalesces repeated schedule() calls into a single flush', () => {
		const harness = makeHarness();
		let flushes = 0;
		const scheduler = createFlushScheduler(() => flushes++, harness.options);

		scheduler.schedule();
		scheduler.schedule();
		scheduler.schedule();
		expect(harness.pendingTimers()).toBe(1);
		expect(harness.pendingFrames()).toBe(1);

		harness.fireTimer();
		expect(flushes).toBe(1);
	});

	test('re-arms after a flush', () => {
		const harness = makeHarness();
		let flushes = 0;
		const scheduler = createFlushScheduler(() => flushes++, harness.options);

		scheduler.schedule();
		harness.fireTimer();
		expect(flushes).toBe(1);

		scheduler.schedule();
		expect(harness.pendingTimers()).toBe(1);
		harness.fireFrame();
		expect(flushes).toBe(2);
	});

	test('cancel() drops a pending flush without running it', () => {
		const harness = makeHarness();
		let flushes = 0;
		const scheduler = createFlushScheduler(() => flushes++, harness.options);

		scheduler.schedule();
		scheduler.cancel();
		expect(harness.pendingTimers()).toBe(0);
		expect(harness.pendingFrames()).toBe(0);
		expect(flushes).toBe(0);
	});

	test('flushes via timeout when rAF is unavailable (non-browser env)', () => {
		const harness = makeHarness();
		let flushes = 0;
		const scheduler = createFlushScheduler(() => flushes++, {
			...harness.options,
			requestFrame: () => null,
		});

		scheduler.schedule();
		expect(harness.pendingFrames()).toBe(0);
		expect(harness.pendingTimers()).toBe(1);

		harness.fireTimer();
		expect(flushes).toBe(1);
	});
});

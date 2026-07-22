// Coalesces bursty live-output updates into at most one flush per frame window, using BOTH a
// requestAnimationFrame and a setTimeout fallback — whichever fires first flushes and cancels the
// other. rAF alone is not enough: browsers pause it entirely for hidden/backgrounded tabs and
// throttle it under load, and with a naive rAF-only coalescer a never-firing frame silently
// swallows every subsequent update (the live console "freezes" until a non-rAF path repaints).
// setTimeout still fires when the tab is hidden (throttled to >=1s, but it fires), so it is the
// reliability floor; rAF, when it wins the race, gives a frame-synced paint while the tab is
// visible. Timer functions are injectable so the scheduler is unit-testable without a DOM.

export interface FlushScheduler {
	/** Cancel any pending flush without running it. */
	cancel(): void;
	/** Arm a flush if one is not already pending (coalescing). */
	schedule(): void;
}

export interface FlushSchedulerOptions {
	cancelFrame?: (handle: number) => void;
	cancelTimer?: (handle: ReturnType<typeof setTimeout>) => void;
	/** Fallback flush delay, ms. Bounds how long a hidden tab can lag behind live output. */
	fallbackMs?: number;
	/** Request an animation frame, or return null when rAF is unavailable (non-browser env). */
	requestFrame?: (callback: () => void) => null | number;
	scheduleTimer?: (callback: () => void, ms: number) => ReturnType<typeof setTimeout>;
}

const DEFAULT_FALLBACK_MS = 150;

export function createFlushScheduler(
	flush: () => void,
	options: FlushSchedulerOptions = {}
): FlushScheduler {
	const fallbackMs = options.fallbackMs ?? DEFAULT_FALLBACK_MS;
	const requestFrame = options.requestFrame ?? defaultRequestFrame;
	const cancelFrame = options.cancelFrame ?? defaultCancelFrame;
	const scheduleTimer = options.scheduleTimer ?? ((callback, ms) => setTimeout(callback, ms));
	const clearTimer = options.cancelTimer ?? ((handle) => clearTimeout(handle));

	// `pending` is the coalescing key, not the handles: a synchronously-firing test double (or an
	// unusually eager timer) can reset it via run() before schedule() finishes assigning handles, so
	// keying off a boolean keeps that race from wedging the scheduler.
	let pending = false;
	let frameHandle: null | number = null;
	let timerHandle: null | ReturnType<typeof setTimeout> = null;

	function clear(): void {
		pending = false;
		if (frameHandle !== null) {
			cancelFrame(frameHandle);
			frameHandle = null;
		}
		if (timerHandle !== null) {
			clearTimer(timerHandle);
			timerHandle = null;
		}
	}

	function run(): void {
		if (!pending) return; // already flushed or cancelled
		clear();
		flush();
	}

	function schedule(): void {
		if (pending) return;
		pending = true;
		timerHandle = scheduleTimer(run, fallbackMs);
		if (!pending) return; // run() fired synchronously (test double); nothing left to arm
		frameHandle = requestFrame(run);
		if (!pending && frameHandle !== null) {
			// The frame ran synchronously and flushed; drop the now-stale handle.
			cancelFrame(frameHandle);
			frameHandle = null;
		}
	}

	return { cancel: clear, schedule };
}

function defaultRequestFrame(callback: () => void): null | number {
	return typeof requestAnimationFrame === 'function' ? requestAnimationFrame(callback) : null;
}

function defaultCancelFrame(handle: number): void {
	if (typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
}

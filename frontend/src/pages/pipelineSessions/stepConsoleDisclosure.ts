import type { PipelineStepStatus } from '../../api/types.ts';

/**
 * The step console's disclosure state, and the run id it implies.
 *
 * Two flags rather than one because they answer different questions: `open` is what the toggle
 * shows, `everOpened` is whether the console has been asked for at all. Keeping them together in
 * one value means the transition has a single definition — the alternative, two `useState` pairs
 * updated side by side, is how a disclosure ends up momentarily open with nothing to show.
 */
export interface ConsoleDisclosure {
	/** True once the disclosure has been opened at least once; never returns to false. */
	everOpened: boolean;
	open: boolean;
}

/** A running step opens with its transcript already visible; anything else opens closed. */
export function initialDisclosure(stepStatus: PipelineStepStatus): ConsoleDisclosure {
	const open = stepStatus === 'running';
	return { everOpened: open, open };
}

export function toggleDisclosure(state: ConsoleDisclosure): ConsoleDisclosure {
	const open = !state.open;
	return { everOpened: state.everOpened || open, open };
}

/**
 * The run id the console should be reading, or `undefined` to read nothing.
 *
 * `undefined` disables both queries and makes the socket handler inert, which is what keeps a
 * session of collapsed steps from firing a transcript request per step on page load. It stays
 * defined after a re-collapse so the streaming dot on the closed toggle remains truthful.
 */
export function consoleSourceId(
	state: ConsoleDisclosure,
	runId: null | string,
): string | undefined {
	return state.everOpened && runId ? runId : undefined;
}

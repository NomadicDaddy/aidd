import type { RunLaunchRequest, WebRunMode } from '../../types.ts';

/**
 * Modes whose child writes to the project checkout it runs in: source files, `.aidd` feature
 * state, and the git baseline the next run will read.
 *
 * Audit and validate runs also write project feature state and reports, so they contend for
 * the checkout. `director` executes in data/director instead of a project tree. `directive`
 * is decided per launch: a review-only directive runs under `--directive-readonly` and mutates
 * nothing, while an ordinary one is a coding run wearing a different hat.
 */
const MUTATING_MODES: ReadonlySet<WebRunMode> = new Set<WebRunMode>([
	'audit',
	'coding',
	'interview',
	'todo',
	'triumvirate',
	'validate',
]);

export function mayMutateProject(
	mode: WebRunMode,
	input: Pick<RunLaunchRequest, 'directiveReadonly'>,
): boolean {
	if (mode === 'directive') return input.directiveReadonly !== true;
	return MUTATING_MODES.has(mode);
}

/**
 * The per-project ceiling this launch must actually clear.
 *
 * Feature leases keep two runs from claiming the same feature, but they say nothing about source
 * files, the index, or the git baseline. Two mutating children in one checkout interleave edits
 * and commit over each other, so a mutating launch with no worktree of its own is admitted only
 * when the project is otherwise idle — the checkout is the resource, and there is one of it.
 *
 * A worktree-isolated run gets its own checkout, and a read-only run never writes to one, so both
 * keep the configured concurrency. The clamp only ever tightens: a configured ceiling of 0 (all
 * launches refused) is left alone rather than raised to 1.
 * @param input - Configured ceiling plus this launch's isolation and mutability.
 * @param input.configured - The operator-configured maxConcurrentRunsPerProject.
 * @param input.isolated - Whether this launch runs in its own git worktree.
 * @param input.mutating - Whether this launch may write to the project checkout.
 * @returns The per-project ceiling the reservation must clear.
 */
export function effectiveProjectRunCeiling(input: {
	configured: number;
	isolated: boolean;
	mutating: boolean;
}): number {
	if (!input.mutating || input.isolated) return input.configured;
	return Math.min(input.configured, 1);
}

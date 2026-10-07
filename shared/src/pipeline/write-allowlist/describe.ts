import type { WriteGuardCheckout, WriteViolation } from './types.ts';

// What the guard did about a violation, in the words the operator reads to decide whether their
// worktree still needs attention. Two claims used to be made that were not always true:
//
// - "writes reverted" was printed even when the revert had failed for some paths.
// - "writes reverted" was printed for a path whose uncommitted edits had been discarded. The
//   revert checks that path out from the baseline commit, which succeeds and restores nothing:
//   the committed version is in place and the edits are gone.
//
// In a shared checkout nothing is reverted at all, and the text says so and says why, because the
// operator has to decide which of the listed paths are the run's and which are their own.
export function describeWriteGuardRevert(
	violations: WriteViolation[],
	revertFailed: string[],
	checkout: WriteGuardCheckout,
	limit = 8,
): string {
	const shown = (paths: string[]): string => {
		const rest = paths.length > limit ? ` … and ${paths.length - limit} more` : '';
		return `${paths.slice(0, limit).join(', ')}${rest}`;
	};
	// A discarded path with no committed version (untracked or added at baseline) is gone outright:
	// nothing restores it, and listing it as "still dirty" or "the committed version is in place"
	// would both be false. The revert that "fails" on it is the same absence, not a second problem.
	// The verdict comes from the detector's baseline status alone: a failed revert says nothing
	// about whether a committed version exists (the isolated unwind also refuses when the baseline
	// is no longer an ancestor), and in a shared checkout nothing is reverted by design.
	const discarded = violations.filter((item) => item.destructivelyDiscarded);
	const unrecoverable = discarded.filter((item) => item.untracked).map((item) => item.path);
	const lost = discarded
		.filter((item) => !unrecoverable.includes(item.path))
		.map((item) => item.path);
	// A discarded path is not dirty whatever its revert did; the lost line already says it is
	// not restored. "Still dirty" names only the paths the run wrote and the revert left behind.
	const discardedPaths = discarded.map((item) => item.path);
	const stillDirty = revertFailed.filter((path) => !discardedPaths.includes(path));
	const parts: string[] = [];
	if (checkout === 'shared') {
		const present = violations
			.filter((item) => !item.destructivelyDiscarded)
			.map((item) => item.path);
		if (present.length > 0) {
			parts.push(
				`NOT reverted, left as they are: this checkout is shared, so the run's writes cannot be told from yours: ${shown(present)}`,
			);
		}
	} else if (stillDirty.length > 0) {
		parts.push(`REVERT FAILED, still dirty: ${shown(stillDirty)}`);
	} else if (discarded.length < violations.length) {
		parts.push('writes reverted');
	}
	if (lost.length > 0) {
		parts.push(
			`uncommitted edits were discarded and are NOT restored (the committed version is in place): ${shown(lost)}`,
		);
	}
	if (unrecoverable.length > 0) {
		parts.push(`deleted and NOT recoverable (it was never committed): ${shown(unrecoverable)}`);
	}
	return parts.join('; ');
}

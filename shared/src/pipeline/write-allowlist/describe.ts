import type { WriteViolation } from './types.ts';

// What the guard did about a violation, in the words the operator reads to decide whether their
// worktree still needs attention. Two claims used to be made that were not always true:
//
// - "writes reverted" was printed even when the revert had failed for some paths.
// - "writes reverted" was printed for a path whose uncommitted edits had been discarded. The
//   revert checks that path out from the baseline commit, which succeeds and restores nothing:
//   the committed version is in place and the edits are gone.
export function describeWriteGuardRevert(
	violations: WriteViolation[],
	revertFailed: string[],
	limit = 8,
): string {
	const shown = (paths: string[]): string => {
		const rest = paths.length > limit ? ` … and ${paths.length - limit} more` : '';
		return `${paths.slice(0, limit).join(', ')}${rest}`;
	};
	const lost = violations.filter((item) => item.destructivelyDiscarded).map((item) => item.path);
	const parts: string[] = [];
	if (revertFailed.length > 0) {
		parts.push(`REVERT FAILED, still dirty: ${shown(revertFailed)}`);
	} else if (lost.length < violations.length) {
		parts.push('writes reverted');
	}
	if (lost.length > 0) {
		parts.push(
			`uncommitted edits were discarded and are NOT restored (the committed version is in place): ${shown(lost)}`,
		);
	}
	return parts.join('; ');
}

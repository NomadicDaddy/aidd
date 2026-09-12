import { rm } from 'node:fs/promises';
import { join } from 'node:path';

import type { WriteGuardSnapshot, WriteViolation } from './types.ts';

import { gitCapture, gitStatusEntries, pathExistsInTree } from './git.ts';

// Best-effort revert: brand-new untracked files are deleted; tracked modifications and
// deletions are restored from the baseline commit, INDEX INCLUDED. Committed violations are
// unwound by resetting HEAD to the baseline commit with `--mixed` (which preserves all changes as
// uncommitted working tree entries) but ONLY the violating paths are then reverted — legitimate
// committed work for non-violating paths stays as uncommitted changes. The operation bails out
// (returning all committed paths as failed) when the baseline HEAD is no longer an ancestor of
// current HEAD (e.g. the agent rebased or amended), so it never resets to a divergent tree.
//
// Failures are collected, not thrown — and callers MUST report them, because "writes reverted" is
// a claim about the operator's worktree, not about this function having run.
export async function revertWriteViolations(
	projectDir: string,
	baseline: WriteGuardSnapshot,
	violations: WriteViolation[],
): Promise<string[]> {
	const failed = new Set<string>();
	const working = await unwindCommittedViolations(projectDir, baseline, violations);
	if (working === null) {
		return violations.filter((violation) => violation.committed).map((v) => v.path);
	}
	for (const violation of working) {
		try {
			if (!(await revertOne(projectDir, baseline, violation))) failed.add(violation.path);
		} catch {
			failed.add(violation.path);
		}
	}
	for (const path of await unrevertedPaths(projectDir, baseline, working)) failed.add(path);
	return [...failed];
}

// Returns the violation list to revert, with committed entries re-classified against live status
// after the mixed reset — or null when the reset is refused or fails.
async function unwindCommittedViolations(
	projectDir: string,
	baseline: WriteGuardSnapshot,
	violations: WriteViolation[],
): Promise<null | WriteViolation[]> {
	if (!violations.some((violation) => violation.committed) || !baseline.head) return violations;
	// Guard: bail out when the agent has rebased or amended such that baseline is no longer an
	// ancestor of HEAD. A mixed reset against a non-ancestor would rewind to a divergent tree, so
	// we refuse rather than silently corrupt the history.
	const ancestor = await gitCapture(projectDir, [
		'merge-base',
		'--is-ancestor',
		baseline.head,
		'HEAD',
	]);
	if (ancestor === null) return null;
	// Unwind HEAD to the baseline commit with `--mixed`: this moves HEAD back but leaves all file
	// content in the working tree as uncommitted changes. Only the violating paths are reverted
	// below — legitimate committed work for non-violating paths is preserved as uncommitted changes.
	if ((await gitCapture(projectDir, ['reset', '--mixed', '--quiet', baseline.head])) === null) {
		return null;
	}
	const status = await gitStatusEntries(projectDir);
	return violations.map((violation) =>
		violation.committed
			? { ...violation, committed: false, untracked: status?.get(violation.path) === '??' }
			: violation,
	);
}

async function revertOne(
	projectDir: string,
	baseline: WriteGuardSnapshot,
	violation: WriteViolation,
): Promise<boolean> {
	if (violation.untracked) {
		await rm(join(projectDir, violation.path), { force: true, recursive: true });
		return true;
	}
	if (violation.destructivelyDiscarded) {
		// A destructive operation (git reset --hard, etc.) discarded the baseline dirty state.
		// Restore the file content from the baseline HEAD so the operator's uncommitted work is
		// recovered as far as it can be — the staged/unstaged split is not recoverable.
		if (!baseline.head) return false;
		return (
			(await gitCapture(projectDir, ['checkout', baseline.head, '--', violation.path])) !==
			null
		);
	}
	if (baseline.entries.has(violation.path)) {
		// Dirty at baseline in some other way: the operator's own index content is the best
		// available restore point, so put the worktree back to it and leave the index alone.
		return (await gitCapture(projectDir, ['checkout', '--', violation.path])) !== null;
	}
	return await restoreCleanBaselinePath(projectDir, baseline, violation.path);
}

// Revert a path that was CLEAN at baseline — the ordinary case, and the one that used to lie.
//
// `git checkout -- <path>` restores the worktree from the INDEX, so a path the run staged is
// "restored" to exactly what the run staged: a no-op reported as a success. That is how every
// metadata-only project-intake tripping over aidd's own `.githooks/*` was told "writes reverted"
// while all five files stayed staged (`A `) in the operator's repository.
async function restoreCleanBaselinePath(
	projectDir: string,
	baseline: WriteGuardSnapshot,
	path: string,
): Promise<boolean> {
	if (baseline.head && (await pathExistsInTree(projectDir, baseline.head, path))) {
		// `checkout <sha> -- <path>` rewrites the index entry as well as the worktree file, which
		// is what makes it a real revert rather than a worktree cosmetic.
		return (await gitCapture(projectDir, ['checkout', baseline.head, '--', path])) !== null;
	}
	// Absent from the baseline commit, so anything staged for it was staged by this run. `git rm
	// --cached` fails when nothing is staged, which is the ordinary case — the post-pass below is
	// what decides whether the path actually came clean, so its exit code is not consulted here.
	await gitCapture(projectDir, ['rm', '--cached', '--force', '--quiet', '--', path]);
	await rm(join(projectDir, path), { force: true, recursive: true });
	return true;
}

// Verify rather than trust. A revert can report success and leave the path dirty (a locked index,
// a concurrent writer, a path git declined to touch), and the caller's summary must not claim
// otherwise. Only paths that were clean at baseline are checkable: for the others there is no
// recorded state to compare against, so their revert stays best-effort.
async function unrevertedPaths(
	projectDir: string,
	baseline: WriteGuardSnapshot,
	violations: WriteViolation[],
): Promise<string[]> {
	const after = await gitStatusEntries(projectDir);
	if (after === null) return [];
	return violations
		.filter((violation) => !violation.destructivelyDiscarded)
		.filter((violation) => !baseline.entries.has(violation.path))
		.filter((violation) => after.has(violation.path))
		.map((violation) => violation.path);
}

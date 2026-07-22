// Detection + revert layer for metadata-only pipeline sessions. Uses the shared
// write-allowlist guard (snapshot/diff/revert) so the pipeline backstop enforces
// identically to the CLI-level --write-allowlist guard.
//
// The legacy captureWorktreeSnapshot/findMetadataViolations pair is preserved for
// backward-compatible callers (e.g. existing tests) but now delegates to the shared
// implementation under the hood. New code should call the shared functions directly.

import { captureWriteGuardSnapshot, isGitRepository } from 'aidd-shared/pipeline/writeAllowlist';

export type { WriteGuardSnapshot, WriteViolation } from 'aidd-shared/pipeline/writeAllowlist';

export { captureWriteGuardSnapshot } from 'aidd-shared/pipeline/writeAllowlist';
export { diffWriteViolations } from 'aidd-shared/pipeline/writeAllowlist';
export { revertWriteViolations } from 'aidd-shared/pipeline/writeAllowlist';

const METADATA_ALLOWLIST = ['.aidd'];

// Legacy interface preserved for callers that only need the dirty-paths set.
export interface WorktreeSnapshot {
	dirtyPaths: Set<string>;
}

// Wraps the shared WriteGuardSnapshot in the legacy WorktreeSnapshot shape so
// existing callers/tests continue to work. Returns null for non-git projects.
export async function captureWorktreeSnapshot(
	projectDir: string
): Promise<null | WorktreeSnapshot> {
	const snapshot = await captureWriteGuardSnapshot(projectDir);
	if (snapshot === null) return null;
	return { dirtyPaths: new Set(snapshot.entries.keys()) };
}

// Legacy violation finder that only checks path membership (no revert). Returns
// the violating paths.
export function findMetadataViolations(
	before: WorktreeSnapshot,
	after: WorktreeSnapshot
): string[] {
	const violations: string[] = [];
	for (const path of after.dirtyPaths) {
		if (before.dirtyPaths.has(path)) continue;
		if (path.startsWith(`${METADATA_ALLOWLIST[0]}/`)) continue;
		if (path === METADATA_ALLOWLIST[0]) continue;
		violations.push(path);
	}
	return violations.sort();
}

// Returns true when projectDir is inside a git repository. Used by launchService
// to refuse metadata-only sessions that cannot be enforced.
export { isGitRepository };

export { METADATA_ALLOWLIST };
